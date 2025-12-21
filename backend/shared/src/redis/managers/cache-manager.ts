/**
 * Redis Cache Manager
 * 
 * Flexible caching with multiple strategies: cache-aside, write-through, write-behind.
 * Supports both JSON and Hash storage, batch operations, and safe key scanning.
 */

import { getRedisClient } from '../connection-manager';
import { getHashOps } from '../operations/hash';
import { getKeyBuilder } from '../utils/key-builder';
import { getScanner } from '../utils/scanner';
import { serialize, deserialize } from '../utils/serialization';
import { CacheOptions, CacheFetcher, RedisOperationError, CacheStrategy } from '../types';
import { DEFAULT_TTL } from '../config';

/**
 * Cache Manager Class
 */
export class CacheManager {
  private hashOps = getHashOps();
  private keyBuilder = getKeyBuilder();
  private scanner = getScanner();
  
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await getRedisClient();
      const value = await client.get(key);
      return value ? deserialize<T>(value) : null;
    } catch (error) {
      throw new RedisOperationError('Cache get failed', 'get', key, error as Error);
    }
  }
  
  /**
   * Set value in cache
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const serialized = serialize(value);
      
      if (ttl) {
        await client.setex(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }
      
      return true;
    } catch (error) {
      throw new RedisOperationError('Cache set failed', 'set', key, error as Error);
    }
  }
  
  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const deleted = await client.del(key);
      return deleted > 0;
    } catch (error) {
      throw new RedisOperationError('Cache delete failed', 'delete', key, error as Error);
    }
  }
  
  /**
   * Get or fetch (cache-aside pattern)
   * If value doesn't exist, fetches it and stores in cache
   */
  async getOrFetch<T>(
    key: string,
    fetcher: CacheFetcher<T>,
    ttl?: number
  ): Promise<T> {
    try {
      // Try to get from cache first
      const cached = await this.get<T>(key);
      if (cached !== null) {
        return cached;
      }
      
      // Fetch from source
      const value = await fetcher();
      
      // Store in cache
      await this.set(key, value, ttl || DEFAULT_TTL.cache.medium);
      
      return value;
    } catch (error) {
      throw new RedisOperationError('Cache getOrFetch failed', 'getOrFetch', key, error as Error);
    }
  }
  
  /**
   * Batch get multiple keys
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const client = await getRedisClient();
      const values = await client.mget(...keys);
      return values.map(v => v ? deserialize<T>(v) : null);
    } catch (error) {
      throw new RedisOperationError('Cache mget failed', 'mget', keys.join(','), error as Error);
    }
  }
  
  /**
   * Batch set multiple key-value pairs
   */
  async mset(entries: Record<string, any>, ttl?: number): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const pairs: string[] = [];
      
      Object.entries(entries).forEach(([key, value]) => {
        pairs.push(key, serialize(value));
      });
      
      await client.mset(...pairs);
      
      // Set TTL on each key if specified
      if (ttl) {
        const keys = Object.keys(entries);
        await Promise.all(keys.map(key => client.expire(key, ttl)));
      }
      
      return true;
    } catch (error) {
      throw new RedisOperationError('Cache mset failed', 'mset', '', error as Error);
    }
  }
  
  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const exists = await client.exists(key);
      return exists === 1;
    } catch (error) {
      throw new RedisOperationError('Cache exists failed', 'exists', key, error as Error);
    }
  }
  
  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      const client = await getRedisClient();
      return await client.ttl(key);
    } catch (error) {
      throw new RedisOperationError('Cache ttl failed', 'ttl', key, error as Error);
    }
  }
  
  /**
   * Set expiry on a key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const client = await getRedisClient();
      const result = await client.expire(key, seconds);
      return result === 1;
    } catch (error) {
      throw new RedisOperationError('Cache expire failed', 'expire', key, error as Error);
    }
  }
  
  /**
   * Invalidate cache by pattern (uses SCAN, not KEYS)
   */
  async invalidate(pattern: string): Promise<number> {
    try {
      return await this.scanner.scanAndDelete(pattern);
    } catch (error) {
      throw new RedisOperationError('Cache invalidate failed', 'invalidate', pattern, error as Error);
    }
  }
  
  /**
   * Get all keys matching pattern (uses SCAN)
   */
  async keys(pattern: string): Promise<string[]> {
    try {
      return await this.scanner.scanKeys(pattern);
    } catch (error) {
      throw new RedisOperationError('Cache keys failed', 'keys', pattern, error as Error);
    }
  }
  
  /**
   * Increment a numeric value
   */
  async increment(key: string, amount: number = 1): Promise<number> {
    try {
      const client = await getRedisClient();
      return await client.incrby(key, amount);
    } catch (error) {
      throw new RedisOperationError('Cache increment failed', 'increment', key, error as Error);
    }
  }
  
  /**
   * Decrement a numeric value
   */
  async decrement(key: string, amount: number = 1): Promise<number> {
    try {
      const client = await getRedisClient();
      return await client.decrby(key, amount);
    } catch (error) {
      throw new RedisOperationError('Cache decrement failed', 'decrement', key, error as Error);
    }
  }
  
  /**
   * Store object as hash (more efficient than JSON for objects)
   */
  async setHash(key: string, obj: Record<string, any>, ttl?: number): Promise<boolean> {
    try {
      await this.hashOps.hmset(key, obj);
      
      if (ttl) {
        const client = await getRedisClient();
        await client.expire(key, ttl);
      }
      
      return true;
    } catch (error) {
      throw new RedisOperationError('Cache setHash failed', 'setHash', key, error as Error);
    }
  }
  
  /**
   * Get object from hash
   */
  async getHash<T>(key: string): Promise<T | null> {
    try {
      return await this.hashOps.hgetall<T>(key);
    } catch (error) {
      throw new RedisOperationError('Cache getHash failed', 'getHash', key, error as Error);
    }
  }
  
  /**
   * Flush all cache (WARNING: Use with caution)
   */
  async flushAll(): Promise<boolean> {
    try {
      const client = await getRedisClient();
      await client.flushdb();
      return true;
    } catch (error) {
      throw new RedisOperationError('Cache flushAll failed', 'flushAll', '', error as Error);
    }
  }
}

// Singleton
let cacheManager: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!cacheManager) {
    cacheManager = new CacheManager();
  }
  return cacheManager;
}

export function createCacheManager(): CacheManager {
  return new CacheManager();
}
