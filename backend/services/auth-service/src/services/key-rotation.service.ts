/**
 * Key Rotation Service
 * 
 * Manages cryptographic key lifecycle for JWT and S2S tokens.
 * Supports zero-downtime rotation with gradual rollout.
 * 
 * Rotation Process:
 * 1. Generate new key pair
 * 2. Add new key to active keys (signing uses new, verification accepts both)
 * 3. Wait for old tokens to expire (grace period)
 * 4. Remove old key from active keys
 * 5. Archive old key for audit purposes
 */

import crypto from 'crypto';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { pool } from '../config/database';
import { auditService } from './audit.service';

interface KeyMetadata {
  keyId: string;
  keyType: 'jwt' | 's2s';
  status: 'active' | 'rotating' | 'deprecated' | 'revoked';
  createdAt: Date;
  activatedAt?: Date;
  deprecatedAt?: Date;
  revokedAt?: Date;
  expiresAt?: Date;
  rotationReason?: string;
  fingerprint: string; // SHA-256 of public key for identification
}

interface RotationConfig {
  gracePeriodHours: number;  // How long to keep old key active after new key is primary
  notifyBeforeDays: number;  // Days before expiry to send alerts
  autoRotateEnabled: boolean;
  maxKeyAgeDays: number;     // Max age before forcing rotation
}

const DEFAULT_CONFIG: RotationConfig = {
  gracePeriodHours: 24,      // Keep old key valid for 24 hours after rotation
  notifyBeforeDays: 7,       // Alert 7 days before expiry
  autoRotateEnabled: false,  // Manual rotation by default
  maxKeyAgeDays: 90,         // Rotate every 90 days
};

// Redis keys for key rotation state
const ROTATION_KEYS = {
  config: 'key-rotation:config',
  jwtKeys: 'key-rotation:jwt:keys',
  s2sKeys: 'key-rotation:s2s:keys',
  rotationLock: 'key-rotation:lock',
  lastRotation: (type: string) => `key-rotation:${type}:last-rotation`,
};

export class KeyRotationService {
  private config: RotationConfig = DEFAULT_CONFIG;

  /**
   * Initialize key rotation service
   */
  async initialize(): Promise<void> {
    const redis = getRedis();
    
    // Load config from Redis if exists
    const storedConfig = await redis.get(ROTATION_KEYS.config);
    if (storedConfig) {
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(storedConfig) };
    }

    logger.info('Key rotation service initialized', {
      gracePeriodHours: this.config.gracePeriodHours,
      autoRotateEnabled: this.config.autoRotateEnabled,
      maxKeyAgeDays: this.config.maxKeyAgeDays,
    });
  }

  /**
   * Check if rotation is needed based on key age
   */
  async checkRotationNeeded(keyType: 'jwt' | 's2s'): Promise<{
    needed: boolean;
    reason?: string;
    currentKeyAge?: number;
  }> {
    const redis = getRedis();
    const lastRotation = await redis.get(ROTATION_KEYS.lastRotation(keyType));

    if (!lastRotation) {
      return { needed: false, reason: 'No previous rotation recorded' };
    }

    const lastRotationDate = new Date(lastRotation);
    const ageInDays = (Date.now() - lastRotationDate.getTime()) / (1000 * 60 * 60 * 24);

    if (ageInDays >= this.config.maxKeyAgeDays) {
      return {
        needed: true,
        reason: `Key age (${Math.floor(ageInDays)} days) exceeds maximum (${this.config.maxKeyAgeDays} days)`,
        currentKeyAge: Math.floor(ageInDays),
      };
    }

    const daysUntilRotation = this.config.maxKeyAgeDays - ageInDays;
    if (daysUntilRotation <= this.config.notifyBeforeDays) {
      return {
        needed: false,
        reason: `Rotation recommended in ${Math.floor(daysUntilRotation)} days`,
        currentKeyAge: Math.floor(ageInDays),
      };
    }

    return {
      needed: false,
      currentKeyAge: Math.floor(ageInDays),
    };
  }

  /**
   * Record that a rotation has occurred
   */
  async recordRotation(
    keyType: 'jwt' | 's2s',
    newKeyId: string,
    reason: string,
    performedBy: string
  ): Promise<void> {
    const redis = getRedis();

    // Record rotation timestamp
    await redis.set(ROTATION_KEYS.lastRotation(keyType), new Date().toISOString());

    // Audit log
    await auditService.log({
      userId: performedBy,
      action: 'key.rotated',
      actionType: 'security',
      resourceType: 'key',
      resourceId: newKeyId,
      metadata: {
        keyType,
        reason,
        timestamp: new Date().toISOString(),
      },
      status: 'success',
    });

    logger.info('Key rotation recorded', {
      keyType,
      newKeyId,
      reason,
      performedBy,
    });
  }

  /**
   * Generate a new RSA key pair
   */
  generateKeyPair(): { privateKey: string; publicKey: string; keyId: string; fingerprint: string } {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const keyId = `key-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const fingerprint = crypto.createHash('sha256').update(publicKey).digest('hex').substring(0, 16);

    return { privateKey, publicKey, keyId, fingerprint };
  }

  /**
   * Get rotation status for monitoring
   */
  async getRotationStatus(): Promise<{
    jwt: { lastRotation: string | null; ageInDays: number | null; rotationNeeded: boolean };
    s2s: { lastRotation: string | null; ageInDays: number | null; rotationNeeded: boolean };
    config: RotationConfig;
  }> {
    const redis = getRedis();

    const jwtLastRotation = await redis.get(ROTATION_KEYS.lastRotation('jwt'));
    const s2sLastRotation = await redis.get(ROTATION_KEYS.lastRotation('s2s'));

    const jwtCheck = await this.checkRotationNeeded('jwt');
    const s2sCheck = await this.checkRotationNeeded('s2s');

    return {
      jwt: {
        lastRotation: jwtLastRotation,
        ageInDays: jwtCheck.currentKeyAge || null,
        rotationNeeded: jwtCheck.needed,
      },
      s2s: {
        lastRotation: s2sLastRotation,
        ageInDays: s2sCheck.currentKeyAge || null,
        rotationNeeded: s2sCheck.needed,
      },
      config: this.config,
    };
  }

  /**
   * Update rotation configuration
   */
  async updateConfig(newConfig: Partial<RotationConfig>, updatedBy: string): Promise<void> {
    const redis = getRedis();

    this.config = { ...this.config, ...newConfig };
    await redis.set(ROTATION_KEYS.config, JSON.stringify(this.config));

    await auditService.log({
      userId: updatedBy,
      action: 'key-rotation.config.updated',
      actionType: 'security',
      resourceType: 'config',
      resourceId: 'key-rotation',
      metadata: { newConfig },
      status: 'success',
    });

    logger.info('Key rotation config updated', { newConfig, updatedBy });
  }

  /**
   * Acquire rotation lock (prevent concurrent rotations)
   */
  async acquireRotationLock(keyType: 'jwt' | 's2s', ttlSeconds = 300): Promise<boolean> {
    const redis = getRedis();
    const lockKey = `${ROTATION_KEYS.rotationLock}:${keyType}`;
    
    const result = await redis.set(lockKey, Date.now().toString(), 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Release rotation lock
   */
  async releaseRotationLock(keyType: 'jwt' | 's2s'): Promise<void> {
    const redis = getRedis();
    const lockKey = `${ROTATION_KEYS.rotationLock}:${keyType}`;
    await redis.del(lockKey);
  }
}

// Singleton instance
export const keyRotationService = new KeyRotationService();
