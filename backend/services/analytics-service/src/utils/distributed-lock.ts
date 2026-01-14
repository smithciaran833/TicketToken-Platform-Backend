/**
 * Distributed Lock Implementation
 * 
 * AUDIT FIX: CRON-1 - Distributed locking for scheduled jobs
 * Prevents duplicate job execution across multiple service instances
 */

import Redis from 'ioredis';
import { getRedis } from '../config/redis';
import { logger } from './logger';

// =============================================================================
// Types
// =============================================================================

export interface LockOptions {
  ttl?: number; // Lock TTL in milliseconds (default: 30000)
  retryCount?: number; // Number of retry attempts (default: 3)
  retryDelay?: number; // Delay between retries in ms (default: 200)
}

export interface Lock {
  key: string;
  value: string;
  ttl: number;
  acquiredAt: number;
}

// =============================================================================
// Distributed Lock Class
// =============================================================================

class DistributedLock {
  private redis: Redis | null = null;
  private heldLocks: Map<string, Lock> = new Map();
  private readonly prefix = 'analytics:lock:';

  private getRedis(): Redis {
    if (!this.redis) {
      this.redis = getRedis();
    }
    return this.redis;
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(
    lockName: string,
    options: LockOptions = {}
  ): Promise<Lock | null> {
    const {
      ttl = 30000,
      retryCount = 3,
      retryDelay = 200,
    } = options;

    const key = `${this.prefix}${lockName}`;
    const value = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const ttlSeconds = Math.ceil(ttl / 1000);

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const redis = this.getRedis();
        
        // Try to acquire lock using SET NX (only set if not exists)
        const result = await redis.set(key, value, 'EX', ttlSeconds, 'NX');

        if (result === 'OK') {
          const lock: Lock = {
            key,
            value,
            ttl,
            acquiredAt: Date.now(),
          };

          this.heldLocks.set(key, lock);

          logger.debug({
            event: 'lock_acquired',
            lockName,
            ttl,
            attempt,
          }, `Acquired lock: ${lockName}`);

          return lock;
        }

        // Lock not acquired, retry if attempts remain
        if (attempt < retryCount) {
          await this.sleep(retryDelay);
        }
      } catch (error) {
        logger.error({
          event: 'lock_acquire_error',
          lockName,
          error: (error as Error).message,
          attempt,
        }, `Failed to acquire lock: ${lockName}`);

        if (attempt < retryCount) {
          await this.sleep(retryDelay);
        }
      }
    }

    logger.debug({
      event: 'lock_not_acquired',
      lockName,
      retryCount,
    }, `Could not acquire lock: ${lockName}`);

    return null;
  }

  /**
   * Release a distributed lock
   */
  async release(lock: Lock | null): Promise<boolean> {
    if (!lock) {
      return false;
    }

    try {
      const redis = this.getRedis();

      // Use Lua script for atomic check-and-delete
      // Only delete if the value matches (we still own the lock)
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redis.eval(script, 1, lock.key, lock.value);

      if (result === 1) {
        this.heldLocks.delete(lock.key);
        logger.debug({
          event: 'lock_released',
          lockName: lock.key.replace(this.prefix, ''),
        }, `Released lock: ${lock.key}`);
        return true;
      }

      logger.warn({
        event: 'lock_release_failed',
        lockName: lock.key.replace(this.prefix, ''),
        reason: 'Lock value mismatch or already expired',
      }, `Failed to release lock: ${lock.key}`);

      return false;
    } catch (error) {
      logger.error({
        event: 'lock_release_error',
        lockName: lock.key.replace(this.prefix, ''),
        error: (error as Error).message,
      }, `Error releasing lock: ${lock.key}`);

      return false;
    }
  }

  /**
   * Extend a lock's TTL
   */
  async extend(lock: Lock, additionalTtl?: number): Promise<boolean> {
    const ttl = additionalTtl || lock.ttl;
    const ttlSeconds = Math.ceil(ttl / 1000);

    try {
      const redis = this.getRedis();

      // Use Lua script for atomic check-and-extend
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("expire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await redis.eval(script, 1, lock.key, lock.value, ttlSeconds);

      if (result === 1) {
        logger.debug({
          event: 'lock_extended',
          lockName: lock.key.replace(this.prefix, ''),
          ttl,
        }, `Extended lock: ${lock.key}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error({
        event: 'lock_extend_error',
        lockName: lock.key.replace(this.prefix, ''),
        error: (error as Error).message,
      }, `Error extending lock: ${lock.key}`);

      return false;
    }
  }

  /**
   * Check if a lock is held
   */
  async isLocked(lockName: string): Promise<boolean> {
    try {
      const redis = this.getRedis();
      const key = `${this.prefix}${lockName}`;
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({
        event: 'lock_check_error',
        lockName,
        error: (error as Error).message,
      }, `Error checking lock: ${lockName}`);
      return false;
    }
  }

  /**
   * Release all locks held by this instance
   */
  async releaseAll(): Promise<void> {
    const locks = Array.from(this.heldLocks.values());
    
    for (const lock of locks) {
      await this.release(lock);
    }

    logger.info({
      event: 'all_locks_released',
      count: locks.length,
    }, `Released ${locks.length} locks`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let distributedLockInstance: DistributedLock | null = null;

export function getDistributedLock(): DistributedLock {
  if (!distributedLockInstance) {
    distributedLockInstance = new DistributedLock();
  }
  return distributedLockInstance;
}

// =============================================================================
// Convenience Functions for Common Locks
// =============================================================================

/**
 * Acquire lock for RFM calculation job
 */
export async function acquireRFMLock(
  venueId?: string,
  options?: LockOptions
): Promise<Lock | null> {
  const lockName = venueId ? `rfm:${venueId}` : 'rfm:global';
  return getDistributedLock().acquire(lockName, options);
}

/**
 * Acquire lock for report generation
 */
export async function acquireReportLock(
  reportId: string,
  options?: LockOptions
): Promise<Lock | null> {
  return getDistributedLock().acquire(`report:${reportId}`, options);
}

/**
 * Acquire lock for data export
 */
export async function acquireExportLock(
  exportId: string,
  options?: LockOptions
): Promise<Lock | null> {
  return getDistributedLock().acquire(`export:${exportId}`, options);
}

/**
 * Acquire lock for aggregation job
 */
export async function acquireAggregationLock(
  aggregationType: string,
  options?: LockOptions
): Promise<Lock | null> {
  return getDistributedLock().acquire(`aggregation:${aggregationType}`, options);
}

// =============================================================================
// Execute with Lock Helper
// =============================================================================

/**
 * Execute a function while holding a lock
 * Automatically acquires and releases the lock
 */
export async function withLock<T>(
  lockName: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T | null> {
  const lock = await getDistributedLock().acquire(lockName, options);

  if (!lock) {
    logger.debug({
      event: 'with_lock_skipped',
      lockName,
    }, `Skipping execution, could not acquire lock: ${lockName}`);
    return null;
  }

  try {
    return await fn();
  } finally {
    await getDistributedLock().release(lock);
  }
}

export default {
  getDistributedLock,
  acquireRFMLock,
  acquireReportLock,
  acquireExportLock,
  acquireAggregationLock,
  withLock,
};
