import Redis from 'ioredis';
import { logger } from '../utils/logger';

let redisClient: Redis | null = null;

export async function connectRedis(): Promise<Redis> {
  if (redisClient) return redisClient;
  
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  });
  
  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });
  
  redisClient.on('error', (error) => {
    logger.error('Redis error:', error);
  });
  
  return redisClient;
}

export function getRedisClient(): Redis {
  if (!redisClient) {
    throw new Error('Redis not initialized');
  }
  return redisClient;
}
