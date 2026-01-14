import Redis from 'ioredis';
import logger from '../utils/logger';

type RedisClient = InstanceType<typeof Redis>;

let redis: RedisClient | undefined;

export function initializeRedis(): RedisClient {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });

  redis.on('connect', () => {
    logger.info('✅ Redis connected');
  });

  redis.on('error', (err: Error) => {
    logger.error('❌ Redis error:', err);
  });

  return redis;
}

export function getRedis(): RedisClient {
  if (!redis) {
    throw new Error('Redis not initialized. Call initializeRedis() first.');
  }
  return redis;
}
