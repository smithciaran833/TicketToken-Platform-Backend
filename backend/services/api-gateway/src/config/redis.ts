import Redis from 'ioredis';
import { config } from './index';
import { logger } from '../utils/logger';

// Create Redis client with retry logic
export const createRedisClient = (name: string = 'default'): Redis => {
  const client = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      logger.info({ attempt: times, delay }, 'Retrying Redis connection');
      return delay;
    },
    lazyConnect: true,
    reconnectOnError: (err) => {
      logger.error({ error: err, client: name }, 'Redis reconnect on error');
      const targetError = 'READONLY';
      if (err.message.includes(targetError)) {
        return true;
      }
      return false;
    },
  });

  // Event handlers
  client.on('connect', () => {
    logger.info({ client: name }, 'Redis client connected');
  });

  client.on('ready', () => {
    logger.info({ client: name }, 'Redis client ready');
  });

  client.on('error', (error) => {
    logger.error({ error, client: name }, 'Redis client error');
  });

  client.on('close', () => {
    logger.warn({ client: name }, 'Redis client closed');
  });

  client.on('reconnecting', (delay: number) => {
    logger.info({ client: name, delay }, 'Redis client reconnecting');
  });

  client.on('end', () => {
    logger.info({ client: name }, 'Redis client ended');
  });

  return client;
};

// Redis key prefixes for different purposes
export const REDIS_KEYS = {
  // Rate limiting
  RATE_LIMIT: 'rl:',
  RATE_LIMIT_TICKET: 'rl:ticket:',
  RATE_LIMIT_IP: 'rl:ip:',

  // Session management
  SESSION: 'session:',
  REFRESH_TOKEN: 'refresh:',

  // Circuit breaker states
  CIRCUIT_BREAKER: 'cb:',

  // Service discovery cache
  SERVICE_DISCOVERY: 'sd:',
  SERVICE_HEALTH: 'health:',

  // API keys
  API_KEY: 'apikey:',

  // Idempotency
  IDEMPOTENCY: 'idem:',

  // Queue coordination
  QUEUE_LOCK: 'queue:lock:',

  // Cache
  CACHE_EVENT: 'cache:event:',
  CACHE_VENUE: 'cache:venue:',
  CACHE_TICKET: 'cache:ticket:',

  // Distributed locks
  LOCK: 'lock:',
} as const;

// TTL values in seconds
export const REDIS_TTL = {
  RATE_LIMIT: 60,
  SESSION: 900, // 15 minutes
  REFRESH_TOKEN: 604800, // 7 days
  CIRCUIT_BREAKER: 300, // 5 minutes
  SERVICE_DISCOVERY: 30,
  API_KEY: 86400, // 24 hours
  IDEMPOTENCY: 86400, // 24 hours
  CACHE_SHORT: 60, // 1 minute
  CACHE_MEDIUM: 300, // 5 minutes
  CACHE_LONG: 3600, // 1 hour
  LOCK: 30, // 30 seconds
} as const;

// Helper functions for Redis operations
export class RedisHelper {
  constructor(private redis: Redis) {}

  async acquireLock(key: string, ttl: number = REDIS_TTL.LOCK): Promise<boolean> {
    const lockKey = `${REDIS_KEYS.LOCK}${key}`;
    const lockId = Date.now().toString();

    const result = await this.redis.set(lockKey, lockId, 'EX', ttl, 'NX');
    return result === 'OK';
  }

  async releaseLock(key: string): Promise<void> {
    const lockKey = `${REDIS_KEYS.LOCK}${key}`;
    await this.redis.del(lockKey);
  }

  async getWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = REDIS_TTL.CACHE_MEDIUM
  ): Promise<T> {
    // Try cache first
    const cached = await this.redis.get(key);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (error) {
        logger.error({ error, key }, 'Failed to parse cached data');
      }
    }

    // Fetch and cache
    const data = await fetcher();
    await this.redis.setex(key, ttl, JSON.stringify(data));
    return data;
  }

  async invalidateCache(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
