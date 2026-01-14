import Redlock, { Lock, ResourceLockedError } from 'redlock';
import Redis from 'ioredis';
import logger from './logger';

let redlock: Redlock | null = null;
let redisClient: Redis | null = null;

// Default lock settings
const LOCK_DEFAULT_TTL_MS = 30000;  // 30 seconds
const LOCK_RETRY_COUNT = 3;
const LOCK_RETRY_DELAY_MS = 200;
const LOCK_RETRY_JITTER_MS = 100;

/**
 * Get or create the Redis client for distributed locking
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      }
    });

    redisClient.on('error', (error) => {
      logger.error('Redis client error (distributed lock)', { error: error.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis client connected (distributed lock)');
    });
  }
  return redisClient;
}

/**
 * Get or create the Redlock instance for distributed locking
 */
export function getRedlock(): Redlock {
  if (!redlock) {
    const redis = getRedisClient();
    
    redlock = new Redlock([redis], {
      // The expected clock drift; for more details, see:
      // http://redis.io/topics/distlock
      driftFactor: 0.01, // multiplied by lock ttl to determine drift time
      
      // The max number of times Redlock will attempt to lock a resource
      retryCount: LOCK_RETRY_COUNT,
      
      // The time in ms between attempts
      retryDelay: LOCK_RETRY_DELAY_MS,
      
      // The max time in ms randomly added to retries to improve performance under high contention
      retryJitter: LOCK_RETRY_JITTER_MS,
      
      // The minimum remaining time on a lock before an extension is automatically attempted
      automaticExtensionThreshold: 500
    });

    redlock.on('error', (error: Error) => {
      // Ignore lock acquisition errors - they're expected under contention
      if (error instanceof ResourceLockedError) {
        logger.debug('Lock acquisition failed - resource already locked', {
          message: error.message
        });
        return;
      }
      logger.error('Redlock error', { error: error.message });
    });

    logger.info('Redlock initialized for distributed locking');
  }
  return redlock;
}

/**
 * Execute a function while holding a distributed lock
 * 
 * @param key - The lock key (should be unique per resource)
 * @param ttlMs - Time-to-live for the lock in milliseconds
 * @param fn - The function to execute while holding the lock
 * @returns The result of the function
 * @throws If the lock cannot be acquired or the function throws
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const lockKey = `lock:${key}`;
  let lock: Lock | null = null;

  logger.debug('Acquiring distributed lock', { lockKey, ttlMs });

  try {
    lock = await getRedlock().acquire([lockKey], ttlMs);
    
    logger.debug('Lock acquired', { 
      lockKey, 
      lockId: lock.value,
      expiresAt: new Date(Date.now() + ttlMs).toISOString()
    });

    return await fn();

  } catch (error) {
    if (error instanceof ResourceLockedError) {
      logger.warn('Failed to acquire lock - resource is locked', {
        lockKey,
        message: (error as Error).message
      });
      throw new Error(`Resource is locked: ${key}. Please try again.`);
    }
    throw error;
  } finally {
    if (lock) {
      try {
        await lock.release();
        logger.debug('Lock released', { lockKey });
      } catch (releaseError) {
        // Lock may have already expired
        logger.warn('Failed to release lock (may have expired)', {
          lockKey,
          error: (releaseError as Error).message
        });
      }
    }
  }
}

/**
 * Try to acquire a lock, but don't wait if it's not available
 * Returns null if lock cannot be acquired immediately
 */
export async function tryLock(
  key: string,
  ttlMs: number
): Promise<Lock | null> {
  const lockKey = `lock:${key}`;

  try {
    const lock = await getRedlock().acquire([lockKey], ttlMs);
    logger.debug('Lock acquired (try)', { lockKey });
    return lock;
  } catch (error) {
    if (error instanceof ResourceLockedError) {
      logger.debug('Lock not available (try)', { lockKey });
      return null;
    }
    throw error;
  }
}

/**
 * Extend an existing lock
 */
export async function extendLock(lock: Lock, ttlMs: number): Promise<Lock> {
  return lock.extend(ttlMs);
}

/**
 * Release a lock manually
 */
export async function releaseLock(lock: Lock): Promise<void> {
  await lock.release();
}

/**
 * Create a lock key for minting operations
 */
export function createMintLockKey(tenantId: string, ticketId: string): string {
  return `mint:${tenantId}:${ticketId}`;
}

/**
 * Create a lock key for batch operations
 */
export function createBatchLockKey(tenantId: string, batchId: string): string {
  return `batch:${tenantId}:${batchId}`;
}

/**
 * Create a lock key for venue operations
 */
export function createVenueLockKey(venueId: string): string {
  return `venue:${venueId}`;
}

// Export types for consumers
export { Lock, ResourceLockedError };
