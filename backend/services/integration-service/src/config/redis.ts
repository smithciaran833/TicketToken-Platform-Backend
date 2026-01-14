/**
 * Redis Configuration and Client for Integration Service
 * 
 * Provides a shared Redis client for:
 * - Rate limiting
 * - Idempotency
 * - Distributed locks
 * - Caching
 */

import Redis, { RedisOptions } from 'ioredis';
import { getRedisConfig } from './index';
import { logger } from '../utils/logger';

// =============================================================================
// REDIS CLIENT SINGLETON
// =============================================================================

let redisClient: InstanceType<typeof Redis> | null = null;
let pubsubClient: InstanceType<typeof Redis> | null = null;

/**
 * Create Redis connection options
 */
function getRedisOptions(): RedisOptions {
  const config = getRedisConfig();
  
  return {
    host: config.host || 'localhost',
    port: config.port,
    password: config.password || undefined,
    db: config.db,
    tls: config.tls ? {} : undefined,
    retryStrategy: (times: number) => {
      if (times > 10) {
        logger.error('Redis connection failed after 10 retries');
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000);
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    connectTimeout: 10000,
    commandTimeout: 5000
  };
}

/**
 * Get or create the Redis client
 */
export function getRedisClient(): InstanceType<typeof Redis> | null {
  const config = getRedisConfig();
  
  if (!config.host) {
    logger.debug('Redis not configured, returning null client');
    return null;
  }
  
  if (!redisClient) {
    try {
      redisClient = new Redis(getRedisOptions());
      
      redisClient.on('connect', () => {
        logger.info('Redis client connected', { host: config.host, port: config.port });
      });
      
      redisClient.on('ready', () => {
        logger.info('Redis client ready');
      });
      
      redisClient.on('error', (error) => {
        logger.error('Redis client error', { error: error.message });
      });
      
      redisClient.on('close', () => {
        logger.warn('Redis client connection closed');
      });
      
      redisClient.on('reconnecting', (delay) => {
        logger.info('Redis client reconnecting', { delay });
      });
      
    } catch (error) {
      logger.error('Failed to create Redis client', { error: (error as Error).message });
      return null;
    }
  }
  
  return redisClient;
}

/**
 * Get or create a pub/sub client
 */
export function getPubSubClient(): InstanceType<typeof Redis> | null {
  const config = getRedisConfig();
  
  if (!config.host) {
    return null;
  }
  
  if (!pubsubClient) {
    try {
      pubsubClient = new Redis(getRedisOptions());
      
      pubsubClient.on('error', (error) => {
        logger.error('Redis pub/sub client error', { error: error.message });
      });
      
    } catch (error) {
      logger.error('Failed to create Redis pub/sub client', { error: (error as Error).message });
      return null;
    }
  }
  
  return pubsubClient;
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client) {
    return false;
  }
  
  try {
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.warn('Redis health check failed', { error: (error as Error).message });
    return false;
  }
}

/**
 * Get Redis info (for monitoring)
 */
export async function getRedisInfo(): Promise<Record<string, string> | null> {
  const client = getRedisClient();
  
  if (!client) {
    return null;
  }
  
  try {
    const info = await client.info();
    const parsed: Record<string, string> = {};
    
    info.split('\r\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value && !key.startsWith('#')) {
        parsed[key] = value;
      }
    });
    
    return parsed;
  } catch (error) {
    logger.warn('Failed to get Redis info', { error: (error as Error).message });
    return null;
  }
}

/**
 * Initialize Redis client - validates connection
 */
export async function initializeRedis(): Promise<void> {
  const client = getRedisClient();
  if (client) {
    try {
      await client.ping();
      logger.info('Redis initialized and connected');
    } catch (error) {
      logger.error('Failed to initialize Redis', { error: (error as Error).message });
      throw error;
    }
  } else {
    logger.warn('Redis not configured, skipping initialization');
  }
}

/**
 * Export the Redis client instance for direct access
 */
export { redisClient };

/**
 * Close Redis connections
 */
export async function closeRedisConnections(): Promise<void> {
  const promises: Promise<void>[] = [];
  
  if (redisClient) {
    promises.push(
      redisClient.quit().then(() => {
        redisClient = null;
        logger.info('Redis client disconnected');
      })
    );
  }
  
  if (pubsubClient) {
    promises.push(
      pubsubClient.quit().then(() => {
        pubsubClient = null;
        logger.info('Redis pub/sub client disconnected');
      })
    );
  }
  
  await Promise.all(promises);
}

// =============================================================================
// CACHE HELPERS
// =============================================================================

/**
 * Get value from cache
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedisClient();
  
  if (!client) {
    return null;
  }
  
  try {
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    logger.warn('Cache get failed', { key, error: (error as Error).message });
    return null;
  }
}

/**
 * Set value in cache
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds?: number
): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client) {
    return false;
  }
  
  try {
    const serialized = JSON.stringify(value);
    
    if (ttlSeconds) {
      await client.setex(key, ttlSeconds, serialized);
    } else {
      await client.set(key, serialized);
    }
    
    return true;
  } catch (error) {
    logger.warn('Cache set failed', { key, error: (error as Error).message });
    return false;
  }
}

/**
 * Delete value from cache
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const client = getRedisClient();
  
  if (!client) {
    return false;
  }
  
  try {
    await client.del(key);
    return true;
  } catch (error) {
    logger.warn('Cache delete failed', { key, error: (error as Error).message });
    return false;
  }
}

/**
 * Delete multiple keys by pattern
 */
export async function cacheDeletePattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  
  if (!client) {
    return 0;
  }
  
  try {
    const keys = await client.keys(pattern);
    if (keys.length === 0) {
      return 0;
    }
    const deleted = await client.del(...keys);
    return deleted;
  } catch (error) {
    logger.warn('Cache delete pattern failed', { pattern, error: (error as Error).message });
    return 0;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  getRedisClient,
  getPubSubClient,
  checkRedisHealth,
  getRedisInfo,
  closeRedisConnections,
  initializeRedis,
  cacheGet,
  cacheSet,
  cacheDelete,
  cacheDeletePattern
};
