/**
 * Distributed Lock Utility
 * 
 * AUDIT FIX CONC-M1: Prevent race conditions with distributed locking
 * AUDIT FIX CONC-M2: Safe lock acquisition with automatic expiry
 */

import { redisClient } from '../config/redis';
import { logger } from './logger';
import * as crypto from 'crypto';

/**
 * Lock options
 */
export interface LockOptions {
  /** Lock TTL in milliseconds (default: 30000) */
  ttlMs?: number;
  /** Retry attempts (default: 3) */
  retryAttempts?: number;
  /** Delay between retries in milliseconds (default: 100) */
  retryDelayMs?: number;
  /** Unique owner identifier (default: auto-generated) */
  owner?: string;
}

/**
 * Lock result
 */
export interface LockResult {
  acquired: boolean;
  lockId: string | null;
  owner: string | null;
  expiresAt: Date | null;
}

/**
 * Default lock options
 */
const DEFAULT_OPTIONS: Required<LockOptions> = {
  ttlMs: 30000,
  retryAttempts: 3,
  retryDelayMs: 100,
  owner: '',
};

/**
 * Generate a unique lock owner ID
 */
function generateOwnerId(): string {
  return `${process.pid}:${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Distributed lock implementation using Redis
 */
export class DistributedLock {
  private keyPrefix = 'lock:';
  
  /**
   * Acquire a distributed lock
   */
  async acquire(
    resource: string,
    options: LockOptions = {}
  ): Promise<LockResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const owner = opts.owner || generateOwnerId();
    const lockKey = `${this.keyPrefix}${resource}`;
    const lockValue = JSON.stringify({
      owner,
      acquiredAt: new Date().toISOString(),
      pid: process.pid,
    });

    for (let attempt = 0; attempt < opts.retryAttempts; attempt++) {
      try {
        // Try to set the lock with NX (only if not exists) and PX (expiry in ms)
        const result = await redisClient.set(
          lockKey,
          lockValue,
          'PX',
          opts.ttlMs,
          'NX'
        );

        if (result === 'OK') {
          const expiresAt = new Date(Date.now() + opts.ttlMs);
          
          logger.debug('Lock acquired', {
            resource,
            owner,
            ttlMs: opts.ttlMs,
            expiresAt,
          });

          return {
            acquired: true,
            lockId: lockKey,
            owner,
            expiresAt,
          };
        }

        // Lock not acquired, wait and retry
        if (attempt < opts.retryAttempts - 1) {
          await this.sleep(opts.retryDelayMs);
        }
      } catch (error) {
        logger.error('Error acquiring lock', {
          resource,
          attempt,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        if (attempt < opts.retryAttempts - 1) {
          await this.sleep(opts.retryDelayMs);
        }
      }
    }

    logger.debug('Failed to acquire lock after retries', {
      resource,
      attempts: opts.retryAttempts,
    });

    return {
      acquired: false,
      lockId: null,
      owner: null,
      expiresAt: null,
    };
  }

  /**
   * Release a distributed lock
   * Uses Lua script to ensure atomic check-and-delete
   */
  async release(resource: string, owner: string): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${resource}`;
    
    // Lua script for atomic release (only delete if owner matches)
    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if current then
        local data = cjson.decode(current)
        if data.owner == ARGV[1] then
          return redis.call('DEL', KEYS[1])
        end
      end
      return 0
    `;

    try {
      const result = await redisClient.eval(
        luaScript,
        1,
        lockKey,
        owner
      );

      const released = result === 1;
      
      if (released) {
        logger.debug('Lock released', { resource, owner });
      } else {
        logger.warn('Lock release failed - not owner or lock expired', {
          resource,
          owner,
        });
      }

      return released;
    } catch (error) {
      logger.error('Error releasing lock', {
        resource,
        owner,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Fallback: try simple delete if Lua fails
      try {
        await redisClient.del(lockKey);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Extend a lock's TTL
   */
  async extend(
    resource: string,
    owner: string,
    additionalTtlMs: number
  ): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${resource}`;
    
    // Lua script for atomic extend (only extend if owner matches)
    const luaScript = `
      local current = redis.call('GET', KEYS[1])
      if current then
        local data = cjson.decode(current)
        if data.owner == ARGV[1] then
          return redis.call('PEXPIRE', KEYS[1], ARGV[2])
        end
      end
      return 0
    `;

    try {
      const result = await redisClient.eval(
        luaScript,
        1,
        lockKey,
        owner,
        additionalTtlMs.toString()
      );

      const extended = result === 1;
      
      if (extended) {
        logger.debug('Lock extended', { resource, owner, additionalTtlMs });
      }

      return extended;
    } catch (error) {
      logger.error('Error extending lock', {
        resource,
        owner,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Check if a resource is locked
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockKey = `${this.keyPrefix}${resource}`;
    
    try {
      const exists = await redisClient.exists(lockKey);
      return exists === 1;
    } catch (error) {
      logger.error('Error checking lock', {
        resource,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get lock info
   */
  async getLockInfo(resource: string): Promise<{
    locked: boolean;
    owner?: string;
    acquiredAt?: string;
    ttlMs?: number;
  }> {
    const lockKey = `${this.keyPrefix}${resource}`;
    
    try {
      const [value, ttl] = await Promise.all([
        redisClient.get(lockKey),
        redisClient.pttl(lockKey),
      ]);

      if (!value) {
        return { locked: false };
      }

      const data = JSON.parse(value);
      return {
        locked: true,
        owner: data.owner,
        acquiredAt: data.acquiredAt,
        ttlMs: ttl > 0 ? ttl : undefined,
      };
    } catch (error) {
      logger.error('Error getting lock info', {
        resource,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { locked: false };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Execute a function with a distributed lock
 * Automatically acquires and releases the lock
 */
export async function withLock<T>(
  resource: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const lock = new DistributedLock();
  const result = await lock.acquire(resource, options);

  if (!result.acquired || !result.owner) {
    throw new Error(`Failed to acquire lock for resource: ${resource}`);
  }

  try {
    return await fn();
  } finally {
    await lock.release(resource, result.owner);
  }
}

/**
 * Export singleton instance
 */
export const distributedLock = new DistributedLock();
