import Redis from 'ioredis';
import { config } from './index';
import { pino } from 'pino';

const logger = pino({ name: 'redis' });

export const createRedisConnection = (): Redis => {
  const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3
  });

  redis.on('connect', () => {
    logger.info('Redis connection established');
  });

  redis.on('error', (error) => {
    logger.error({ error }, 'Redis connection error');
  });

  return redis;
};
