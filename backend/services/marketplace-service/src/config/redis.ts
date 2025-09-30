import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Create Redis client with no retries if it fails
export const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: 0,  // Don't retry
  enableOfflineQueue: false, // Don't queue commands when offline
  retryStrategy: () => null, // Disable connection retries
  reconnectOnError: () => false, // Don't reconnect on errors
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('error', (err) => {
  logger.warn('Redis error (non-fatal):', err.message);
});

// Cache helper functions that fail gracefully
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  },

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      if (ttl) {
        await redis.setex(key, ttl, serialized);
      } else {
        await redis.set(key, serialized);
      }
    } catch (error) {
      // Silently fail - cache is optional
    }
  },

  async del(key: string): Promise<void> {
    try {
      await redis.del(key);
    } catch (error) {
      // Silently fail
    }
  },

  async exists(key: string): Promise<boolean> {
    try {
      return (await redis.exists(key)) === 1;
    } catch (error) {
      return false;
    }
  }
};

export default redis;
