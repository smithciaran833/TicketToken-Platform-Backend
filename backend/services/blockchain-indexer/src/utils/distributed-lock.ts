/**
 * Distributed Lock Utility
 * 
 * AUDIT FIX: IDP-2 - Locking on concurrent processing
 * AUDIT FIX: IDP-3 - Prevent race conditions in check-then-insert patterns
 * 
 * Uses Redis for distributed locking across multiple service instances
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_LOCK_TTL_MS = 30000; // 30 seconds default lock
const DEFAULT_RETRY_DELAY_MS = 100;
const DEFAULT_MAX_RETRIES = 50;
const LOCK_PREFIX = 'blockchain-indexer:lock:';

// =============================================================================
// TYPES
// =============================================================================

export interface LockOptions {
  /** Lock TTL in milliseconds */
  ttlMs?: number;
  /** Retry delay in milliseconds */
  retryDelayMs?: number;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Unique lock owner ID (auto-generated if not provided) */
  ownerId?: string;
}

export interface Lock {
  key: string;
  ownerId: string;
  acquiredAt: number;
  ttlMs: number;
}

export interface LockResult {
  acquired: boolean;
  lock?: Lock;
}

// =============================================================================
// DISTRIBUTED LOCK MANAGER
// =============================================================================

export class DistributedLockManager {
  private client: Redis;
  private readonly prefix: string;

  constructor(redisClient: Redis, prefix?: string) {
    this.client = redisClient;
    this.prefix = prefix || LOCK_PREFIX;
  }

  /**
   * Attempt to acquire a distributed lock
   * Uses SET NX with expiry for atomic lock acquisition
   */
  async acquire(resourceKey: string, options: LockOptions = {}): Promise<LockResult> {
    const {
      ttlMs = DEFAULT_LOCK_TTL_MS,
      retryDelayMs = DEFAULT_RETRY_DELAY_MS,
      maxRetries = DEFAULT_MAX_RETRIES,
      ownerId = uuidv4()
    } = options;

    const lockKey = `${this.prefix}${resourceKey}`;
    let attempts = 0;

    while (attempts < maxRetries) {
      try {
        // Atomic SET NX with expiry
        const result = await this.client.set(
          lockKey,
          ownerId,
          'PX', // milliseconds
          ttlMs,
          'NX' // only set if not exists
        );

        if (result === 'OK') {
          const lock: Lock = {
            key: resourceKey,
            ownerId,
            acquiredAt: Date.now(),
            ttlMs
          };

          logger.debug({ lockKey, ownerId, ttlMs }, 'Lock acquired');
          return { acquired: true, lock };
        }

        // Lock not acquired, retry
        attempts++;
        
        if (attempts < maxRetries) {
          await this.sleep(retryDelayMs);
        }
      } catch (error) {
        logger.error({ error, lockKey }, 'Error acquiring lock');
        throw error;
      }
    }

    logger.warn({ lockKey, attempts, maxRetries }, 'Failed to acquire lock after max retries');
    return { acquired: false };
  }

  /**
   * Release a distributed lock
   * Uses Lua script for atomic check-and-delete
   */
  async release(lock: Lock): Promise<boolean> {
    const lockKey = `${this.prefix}${lock.key}`;
    
    // Lua script for atomic check-and-delete
    // Only delete if the lock value matches our owner ID
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.client.eval(script, 1, lockKey, lock.ownerId);
      
      if (result === 1) {
        logger.debug({ lockKey, ownerId: lock.ownerId }, 'Lock released');
        return true;
      } else {
        logger.warn({ lockKey, ownerId: lock.ownerId }, 'Lock release failed - not owner or expired');
        return false;
      }
    } catch (error) {
      logger.error({ error, lockKey }, 'Error releasing lock');
      throw error;
    }
  }

  /**
   * Extend a lock's TTL
   */
  async extend(lock: Lock, additionalTtlMs: number): Promise<boolean> {
    const lockKey = `${this.prefix}${lock.key}`;
    
    // Lua script to extend only if we own the lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const newTtl = lock.ttlMs + additionalTtlMs;
      const result = await this.client.eval(script, 1, lockKey, lock.ownerId, newTtl.toString());
      
      if (result === 1) {
        lock.ttlMs = newTtl;
        logger.debug({ lockKey, newTtl }, 'Lock extended');
        return true;
      }
      return false;
    } catch (error) {
      logger.error({ error, lockKey }, 'Error extending lock');
      throw error;
    }
  }

  /**
   * Check if a resource is currently locked
   */
  async isLocked(resourceKey: string): Promise<boolean> {
    const lockKey = `${this.prefix}${resourceKey}`;
    const value = await this.client.get(lockKey);
    return value !== null;
  }

  /**
   * Execute a function with lock protection
   * Automatically acquires and releases lock
   */
  async withLock<T>(
    resourceKey: string,
    fn: () => Promise<T>,
    options: LockOptions = {}
  ): Promise<T> {
    const result = await this.acquire(resourceKey, options);
    
    if (!result.acquired || !result.lock) {
      throw new Error(`Failed to acquire lock for resource: ${resourceKey}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(result.lock);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// TRANSACTION PROCESSING LOCK HELPERS
// =============================================================================

/**
 * Create a lock key for transaction signature
 * AUDIT FIX: IDP-2 - Prevent duplicate processing
 */
export function transactionLockKey(signature: string): string {
  return `tx:${signature}`;
}

/**
 * Create a lock key for slot processing
 */
export function slotLockKey(slot: number): string {
  return `slot:${slot}`;
}

/**
 * Create a lock key for reconciliation
 */
export function reconciliationLockKey(type: string): string {
  return `reconcile:${type}`;
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let lockManagerInstance: DistributedLockManager | null = null;

/**
 * Initialize the distributed lock manager
 */
export function initializeLockManager(redisClient: Redis): DistributedLockManager {
  if (lockManagerInstance) {
    logger.warn('Lock manager already initialized');
    return lockManagerInstance;
  }
  
  lockManagerInstance = new DistributedLockManager(redisClient);
  logger.info('Distributed lock manager initialized');
  return lockManagerInstance;
}

/**
 * Get the distributed lock manager instance
 */
export function getLockManager(): DistributedLockManager {
  if (!lockManagerInstance) {
    throw new Error('Lock manager not initialized. Call initializeLockManager() first.');
  }
  return lockManagerInstance;
}
