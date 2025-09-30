import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

let redis: Redis;
let pubClient: Redis;
let subClient: Redis;

export async function connectRedis() {
  try {
    // Main Redis client
    redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
    });

    // Pub/Sub clients for real-time updates
    pubClient = redis.duplicate();
    subClient = redis.duplicate();

    redis.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redis.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    // Test connection
    await redis.ping();
    
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedis() {
  if (!redis) {
    throw new Error('Redis not initialized');
  }
  return redis;
}

export function getPubClient() {
  if (!pubClient) {
    throw new Error('Redis pub client not initialized');
  }
  return pubClient;
}

export function getSubClient() {
  if (!subClient) {
    throw new Error('Redis sub client not initialized');
  }
  return subClient;
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
  }
  if (pubClient) {
    await pubClient.quit();
  }
  if (subClient) {
    await subClient.quit();
  }
  logger.info('Redis connections closed');
}
