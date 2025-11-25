/**
 * Redis Configuration
 * Connection pooling and failover for caching
 */
import Redis from 'ioredis';
import { SafeLogger } from '../utils/pci-log-scrubber.util';
const logger = new SafeLogger('Redis');
let redisClient: Redis | null = null;
function getRedisClient(): Redis {
  if (!redisClient) {
    // Redis connection configuration
    const redisConfig: any = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
      lazyConnect: true,
      // Connection settings
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      // Timeouts
      connectTimeout: 10000, // 10 seconds
      commandTimeout: 5000,  // 5 seconds
      // Retry strategy
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn('Redis connection retry', { times, delay });
        return delay;
      },
      // Reconnect on error
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Reconnect if redis is in readonly mode
          return true;
        }
        return false;
      },
    };
    // Only add password if it's actually set in environment
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
      logger.info('Redis password configured from environment');
    } else {
      logger.info('Redis running without authentication');
    }
    // Create Redis client
    redisClient = new Redis(redisConfig);
    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis client connecting');
    });
    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });
    redisClient.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
    });
    redisClient.on('close', () => {
      logger.warn('Redis client connection closed');
    });
    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }
  return redisClient;
}
// Export getter function instead of client directly
export const redis = new Proxy({} as Redis, {
  get(target, prop) {
    return (getRedisClient() as any)[prop];
  }
});
/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed gracefully');
      redisClient = null;
    } catch (error) {
      logger.error('Error closing Redis connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
/**
 * Health check
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const result = await getRedisClient().ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
