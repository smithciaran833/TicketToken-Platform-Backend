import Redis from 'ioredis';
import { getContainerUrls } from './containers';

let testRedis: Redis | null = null;

/**
 * Get or create the test Redis connection
 */
export function getTestRedis(): Redis {
  if (testRedis) {
    return testRedis;
  }

  const urls = getContainerUrls();

  testRedis = new Redis({
    host: urls.redis.host,
    port: urls.redis.port,
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  return testRedis;
}

/**
 * Flush all Redis data
 */
export async function flushRedis(): Promise<void> {
  const redis = getTestRedis();
  await redis.flushall();
}

/**
 * Close Redis connection
 */
export async function closeRedis(): Promise<void> {
  if (testRedis) {
    await testRedis.quit();
    testRedis = null;
    console.log('[Redis] Connection closed');
  }
}

/**
 * Check Redis connectivity
 */
export async function checkRedisConnection(): Promise<boolean> {
  try {
    const redis = getTestRedis();
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch (error) {
    console.error('[Redis] Connection check failed:', error);
    return false;
  }
}

/**
 * Set a test key-value pair
 */
export async function setTestKey(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const redis = getTestRedis();
  if (ttlSeconds) {
    await redis.setex(key, ttlSeconds, value);
  } else {
    await redis.set(key, value);
  }
}

/**
 * Get a test key value
 */
export async function getTestKey(key: string): Promise<string | null> {
  const redis = getTestRedis();
  return redis.get(key);
}

/**
 * Delete keys matching a pattern
 */
export async function deleteKeysByPattern(pattern: string): Promise<number> {
  const redis = getTestRedis();
  const keys = await redis.keys(pattern);
  
  if (keys.length === 0) {
    return 0;
  }

  return redis.del(...keys);
}

/**
 * Get all keys matching a pattern
 */
export async function getKeysByPattern(pattern: string): Promise<string[]> {
  const redis = getTestRedis();
  return redis.keys(pattern);
}
