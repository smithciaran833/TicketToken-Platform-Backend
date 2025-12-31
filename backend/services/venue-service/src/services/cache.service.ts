import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { withCircuitBreaker } from '../utils/circuitBreaker';
import { withRetry } from '../utils/retry';
import { CacheError } from '../utils/errors';

export class CacheService {
  private redis: Redis;
  private defaultTTL: number = 3600; // 1 hour default
  private keyPrefix: string = 'venue:';
  
  // SECURITY FIX (SR1): Current tenant context for cache key prefixing
  private currentTenantId: string | null = null;

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

  // SECURITY FIX (SR1): Set current tenant context for cache operations
  setTenantContext(tenantId: string | null): void {
    this.currentTenantId = tenantId;
  }

  // SECURITY FIX (SR1): Generate cache key with tenant prefix for isolation
  private getCacheKey(key: string, tenantId?: string): string {
    const tenant = tenantId || this.currentTenantId;
    if (tenant) {
      // Include tenant ID in key to prevent cross-tenant cache pollution
      return `${this.keyPrefix}tenant:${tenant}:${key}`;
    }
    // Fallback for system/global cache (should be rare)
    return `${this.keyPrefix}global:${key}`;
  }

  // Get cache key for a specific tenant (for invalidation)
  private getTenantCacheKey(tenantId: string, key: string): string {
    return `${this.keyPrefix}tenant:${tenantId}:${key}`;
  }

  // SECURITY FIX (SR1): Get from cache with tenant isolation
  async get(key: string, tenantId?: string): Promise<any | null> {
    try {
      const cacheKey = this.getCacheKey(key, tenantId);
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

  // SECURITY FIX (SR1): Set in cache with tenant isolation
  async set(key: string, value: any, ttl: number = this.defaultTTL, tenantId?: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key, tenantId);
      const data = JSON.stringify(value);
      await this.setWithBreaker(cacheKey, data, ttl);
      logger.debug({ key: cacheKey, ttl }, 'Cache set');
    } catch (error) {
      logger.error({ error, key }, 'Cache set error');
      throw new CacheError('set', error);
    }
  }

  // SECURITY FIX (SR1/SR4): Delete from cache with tenant isolation
  async del(key: string, tenantId?: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(key, tenantId);
      await this.delWithBreaker(cacheKey);
      logger.debug({ key: cacheKey }, 'Cache deleted');
    } catch (error) {
      logger.error({ error, key }, 'Cache delete error');
      throw new CacheError('delete', error);
    }
  }

  // SECURITY FIX (SR4): Clear venue cache with tenant scoping
  async clearVenueCache(venueId: string, tenantId?: string): Promise<void> {
    try {
      const tenant = tenantId || this.currentTenantId;
      
      if (!tenant) {
        logger.warn({ venueId }, 'clearVenueCache called without tenant context - clearing global pattern');
      }
      
      const patterns = tenant
        ? [
            // Tenant-scoped patterns
            `${this.keyPrefix}tenant:${tenant}:${venueId}`,
            `${this.keyPrefix}tenant:${tenant}:${venueId}:*`,
            `${this.keyPrefix}tenant:${tenant}:venues:*${venueId}*`,
          ]
        : [
            // Legacy patterns (for backward compatibility during migration)
            `${this.keyPrefix}${venueId}`,
            `${this.keyPrefix}${venueId}:*`,
          ];

      for (const pattern of patterns) {
        await this.clearByPattern(pattern);
      }

      logger.info({ venueId, tenantId: tenant }, 'Venue cache cleared');
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

  // Check if key exists with tenant isolation
  async exists(key: string, tenantId?: string): Promise<boolean> {
    try {
      const cacheKey = this.getCacheKey(key, tenantId);
      const exists = await this.existsWithBreaker(cacheKey);
      return exists === 1;
    } catch (error) {
      logger.error({ error, key }, 'Cache exists check error');
      return false;
    }
  }

  // Get remaining TTL for a key with tenant isolation
  async ttl(key: string, tenantId?: string): Promise<number> {
    try {
      const cacheKey = this.getCacheKey(key, tenantId);
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
