/**
 * Distributed Lock Utility using Redis SET NX
 * Phase 2.3 Implementation - Race Condition Prevention
 */

import Redis from 'ioredis';
import { getRedisConfig } from '../config';
import {
  LockTimeoutError,
  LockContentionError,
  LockSystemError
} from '../errors/lock-errors';

// Initialize Redis client for locks
const redisConfig = getRedisConfig();
const redis = typeof redisConfig === 'string'
  ? new Redis(redisConfig)
  : new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
    });

// Handle Redis connection errors
redis.on('error', (err) => {
  console.error('Redis connection error for distributed locks:', err);
});

redis.on('connect', () => {
  console.log('Redis connected for distributed locks');
});

/**
 * Lock key generator with environment prefix
 */
export class LockKeys {
  private static readonly ENV_PREFIX = process.env.NODE_ENV || 'dev';

  static inventory(eventId: string, tierId: string): string {
    return `${this.ENV_PREFIX}:lock:inventory:${eventId}:${tierId}`;
  }

  static listing(listingId: string): string {
    return `${this.ENV_PREFIX}:lock:listing:${listingId}`;
  }

  static ticket(ticketId: string): string {
    return `${this.ENV_PREFIX}:lock:ticket:${ticketId}`;
  }

  static userPurchase(userId: string): string {
    return `${this.ENV_PREFIX}:lock:user:${userId}:purchase`;
  }

  static reservation(reservationId: string): string {
    return `${this.ENV_PREFIX}:lock:reservation:${reservationId}`;
  }

  static payment(paymentId: string): string {
    return `${this.ENV_PREFIX}:lock:payment:${paymentId}`;
  }

  static refund(paymentId: string): string {
    return `${this.ENV_PREFIX}:lock:refund:${paymentId}`;
  }
}

/**
 * Options for lock acquisition
 */
interface LockOptions {
  service?: string;
  lockType?: string;
}

/**
 * Execute a function with a distributed lock using Redis SET NX
 *
 * @param key - The lock key
 * @param ttlMs - Lock duration in milliseconds
 * @param fn - The function to execute while holding the lock
 * @param options - Optional metadata for logging and metrics
 * @returns The result of the function
 * @throws {LockTimeoutError} When lock cannot be acquired within timeout
 * @throws {LockContentionError} When resource is locked by another process
 * @throws {LockSystemError} When Redis or system errors occur
 */
export async function withLock<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const startTime = Date.now();
  const service = options?.service || 'unknown';
  const lockType = options?.lockType || parseLockType(key);
  const lockValue = `${process.pid}-${Date.now()}`; // Unique lock value
  let acquired = false;

  try {
    // Try to acquire lock with retry logic
    const maxRetries = 50; // 50 retries = ~5 seconds of attempts
    const retryDelayMs = 100;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // SET key value PX milliseconds NX
      // Returns 'OK' if set, null if key already exists
      const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
      
      if (result === 'OK') {
        acquired = true;
        const acquisitionTime = Date.now() - startTime;
        console.log(`Lock acquired: ${key} (${acquisitionTime}ms)`);
        break;
      }

      // Lock is held by another process, wait and retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }

    if (!acquired) {
      const acquisitionTime = Date.now() - startTime;
      console.error(`Lock timeout: ${key} after ${acquisitionTime}ms`, {
        service,
        lockType,
        ttlMs
      });

      throw new LockTimeoutError(
        `Failed to acquire lock after ${acquisitionTime}ms`,
        key,
        ttlMs
      );
    }

    // Execute the protected function
    const result = await fn();

    return result;

  } catch (error: any) {
    // If we threw a lock error, re-throw it
    if (error instanceof LockTimeoutError || 
        error instanceof LockContentionError || 
        error instanceof LockSystemError) {
      throw error;
    }

    // Check for Redis connection errors
    if (error.message && (
      error.message.includes('Redis') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ETIMEDOUT')
    )) {
      console.error(`Lock system error: ${key}`, {
        service,
        lockType,
        error: error.message
      });

      throw new LockSystemError(
        'Lock system unavailable',
        key,
        error
      );
    }

    // Re-throw business logic errors
    throw error;

  } finally {
    // Always attempt to release the lock
    if (acquired) {
      try {
        // Only delete if we still own the lock (check value matches)
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await redis.eval(script, 1, key, lockValue);
        
        const totalTime = Date.now() - startTime;
        console.log(`Lock released: ${key} (held for ${totalTime}ms)`);
      } catch (err: any) {
        console.warn(`Failed to release lock ${key}:`, err.message);
      }
    }
  }
}

/**
 * Execute a function with a distributed lock, with automatic retry on timeout
 */
export async function withLockRetry<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  options?: LockOptions & {
    maxRetries?: number;
    backoffMultiplier?: number;
    initialDelayMs?: number;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const backoffMultiplier = options?.backoffMultiplier ?? 2;
  const initialDelayMs = options?.initialDelayMs ?? 100;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withLock(key, ttlMs, fn, options);
    } catch (error: any) {
      lastError = error;

      if (
        !(error instanceof LockTimeoutError) &&
        !(error instanceof LockContentionError)
      ) {
        throw error;
      }

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      console.log(`Lock retry attempt ${attempt + 1}/${maxRetries} for ${key} after ${delayMs}ms`);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Try to acquire a lock without waiting
 */
export async function tryLock(
  key: string,
  ttlMs: number
): Promise<boolean> {
  try {
    const lockValue = `${process.pid}-${Date.now()}`;
    const result = await redis.set(key, lockValue, 'PX', ttlMs, 'NX');
    return result === 'OK';
  } catch (error: any) {
    return false;
  }
}

/**
 * Parse lock type from lock key for logging/metrics
 */
function parseLockType(key: string): string {
  const parts = key.split(':');
  return parts.length >= 3 ? parts[2] : 'unknown';
}

/**
 * Lock metrics for monitoring
 */
export class LockMetrics {
  private static lockAcquisitionTimes = new Map<string, number>();
  private static lockWaitTimes = new Map<string, number>();
  private static lockTimeouts = 0;
  private static activeLocks = new Set<string>();

  static startAcquisition(key: string): void {
    this.lockAcquisitionTimes.set(key, Date.now());
  }

  static endAcquisition(key: string): void {
    const startTime = this.lockAcquisitionTimes.get(key);
    if (startTime) {
      const waitTime = Date.now() - startTime;
      this.lockWaitTimes.set(key, waitTime);
      this.lockAcquisitionTimes.delete(key);
      console.log(`Lock wait time for ${key}: ${waitTime}ms`);
    }
    this.activeLocks.add(key);
  }

  static releaseLock(key: string): void {
    this.activeLocks.delete(key);
  }

  static incrementTimeout(): void {
    this.lockTimeouts++;
  }

  static getMetrics() {
    return {
      activeLockCount: this.activeLocks.size,
      totalTimeouts: this.lockTimeouts,
      averageWaitTime: this.calculateAverageWaitTime(),
    };
  }

  private static calculateAverageWaitTime(): number {
    const times = Array.from(this.lockWaitTimes.values());
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
}

// Export Redis client for testing
export { redis as lockRedisClient };

// Compatibility exports (not used in SET NX implementation but kept for interface)
export const redlock = null;
