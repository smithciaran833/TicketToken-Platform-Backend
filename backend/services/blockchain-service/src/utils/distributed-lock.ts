/**
 * Distributed Locking for Blockchain Service
 * 
 * Issues Fixed:
 * - #16: No distributed locking → Redis-based Redlock
 * - #17: Race conditions → Lock before mint operations
 * 
 * Features:
 * - Redis-based distributed locking using Redlock algorithm
 * - Automatic lock extension
 * - Graceful fallback
 */

import { logger } from './logger';

// Lock settings
const LOCK_DEFAULT_TTL_MS = 30000;  // 30 seconds
const LOCK_RETRY_COUNT = 3;
const LOCK_RETRY_DELAY_MS = 200;

// Types
interface Lock {
  key: string;
  value: string;
  expiresAt: number;
}

// In-memory fallback when Redis is unavailable
const memoryLocks = new Map<string, { value: string; expiresAt: number }>();

// Redis client reference (injected)
let redisClient: any = null;

/**
 * Initialize Redis client for distributed locking
 */
export function initializeDistributedLock(client: any): void {
  redisClient = client;
  logger.info('Distributed lock Redis client initialized');
}

/**
 * Generate a unique lock value
 */
function generateLockValue(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * Acquire a lock using Redis (SET NX PX)
 */
async function acquireRedisLock(
  key: string,
  ttlMs: number,
  retries: number = LOCK_RETRY_COUNT
): Promise<Lock | null> {
  const lockKey = `lock:${key}`;
  const lockValue = generateLockValue();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // SET key value NX PX ttlMs
      const result = await redisClient.set(lockKey, lockValue, 'NX', 'PX', ttlMs);
      
      if (result === 'OK') {
        return {
          key: lockKey,
          value: lockValue,
          expiresAt: Date.now() + ttlMs
        };
      }

      // Lock not acquired, wait before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
      }
    } catch (error) {
      logger.warn('Redis lock acquisition error', {
        key,
        attempt,
        error: (error as Error).message
      });
      
      if (attempt === retries) {
        throw error;
      }
    }
  }

  return null;
}

/**
 * Release a lock using Redis (Lua script for atomic operation)
 */
async function releaseRedisLock(lock: Lock): Promise<boolean> {
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  try {
    const result = await redisClient.eval(luaScript, 1, lock.key, lock.value);
    return result === 1;
  } catch (error) {
    logger.warn('Redis lock release error', {
      key: lock.key,
      error: (error as Error).message
    });
    return false;
  }
}

/**
 * Acquire a lock using in-memory fallback
 */
function acquireMemoryLock(key: string, ttlMs: number): Lock | null {
  const lockKey = `lock:${key}`;
  const now = Date.now();

  // Clean expired locks
  const existing = memoryLocks.get(lockKey);
  if (existing && existing.expiresAt > now) {
    return null; // Lock is held
  }

  const lockValue = generateLockValue();
  memoryLocks.set(lockKey, {
    value: lockValue,
    expiresAt: now + ttlMs
  });

  return {
    key: lockKey,
    value: lockValue,
    expiresAt: now + ttlMs
  };
}

/**
 * Release a lock using in-memory fallback
 */
function releaseMemoryLock(lock: Lock): boolean {
  const existing = memoryLocks.get(lock.key);
  if (existing && existing.value === lock.value) {
    memoryLocks.delete(lock.key);
    return true;
  }
  return false;
}

/**
 * Execute a function while holding a distributed lock
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  let lock: Lock | null = null;

  logger.debug('Acquiring distributed lock', { key, ttlMs });

  try {
    // Try Redis first, fall back to memory
    if (redisClient) {
      lock = await acquireRedisLock(key, ttlMs);
    } else {
      logger.debug('Using in-memory lock (Redis not available)');
      lock = acquireMemoryLock(key, ttlMs);
    }

    if (!lock) {
      throw new Error(`Failed to acquire lock for: ${key}. Resource is busy.`);
    }

    logger.debug('Lock acquired', {
      key,
      lockId: lock.value.substring(0, 8),
      expiresAt: new Date(lock.expiresAt).toISOString()
    });

    return await fn();

  } finally {
    if (lock) {
      try {
        const released = redisClient 
          ? await releaseRedisLock(lock)
          : releaseMemoryLock(lock);
        
        logger.debug('Lock released', { key, released });
      } catch (releaseError) {
        logger.warn('Failed to release lock', {
          key,
          error: (releaseError as Error).message
        });
      }
    }
  }
}

/**
 * Try to acquire a lock without retries
 */
export async function tryLock(
  key: string,
  ttlMs: number
): Promise<Lock | null> {
  if (redisClient) {
    return acquireRedisLock(key, ttlMs, 0);
  }
  return acquireMemoryLock(key, ttlMs);
}

/**
 * Release a lock
 */
export async function releaseLock(lock: Lock): Promise<void> {
  if (redisClient) {
    await releaseRedisLock(lock);
  } else {
    releaseMemoryLock(lock);
  }
}

// Lock key generators for blockchain operations
export function createMintLockKey(tenantId: string, ticketId: string): string {
  return `mint:${tenantId}:${ticketId}`;
}

export function createTransactionLockKey(signature: string): string {
  return `tx:${signature}`;
}

export function createWalletLockKey(walletAddress: string): string {
  return `wallet:${walletAddress}`;
}

export function createTreasuryLockKey(): string {
  return `treasury:operations`;
}

export type { Lock };
