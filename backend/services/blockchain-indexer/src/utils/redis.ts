import Redis from 'ioredis';
import logger from './logger';

const redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: 3
});

redis.on('connect', () => {
    logger.info('Connected to Redis');
});

redis.on('error', (err: Error) => {
    logger.error({ err }, 'Redis error');
});

export default redis;
