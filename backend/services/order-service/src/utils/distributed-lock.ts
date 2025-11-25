import { RedisService } from '../services/redis.service';
import { logger } from './logger';

export interface LockOptions {
  ttl?: number; // Time to live in milliseconds
  retryDelay?: number; // Delay between retry attempts in ms
  retryCount?: number; // Number of times to retry acquiring lock
}

const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttl: 30000, // 30 seconds
  retryDelay: 100, // 100ms
  retryCount: 3,
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
  const client = RedisService.getClient();
  const lockValue = `lock:${Date.now()}:${Math.random()}`;
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
 * Try to acquire a lock without retries
 */
export async function tryLock(
  lockKey: string,
  ttl: number = 30000
): Promise<boolean> {
  const client = RedisService.getClient();
  const lockValue = `lock:${Date.now()}:${Math.random()}`;

  try {
    const result = await client.set(lockKey, lockValue, 'PX', ttl, 'NX');

    return result === 'OK';
  } catch (error) {
    logger.error('Error trying to acquire lock', { error, lockKey });
    return false;
  }
}

/**
 * Release a lock
 */
export async function releaseLock(lockKey: string): Promise<void> {
  try {
    const client = RedisService.getClient();
    await client.del(lockKey);
  } catch (error) {
    logger.error('Error releasing lock', { error, lockKey });
  }
}

/**
 * Check if a lock exists
 */
export async function isLocked(lockKey: string): Promise<boolean> {
  try {
    const client = RedisService.getClient();
    const exists = await client.exists(lockKey);
    return exists === 1;
  } catch (error) {
    logger.error('Error checking lock existence', { error, lockKey });
    return false;
  }
}
