/**
 * Multi-Factor Authentication Service
 * 
 * Implements TOTP-based MFA for admin users
 * PCI-DSS requirement: MFA for admin access to payment data
 */

import { Pool } from 'pg';
import * as crypto from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { logger } from '../utils/logger';

export interface MFAMethod {
  id: string;
  tenantId: string;
  userId: string;
  methodType: 'TOTP' | 'SMS' | 'EMAIL' | 'BACKUP_CODES';
  isVerified: boolean;
  isPrimary: boolean;
  lastUsedAt?: Date;
  createdAt: Date;
}

export interface TOTPSetupResponse {
  secret: string;
  qrCodeUrl: string;
  manualEntryKey: string;
}

export class MFAService {
  private pool: Pool;
  private encryptionKey: Buffer;

  constructor(pool: Pool) {
    this.pool = pool;
    // In production, load from environment variable or secrets manager
    const key = process.env.MFA_ENCRYPTION_KEY || 'default-key-change-in-production';
    this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Encrypt sensitive data for storage
   */
  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt sensitive data from storage
   */
  private decrypt(text: string): string {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Setup TOTP for a user
   */
  async setupTOTP(userId: string, tenantId: string, userEmail: string): Promise<TOTPSetupResponse> {
    try {
      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `TicketToken (${userEmail})`,
        issuer: 'TicketToken Platform',
      });

      // Encrypt and store
      const encryptedSecret = this.encrypt(secret.base32);

      await this.pool.query(
        `INSERT INTO mfa_methods (tenant_id, user_id, method_type, secret_encrypted, is_verified, is_primary, created_at, updated_at)
         VALUES ($1, $2, 'TOTP', $3, FALSE, FALSE, NOW(), NOW())
         ON CONFLICT (tenant_id, user_id, method_type) 
         DO UPDATE SET secret_encrypted = $3, updated_at = NOW()`,
        [tenantId, userId, encryptedSecret]
      );

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      return {
        secret: secret.base32,
        qrCodeUrl,
        manualEntryKey: secret.base32,
      };
    } catch (error) {
      logger.error('Failed to setup TOTP', { error, userId, tenantId });
      throw new Error('Failed to setup TOTP');
    }
  }

  /**
   * Verify TOTP code and mark as verified
   */
  async verifyTOTP(userId: string, tenantId: string, code: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT id, secret_encrypted FROM mfa_methods 
         WHERE tenant_id = $1 AND user_id = $2 AND method_type = 'TOTP'`,
        [tenantId, userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const method = result.rows[0];
      const secret = this.decrypt(method.secret_encrypted);

      const isValid = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 2, // Allow 2 time steps before and after
      });

      if (isValid) {
        // Mark as verified and primary
        await this.pool.query(
          `UPDATE mfa_methods 
           SET is_verified = TRUE, is_primary = TRUE, updated_at = NOW(), last_used_at = NOW()
           WHERE id = $1`,
          [method.id]
        );

        // Log successful verification
        await this.logVerificationAttempt(userId, tenantId, method.id, code, true);
      } else {
        // Log failed verification
        await this.logVerificationAttempt(userId, tenantId, method.id, code, false);
      }

      return isValid;
    } catch (error) {
      logger.error('Failed to verify TOTP', { error, userId, tenantId });
      return false;
    }
  }

  /**
   * Validate TOTP code for login/sensitive operations
   */
  async validateTOTP(userId: string, tenantId: string, code: string, ipAddress?: string, userAgent?: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT id, secret_encrypted FROM mfa_methods 
         WHERE tenant_id = $1 AND user_id = $2 AND method_type = 'TOTP' AND is_verified = TRUE`,
        [tenantId, userId]
      );

      if (result.rows.length === 0) {
        logger.warn('No verified TOTP method found', { userId, tenantId });
        return false;
      }

      const method = result.rows[0];
      const secret = this.decrypt(method.secret_encrypted);

      const isValid = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: code,
        window: 1, // Stricter window for validation
      });

      // Always log attempt
      await this.logVerificationAttempt(userId, tenantId, method.id, code, isValid, ipAddress, userAgent);

      if (isValid) {
        // Update last used timestamp
        await this.pool.query(
          `UPDATE mfa_methods SET last_used_at = NOW() WHERE id = $1`,
          [method.id]
        );
      }

      return isValid;
    } catch (error) {
      logger.error('Failed to validate TOTP', { error, userId, tenantId });
      return false;
    }
  }

  /**
   * Check if user has MFA enabled
   */
  async hasMFAEnabled(userId: string, tenantId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count FROM mfa_methods 
         WHERE tenant_id = $1 AND user_id = $2 AND is_verified = TRUE`,
        [tenantId, userId]
      );

      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      logger.error('Failed to check MFA status', { error, userId, tenantId });
      return false;
    }
  }

  /**
   * Get user's MFA methods
   */
  async getMFAMethods(userId: string, tenantId: string): Promise<MFAMethod[]> {
    try {
      const result = await this.pool.query(
        `SELECT id, tenant_id, user_id, method_type, is_verified, is_primary, last_used_at, created_at
         FROM mfa_methods 
         WHERE tenant_id = $1 AND user_id = $2
         ORDER BY is_primary DESC, created_at DESC`,
        [tenantId, userId]
      );

      return result.rows.map(row => ({
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        methodType: row.method_type,
        isVerified: row.is_verified,
        isPrimary: row.is_primary,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Failed to get MFA methods', { error, userId, tenantId });
      return [];
    }
  }

  /**
   * Remove MFA method
   */
  async removeMFAMethod(userId: string, tenantId: string, methodId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `DELETE FROM mfa_methods 
         WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
        [methodId, tenantId, userId]
      );

      return result.rowCount > 0;
    } catch (error) {
      logger.error('Failed to remove MFA method', { error, userId, tenantId, methodId });
      return false;
    }
  }

  /**
   * Get recent failed attempts (for rate limiting/lockout)
   */
  async getRecentFailedAttempts(userId: string, tenantId: string, minutes: number = 15): Promise<number> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count FROM mfa_verification_attempts
         WHERE tenant_id = $1 AND user_id = $2 
         AND is_successful = FALSE 
         AND attempted_at > NOW() - INTERVAL '${minutes} minutes'`,
        [tenantId, userId]
      );

      return parseInt(result.rows[0].count);
    } catch (error) {
      logger.error('Failed to get failed attempts', { error, userId, tenantId });
      return 0;
    }
  }

  /**
   * Log verification attempt
   */
  private async logVerificationAttempt(
    userId: string,
    tenantId: string,
    methodId: string,
    code: string,
    isSuccessful: boolean,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      // Hash code for logging (never store plain codes)
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');

      await this.pool.query(
        `INSERT INTO mfa_verification_attempts 
         (tenant_id, user_id, mfa_method_id, code_hash, is_successful, ip_address, user_agent, attempted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [tenantId, userId, methodId, codeHash, isSuccessful, ipAddress, userAgent]
      );
    } catch (error) {
      logger.error('Failed to log verification attempt', { error, userId, tenantId });
    }
  }
}
