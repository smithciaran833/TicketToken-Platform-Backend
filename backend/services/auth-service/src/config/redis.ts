import Redis from 'ioredis';
import { env } from './env';

// Redis client for session management and caching
export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  enableOfflineQueue: true,
});

// Redis event handlers
redis.on('connect', () => {
  console.log('Redis client connected');
});

redis.on('error', (error) => {
  console.error('Redis client error:', error);
});

redis.on('ready', () => {
  console.log('Redis client ready');
});

// Create a duplicate client for pub/sub if needed
export const redisPub = redis.duplicate();
export const redisSub = redis.duplicate();

// Graceful shutdown
export async function closeRedisConnections() {
  await redis.quit();
  await redisPub.quit();
  await redisSub.quit();
}
