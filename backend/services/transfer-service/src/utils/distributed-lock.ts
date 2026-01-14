/**
 * Distributed Lock Utility for Transfer Service
 * 
 * AUDIT FIX: CONC-M1/M2 - No distributed locking → Redis-based distributed locks
 * 
 * Features:
 * - Redis-based distributed locks (Redlock algorithm)
 * - Automatic lock extension
 * - Deadlock prevention
 * - Lock metrics
 */

import Redis from 'ioredis';
import logger from './logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const LOCK_CONFIG = {
  // Default lock TTL in milliseconds
  defaultTtl: 30000, // 30 seconds
  
  // Maximum lock TTL
  maxTtl: 300000, // 5 minutes
  
  // Retry settings
  retryCount: 3,
  retryDelay: 200, // ms
  retryJitter: 100, // ms
  
  // Clock drift factor
  clockDriftFactor: 0.01,
  
  // Lock key prefix
  keyPrefix: 'transfer-service:lock:'
};

// =============================================================================
// TYPES
// =============================================================================

interface Lock {
  resource: string;
  value: string;
  ttl: number;
  acquiredAt: number;
  expiresAt: number;
}

interface LockOptions {
  ttl?: number;
  retryCount?: number;
  retryDelay?: number;
}

interface ExtendOptions {
  ttl?: number;
}

// =============================================================================
// DISTRIBUTED LOCK CLASS
// =============================================================================

export class DistributedLock {
  private redis: Redis;
  private locks: Map<string, Lock> = new Map();
  private extensionIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  /**
   * Generate a unique lock value
   */
  private generateLockValue(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get the full lock key
   */
  private getLockKey(resource: string): string {
    return `${LOCK_CONFIG.keyPrefix}${resource}`;
  }

  /**
   * Add random jitter to delay
   */
  private addJitter(delay: number): number {
    return delay + Math.floor(Math.random() * LOCK_CONFIG.retryJitter);
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(resource: string, options: LockOptions = {}): Promise<Lock | null> {
    const ttl = Math.min(options.ttl || LOCK_CONFIG.defaultTtl, LOCK_CONFIG.maxTtl);
    const retryCount = options.retryCount ?? LOCK_CONFIG.retryCount;
    const retryDelay = options.retryDelay ?? LOCK_CONFIG.retryDelay;
    
    const key = this.getLockKey(resource);
    const value = this.generateLockValue();
    
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const startTime = Date.now();
        
        // Try to acquire lock using SET NX EX
        const result = await this.redis.set(key, value, 'PX', ttl, 'NX');
        
        if (result === 'OK') {
          // Calculate drift
          const drift = Math.floor(ttl * LOCK_CONFIG.clockDriftFactor) + 2;
          const validityTime = ttl - (Date.now() - startTime) - drift;
          
          if (validityTime > 0) {
            const lock: Lock = {
              resource,
              value,
              ttl,
              acquiredAt: Date.now(),
              expiresAt: Date.now() + validityTime
            };
            
            this.locks.set(resource, lock);
            
            logger.debug({
              resource,
              ttl,
              attempt
            }, 'Lock acquired');
            
            return lock;
          }
          
          // Lock acquired but validity time expired, release it
          await this.redis.eval(
            `if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("del", KEYS[1])
            else
              return 0
            end`,
            1,
            key,
            value
          );
        }
        
        // Wait before retry
        if (attempt < retryCount) {
          await this.sleep(this.addJitter(retryDelay));
        }
      } catch (error) {
        logger.error({ error, resource, attempt }, 'Error acquiring lock');
        
        if (attempt < retryCount) {
          await this.sleep(this.addJitter(retryDelay));
        }
      }
    }
    
    logger.warn({ resource }, 'Failed to acquire lock after retries');
    return null;
  }

  /**
   * Release a distributed lock
   */
  async release(lock: Lock): Promise<boolean> {
    const key = this.getLockKey(lock.resource);
    
    // Stop auto-extension if active
    this.stopAutoExtend(lock.resource);
    
    try {
      // Use Lua script to ensure we only delete our own lock
      const result = await this.redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end`,
        1,
        key,
        lock.value
      );
      
      this.locks.delete(lock.resource);
      
      const released = result === 1;
      
      if (released) {
        logger.debug({ resource: lock.resource }, 'Lock released');
      } else {
        logger.warn({ resource: lock.resource }, 'Lock was already released or expired');
      }
      
      return released;
    } catch (error) {
      logger.error({ error, resource: lock.resource }, 'Error releasing lock');
      return false;
    }
  }

  /**
   * Extend a lock's TTL
   */
  async extend(lock: Lock, options: ExtendOptions = {}): Promise<boolean> {
    const ttl = Math.min(options.ttl || lock.ttl, LOCK_CONFIG.maxTtl);
    const key = this.getLockKey(lock.resource);
    
    try {
      // Use Lua script to ensure we only extend our own lock
      const result = await this.redis.eval(
        `if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("pexpire", KEYS[1], ARGV[2])
        else
          return 0
        end`,
        1,
        key,
        lock.value,
        ttl.toString()
      );
      
      if (result === 1) {
        // Update lock metadata
        lock.expiresAt = Date.now() + ttl;
        this.locks.set(lock.resource, lock);
        
        logger.debug({ resource: lock.resource, ttl }, 'Lock extended');
        return true;
      }
      
      logger.warn({ resource: lock.resource }, 'Failed to extend lock - already released');
      return false;
    } catch (error) {
      logger.error({ error, resource: lock.resource }, 'Error extending lock');
      return false;
    }
  }

  /**
   * Start automatic lock extension
   */
  startAutoExtend(lock: Lock, interval?: number): void {
    const extensionInterval = interval || Math.floor(lock.ttl * 0.75);
    
    // Clear any existing interval
    this.stopAutoExtend(lock.resource);
    
    const intervalId = setInterval(async () => {
      const success = await this.extend(lock);
      if (!success) {
        this.stopAutoExtend(lock.resource);
      }
    }, extensionInterval);
    
    this.extensionIntervals.set(lock.resource, intervalId);
    
    logger.debug({
      resource: lock.resource,
      extensionInterval
    }, 'Started auto-extend');
  }

  /**
   * Stop automatic lock extension
   */
  stopAutoExtend(resource: string): void {
    const intervalId = this.extensionIntervals.get(resource);
    if (intervalId) {
      clearInterval(intervalId);
      this.extensionIntervals.delete(resource);
      logger.debug({ resource }, 'Stopped auto-extend');
    }
  }

  /**
   * Check if a lock is still valid
   */
  isLocked(lock: Lock): boolean {
    return Date.now() < lock.expiresAt;
  }

  /**
   * Execute a function with a lock
   */
  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    options: LockOptions & { autoExtend?: boolean } = {}
  ): Promise<T> {
    const lock = await this.acquire(resource, options);
    
    if (!lock) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`);
    }
    
    if (options.autoExtend) {
      this.startAutoExtend(lock);
    }
    
    try {
      return await fn();
    } finally {
      await this.release(lock);
    }
  }

  /**
   * Get lock status for a resource
   */
  async getLockStatus(resource: string): Promise<{ locked: boolean; ttl?: number }> {
    const key = this.getLockKey(resource);
    
    try {
      const ttl = await this.redis.pttl(key);
      
      if (ttl > 0) {
        return { locked: true, ttl };
      }
      
      return { locked: false };
    } catch (error) {
      logger.error({ error, resource }, 'Error checking lock status');
      return { locked: false };
    }
  }

  /**
   * Release all locks held by this instance
   */
  async releaseAll(): Promise<void> {
    const locks = Array.from(this.locks.values());
    
    for (const lock of locks) {
      await this.release(lock);
    }
    
    logger.info({ count: locks.length }, 'Released all locks');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let distributedLock: DistributedLock | null = null;

export function initDistributedLock(redis: Redis): DistributedLock {
  distributedLock = new DistributedLock(redis);
  return distributedLock;
}

export function getDistributedLock(): DistributedLock {
  if (!distributedLock) {
    throw new Error('Distributed lock not initialized');
  }
  return distributedLock;
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * Acquire a transfer lock
 */
export async function acquireTransferLock(
  transferId: string,
  options?: LockOptions
): Promise<Lock | null> {
  return getDistributedLock().acquire(`transfer:${transferId}`, options);
}

/**
 * Acquire a blockchain transfer lock
 */
export async function acquireBlockchainLock(
  nftMint: string,
  options?: LockOptions
): Promise<Lock | null> {
  return getDistributedLock().acquire(`blockchain:${nftMint}`, {
    ttl: 60000, // 60 seconds for blockchain ops
    ...options
  });
}

/**
 * Acquire a batch transfer lock
 */
export async function acquireBatchLock(
  batchId: string,
  options?: LockOptions
): Promise<Lock | null> {
  return getDistributedLock().acquire(`batch:${batchId}`, {
    ttl: 120000, // 2 minutes for batch ops
    ...options
  });
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  DistributedLock,
  initDistributedLock,
  getDistributedLock,
  acquireTransferLock,
  acquireBlockchainLock,
  acquireBatchLock,
  LOCK_CONFIG
};
