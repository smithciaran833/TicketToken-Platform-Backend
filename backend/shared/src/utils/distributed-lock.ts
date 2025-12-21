/**
 * Distributed Lock Utility using Redis SET NX
 * Phase 2.3 Implementation - Race Condition Prevention
 */

import Redis from 'ioredis';
import { LockTimeoutError, LockContentionError, LockSystemError } from '../errors/lock-errors';

// Lazy initialize Redis client for locks
let redis: Redis | null = null;

function getRedisClient(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      redis = new Redis(redisUrl);
    } else {
      redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD || undefined,
      });
    }

    redis.on('error', (err) => {
      console.error('Redis connection error for distributed locks:', err);
    });

    redis.on('connect', () => {
      console.log('Redis connected for distributed locks');
    });
  }
  return redis;
}

/**
 * Lock key generator with environment prefix
 */
export class LockKeys {
  private static getEnvPrefix(): string {
    return process.env.NODE_ENV || 'dev';
  }

  static inventory(eventId: string, tierId: string): string {
    return `${this.getEnvPrefix()}:lock:inventory:${eventId}:${tierId}`;
  }

  static listing(listingId: string): string {
    return `${this.getEnvPrefix()}:lock:listing:${listingId}`;
  }

  static ticket(ticketId: string): string {
    return `${this.getEnvPrefix()}:lock:ticket:${ticketId}`;
  }

  static userPurchase(userId: string): string {
    return `${this.getEnvPrefix()}:lock:user:${userId}:purchase`;
  }

  static reservation(reservationId: string): string {
    return `${this.getEnvPrefix()}:lock:reservation:${reservationId}`;
  }

  static payment(paymentId: string): string {
    return `${this.getEnvPrefix()}:lock:payment:${paymentId}`;
  }

  static refund(paymentId: string): string {
    return `${this.getEnvPrefix()}:lock:refund:${paymentId}`;
  }

  static order(orderId: string): string {
    return `${this.getEnvPrefix()}:lock:order:${orderId}`;
  }

  static orderConfirmation(orderId: string): string {
    return `${this.getEnvPrefix()}:lock:order:${orderId}:confirm`;
  }

  static orderCancellation(orderId: string): string {
    return `${this.getEnvPrefix()}:lock:order:${orderId}:cancel`;
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
  const lockValue = `${process.pid}-${Date.now()}`;
  let acquired = false;

  try {
    const maxRetries = 50;
    const retryDelayMs = 100;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const result = await getRedisClient().set(key, lockValue, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        acquired = true;
        const acquisitionTime = Date.now() - startTime;
        console.log(`Lock acquired: ${key} (${acquisitionTime}ms)`);
        break;
      }

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }

    if (!acquired) {
      const acquisitionTime = Date.now() - startTime;
      console.error(`Lock timeout: ${key} after ${acquisitionTime}ms`, {
        service,
        lockType,
        ttlMs,
      });

      throw new LockTimeoutError(`Failed to acquire lock after ${acquisitionTime}ms`, key, ttlMs);
    }

    const result = await fn();
    return result;
  } catch (error: any) {
    if (
      error instanceof LockTimeoutError ||
      error instanceof LockContentionError ||
      error instanceof LockSystemError
    ) {
      throw error;
    }

    if (
      error.message &&
      (error.message.includes('Redis') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ETIMEDOUT'))
    ) {
      console.error(`Lock system error: ${key}`, {
        service,
        lockType,
        error: error.message,
      });

      throw new LockSystemError('Lock system unavailable', key, error);
    }

    throw error;
  } finally {
    if (acquired) {
      try {
        const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await getRedisClient().eval(script, 1, key, lockValue);

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

      if (!(error instanceof LockTimeoutError) && !(error instanceof LockContentionError)) {
        throw error;
      }

      if (attempt === maxRetries) {
        break;
      }

      const delayMs = initialDelayMs * Math.pow(backoffMultiplier, attempt);
      console.log(`Lock retry attempt ${attempt + 1}/${maxRetries} for ${key} after ${delayMs}ms`);

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Try to acquire a lock without waiting
 */
export async function tryLock(key: string, ttlMs: number): Promise<boolean> {
  try {
    const lockValue = `${process.pid}-${Date.now()}`;
    const result = await getRedisClient().set(key, lockValue, 'PX', ttlMs, 'NX');
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

/**
 * Simple lock acquisition (alternative to withLock for lightweight use cases)
 */
export async function acquireLock(key: string, ttl: number): Promise<boolean> {
  try {
    const lockValue = `${process.pid}-${Date.now()}`;
    const result = await getRedisClient().set(key, lockValue, 'EX', ttl, 'NX');
    return result === 'OK';
  } catch (error: any) {
    console.error(`Failed to acquire lock ${key}:`, error.message);
    return false;
  }
}

/**
 * Release a lock
 */
export async function releaseLock(key: string): Promise<boolean> {
  try {
    const deleted = await getRedisClient().del(key);
    return deleted > 0;
  } catch (error: any) {
    console.error(`Failed to release lock ${key}:`, error.message);
    return false;
  }
}

/**
 * Extend lock TTL
 */
export async function extendLock(key: string, ttl: number): Promise<boolean> {
  try {
    const result = await getRedisClient().expire(key, ttl);
    return result === 1;
  } catch (error: any) {
    console.error(`Failed to extend lock ${key}:`, error.message);
    return false;
  }
}

// Export Redis client for testing
export function lockRedisClient(): Redis {
  return getRedisClient();
}

// Compatibility exports
export const redlock: any = null;
