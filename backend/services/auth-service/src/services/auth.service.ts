import bcrypt from 'bcrypt';
import { pool } from '../config/database';
import { JWTService } from './jwt.service';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

export class AuthService {
  private log = logger.child({ component: 'AuthService' });
  
  // Dummy hash for timing attack prevention (not readonly so it can be updated)
  private DUMMY_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';
  
  constructor(private jwtService: JWTService) {
    // Pre-generate a dummy hash to use for timing consistency
    bcrypt.hash('dummy_password_for_timing_consistency', 10).then(hash => {
      this.DUMMY_HASH = hash;
    });
  }
  
  async register(data: any) {
    // Don't log the actual email or password
    this.log.info('Registration attempt', {
      hasEmail: !!data.email,
      hasPassword: !!data.password
    });
    
    try {
      // Use direct pool query instead of Knex
      this.log.debug('Checking for existing user');
      const existingResult = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      if (existingResult.rows.length > 0) {
        throw new Error('Email already registered');
      }
      
      this.log.debug('Hashing password');
      const passwordHash = await bcrypt.hash(data.password, 10);
      
      // Determine tenant_id
      const tenantId = data.tenant_id || process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
      
      this.log.info('Creating new user', { tenantId });
      const insertResult = await pool.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, phone, email_verified, tenant_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id`,
        [data.email.toLowerCase(), passwordHash, data.firstName, data.lastName, data.phone || null, false, tenantId, new Date()]
      );
      
      const user = insertResult.rows[0];
      this.log.info('User created successfully', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      const tokens = await this.jwtService.generateTokenPair(user);
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Log error without exposing sensitive details
      this.log.error('Registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
  
  async login(data: any) {
    this.log.info('Login attempt');
    
    // Store start time for consistent timing
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 500; // Minimum response time in ms
    
    try {
      // Always perform database lookup
      const result = await pool.query(
        'SELECT id, email, password_hash, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE email = $1 AND deleted_at IS NULL',
        [data.email.toLowerCase()]
      );
      
      let user = result.rows[0];
      let passwordHash = user?.password_hash || this.DUMMY_HASH;
      
      // Always perform bcrypt comparison to maintain consistent timing
      const valid = await bcrypt.compare(data.password, passwordHash);
      
      // Add random jitter (0-50ms) to prevent statistical timing analysis
      const jitter = crypto.randomInt(0, 50);
      await this.delay(jitter);
      
      // Check if login should succeed
      if (!user || !valid) {
        // Ensure minimum response time to prevent timing analysis
        const elapsed = Date.now() - startTime;
        if (elapsed < MIN_RESPONSE_TIME) {
          await this.delay(MIN_RESPONSE_TIME - elapsed);
        }
        
        this.log.warn('Login failed', { 
          reason: !user ? 'user_not_found' : 'invalid_password'
        });
        throw new Error('Invalid credentials');
      }
      
      // Login successful
      const tokens = await this.jwtService.generateTokenPair(user);
      
      // Ensure minimum response time even for successful logins
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      this.log.info('Login successful', {
        userId: user.id,
        tenantId: user.tenant_id
      });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          permissions: user.permissions,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      // Ensure minimum response time even for errors
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Re-throw the error
      throw error;
    }
  }

  async refreshTokens(refreshToken: string, ipAddress?: string, userAgent?: string) {
    this.log.info('Token refresh attempt', { ipAddress, userAgent });
    
    try {
      // Verify the refresh token
      const decoded = await this.jwtService.verifyRefreshToken(refreshToken);
      
      // Get fresh user data
      const result = await pool.query(
        'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
        [decoded.userId || decoded.sub]
      );
      
      if (result.rows.length === 0) {
        throw new Error('User not found');
      }
      
      const user = result.rows[0];
      
      // Generate new token pair
      const tokens = await this.jwtService.generateTokenPair(user);
      
      // Log the refresh for security auditing if needed
      if (ipAddress || userAgent) {
        await pool.query(
          `INSERT INTO token_refresh_log (user_id, ip_address, user_agent, refreshed_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT DO NOTHING`,
          [user.id, ipAddress || null, userAgent || null]
        ).catch(err => {
          // Don't fail the refresh if logging fails
          this.log.warn('Failed to log token refresh', err);
        });
      }
      
      this.log.info('Token refresh successful', { userId: user.id });
      
      return {
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          email_verified: user.email_verified,
          mfa_enabled: user.mfa_enabled || false,
          permissions: user.permissions,
          role: user.role,
          tenant_id: user.tenant_id,
        },
        tokens,
      };
    } catch (error) {
      this.log.warn('Token refresh failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        ipAddress,
        userAgent
      });
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string, refreshToken?: string) {
    this.log.info('Logout attempt', { userId });
    
    try {
      // If refresh token provided, invalidate it
      if (refreshToken) {
        // Store invalidated token to prevent reuse (with expiry)
        const expiryTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        
        await pool.query(
          `INSERT INTO invalidated_tokens (token, user_id, invalidated_at, expires_at)
           VALUES ($1, $2, NOW(), $3)
           ON CONFLICT (token) DO NOTHING`,
          [refreshToken, userId, expiryTime]
        );
      }
      
      // Could also clear any active sessions if you have a sessions table
      await pool.query(
        'SET search_path TO public; UPDATE user_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL',
        [userId]
      );
      
      this.log.info('Logout successful', { userId });
      
      return { success: true };
    } catch (error) {
      this.log.error('Logout error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Don't throw - logout should always succeed from user perspective
      return { success: true };
    }
  }
  
  async verifyEmail(token: string) {
    this.log.info('Email verification attempt');
    
    const result = await pool.query(
      'UPDATE users SET email_verified = true WHERE email_verification_token = $1 RETURNING id',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid verification token');
    }
    
    return { success: true };
  }
  
  async forgotPassword(email: string) {
    this.log.info('Password reset request');
    
    // Use constant-time operation regardless of user existence
    const startTime = Date.now();
    const MIN_RESPONSE_TIME = 300;
    
    try {
      const result = await pool.query(
        'SELECT id, email FROM users WHERE email = $1 AND deleted_at IS NULL',
        [email.toLowerCase()]
      );
      
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetExpiry = new Date(Date.now() + 3600000); // 1 hour
        
        await pool.query(
          'UPDATE users SET password_reset_token = $1, password_reset_expires = $2 WHERE id = $3',
          [resetToken, resetExpiry, user.id]
        );
        
        // Queue email sending (async, don't wait)
        this.sendPasswordResetEmail(user.email, resetToken).catch(err => 
          this.log.error('Failed to send password reset email', err)
        );
      }
      
      // Always wait the same amount of time
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Always return the same response
      return { 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    } catch (error) {
      // Ensure consistent timing even on error
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_RESPONSE_TIME) {
        await this.delay(MIN_RESPONSE_TIME - elapsed);
      }
      
      // Return same response to prevent enumeration
      return { 
        message: 'If an account exists with this email, a password reset link has been sent.' 
      };
    }
  }
  
  async resetPassword(token: string, newPassword: string) {
    this.log.info('Password reset attempt');
    
    const result = await pool.query(
      'SELECT id FROM users WHERE password_reset_token = $1 AND password_reset_expires > NOW() AND deleted_at IS NULL',
      [token]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Invalid or expired reset token');
    }
    
    const user = result.rows[0];
    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1, password_reset_token = NULL, password_reset_expires = NULL WHERE id = $2',
      [passwordHash, user.id]
    );
    
    return { success: true };
  }
  
  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    this.log.info('Password change attempt', { userId });
    
    const result = await pool.query(
      'SELECT password_hash FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = result.rows[0];
    const valid = await bcrypt.compare(oldPassword, user.password_hash);
    
    if (!valid) {
      throw new Error('Invalid current password');
    }
    
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [newPasswordHash, userId]
    );
    
    return { success: true };
  }
  
  async getUserById(userId: string) {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, email_verified, mfa_enabled, permissions, role, tenant_id FROM users WHERE id = $1 AND deleted_at IS NULL',
      [userId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('User not found');
    }
    
    return result.rows[0];
  }
  
  // Helper method for consistent timing delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Async email sender (doesn't block response)
  private async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    // This would integrate with your email service
    // Implementation depends on your email provider
    this.log.info('Queuing password reset email', { email: email.substring(0, 3) + '***' });
  }
}
