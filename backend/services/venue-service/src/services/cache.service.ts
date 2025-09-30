import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { withCircuitBreaker } from '../utils/circuitBreaker';
import { withRetry } from '../utils/retry';
import { CacheError } from '../utils/errors';

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour default
  private keyPrefix: string = 'venue:';

  // Wrapped Redis operations with circuit breakers and retry
  private getWithBreaker: (key: string) => Promise<string | null>;
  private setWithBreaker: (key: string, value: string, ttl?: number) => Promise<string>;
  private delWithBreaker: (key: string) => Promise<number>;
  private existsWithBreaker: (key: string) => Promise<number>;
  private scanWithBreaker: (cursor: string, pattern: string, count: number) => Promise<[string, string[]]>;

  constructor(redis: Redis) {
    this.redis = redis;

    // Wrap Redis operations with retry then circuit breaker
    this.getWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.get(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-get', timeout: 1000 }
    );

    this.setWithBreaker = withCircuitBreaker(
      (key: string, value: string, ttl?: number) => withRetry(
        () => {
          if (ttl) {
            return this.redis.setex(key, ttl, value);
          }
          return this.redis.set(key, value);
        },
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-set', timeout: 1000 }
    );

    this.delWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.del(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-del', timeout: 1000 }
    );

    this.existsWithBreaker = withCircuitBreaker(
      (key: string) => withRetry(
        () => this.redis.exists(key),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-exists', timeout: 1000 }
    );

    this.scanWithBreaker = withCircuitBreaker(
      (cursor: string, pattern: string, count: number) => withRetry(
        () => this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', count),
        { maxAttempts: 2, initialDelay: 50 }
      ),
      { name: 'redis-scan', timeout: 2000 }
    );
  }

  // Generate cache key with prefix
  private getCacheKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  // Get from cache
  async get(key: string): Promise<any | null> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = await this.getWithBreaker(cacheKey);
      
      if (data) {
        logger.debug({ key: cacheKey }, 'Cache hit');
        return JSON.parse(data);
      }
      
      logger.debug({ key: cacheKey }, 'Cache miss');
      return null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      throw new CacheError('get', error);
    }
  }

  // Set in cache
  async set(key: string, value: any, ttl: number = this.defaultTTL): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      const data = JSON.stringify(value);
      await this.setWithBreaker(cacheKey, data, ttl);
      logger.debug({ key: cacheKey, ttl }, 'Cache set');
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
      throw new CacheError('set', error);
    }
  }

  // Delete from cache
  async del(key: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key);
      await this.delWithBreaker(cacheKey);
      logger.debug({ key: cacheKey }, 'Cache deleted');
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
      throw new CacheError('delete', error);
    }
  }

  // Clear venue cache with pattern matching
  async clearVenueCache(venueId: string): Promise<void> {
    try {
      const patterns = [
        `${this.keyPrefix}${venueId}`,
        `${this.keyPrefix}${venueId}:*`,
        `${this.keyPrefix}list:*${venueId}*`,
        `${this.keyPrefix}tenant:*:${venueId}`
      ];

      for (const pattern of patterns) {
        await this.clearByPattern(pattern);
      }

      logger.info({ venueId }, 'Venue cache cleared');
    } catch (error) {
      logger.error({ error, venueId }, 'Failed to clear venue cache');
      throw new CacheError('clear', error);
    }
  }

  // Clear all venue-related cache for a tenant
  async clearTenantVenueCache(tenantId: string): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}tenant:${tenantId}:*`;
      await this.clearByPattern(pattern);
      logger.info({ tenantId }, 'Tenant venue cache cleared');
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to clear tenant venue cache');
      throw new CacheError('clear', error);
    }
  }

  // Clear cache by pattern using SCAN
  private async clearByPattern(pattern: string): Promise<void> {
    let cursor = '0';
    const keysToDelete: string[] = [];

    do {
      try {
        const [nextCursor, keys] = await this.scanWithBreaker(cursor, pattern, 100);
        cursor = nextCursor;
        keysToDelete.push(...keys);
      } catch (error) {
        logger.error({ error, pattern }, 'Failed to scan keys');
        throw error;
      }
    } while (cursor !== '0');

    if (keysToDelete.length > 0) {
      // Delete in batches to avoid blocking
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        try {
          await this.redis.del(...batch);
        } catch (error) {
          logger.error({ error, batch }, 'Failed to delete batch');
        }
      }
      logger.debug({ pattern, count: keysToDelete.length }, 'Keys deleted by pattern');
    }
  }

  // Cache-aside pattern helpers
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = this.defaultTTL
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get(key);
    if (cached !== null) {
      return cached;
    }

    // Fetch from source
    const data = await fetchFn();
    
    // Store in cache (fire and forget)
    this.set(key, data, ttl).catch(error => {
      logger.error({ error, key }, 'Failed to cache after fetch');
    });

    return data;
  }

  // Warm cache with data
  async warmCache(entries: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = entries.map(entry => 
      this.set(entry.key, entry.value, entry.ttl || this.defaultTTL)
        .catch(error => {
          logger.error({ error, key: entry.key }, 'Failed to warm cache entry');
        })
    );

    await Promise.allSettled(promises);
    logger.info({ count: entries.length }, 'Cache warmed');
  }

  // Invalidate multiple keys
  async invalidateKeys(keys: string[]): Promise<void> {
    const promises = keys.map(key => 
      this.del(key).catch(error => {
        logger.error({ error, key }, 'Failed to invalidate key');
      })
    );

    await Promise.allSettled(promises);
    logger.debug({ count: keys.length }, 'Keys invalidated');
  }

  // Check if key exists
  async exists(key: string): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(key);
      const exists = await this.existsWithBreaker(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists check error');
      return false;
    }
  }

  // Get remaining TTL for a key
  async ttl(key: string): Promise<number> {
    try {
      const cacheKey = this.getCacheKey(key);
      return await this.redis.ttl(cacheKey);
    } catch (error) {
      logger.error({ error, key }, 'Failed to get TTL');
      return -1;
    }
  }
}

// Export singleton instance
let cacheInstance: CacheService | null = null;

export function initializeCache(redis: Redis): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService(redis);
  }
  return cacheInstance;
}

export { cacheInstance as cache };
