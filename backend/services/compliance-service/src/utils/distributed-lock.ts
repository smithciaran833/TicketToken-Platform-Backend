/**
 * Distributed Lock for Compliance Service
 * 
 * AUDIT FIX IDP-3, IDP-4: Prevents concurrent 1099 generation and tax tracking
 * 
 * Uses Redis for distributed locking across service instances.
 * Critical for:
 * - 1099 form generation (prevent duplicates)
 * - Tax tracking updates (prevent race conditions)
 * - OFAC batch processing
 * - Scheduled compliance jobs
 */

import { redisService } from '../services/redis.service';
import { logger } from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_LOCK_TTL = 30000; // 30 seconds
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY = 200; // ms
const LOCK_PREFIX = 'lock:compliance:';

// =============================================================================
// TYPES
// =============================================================================

export interface LockOptions {
  /** Lock TTL in milliseconds */
  ttl?: number;
  /** Number of retry attempts */
  retryCount?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
  /** Request ID for logging */
  requestId?: string;
}

export interface Lock {
  key: string;
  token: string;
  ttl: number;
  acquiredAt: number;
}

// =============================================================================
// DISTRIBUTED LOCK CLASS
// =============================================================================

export class DistributedLock {
  private readonly lockKey: string;
  private readonly ttl: number;
  private readonly retryCount: number;
  private readonly retryDelay: number;
  private readonly requestId?: string;
  private token: string | null = null;
  private renewInterval: NodeJS.Timeout | null = null;

  constructor(key: string, options?: LockOptions) {
    this.lockKey = `${LOCK_PREFIX}${key}`;
    this.ttl = options?.ttl ?? DEFAULT_LOCK_TTL;
    this.retryCount = options?.retryCount ?? DEFAULT_RETRY_COUNT;
    this.retryDelay = options?.retryDelay ?? DEFAULT_RETRY_DELAY;
    this.requestId = options?.requestId;
  }

  /**
   * Attempt to acquire the lock
   */
  async acquire(): Promise<boolean> {
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      const acquired = await this.tryAcquire();
      if (acquired) {
        return true;
      }

      if (attempt < this.retryCount) {
        await this.sleep(this.retryDelay * Math.pow(2, attempt)); // Exponential backoff
      }
    }

    logger.warn({
      requestId: this.requestId,
      lockKey: this.lockKey,
      attempts: this.retryCount + 1
    }, 'Failed to acquire lock after retries');

    return false;
  }

  /**
   * Single attempt to acquire lock
   */
  private async tryAcquire(): Promise<boolean> {
    this.token = this.generateToken();
    
    try {
      const result = await redisService.setNX(
        this.lockKey,
        this.token,
        Math.ceil(this.ttl / 1000) // Convert to seconds
      );

      if (result) {
        logger.debug({
          requestId: this.requestId,
          lockKey: this.lockKey,
          token: this.token.substring(0, 8)
        }, 'Lock acquired');
        
        // Start auto-renewal
        this.startRenewal();
        return true;
      }

      return false;
    } catch (error) {
      logger.error({
        requestId: this.requestId,
        lockKey: this.lockKey,
        error: (error as Error).message
      }, 'Error acquiring lock');
      return false;
    }
  }

  /**
   * Release the lock
   */
  async release(): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    // Stop renewal
    this.stopRenewal();

    try {
      // Use Lua script to ensure atomic check-and-delete
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `;

      const result = await redisService.eval(script, [this.lockKey], [this.token]);
      
      if (result === 1) {
        logger.debug({
          requestId: this.requestId,
          lockKey: this.lockKey
        }, 'Lock released');
        this.token = null;
        return true;
      }

      logger.warn({
        requestId: this.requestId,
        lockKey: this.lockKey
      }, 'Lock already released or expired');
      
      return false;
    } catch (error) {
      logger.error({
        requestId: this.requestId,
        lockKey: this.lockKey,
        error: (error as Error).message
      }, 'Error releasing lock');
      return false;
    }
  }

  /**
   * Extend lock TTL
   */
  async extend(additionalTtl?: number): Promise<boolean> {
    if (!this.token) {
      return false;
    }

    const extendTtl = additionalTtl ?? this.ttl;

    try {
      // Lua script to extend only if we still own the lock
      const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end
      `;

      const result = await redisService.eval(
        script, 
        [this.lockKey], 
        [this.token, extendTtl.toString()]
      );

      return result === 1;
    } catch (error) {
      logger.error({
        requestId: this.requestId,
        lockKey: this.lockKey,
        error: (error as Error).message
      }, 'Error extending lock');
      return false;
    }
  }

  /**
   * Start auto-renewal of the lock
   */
  private startRenewal(): void {
    // Renew at half the TTL to prevent expiration
    const renewalInterval = this.ttl / 2;

    this.renewInterval = setInterval(async () => {
      const extended = await this.extend();
      if (!extended) {
        logger.warn({
          requestId: this.requestId,
          lockKey: this.lockKey
        }, 'Lock renewal failed - lock may have expired');
        this.stopRenewal();
      }
    }, renewalInterval);
  }

  /**
   * Stop auto-renewal
   */
  private stopRenewal(): void {
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
      this.renewInterval = null;
    }
  }

  /**
   * Generate unique token for lock ownership
   */
  private generateToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Execute a function with a distributed lock
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T> {
  const lock = new DistributedLock(key, options);
  
  const acquired = await lock.acquire();
  if (!acquired) {
    throw new Error(`Could not acquire lock for key: ${key}`);
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

/**
 * Try to execute with lock, return null if lock unavailable
 */
export async function tryWithLock<T>(
  key: string,
  fn: () => Promise<T>,
  options?: LockOptions
): Promise<T | null> {
  const lock = new DistributedLock(key, options);
  
  const acquired = await lock.acquire();
  if (!acquired) {
    return null;
  }

  try {
    return await fn();
  } finally {
    await lock.release();
  }
}

// =============================================================================
// COMPLIANCE-SPECIFIC LOCK HELPERS
// =============================================================================

/**
 * Lock for 1099 generation (prevents duplicate forms)
 */
export async function with1099Lock<T>(
  venueId: string,
  year: number,
  fn: () => Promise<T>,
  requestId?: string
): Promise<T> {
  return withLock(
    `1099:${venueId}:${year}`,
    fn,
    { ttl: 300000, requestId } // 5 minute TTL for 1099 generation
  );
}

/**
 * Lock for tax tracking updates
 */
export async function withTaxTrackingLock<T>(
  venueId: string,
  fn: () => Promise<T>,
  requestId?: string
): Promise<T> {
  return withLock(
    `tax-tracking:${venueId}`,
    fn,
    { ttl: 30000, requestId } // 30 second TTL
  );
}

/**
 * Lock for OFAC batch processing
 */
export async function withOFACBatchLock<T>(
  batchId: string,
  fn: () => Promise<T>,
  requestId?: string
): Promise<T> {
  return withLock(
    `ofac-batch:${batchId}`,
    fn,
    { ttl: 600000, requestId } // 10 minute TTL for batch
  );
}

/**
 * Lock for scheduled compliance jobs
 */
export async function withScheduledJobLock<T>(
  jobName: string,
  fn: () => Promise<T>
): Promise<T> {
  return withLock(
    `scheduled:${jobName}`,
    fn,
    { ttl: 3600000, retryCount: 0 } // 1 hour TTL, no retry
  );
}

export default {
  DistributedLock,
  withLock,
  tryWithLock,
  with1099Lock,
  withTaxTrackingLock,
  withOFACBatchLock,
  withScheduledJobLock
};
