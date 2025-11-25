import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { AuthenticationError } from '../errors';

export class MFAService {
  async setupTOTP(userId: string): Promise<{
    secret: string;
    qrCode: string;
    backupCodes: string[];
  }> {
    try {
      // Get user - explicitly use core schema
      const user = await db('users').withSchema('public').where('users.id', userId).first();
      if (!user) {
        throw new Error('User not found');
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `TicketToken (${user.email})`,
        issuer: env.MFA_ISSUER || 'TicketToken',
        length: 32,
      });

      // Generate QR code
      const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

      // Generate backup codes
      const backupCodes = this.generateBackupCodes();

      // Store temporarily until verified
      await redis.setex(
        `mfa:setup:${userId}`,
        600, // 10 minutes
        JSON.stringify({
          secret: this.encrypt(secret.base32),
          backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
        })
      );

      return {
        secret: secret.base32,
        qrCode,
        backupCodes,
      };
    } catch (error: any) {
      console.error('MFA setupTOTP error:', error.message, error.stack);
      throw error;
    }
  }

  async verifyAndEnableTOTP(userId: string, token: string): Promise<boolean> {
    try {
      // Get temporary setup data
      const setupData = await redis.get(`mfa:setup:${userId}`);
      if (!setupData) {
        throw new Error('MFA setup expired or not found');
      }

      const { secret, backupCodes } = JSON.parse(setupData);
      const decryptedSecret = this.decrypt(secret);

      // Verify token
      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token,
        window: 2,
      });

      if (!verified) {
        throw new AuthenticationError('Invalid MFA token');
      }

      // Enable MFA for user
      await db('users').withSchema('public').where('users.id', userId).update({
        mfa_enabled: true,
        mfa_secret: secret,
        backup_codes: JSON.stringify(backupCodes),
      });

      // Clean up temporary data
      await redis.del(`mfa:setup:${userId}`);

      return true;
    } catch (error: any) {
      console.error('MFA verifyAndEnableTOTP error:', error.message, error.stack);
      throw error;
    }
  }

  async verifyTOTP(userId: string, token: string): Promise<boolean> {
    try {
      const user = await db('users').withSchema('public').where('users.id', userId).first();

      if (!user || !user.mfa_enabled || !user.mfa_secret) {
        return false;
      }

      const secret = this.decrypt(user.mfa_secret);

      // Check recent use to prevent replay attacks
      const recentKey = `mfa:recent:${userId}:${token}`;
      const recentlyUsed = await redis.get(recentKey);

      if (recentlyUsed) {
        throw new AuthenticationError('MFA token recently used');
      }

      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 2,
      });

      if (verified) {
        // Mark token as used
        await redis.setex(recentKey, 90, '1'); // 90 seconds
      }

      return verified;
    } catch (error: any) {
      console.error('MFA verifyTOTP error:', error.message, error.stack);
      throw error;
    }
  }

  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    try {
      const user = await db('users').withSchema('public').where('users.id', userId).first();

      if (!user || !user.backup_codes) {
        return false;
      }

      const backupCodes = JSON.parse(user.backup_codes);
      const hashedCode = this.hashBackupCode(code);
      const codeIndex = backupCodes.indexOf(hashedCode);

      if (codeIndex === -1) {
        return false;
      }

      // Remove used code
      backupCodes.splice(codeIndex, 1);

      await db('users').withSchema('public').where('users.id', userId).update({
        backup_codes: JSON.stringify(backupCodes),
      });

      return true;
    } catch (error: any) {
      console.error('MFA verifyBackupCode error:', error.message, error.stack);
      throw error;
    }
  }

  async requireMFAForOperation(userId: string, operation: string): Promise<void> {
    const sensitiveOperations = [
      'withdraw:funds',
      'update:bank-details',
      'delete:venue',
      'export:customer-data',
      'disable:mfa',
    ];

    if (!sensitiveOperations.includes(operation)) {
      return;
    }

    // Check if MFA was recently verified
    const recentMFA = await redis.get(`mfa:verified:${userId}`);
    if (!recentMFA) {
      throw new AuthenticationError('MFA required for this operation');
    }
  }

  async markMFAVerified(userId: string): Promise<void> {
    // Mark MFA as recently verified for sensitive operations
    await redis.setex(`mfa:verified:${userId}`, 300, '1'); // 5 minutes
  }

  private generateBackupCodes(): string[] {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
    }
    return codes;
  }

  private hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private encrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.ENCRYPTION_KEY, 'utf8').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(env.ENCRYPTION_KEY, 'utf8').slice(0, 32);
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  async disableTOTP(userId: string): Promise<void> {
    try {
      // Clear MFA settings from user record
      await db('users').withSchema('public')
        .where({ 'users.id': userId })
        .update({
          mfa_enabled: false,
          mfa_secret: null,
          backup_codes: null,
          updated_at: new Date()
        });

      // Clear any MFA-related data from Redis
      await redis.del(`mfa:secret:${userId}`);

      console.log('MFA disabled for user:', userId);
    } catch (error: any) {
      console.error('MFA disableTOTP error:', error.message, error.stack);
      throw error;
    }
  }
}
