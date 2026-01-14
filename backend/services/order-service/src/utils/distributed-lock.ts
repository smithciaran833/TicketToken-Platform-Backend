import { getRedis } from '../config/redis';
import { logger } from './logger';

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retryDelay?: number; // Delay between retry attempts in ms
  retryCount?: number; // Number of times to retry acquiring lock
  // MEDIUM: Owner identifier for lock extension
  owner?: string;
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttl: 30000, // 30 seconds
  retryDelay: 100, // 100ms
  retryCount: 3,
  owner: '',
};

/**
 * Distributed lock using Redis SET NX
 * Prevents multiple instances from executing critical sections simultaneously
 */
export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const client = getRedis();
  // MEDIUM: Use owner if provided, otherwise generate unique value
  const lockValue = opts.owner || `lock:${Date.now()}:${Math.random()}`;
  let acquired = false;

  // Try to acquire lock with retries
  for (let attempt = 0; attempt <= opts.retryCount; attempt++) {
    try {
      const result = await client.set(lockKey, lockValue, 'PX', opts.ttl, 'NX');
      if (result === 'OK') {
        acquired = true;
        break;
      }

      // If not the last attempt, wait before retrying
      if (attempt < opts.retryCount) {
        await new Promise(resolve => setTimeout(resolve, opts.retryDelay));
      }
    } catch (error) {
      logger.error('Error acquiring distributed lock', { error, lockKey, attempt });
      if (attempt === opts.retryCount) {
        throw new Error(`Failed to acquire lock after ${opts.retryCount} attempts`);
      }
    }
  }

  if (!acquired) {
    throw new Error(`Could not acquire lock: ${lockKey}`);
  }

  try {
    // Execute the function with the lock held
    return await fn();
  } finally {
    // Release the lock (only if we still own it)
    try {
      const currentValue = await client.get(lockKey);
      if (currentValue === lockValue) {
        await client.del(lockKey);
      }
    } catch (error) {
      logger.error('Error releasing distributed lock', { error, lockKey });
    }
  }
}

/**
 * MEDIUM: Extend a lock's TTL if we still own it
 * Used for long-running jobs that need to keep the lock beyond initial TTL
 */
export async function extendLock(
  lockKey: string,
  owner: string,
  ttlMs: number
): Promise<boolean> {
  const client = getRedis();

  try {
    // Lua script to atomically check owner and extend TTL
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await client.eval(script, 1, lockKey, owner, ttlMs.toString());
    
    if (result === 1) {
      logger.debug('Lock extended successfully', { lockKey, owner, ttlMs });
      return true;
    } else {
      logger.warn('Failed to extend lock - not owner or lock expired', { lockKey, owner });
      return false;
    }
  } catch (error) {
    logger.error('Error extending lock', { error, lockKey, owner });
    return false;
  }
}

/**
 * Try to acquire a lock without retries
 * MEDIUM: Now supports owner parameter
 */
export async function tryLock(
  lockKey: string,
  ttl: number = 30000,
  owner?: string
): Promise<boolean> {
  const client = getRedis();
  const lockValue = owner || `lock:${Date.now()}:${Math.random()}`;

  try {
    const result = await client.set(lockKey, lockValue, 'PX', ttl, 'NX');
    return result === 'OK';
  } catch (error) {
    logger.error('Error trying to acquire lock', { error, lockKey });
    return false;
  }
}

/**
 * Release a lock only if we own it
 * MEDIUM: Now checks ownership before releasing
 */
export async function releaseLock(lockKey: string, owner?: string): Promise<boolean> {
  const client = getRedis();

  try {
    if (owner) {
      // Lua script to atomically check owner and delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;
      const result = await client.eval(script, 1, lockKey, owner);
      return result === 1;
    } else {
      // No owner specified - just delete (legacy behavior)
      await client.del(lockKey);
      return true;
    }
  } catch (error) {
    logger.error('Error releasing lock', { error, lockKey });
    return false;
  }
}

/**
 * Check if a lock exists
 */
export async function isLocked(lockKey: string): Promise<boolean> {
  try {
    const client = getRedis();
    const exists = await client.exists(lockKey);
    return exists === 1;
  } catch (error) {
    logger.error('Error checking lock existence', { error, lockKey });
    return false;
  }
}

/**
 * MEDIUM: Get lock owner (for debugging/monitoring)
 */
export async function getLockOwner(lockKey: string): Promise<string | null> {
  try {
    const client = getRedis();
    return await client.get(lockKey);
  } catch (error) {
    logger.error('Error getting lock owner', { error, lockKey });
    return null;
  }
}

/**
 * MEDIUM: Get lock TTL remaining (for debugging/monitoring)
 */
export async function getLockTTL(lockKey: string): Promise<number> {
  try {
    const client = getRedis();
    const ttl = await client.pttl(lockKey);
    return ttl > 0 ? ttl : 0;
  } catch (error) {
    logger.error('Error getting lock TTL', { error, lockKey });
    return 0;
  }
}
