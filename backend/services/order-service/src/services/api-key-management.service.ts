/**
 * API Key Management Service
 * Manages API key generation, validation, and lifecycle
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { securityConfig } from '../config/security.config';
import * as crypto from 'crypto';

interface APIKey {
  keyId: string;
  apiKey: string;
  name: string;
  userId: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  isActive: boolean;
}

export class APIKeyManagementService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate new API key
   */
  async generateAPIKey(
    userId: string,
    name: string,
    scopes: string[] = [],
    expiresInDays?: number
  ): Promise<{ keyId: string; apiKey: string }> {
    const keyId = this.generateKeyId();
    const apiKey = this.generateKey();
    const hashedKey = this.hashKey(apiKey);

    const rotationDays = securityConfig.api.apiKeys.rotationDays;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + rotationDays * 24 * 60 * 60 * 1000);

    await this.pool.query(
      `INSERT INTO api_keys (key_id, key_hash, name, user_id, scopes, expires_at, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [keyId, hashedKey, name, userId, JSON.stringify(scopes), expiresAt]
    );

    logger.info('API key generated', {
      keyId,
      userId,
      name,
      scopes,
      expiresAt,
    });

    return { keyId, apiKey: `${keyId}.${apiKey}` };
  }

  /**
   * Validate API key
   */
  async validateAPIKey(apiKey: string): Promise<{
    valid: boolean;
    keyInfo: APIKey | null;
    reason?: string;
  }> {
    try {
      // Parse key ID and key
      const parts = apiKey.split('.');
      if (parts.length !== 2) {
        return { valid: false, keyInfo: null, reason: 'Invalid key format' };
      }

      const [keyId, key] = parts;
      const hashedKey = this.hashKey(key);

      // Get key from database
      const result = await this.pool.query(
        `SELECT key_id, key_hash, name, user_id, scopes, created_at, expires_at, last_used_at, is_active
         FROM api_keys
         WHERE key_id = $1`,
        [keyId]
      );

      if (result.rows.length === 0) {
        return { valid: false, keyInfo: null, reason: 'Key not found' };
      }

      const row = result.rows[0];

      // Check if key is active
      if (!row.is_active) {
        return { valid: false, keyInfo: null, reason: 'Key is disabled' };
      }

      // Verify hash
      if (row.key_hash !== hashedKey) {
        logger.warn('API key hash mismatch', { keyId });
        return { valid: false, keyInfo: null, reason: 'Invalid key' };
      }

      // Check expiration
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return { valid: false, keyInfo: null, reason: 'Key expired' };
      }

      // Update last used timestamp
      await this.updateLastUsed(keyId);

      const keyInfo: APIKey = {
        keyId: row.key_id,
        apiKey: '', // Don't include actual key
        name: row.name,
        userId: row.user_id,
        scopes: JSON.parse(row.scopes),
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        lastUsedAt: new Date(),
        isActive: row.is_active,
      };

      return { valid: true, keyInfo };

    } catch (error) {
      logger.error('API key validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { valid: false, keyInfo: null, reason: 'Validation error' };
    }
  }

  /**
   * Revoke API key
   */
  async revokeAPIKey(keyId: string, userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys
       SET is_active = false, revoked_at = NOW()
       WHERE key_id = $1 AND user_id = $2`,
      [keyId, userId]
    );

    logger.info('API key revoked', { keyId, userId });
  }

  /**
   * List user's API keys
   */
  async listUserAPIKeys(userId: string): Promise<Omit<APIKey, 'apiKey'>[]> {
    const result = await this.pool.query(
      `SELECT key_id, name, scopes, created_at, expires_at, last_used_at, is_active
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      keyId: row.key_id,
      apiKey: '', // Never return actual key
      name: row.name,
      userId,
      scopes: JSON.parse(row.scopes),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      isActive: row.is_active,
    }));
  }

  /**
   * Get keys expiring soon
   */
  async getExpiringKeys(daysThreshold: number = 30): Promise<Array<{
    keyId: string;
    userId: string;
    name: string;
    expiresAt: Date;
    daysUntilExpiry: number;
  }>> {
    const thresholdDate = new Date(Date.now() + daysThreshold * 24 * 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT key_id, user_id, name, expires_at,
              EXTRACT(DAY FROM (expires_at - NOW())) as days_until_expiry
       FROM api_keys
       WHERE is_active = true
         AND expires_at IS NOT NULL
         AND expires_at > NOW()
         AND expires_at < $1
       ORDER BY expires_at ASC`,
      [thresholdDate]
    );

    return result.rows.map(row => ({
      keyId: row.key_id,
      userId: row.user_id,
      name: row.name,
      expiresAt: row.expires_at,
      daysUntilExpiry: parseInt(row.days_until_expiry),
    }));
  }

  /**
   * Cleanup expired keys
   */
  async cleanupExpiredKeys(): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM api_keys
       WHERE expires_at < NOW()
         AND expires_at < NOW() - INTERVAL '90 days'`
    );

    if (result.rowCount && result.rowCount > 0) {
      logger.info('Expired API keys cleaned up', {
        count: result.rowCount,
      });
    }

    return result.rowCount || 0;
  }

  /**
   * Get API key usage statistics
   */
  async getUsageStats(userId: string): Promise<{
    totalKeys: number;
    activeKeys: number;
    expiredKeys: number;
    revokedKeys: number;
  }> {
    const result = await this.pool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())) as active,
         COUNT(*) FILTER (WHERE expires_at < NOW()) as expired,
         COUNT(*) FILTER (WHERE is_active = false) as revoked
       FROM api_keys
       WHERE user_id = $1`,
      [userId]
    );

    return {
      totalKeys: parseInt(result.rows[0].total),
      activeKeys: parseInt(result.rows[0].active),
      expiredKeys: parseInt(result.rows[0].expired),
      revokedKeys: parseInt(result.rows[0].revoked),
    };
  }

  /**
   * Generate key ID
   */
  private generateKeyId(): string {
    return `ak_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Generate API key
   */
  private generateKey(): string {
    const config = securityConfig.api.apiKeys;
    return crypto.randomBytes(config.keyLength).toString('hex');
  }

  /**
   * Hash API key
   */
  private hashKey(key: string): string {
    const config = securityConfig.api.apiKeys;
    return crypto.createHash(config.algorithm).update(key).digest('hex');
  }

  /**
   * Update last used timestamp
   */
  private async updateLastUsed(keyId: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE key_id = $1`,
      [keyId]
    );
  }
}

