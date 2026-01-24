import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { db } from '../config/database';
import { getRedis } from '../config/redis';
import { env } from '../config/env';
import { AuthenticationError } from '../errors';
import { redisKeys } from '../utils/redisKeys';
import { otpRateLimiter, mfaSetupRateLimiter, backupCodeRateLimiter } from '../utils/rateLimiter';
import { logger } from '../utils/logger';

// Idempotency window for MFA setup (5 minutes)
const MFA_SETUP_IDEMPOTENCY_WINDOW = 5 * 60;

export class MFAService {
  /**
   * Setup TOTP with idempotency
   * If setup was initiated within the idempotency window, return the same secret
   */
  async setupTOTP(userId: string, tenantId?: string): Promise<{
    secret: string;
    qrCode: string;
  }> {
    try {
      // Rate limit MFA setup attempts
      await mfaSetupRateLimiter.consume(userId, 1, tenantId);

      const user = await db('users').withSchema('public').where('users.id', userId).first();
      if (!user) {
        throw new Error('User not found');
      }

      if (user.mfa_enabled) {
        throw new Error('MFA is already enabled for this account');
      }

      const redis = getRedis();
      const setupKey = redisKeys.mfaSetup(userId, tenantId || user.tenant_id);

      // Idempotency check: return existing setup if within window
      const existingSetup = await redis.get(setupKey);
      if (existingSetup) {
        const setupData = JSON.parse(existingSetup);
        const decryptedSecret = this.decrypt(setupData.secret);

        // Regenerate QR code (it's deterministic based on secret)
        const otpauthUrl = speakeasy.otpauthURL({
          secret: decryptedSecret,
          label: user.email,
          issuer: env.MFA_ISSUER || 'TicketToken',
          encoding: 'base32'
        });
        const qrCode = await QRCode.toDataURL(otpauthUrl);

        return {
          secret: decryptedSecret,
          qrCode,
        };
      }

      // Generate new secret
      const secret = speakeasy.generateSecret({
        name: `TicketToken (${user.email})`,
        issuer: env.MFA_ISSUER || 'TicketToken',
        length: 32,
      });

      const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");
      const backupCodes = this.generateBackupCodes();

      // Store in Redis with TTL
      await redis.setex(
        setupKey,
        600, // 10 minutes total TTL
        JSON.stringify({
          secret: this.encrypt(secret.base32),
          backupCodes: backupCodes.map(code => this.hashBackupCode(code)),
          plainBackupCodes: backupCodes,
          tenantId: tenantId || user.tenant_id,
          createdAt: Date.now(),
        })
      );

      return {
        secret: secret.base32,
        qrCode,
      };
    } catch (error: any) {
      logger.error('MFA setupTOTP error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async verifyAndEnableTOTP(userId: string, token: string, tenantId?: string): Promise<{ backupCodes: string[] }> {
    try {
      // Rate limit OTP verification
      await otpRateLimiter.consume(userId, 1, tenantId);

      const redis = getRedis();

      // Try tenant-prefixed key first, then fall back
      let setupData = await redis.get(redisKeys.mfaSetup(userId, tenantId));
      if (!setupData && tenantId) {
        setupData = await redis.get(`mfa:setup:${userId}`);
      }

      if (!setupData) {
        throw new Error('MFA setup expired or not found');
      }

      const { secret, backupCodes, plainBackupCodes, tenantId: storedTenantId } = JSON.parse(setupData);
      const effectiveTenantId = tenantId || storedTenantId;
      const decryptedSecret = this.decrypt(secret);

      const verified = speakeasy.totp.verify({
        secret: decryptedSecret,
        encoding: 'base32',
        token,
        window: 2,
      });

      if (!verified) {
        throw new AuthenticationError('Invalid MFA token');
      }

      await db('users').withSchema('public').where('users.id', userId).update({
        mfa_enabled: true,
        mfa_secret: secret,
        backup_codes: backupCodes,
      });

      // Clean up - try both key patterns
      await redis.del(redisKeys.mfaSetup(userId, effectiveTenantId));
      await redis.del(`mfa:setup:${userId}`);

      // Reset rate limiter on success
      await otpRateLimiter.reset(userId, tenantId);

      return { backupCodes: plainBackupCodes };
    } catch (error: any) {
      logger.error('MFA verifyAndEnableTOTP error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async verifyTOTP(userId: string, token: string, tenantId?: string): Promise<boolean> {
    try {
      // Rate limit OTP verification - strict limits
      await otpRateLimiter.consume(userId, 1, tenantId);

      const user = await db('users').withSchema('public').where('users.id', userId).first();

      if (!user || !user.mfa_enabled || !user.mfa_secret) {
        return false;
      }

      if (!/^\d{6}$/.test(token)) {
        return false;
      }

      const secret = this.decrypt(user.mfa_secret);
      const effectiveTenantId = tenantId || user.tenant_id;

      const redis = getRedis();
      const recentKey = redisKeys.mfaRecent(userId, token, effectiveTenantId);
      const recentlyUsed = await redis.get(recentKey);

      if (recentlyUsed) {
        throw new AuthenticationError('MFA token recently used');
      }

      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 1,
      });

      if (verified) {
        await redis.setex(recentKey, 90, '1');
        // Reset rate limiter on successful verification
        await otpRateLimiter.reset(userId, tenantId);
      }

      return verified;
    } catch (error: any) {
      logger.error('MFA verifyTOTP error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async verifyBackupCode(userId: string, code: string, tenantId?: string): Promise<boolean> {
    try {
      // Rate limit backup code verification - very strict
      await backupCodeRateLimiter.consume(userId, 1, tenantId);

      const user = await db('users').withSchema('public').where('users.id', userId).first();

      if (!user || !user.backup_codes) {
        return false;
      }

      const backupCodes = user.backup_codes;
      if (!Array.isArray(backupCodes) || backupCodes.length === 0) {
        return false;
      }

      const hashedCode = this.hashBackupCode(code);
      const codeIndex = backupCodes.indexOf(hashedCode);

      if (codeIndex === -1) {
        return false;
      }

      backupCodes.splice(codeIndex, 1);

      await db('users').withSchema('public').where('users.id', userId).update({
        backup_codes: backupCodes,
      });

      // Reset rate limiter on success
      await backupCodeRateLimiter.reset(userId, tenantId);

      return true;
    } catch (error: any) {
      logger.error('MFA verifyBackupCode error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async regenerateBackupCodes(userId: string): Promise<{ backupCodes: string[] }> {
    try {
      const user = await db('users').withSchema('public').where('users.id', userId).first();

      if (!user) {
        throw new Error('User not found');
      }

      if (!user.mfa_enabled) {
        throw new Error('MFA is not enabled for this account');
      }

      const newBackupCodes = this.generateBackupCodes();
      const hashedCodes = newBackupCodes.map(code => this.hashBackupCode(code));

      await db('users').withSchema('public').where('users.id', userId).update({
        backup_codes: hashedCodes,
      });

      return { backupCodes: newBackupCodes };
    } catch (error: any) {
      logger.error('MFA regenerateBackupCodes error', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async requireMFAForOperation(userId: string, operation: string, tenantId?: string): Promise<void> {
    const redis = getRedis();
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

    const recentMFA = await redis.get(redisKeys.mfaVerified(userId, tenantId));
    if (!recentMFA) {
      throw new AuthenticationError('MFA required for this operation');
    }
  }

  async markMFAVerified(userId: string, tenantId?: string): Promise<void> {
    const redis = getRedis();
    await redis.setex(redisKeys.mfaVerified(userId, tenantId), 300, '1');
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

  async disableTOTP(userId: string, password: string, token: string, tenantId?: string): Promise<void> {
    try {
      const user = await db('users').withSchema('public').where('users.id', userId).first();

      if (!user) {
        throw new Error('User not found');
      }

      const bcrypt = require('bcrypt');
      const passwordValid = await bcrypt.compare(password, user.password_hash);

      if (!passwordValid) {
        throw new Error('Invalid password');
      }

      const mfaValid = await this.verifyTOTP(user.id, token, tenantId || user.tenant_id);

      if (!mfaValid) {
        throw new Error('Invalid MFA token');
      }

      await db('users').withSchema('public')
        .where({ 'users.id': userId })
        .update({
          mfa_enabled: false,
          mfa_secret: null,
          backup_codes: null,
          updated_at: new Date()
        });

      const redis = getRedis();
      const effectiveTenantId = tenantId || user.tenant_id;

      // Clean up both old and new key patterns
      await redis.del(redisKeys.mfaSecret(userId, effectiveTenantId));
      await redis.del(redisKeys.mfaVerified(userId, effectiveTenantId));
      await redis.del(`mfa:secret:${userId}`);
      await redis.del(`mfa:verified:${userId}`);

      logger.info('MFA disabled for user', { userId });
    } catch (error: any) {
      logger.error('MFA disableTOTP error', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}
