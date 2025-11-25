import { Redis } from 'ioredis';
import logger from '../utils/logger';

/**
 * CACHE SERVICE
 * 
 * Redis-based caching for improved performance
 * Phase 8: Advanced Features
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string;
}

export class CacheService {
  constructor(private readonly redis: Redis) {}

  /**
   * Generate cache key with namespace
   */
  private getKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      const fullKey = this.getKey(key, options?.namespace);
      const data = await this.redis.get(fullKey);
      
      if (!data) {
        return null;
      }

      return JSON.parse(data) as T;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache get error');
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.getKey(key, options?.namespace);
      const data = JSON.stringify(value);
      
      if (options?.ttl) {
        await this.redis.setex(fullKey, options.ttl, data);
      } else {
        await this.redis.set(fullKey, data);
      }
    } catch (error) {
      logger.error({ err: error, key }, 'Cache set error');
    }
  }

  /**
   * Delete value from cache
   */
  async del(key: string, options?: CacheOptions): Promise<void> {
    try {
      const fullKey = this.getKey(key, options?.namespace);
      await this.redis.del(fullKey);
    } catch (error) {
      logger.error({ err: error, key }, 'Cache delete error');
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async delPattern(pattern: string, options?: CacheOptions): Promise<void> {
    try {
      const fullPattern = this.getKey(pattern, options?.namespace);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      logger.error({ err: error, pattern }, 'Cache delete pattern error');
    }
  }

  /**
   * Get or set value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    const value = await fetchFn();
    
    // Store in cache
    await this.set(key, value, options);
    
    return value;
  }

  /**
   * Increment counter
   */
  async incr(key: string, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.redis.incr(fullKey);
      
      if (options?.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }
      
      return result;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache incr error');
      return 0;
    }
  }

  /**
   * Set with expiry
   */
  async setWithExpiry(
    key: string,
    value: any,
    ttl: number,
    options?: CacheOptions
  ): Promise<void> {
    await this.set(key, value, { ...options, ttl });
  }

  /**
   * Check if key exists
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.getKey(key, options?.namespace);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error({ err: error, key }, 'Cache exists error');
      return false;
    }
  }

  /**
   * Get remaining TTL
   */
  async ttl(key: string, options?: CacheOptions): Promise<number> {
    try {
      const fullKey = this.getKey(key, options?.namespace);
      return await this.redis.ttl(fullKey);
    } catch (error) {
      logger.error({ err: error, key }, 'Cache TTL error');
      return -1;
    }
  }
}

/**
 * Cache namespaces for different data types
 */
export const CacheNamespaces = {
  TRANSFER: 'transfer',
  USER: 'user',
  TICKET: 'ticket',
  ANALYTICS: 'analytics',
  RULES: 'rules'
};

/**
 * Standard TTL values
 */
export const CacheTTL = {
  SHORT: 60,          // 1 minute
  MEDIUM: 300,        // 5 minutes
  LONG: 3600,         // 1 hour
  DAY: 86400          // 24 hours
};
