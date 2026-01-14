/**
 * Distributed Lock Utility for Marketplace Service
 * 
 * Issues Fixed:
 * - DB-H1: Race conditions on listing purchase → Redis-based locking
 * - DB-H2: Concurrent modification conflicts → Exclusive locks
 * - DB-H4: No optimistic locking → Version checking support
 * - IDEM-H2: Duplicate purchases → Purchase-level locking
 * 
 * Features:
 * - Redis-based distributed locks (Redlock algorithm)
 * - Automatic lock expiration
 * - Lock retry with backoff
 * - Lock extension support
 */

import { getRedis } from '../config/redis';
import { logger } from './logger';
import { randomUUID } from 'crypto';

const log = logger.child({ component: 'DistributedLock' });

// Configuration
const DEFAULT_LOCK_TTL_MS = parseInt(process.env.LOCK_DEFAULT_TTL_MS || '30000', 10);
const LOCK_RETRY_COUNT = parseInt(process.env.LOCK_RETRY_COUNT || '3', 10);
const LOCK_RETRY_DELAY_MS = parseInt(process.env.LOCK_RETRY_DELAY_MS || '200', 10);
const LOCK_KEY_PREFIX = 'lock:';

interface LockOptions {
  ttlMs?: number;
  retryCount?: number;
  retryDelayMs?: number;
}

interface Lock {
  key: string;
  token: string;
  expiresAt: number;
  release: () => Promise<boolean>;
  extend: (additionalMs?: number) => Promise<boolean>;
}

/**
 * AUDIT FIX DB-H1: Acquire a distributed lock
 */
export async function acquireLock(
  resourceKey: string,
  options: LockOptions = {}
): Promise<Lock | null> {
  const {
    ttlMs = DEFAULT_LOCK_TTL_MS,
    retryCount = LOCK_RETRY_COUNT,
    retryDelayMs = LOCK_RETRY_DELAY_MS
  } = options;

  const redis = getRedis();
  const lockKey = `${LOCK_KEY_PREFIX}${resourceKey}`;
  const token = randomUUID();
  const expiresAt = Date.now() + ttlMs;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Try to set the lock using SET NX EX (atomic operation)
      const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        log.debug('Lock acquired', { resourceKey, token, ttlMs, attempt });

        const lock: Lock = {
          key: lockKey,
          token,
          expiresAt,
          release: () => releaseLock(lockKey, token),
          extend: (additionalMs?: number) => extendLock(lockKey, token, additionalMs || ttlMs)
        };

        return lock;
      }

      // Lock not acquired, wait before retry
      if (attempt < retryCount) {
        const delay = retryDelayMs * Math.pow(2, attempt); // Exponential backoff
        await sleep(delay);
      }
    } catch (error: any) {
      log.error('Lock acquisition error', {
        resourceKey,
        attempt,
        error: error.message
      });

      if (attempt === retryCount) {
        throw error;
      }
    }
  }

  log.warn('Failed to acquire lock after retries', { resourceKey, retryCount });
  return null;
}

/**
 * AUDIT FIX DB-H1: Release a distributed lock
 */
export async function releaseLock(lockKey: string, token: string): Promise<boolean> {
  const redis = getRedis();

  // Use Lua script for atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const result = await redis.eval(script, 1, lockKey, token);
    const released = result === 1;

    if (released) {
      log.debug('Lock released', { lockKey });
    } else {
      log.warn('Lock release failed - token mismatch or expired', { lockKey });
    }

    return released;
  } catch (error: any) {
    log.error('Lock release error', { lockKey, error: error.message });
    return false;
  }
}

/**
 * AUDIT FIX DB-H1: Extend a lock's TTL
 */
export async function extendLock(
  lockKey: string,
  token: string,
  additionalMs: number = DEFAULT_LOCK_TTL_MS
): Promise<boolean> {
  const redis = getRedis();

  // Use Lua script for atomic check-and-extend
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("pexpire", KEYS[1], ARGV[2])
    else
      return 0
    end
  `;

  try {
    const result = await redis.eval(script, 1, lockKey, token, additionalMs.toString());
    const extended = result === 1;

    if (extended) {
      log.debug('Lock extended', { lockKey, additionalMs });
    } else {
      log.warn('Lock extension failed', { lockKey });
    }

    return extended;
  } catch (error: any) {
    log.error('Lock extension error', { lockKey, error: error.message });
    return false;
  }
}

/**
 * AUDIT FIX DB-H1: Execute a function with a lock
 */
export async function withLock<T>(
  resourceKey: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = await acquireLock(resourceKey, options);

  if (!lock) {
    throw new Error(`Failed to acquire lock for resource: ${resourceKey}`);
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

/**
 * AUDIT FIX DB-H2: Create a listing-specific lock
 */
export async function acquireListingLock(
  listingId: string,
  options: LockOptions = {}
): Promise<Lock | null> {
  return acquireLock(`listing:${listingId}`, {
    ttlMs: 10000, // 10 second default for listing operations
    ...options
  });
}

/**
 * AUDIT FIX IDEM-H2: Create a purchase-specific lock
 */
export async function acquirePurchaseLock(
  listingId: string,
  buyerId: string,
  options: LockOptions = {}
): Promise<Lock | null> {
  return acquireLock(`purchase:${listingId}:${buyerId}`, {
    ttlMs: 30000, // 30 second default for purchase operations
    retryCount: 5,
    retryDelayMs: 500,
    ...options
  });
}

/**
 * AUDIT FIX DB-H2: Create a user wallet lock
 */
export async function acquireWalletLock(
  userId: string,
  options: LockOptions = {}
): Promise<Lock | null> {
  return acquireLock(`wallet:${userId}`, {
    ttlMs: 15000, // 15 second default for wallet operations
    ...options
  });
}

/**
 * AUDIT FIX DB-H4: Optimistic locking helper
 */
export async function checkVersion(
  tableName: string,
  recordId: string,
  expectedVersion: number,
  knex: any
): Promise<boolean> {
  const record = await knex(tableName)
    .where('id', recordId)
    .select('version')
    .first();

  if (!record) {
    return false;
  }

  return record.version === expectedVersion;
}

/**
 * AUDIT FIX DB-H4: Update with optimistic locking
 */
export async function updateWithVersion<T>(
  tableName: string,
  recordId: string,
  expectedVersion: number,
  updates: Partial<T>,
  knex: any
): Promise<boolean> {
  const result = await knex(tableName)
    .where('id', recordId)
    .where('version', expectedVersion)
    .update({
      ...updates,
      version: expectedVersion + 1,
      updated_at: knex.fn.now()
    });

  if (result === 0) {
    log.warn('Optimistic lock conflict', {
      tableName,
      recordId,
      expectedVersion
    });
    return false;
  }

  return true;
}

/**
 * Check if a resource is currently locked
 */
export async function isLocked(resourceKey: string): Promise<boolean> {
  const redis = getRedis();
  const lockKey = `${LOCK_KEY_PREFIX}${resourceKey}`;
  const exists = await redis.exists(lockKey);
  return exists === 1;
}

/**
 * Force release a lock (admin function - use with caution)
 */
export async function forceReleaseLock(resourceKey: string): Promise<boolean> {
  const redis = getRedis();
  const lockKey = `${LOCK_KEY_PREFIX}${resourceKey}`;

  try {
    const result = await redis.del(lockKey);
    log.warn('Lock force released', { resourceKey });
    return result === 1;
  } catch (error: any) {
    log.error('Force release failed', { resourceKey, error: error.message });
    return false;
  }
}

/**
 * Helper function to sleep
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Export configuration for testing
export const lockConfig = {
  DEFAULT_LOCK_TTL_MS,
  LOCK_RETRY_COUNT,
  LOCK_RETRY_DELAY_MS,
  LOCK_KEY_PREFIX
};
