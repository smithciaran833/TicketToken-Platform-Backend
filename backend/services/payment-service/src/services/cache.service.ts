/**
 * Cache Service
 * Provides caching abstraction layer with Redis backend
 */

import { redis } from '../config/redis';
import { SafeLogger } from '../utils/pci-log-scrubber.util';

const logger = new SafeLogger('CacheService');

export class CacheService {
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      if (!value) {
        return null;
      }
      
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null; // Return null on error, don't fail
    }
  }

  /**
   * Set value in cache with TTL
   * @param key Cache key
   * @param value Value to store
   * @param ttlSeconds Time to live in seconds
   */
  async set(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      await redis.setex(key, ttlSeconds, serialized);
      return true;
    } catch (error) {
      logger.error('Cache set error', {
        key,
        ttlSeconds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      logger.error('Cache delete error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Delete keys matching pattern
   * Use with caution - can be expensive
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await redis.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      
      await redis.del(...keys);
      return keys.length;
    } catch (error) {
      logger.error('Cache delete pattern error', {
        pattern,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Increment counter (atomic operation)
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      return await redis.incrby(key, amount);
    } catch (error) {
      logger.error('Cache increment error', {
        key,
        amount,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Set expiry on existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await redis.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      logger.error('Cache expire error', {
        key,
        ttlSeconds,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get or compute value (cache-aside pattern)
   * @param key Cache key
   * @param computeFn Function to compute value if not in cache
   * @param ttlSeconds Time to live in seconds
   */
  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      logger.info('Cache hit', { key });
      return cached;
    }

    // Cache miss - compute value
    logger.info('Cache miss', { key });
    const value = await computeFn();
    
    // Store in cache (fire and forget - don't wait)
    this.set(key, value, ttlSeconds).catch((error) => {
      logger.error('Failed to cache computed value', {
        key,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    return value;
  }
}

// Export singleton instance
export const cacheService = new CacheService();
