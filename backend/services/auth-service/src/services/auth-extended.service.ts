import bcrypt from 'bcrypt';
// import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { ValidationError, AuthenticationError } from '../errors';
import { passwordResetRateLimiter } from '../utils/rateLimiter';
import { EmailService } from './email.service';

export class AuthExtendedService {
  private emailService: EmailService;

  constructor(emailService: EmailService) {
    this.emailService = emailService;
  }

  async requestPasswordReset(email: string, ipAddress: string): Promise<void> {
    // Rate limit password reset requests
    await passwordResetRateLimiter.consume(ipAddress);

    // Find user
    const user = await db('users').withSchema('public')
      .where({ email: email.toLowerCase() })
      .whereNull('deleted_at')
      .first();

    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(
      user.id,
      user.email,
      user.first_name
    );

    // Log the request
    await db('audit_logs').insert({
      user_id: user.id,
      action: 'password_reset_requested',
      ip_address: ipAddress,
      created_at: new Date()
    });
  }

  async resetPassword(token: string, newPassword: string, ipAddress: string): Promise<void> {
    // Get token data from Redis
    const tokenData = await redis.get(`password-reset:${token}`);
    
    if (!tokenData) {
      throw new ValidationError('Invalid or expired reset token' as any);
    }

    const { userId } = JSON.parse(tokenData);

    // Validate password strength
    this.validatePasswordStrength(newPassword);

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await db('users').withSchema('public')
      .where({ id: userId })
      .update({
        password_hash: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date()
      });

    // Delete the reset token
    await redis.del(`password-reset:${token}`);

    // Invalidate all refresh tokens for this user
    const keys = await redis.keys(`refresh_token:*`);
    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const tokenData = JSON.parse(data);
        if (tokenData.userId === userId) {
          await redis.del(key);
        }
      }
    }

    // Log the password reset
    await db('audit_logs').insert({
      user_id: userId,
      action: 'password_reset_completed',
      ip_address: ipAddress,
      created_at: new Date()
    });
  }

  async verifyEmail(token: string): Promise<void> {
    // Get token data from Redis
    const tokenData = await redis.get(`email-verify:${token}`);
    
    if (!tokenData) {
      throw new ValidationError('Invalid or expired verification token' as any);
    }

    const { userId, email } = JSON.parse(tokenData);

    // Update user as verified
    const updated = await db('users').withSchema('public')
      .where({ id: userId, email })
      .whereNull('deleted_at')
      .update({
        email_verified: true,
        email_verified_at: new Date(),
        updated_at: new Date()
      });

    if (updated === 0) {
      throw new ValidationError('User not found or email mismatch' as any);
    }

    // Delete the verification token
    await redis.del(`email-verify:${token}`);

    // Log the verification
    await db('audit_logs').insert({
      user_id: userId,
      action: 'email_verified',
      created_at: new Date()
    });
  }

  async resendVerificationEmail(userId: string): Promise<void> {
    // Rate limit resend requests
    const rateLimitKey = `resend-verify:${userId}`;
    const attempts = await redis.incr(rateLimitKey);
    
    if (attempts === 1) {
      await redis.expire(rateLimitKey, 3600); // 1 hour
    }
    
    if (attempts > 3) {
      throw new ValidationError('Too many resend attempts. Try again later.' as any);
    }

    // Get user
    const user = await db('users').withSchema('public')
      .where({ id: userId })
      .whereNull('deleted_at')
      .first();

    if (!user) {
      throw new ValidationError('User not found' as any);
    }

    if (user.email_verified) {
      throw new ValidationError('Email already verified' as any);
    }

    // Send new verification email
    await this.emailService.sendVerificationEmail(
      user.id,
      user.email,
      user.first_name
    );
  }

  async changePassword(
    userId: string, 
    currentPassword: string, 
    newPassword: string
  ): Promise<void> {
    // Get user
    const user = await db('users').withSchema('public')
      .where("users.id", userId)
      .whereNull("users.deleted_at")
      .first();

    if (!user) {
      throw new AuthenticationError('User not found');
    }

    // Verify current password
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!validPassword) {
      throw new AuthenticationError('Current password is incorrect');
    }

    // Validate new password
    this.validatePasswordStrength(newPassword);

    // Ensure new password is different
    const samePassword = await bcrypt.compare(newPassword, user.password_hash);
    if (samePassword) {
      throw new ValidationError('New password must be different from current password' as any);
    }

    // Hash and update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db('users').withSchema('public')
      .where({ id: userId })
      .update({
        password_hash: hashedPassword,
        password_changed_at: new Date(),
        updated_at: new Date()
      });

    // Log the change
    await db('audit_logs').insert({
      user_id: userId,
      action: 'password_changed',
      created_at: new Date()
    });
    
    // Invalidate all user sessions after password change
    await db('user_sessions')
      .where({ user_id: userId })
      .whereNull('revoked_at')
      .update({ 
        revoked_at: new Date(),
        metadata: db.raw("COALESCE(metadata, '{}'::jsonb) || ?::jsonb", [
          JSON.stringify({ revoked_reason: 'password_changed' })
        ])
      });
    
    console.log('All sessions invalidated due to password change for user:', userId);
  }

  private validatePasswordStrength(password: string): void {
    if (password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters long' as any);
    }

    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      throw new ValidationError([
        'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      ]);
    }
  }
}
