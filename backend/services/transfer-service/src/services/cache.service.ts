/**
 * Cache Service for Transfer Service
 * 
 * Redis-backed caching with memory fallback
 * Used by idempotency middleware and other components
 */

import Redis from 'ioredis';
import logger from '../utils/logger';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface CacheConfig {
  redisUrl?: string;
  redisHost?: string;
  redisPort?: number;
  redisPassword?: string;
  defaultTtlSeconds?: number;
  keyPrefix?: string;
}

const DEFAULT_TTL = 3600; // 1 hour
const KEY_PREFIX = 'transfer:';

// =============================================================================
// IN-MEMORY FALLBACK
// =============================================================================

interface MemoryCacheEntry {
  value: any;
  expiresAt: number;
}

const memoryCache = new Map<string, MemoryCacheEntry>();

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiresAt < now) {
      memoryCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug('Cleaned expired cache entries', { cleaned });
  }
}, 60 * 1000);

// =============================================================================
// CACHE SERVICE CLASS
// =============================================================================

export class CacheService {
  private redis: Redis | null = null;
  private connected: boolean = false;
  private keyPrefix: string;
  private defaultTtl: number;

  constructor(config: CacheConfig = {}) {
    this.keyPrefix = config.keyPrefix || KEY_PREFIX;
    this.defaultTtl = config.defaultTtlSeconds || DEFAULT_TTL;

    // Try to connect to Redis
    this.initializeRedis(config);
  }

  private initializeRedis(config: CacheConfig): void {
    const redisUrl = config.redisUrl || process.env.REDIS_URL;
    
    if (!redisUrl && !config.redisHost) {
      logger.warn('Redis not configured, using memory cache');
      return;
    }

    try {
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false,
          lazyConnect: true
        });
      } else {
        this.redis = new Redis({
          host: config.redisHost || process.env.REDIS_HOST || 'localhost',
          port: config.redisPort || parseInt(process.env.REDIS_PORT || '6379'),
          password: config.redisPassword || process.env.REDIS_PASSWORD,
          maxRetriesPerRequest: 3,
          enableOfflineQueue: false,
          lazyConnect: true
        });
      }

      this.redis.on('connect', () => {
        this.connected = true;
        logger.info('Redis connected');
      });

      this.redis.on('error', (err) => {
        this.connected = false;
        logger.error({ err }, 'Redis error');
      });

      this.redis.on('close', () => {
        this.connected = false;
        logger.warn('Redis connection closed');
      });

      // Connect in background
      this.redis.connect().catch((err) => {
        logger.warn({ err }, 'Redis connection failed, using memory cache');
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to initialize Redis, using memory cache');
    }
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  /**
   * Get a value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    const fullKey = this.getKey(key);

    // Try Redis first
    if (this.redis && this.connected) {
      try {
        const value = await this.redis.get(fullKey);
        if (value) {
          return JSON.parse(value) as T;
        }
      } catch (error) {
        logger.warn({ error, key }, 'Redis get error, falling back to memory');
      }
    }

    // Fallback to memory
    const entry = memoryCache.get(fullKey);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value as T;
    }
    
    if (entry) {
      memoryCache.delete(fullKey);
    }
    
    return null;
  }

  /**
   * Set a value in cache
   */
  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const fullKey = this.getKey(key);
    const ttl = ttlSeconds || this.defaultTtl;
    const serialized = JSON.stringify(value);

    // Try Redis first
    if (this.redis && this.connected) {
      try {
        await this.redis.setex(fullKey, ttl, serialized);
        return;
      } catch (error) {
        logger.warn({ error, key }, 'Redis set error, falling back to memory');
      }
    }

    // Fallback to memory
    memoryCache.set(fullKey, {
      value,
      expiresAt: Date.now() + (ttl * 1000)
    });
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.getKey(key);

    // Try Redis first
    if (this.redis && this.connected) {
      try {
        await this.redis.del(fullKey);
      } catch (error) {
        logger.warn({ error, key }, 'Redis delete error');
      }
    }

    // Always delete from memory too
    memoryCache.delete(fullKey);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.getKey(key);

    if (this.redis && this.connected) {
      try {
        const exists = await this.redis.exists(fullKey);
        return exists === 1;
      } catch (error) {
        logger.warn({ error, key }, 'Redis exists error');
      }
    }

    const entry = memoryCache.get(fullKey);
    return !!entry && entry.expiresAt > Date.now();
  }

  /**
   * Set a value only if it doesn't exist (for distributed locks)
   */
  async setNX(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    const fullKey = this.getKey(key);
    const serialized = JSON.stringify(value);

    if (this.redis && this.connected) {
      try {
        const result = await this.redis.set(fullKey, serialized, 'EX', ttlSeconds, 'NX');
        return result === 'OK';
      } catch (error) {
        logger.warn({ error, key }, 'Redis setNX error');
      }
    }

    // Memory fallback
    const existing = memoryCache.get(fullKey);
    if (existing && existing.expiresAt > Date.now()) {
      return false;
    }

    memoryCache.set(fullKey, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
    return true;
  }

  /**
   * Increment a counter
   */
  async incr(key: string): Promise<number> {
    const fullKey = this.getKey(key);

    if (this.redis && this.connected) {
      try {
        return await this.redis.incr(fullKey);
      } catch (error) {
        logger.warn({ error, key }, 'Redis incr error');
      }
    }

    // Memory fallback
    const entry = memoryCache.get(fullKey);
    const current = entry && entry.expiresAt > Date.now() ? Number(entry.value) : 0;
    const newValue = current + 1;
    
    memoryCache.set(fullKey, {
      value: newValue,
      expiresAt: entry?.expiresAt || Date.now() + (this.defaultTtl * 1000)
    });
    
    return newValue;
  }

  /**
   * Set expiry on a key
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const fullKey = this.getKey(key);

    if (this.redis && this.connected) {
      try {
        await this.redis.expire(fullKey, ttlSeconds);
        return;
      } catch (error) {
        logger.warn({ error, key }, 'Redis expire error');
      }
    }

    // Memory fallback
    const entry = memoryCache.get(fullKey);
    if (entry) {
      entry.expiresAt = Date.now() + (ttlSeconds * 1000);
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
      this.connected = false;
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let cacheInstance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService();
  }
  return cacheInstance;
}

export default CacheService;
