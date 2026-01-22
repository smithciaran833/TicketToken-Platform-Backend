import Redis from 'ioredis';

let testRedis: Redis | null = null;

export function getTestRedis(): Redis {
  if (testRedis) {
    return testRedis;
  }

  testRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '15'),
    maxRetriesPerRequest: 3,
  });

  return testRedis;
}

export async function flushRedis(): Promise<void> {
  const redis = getTestRedis();
  await redis.flushdb();
}

export async function closeRedis(): Promise<void> {
  if (testRedis) {
    await testRedis.quit();
    testRedis = null;
    console.log('[Redis] Connection closed');
  }
}

export async function getKeysByPattern(pattern: string): Promise<string[]> {
  const redis = getTestRedis();
  return redis.keys(pattern);
}
