/**
 * Nonce Store
 *
 * Redis-backed nonce storage for replay attack prevention.
 * Uses SETNX (SET if Not eXists) for atomic "use once" semantics.
 */

import { getRedisClient } from '../redis/connection-manager';
import { DEFAULT_HMAC_CONFIG } from './types';

/**
 * Nonce Store Class
 *
 * Stores nonces in Redis with TTL for automatic cleanup.
 * Key format: {prefix}:{serviceName}:{nonce}
 */
export class NonceStore {
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;

  constructor(options?: { keyPrefix?: string; ttlSeconds?: number }) {
    this.keyPrefix = options?.keyPrefix ?? DEFAULT_HMAC_CONFIG.nonceKeyPrefix;
    this.ttlSeconds = options?.ttlSeconds ?? Math.ceil(DEFAULT_HMAC_CONFIG.replayWindowMs / 1000);
  }

  /**
   * Build Redis key for a nonce
   */
  private buildKey(nonce: string, serviceName: string): string {
    return `${this.keyPrefix}:${serviceName}:${nonce}`;
  }

  /**
   * Check if a nonce has been used and mark it as used atomically
   *
   * @param nonce - The nonce to check
   * @param serviceName - The service that sent the request
   * @returns true if nonce was already used (replay attack), false if new
   */
  public async isNonceUsed(nonce: string, serviceName: string): Promise<boolean> {
    try {
      const redis = await getRedisClient();
      const key = this.buildKey(nonce, serviceName);

      // Use SET NX EX (Set if Not Exists with Expiry)
      // Returns 'OK' if key was set (nonce is new), null if key exists (replay)
      const result = await redis.set(key, '1', 'EX', this.ttlSeconds, 'NX');

      // If result is null, key already existed = nonce was used = replay attack
      return result === null;
    } catch (error) {
      // Log error but don't fail open - reject the request
      console.error('[NonceStore] Redis error during nonce check:', error);
      throw new Error('Nonce validation unavailable');
    }
  }

  /**
   * Manually mark a nonce as used (for testing or special cases)
   */
  public async markNonceAsUsed(nonce: string, serviceName: string): Promise<void> {
    const redis = await getRedisClient();
    const key = this.buildKey(nonce, serviceName);
    await redis.set(key, '1', 'EX', this.ttlSeconds);
  }

  /**
   * Check if a nonce exists without marking it (for testing)
   */
  public async nonceExists(nonce: string, serviceName: string): Promise<boolean> {
    const redis = await getRedisClient();
    const key = this.buildKey(nonce, serviceName);
    const exists = await redis.exists(key);
    return exists === 1;
  }

  /**
   * Delete a nonce (for testing cleanup)
   */
  public async deleteNonce(nonce: string, serviceName: string): Promise<void> {
    const redis = await getRedisClient();
    const key = this.buildKey(nonce, serviceName);
    await redis.del(key);
  }

  /**
   * Get TTL remaining for a nonce (for debugging)
   */
  public async getNonceTTL(nonce: string, serviceName: string): Promise<number> {
    const redis = await getRedisClient();
    const key = this.buildKey(nonce, serviceName);
    return await redis.ttl(key);
  }
}

// Default instance (lazy initialization)
let defaultStore: NonceStore | null = null;

/**
 * Get the default nonce store
 */
export function getNonceStore(): NonceStore {
  if (!defaultStore) {
    defaultStore = new NonceStore();
  }
  return defaultStore;
}

/**
 * Create a new nonce store with custom config
 */
export function createNonceStore(options?: { keyPrefix?: string; ttlSeconds?: number }): NonceStore {
  return new NonceStore(options);
}
