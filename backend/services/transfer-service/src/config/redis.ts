/**
 * Redis Configuration for Transfer Service
 * 
 * AUDIT FIX LOW-4: Missing Redis config → Proper Redis configuration
 * 
 * Features:
 * - Connection pooling
 * - TLS support
 * - Reconnection handling
 * - Health monitoring
 */

import Redis, { RedisOptions } from 'ioredis';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

const REDIS_CONFIG = {
  // Connection
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  
  // TLS
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  
  // Connection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
  
  // Reconnection
  retryStrategy: (times: number) => {
    if (times > 10) {
      logger.error('Redis max reconnection attempts reached');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 100, 3000);
    logger.warn({ attempt: times, delay }, 'Redis reconnecting');
    return delay;
  },
  
  // Performance
  enableReadyCheck: true,
  enableOfflineQueue: true,
  maxRetriesPerRequest: 3,
  
  // Key prefix
  keyPrefix: 'transfer-service:'
};

// =============================================================================
// REDIS CLIENT
// =============================================================================

let redisClient: Redis | null = null;
let subscriberClient: Redis | null = null;

/**
 * Create Redis connection options
 */
function createRedisOptions(): RedisOptions {
  // If REDIS_URL is provided, use it directly
  if (process.env.REDIS_URL) {
    return {
      ...REDIS_CONFIG,
      lazyConnect: true
    };
  }
  
  return {
    host: REDIS_CONFIG.host,
    port: REDIS_CONFIG.port,
    password: REDIS_CONFIG.password,
    tls: REDIS_CONFIG.tls,
    connectTimeout: REDIS_CONFIG.connectTimeout,
    commandTimeout: REDIS_CONFIG.commandTimeout,
    retryStrategy: REDIS_CONFIG.retryStrategy,
    enableReadyCheck: REDIS_CONFIG.enableReadyCheck,
    enableOfflineQueue: REDIS_CONFIG.enableOfflineQueue,
    maxRetriesPerRequest: REDIS_CONFIG.maxRetriesPerRequest,
    keyPrefix: REDIS_CONFIG.keyPrefix,
    lazyConnect: true
  };
}

/**
 * Initialize Redis client
 */
export async function initRedis(): Promise<Redis> {
  if (redisClient) {
    return redisClient;
  }
  
  const options = createRedisOptions();
  
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL, options);
  } else {
    redisClient = new Redis(options);
  }
  
  // Set up event handlers
  redisClient.on('connect', () => {
    logger.info('Redis connecting');
  });
  
  redisClient.on('ready', () => {
    logger.info('Redis ready');
  });
  
  redisClient.on('error', (error) => {
    logger.error({ error }, 'Redis error');
  });
  
  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });
  
  redisClient.on('reconnecting', () => {
    logger.info('Redis reconnecting');
  });
  
  // Connect
  await redisClient.connect();
  
  return redisClient;
}

/**
 * Get Redis client
 */
export function getRedis(): Redis | null {
  return redisClient;
}

/**
 * Get or create subscriber client (for pub/sub)
 */
export async function getSubscriberClient(): Promise<Redis> {
  if (subscriberClient) {
    return subscriberClient;
  }
  
  const options = createRedisOptions();
  
  if (process.env.REDIS_URL) {
    subscriberClient = new Redis(process.env.REDIS_URL, {
      ...options,
      keyPrefix: undefined // Subscriber shouldn't use keyPrefix
    });
  } else {
    subscriberClient = new Redis({
      ...options,
      keyPrefix: undefined
    });
  }
  
  subscriberClient.on('error', (error) => {
    logger.error({ error }, 'Redis subscriber error');
  });
  
  await subscriberClient.connect();
  
  return subscriberClient;
}

/**
 * Close Redis connections
 */
export async function closeRedis(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  
  if (redisClient) {
    closePromises.push(
      redisClient.quit().then(() => {
        logger.info('Redis client disconnected');
      })
    );
    redisClient = null;
  }
  
  if (subscriberClient) {
    closePromises.push(
      subscriberClient.quit().then(() => {
        logger.info('Redis subscriber disconnected');
      })
    );
    subscriberClient = null;
  }
  
  await Promise.all(closePromises);
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}> {
  if (!redisClient) {
    return { healthy: false, error: 'Redis not initialized' };
  }
  
  const start = Date.now();
  
  try {
    await redisClient.ping();
    return {
      healthy: true,
      latencyMs: Date.now() - start
    };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Get Redis connection info
 */
export async function getRedisInfo(): Promise<Record<string, string> | null> {
  if (!redisClient) {
    return null;
  }
  
  try {
    const info = await redisClient.info();
    const parsed: Record<string, string> = {};
    
    info.split('\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        parsed[key.trim()] = value.trim();
      }
    });
    
    return parsed;
  } catch (error) {
    logger.error({ error }, 'Failed to get Redis info');
    return null;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  initRedis,
  getRedis,
  getSubscriberClient,
  closeRedis,
  checkRedisHealth,
  getRedisInfo,
  REDIS_CONFIG
};
