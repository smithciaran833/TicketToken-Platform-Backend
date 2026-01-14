/**
 * Distributed Lock Utility for Integration Service
 * 
 * AUDIT FIX DL-1: No distributed locking for concurrent operations
 * 
 * Uses Redis for distributed locking to prevent:
 * - Duplicate sync operations
 * - Concurrent OAuth token refreshes
 * - Race conditions in webhook processing
 */

import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { getRedisConfig } from '../config/index';
import { logger } from './logger';

// =============================================================================
// TYPES
// =============================================================================

export interface LockOptions {
  ttlMs?: number;           // Lock time-to-live (default: 30000)
  retryCount?: number;      // Number of retry attempts (default: 3)
  retryDelayMs?: number;    // Delay between retries (default: 200)
  autoExtend?: boolean;     // Auto-extend lock while holding (default: false)
  extendIntervalMs?: number; // Interval for auto-extend (default: ttlMs/2)
}

export interface LockHandle {
  key: string;
  token: string;
  acquired: boolean;
  acquiredAt?: Date;
  expiresAt?: Date;
  release: () => Promise<boolean>;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const LOCK_PREFIX = 'integration:lock:';
const DEFAULT_TTL_MS = 30000;
const DEFAULT_RETRY_COUNT = 3;
const DEFAULT_RETRY_DELAY_MS = 200;

// Lua script for atomic lock release (only release if token matches)
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

// Lua script for atomic lock extend
const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: InstanceType<typeof Redis> | null = null;

function getRedisClient(): InstanceType<typeof Redis> | null {
  if (!redisClient) {
    try {
      const config = getRedisConfig();
      redisClient = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        tls: config.tls,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        maxRetriesPerRequest: 3
      });
      
      redisClient.on('error', (err) => {
        logger.error('Redis distributed lock client error', { error: err.message });
      });
      
    } catch (error) {
      logger.warn('Failed to create Redis client for distributed lock', {
        error: (error as Error).message
      });
      return null;
    }
  }
  return redisClient;
}

// =============================================================================
// LOCK IMPLEMENTATION
// =============================================================================

/**
 * Acquire a distributed lock
 */
export async function acquireLock(
  key: string,
  options: LockOptions = {}
): Promise<LockHandle> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const retryCount = options.retryCount ?? DEFAULT_RETRY_COUNT;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  
  const lockKey = `${LOCK_PREFIX}${key}`;
  const token = randomUUID();
  
  let extendInterval: NodeJS.Timeout | undefined;
  
  const handle: LockHandle = {
    key: lockKey,
    token,
    acquired: false,
    release: async () => {
      if (extendInterval) {
        clearInterval(extendInterval);
      }
      return releaseLock(lockKey, token);
    }
  };
  
  const redis = getRedisClient();
  
  if (!redis) {
    logger.warn('Redis unavailable, lock not acquired', { key });
    return handle;
  }
  
  // Try to acquire lock with retries
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // SET NX EX - atomic set-if-not-exists with expiration
      const result = await redis.set(lockKey, token, 'PX', ttlMs, 'NX');
      
      if (result === 'OK') {
        handle.acquired = true;
        handle.acquiredAt = new Date();
        handle.expiresAt = new Date(Date.now() + ttlMs);
        
        logger.debug('Lock acquired', { 
          key: lockKey, 
          attempt: attempt + 1,
          ttlMs 
        });
        
        // Set up auto-extend if requested
        if (options.autoExtend) {
          const extendIntervalMs = options.extendIntervalMs ?? Math.floor(ttlMs / 2);
          extendInterval = setInterval(async () => {
            const extended = await extendLock(lockKey, token, ttlMs);
            if (extended) {
              handle.expiresAt = new Date(Date.now() + ttlMs);
            } else {
              // Lock lost, stop extending
              clearInterval(extendInterval);
              logger.warn('Lock auto-extend failed, lock may have been lost', { key: lockKey });
            }
          }, extendIntervalMs);
        }
        
        return handle;
      }
      
      // Lock not acquired, retry after delay
      if (attempt < retryCount) {
        await sleep(retryDelayMs);
      }
      
    } catch (error) {
      logger.warn('Error acquiring lock', { 
        key: lockKey, 
        attempt: attempt + 1,
        error: (error as Error).message 
      });
      
      if (attempt < retryCount) {
        await sleep(retryDelayMs);
      }
    }
  }
  
  logger.warn('Failed to acquire lock after retries', { 
    key: lockKey, 
    retryCount 
  });
  
  return handle;
}

/**
 * Release a distributed lock
 */
async function releaseLock(lockKey: string, token: string): Promise<boolean> {
  const redis = getRedisClient();
  
  if (!redis) {
    return false;
  }
  
  try {
    const result = await redis.eval(RELEASE_SCRIPT, 1, lockKey, token);
    const released = result === 1;
    
    if (released) {
      logger.debug('Lock released', { key: lockKey });
    } else {
      logger.warn('Lock release failed (token mismatch or expired)', { key: lockKey });
    }
    
    return released;
  } catch (error) {
    logger.error('Error releasing lock', { 
      key: lockKey, 
      error: (error as Error).message 
    });
    return false;
  }
}

/**
 * Extend a lock's TTL
 */
async function extendLock(lockKey: string, token: string, ttlMs: number): Promise<boolean> {
  const redis = getRedisClient();
  
  if (!redis) {
    return false;
  }
  
  try {
    const result = await redis.eval(EXTEND_SCRIPT, 1, lockKey, token, ttlMs);
    return result === 1;
  } catch (error) {
    logger.error('Error extending lock', { 
      key: lockKey, 
      error: (error as Error).message 
    });
    return false;
  }
}

// =============================================================================
// HIGH-LEVEL HELPERS
// =============================================================================

/**
 * Execute a function with a distributed lock
 */
export async function withLock<T>(
  key: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<{ success: boolean; result?: T; error?: Error }> {
  const handle = await acquireLock(key, options);
  
  if (!handle.acquired) {
    return { 
      success: false, 
      error: new Error(`Failed to acquire lock: ${key}`) 
    };
  }
  
  try {
    const result = await fn();
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error as Error };
  } finally {
    await handle.release();
  }
}

/**
 * Create lock keys for common operations
 */
export const lockKeys = {
  /**
   * Lock for sync operation
   */
  sync: (integrationId: string, syncType: string) => 
    `sync:${integrationId}:${syncType}`,
  
  /**
   * Lock for OAuth token refresh
   */
  oauthRefresh: (integrationId: string) => 
    `oauth-refresh:${integrationId}`,
  
  /**
   * Lock for webhook processing
   */
  webhookProcess: (provider: string, eventId: string) => 
    `webhook:${provider}:${eventId}`,
  
  /**
   * Lock for integration updates
   */
  integrationUpdate: (integrationId: string) => 
    `integration-update:${integrationId}`,
  
  /**
   * Lock for field mapping sync
   */
  fieldMapping: (integrationId: string) => 
    `field-mapping:${integrationId}`
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if a lock exists (for monitoring/debugging)
 */
export async function isLocked(key: string): Promise<boolean> {
  const redis = getRedisClient();
  
  if (!redis) {
    return false;
  }
  
  const lockKey = `${LOCK_PREFIX}${key}`;
  const result = await redis.exists(lockKey);
  return result === 1;
}

/**
 * Get TTL of a lock (for monitoring/debugging)
 */
export async function getLockTtl(key: string): Promise<number | null> {
  const redis = getRedisClient();
  
  if (!redis) {
    return null;
  }
  
  const lockKey = `${LOCK_PREFIX}${key}`;
  const ttl = await redis.pttl(lockKey);
  return ttl >= 0 ? ttl : null;
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  acquireLock,
  withLock,
  lockKeys,
  isLocked,
  getLockTtl
};
