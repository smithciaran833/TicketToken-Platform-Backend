import Redis from 'ioredis';
import logger from './logger';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
}

/**
 * Cache Manager using Redis
 */
export class CacheManager {
  private client: Redis;
  private readonly defaultTTL: number;
  private readonly keyPrefix: string;

  constructor(config: CacheConfig) {
    this.defaultTTL = config.defaultTTL || 300; // 5 minutes default
    this.keyPrefix = config.keyPrefix || 'blockchain-indexer:';

    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: this.keyPrefix,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('connect', () => {
      logger.info({ host: config.host, port: config.port }, 'Redis cache connected');
    });

    this.client.on('error', (error) => {
      logger.error({ error }, 'Redis cache error');
    });
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      if (!value) return null;
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const expirySeconds = ttl || this.defaultTTL;
      
      await this.client.setex(key, expirySeconds, serialized);
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        // Remove prefix since Redis client adds it automatically
        const strippedKeys = keys.map(key => key.replace(this.keyPrefix, ''));
        await this.client.del(...strippedKeys);
        logger.info({ pattern, count: keys.length }, 'Deleted keys matching pattern');
      }
    } catch (error) {
      logger.error({ error, pattern }, 'Cache delete pattern error');
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      logger.debug({ key }, 'Cache hit');
      return cached;
    }

    // Cache miss - fetch data
    logger.debug({ key }, 'Cache miss');
    const data = await fetchFn();
    
    // Store in cache
    await this.set(key, data, ttl);
    
    return data;
  }

  /**
   * Increment counter
   */
  async incr(key: string): Promise<number> {
    try {
      return await this.client.incr(key);
    } catch (error) {
      logger.error({ error, key }, 'Cache incr error');
      return 0;
    }
  }

  /**
   * Set expiration on key
   */
  async expire(key: string, seconds: number): Promise<void> {
    try {
      await this.client.expire(key, seconds);
    } catch (error) {
      logger.error({ error, key, seconds }, 'Cache expire error');
    }
  }

  /**
   * Get multiple keys
   */
  async mget<T>(keys: string[]): Promise<Array<T | null>> {
    try {
      const values = await this.client.mget(...keys);
      return values.map(v => v ? JSON.parse(v) as T : null);
    } catch (error) {
      logger.error({ error, keys }, 'Cache mget error');
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys
   */
  async mset(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.client.pipeline();
      
      for (const entry of entries) {
        const serialized = JSON.stringify(entry.value);
        const ttl = entry.ttl || this.defaultTTL;
        pipeline.setex(entry.key, ttl, serialized);
      }
      
      await pipeline.exec();
    } catch (error) {
      logger.error({ error }, 'Cache mset error');
    }
  }

  /**
   * Clear all keys with this prefix
   */
  async clear(): Promise<void> {
    try {
      const keys = await this.client.keys('*');
      if (keys.length > 0) {
        const strippedKeys = keys.map(key => key.replace(this.keyPrefix, ''));
        await this.client.del(...strippedKeys);
        logger.info({ count: keys.length }, 'Cleared all cache keys');
      }
    } catch (error) {
      logger.error({ error }, 'Cache clear error');
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
    logger.info('Redis cache disconnected');
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{ keyCount: number; memoryUsed: string }> {
    try {
      const info = await this.client.info('memory');
      const keys = await this.client.keys('*');
      
      // Parse memory info
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'unknown';
      
      return {
        keyCount: keys.length,
        memoryUsed
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get cache stats');
      return { keyCount: 0, memoryUsed: 'unknown' };
    }
  }
}

// Singleton instance
let cacheInstance: CacheManager | null = null;

/**
 * Initialize cache manager
 */
export function initializeCache(config: CacheConfig): CacheManager {
  if (cacheInstance) {
    logger.warn('Cache manager already initialized');
    return cacheInstance;
  }
  
  cacheInstance = new CacheManager(config);
  return cacheInstance;
}

/**
 * Get cache manager instance
 */
export function getCache(): CacheManager {
  if (!cacheInstance) {
    throw new Error('Cache manager not initialized. Call initializeCache() first.');
  }
  return cacheInstance;
}

/**
 * Cache key builders for common patterns
 */
export const CacheKeys = {
  transaction: (signature: string) => `tx:${signature}`,
  walletActivity: (address: string, offset: number, limit: number) => 
    `wallet:${address}:activity:${offset}:${limit}`,
  nftHistory: (tokenId: string) => `nft:${tokenId}:history`,
  syncStatus: () => `sync:status`,
  slotTransactions: (slot: number) => `slot:${slot}:transactions`,
  marketplaceActivity: (marketplace: string | undefined, offset: number, limit: number) =>
    `marketplace:${marketplace || 'all'}:${offset}:${limit}`
};
