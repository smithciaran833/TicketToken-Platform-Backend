import Redis from 'ioredis';
import CircuitBreaker from 'opossum';
import { logger } from '../utils/logger';

/**
 * CRITICAL FIX: Added tenant isolation to prevent cross-tenant data leakage
 * All cache operations now require tenantId parameter
 * Keys are prefixed with tenant:${tenantId}: for complete isolation
 * 
 * SECURITY FIXES:
 * - Issue #1: Added tenant prefixing to all Redis keys
 * - Issue #2: Removed dangerous global flush() method
 * - Issue #3: Replaced blocking KEYS with SCAN for pattern matching
 * 
 * HIGH PRIORITY RESILIENCE FIXES:
 * - Issue #14: Added timeout (1s) on all Redis operations
 * - Issue #15: Added circuit breaker for Redis failures
 */

class ServiceCache {
  private client: Redis;
  private circuitBreaker: CircuitBreaker;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      // HIGH PRIORITY FIX: Add connection timeout
      connectTimeout: 5000,
      // HIGH PRIORITY FIX: Add command timeout
      commandTimeout: 1000, // 1s timeout for all commands
    });

    // HIGH PRIORITY FIX: Circuit breaker for Redis operations
    this.circuitBreaker = new CircuitBreaker(async (fn: () => Promise<any>) => fn(), {
      timeout: 1000, // 1s timeout
      errorThresholdPercentage: 50,
      resetTimeout: 30000, // 30s before attempting again
      volumeThreshold: 5,
      name: 'redis-cache',
    });

    // Log circuit breaker events
    this.circuitBreaker.on('open', () => {
      logger.error('Redis circuit breaker opened - cache operations will fail fast');
    });

    this.circuitBreaker.on('halfOpen', () => {
      logger.info('Redis circuit breaker half-open - testing connection');
    });

    this.circuitBreaker.on('close', () => {
      logger.info('Redis circuit breaker closed - cache operational');
    });

    this.circuitBreaker.on('timeout', () => {
      logger.warn('Redis operation timed out after 1s');
    });

    // Log Redis connection events
    this.client.on('error', (err) => {
      logger.error({ error: err.message }, 'Redis connection error');
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis ready');
    });
  }

  /**
   * Generate tenant-scoped cache key
   * @param tenantId - Tenant identifier for isolation
   * @param key - The cache key
   * @returns Scoped key in format: tenant:${tenantId}:${key}
   */
  private getScopedKey(tenantId: string, key: string): string {
    return `tenant:${tenantId}:${key}`;
  }

  /**
   * Get value from cache with tenant isolation
   * HIGH PRIORITY FIX: Uses circuit breaker with timeout
   * @param tenantId - Tenant identifier
   * @param key - Cache key
   */
  async get(tenantId: string, key: string): Promise<any> {
    try {
      const scopedKey = this.getScopedKey(tenantId, key);
      
      // Use circuit breaker with timeout
      const value = await this.circuitBreaker.fire(() => 
        this.client.get(scopedKey)
      );
      
      return value ? JSON.parse(value as string) : null;
    } catch (error: any) {
      // Circuit breaker or timeout - gracefully return null
      if (error.message?.includes('circuit') || error.message?.includes('timeout')) {
        logger.warn({ tenantId, key, error: error.message }, 'Cache get degraded - circuit breaker or timeout');
      } else {
        logger.error({ error, tenantId, key }, 'Cache get error');
      }
      return null;
    }
  }

  /**
   * Set value in cache with tenant isolation
   * HIGH PRIORITY FIX: Uses circuit breaker with timeout
   * @param tenantId - Tenant identifier
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (default: 3600)
   */
  async set(tenantId: string, key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      const scopedKey = this.getScopedKey(tenantId, key);
      
      // Use circuit breaker with timeout
      await this.circuitBreaker.fire(() => 
        this.client.setex(scopedKey, ttl, JSON.stringify(value))
      );
    } catch (error: any) {
      // Fail silently for cache writes
      if (error.message?.includes('circuit') || error.message?.includes('timeout')) {
        logger.warn({ tenantId, key, error: error.message }, 'Cache set degraded - circuit breaker or timeout');
      } else {
        logger.error({ error, tenantId, key, ttl }, 'Cache set error');
      }
    }
  }

  /**
   * Delete keys from cache with tenant isolation
   * Uses SCAN instead of KEYS for pattern matching (non-blocking)
   * HIGH PRIORITY FIX: Uses circuit breaker with timeout
   * @param tenantId - Tenant identifier
   * @param keys - Single key or array of keys (supports wildcards)
   */
  async delete(tenantId: string, keys: string | string[]): Promise<void> {
    try {
      const keysArray = Array.isArray(keys) ? keys : [keys];
      
      for (const key of keysArray) {
        const scopedKey = this.getScopedKey(tenantId, key);
        
        if (scopedKey.includes('*')) {
          // Use SCAN instead of KEYS for non-blocking operation
          await this.scanAndDelete(scopedKey);
        } else {
          // Use circuit breaker for simple deletes
          await this.circuitBreaker.fire(() => 
            this.client.del(scopedKey)
          );
        }
      }
    } catch (error: any) {
      // Fail silently for cache deletes
      if (error.message?.includes('circuit') || error.message?.includes('timeout')) {
        logger.warn({ tenantId, keys, error: error.message }, 'Cache delete degraded - circuit breaker or timeout');
      } else {
        logger.error({ error, tenantId, keys }, 'Cache delete error');
      }
    }
  }

  /**
   * Scan and delete keys matching pattern (non-blocking alternative to KEYS)
   * HIGH PRIORITY FIX: Uses circuit breaker with timeout
   * @param pattern - Pattern to match (already scoped to tenant)
   */
  private async scanAndDelete(pattern: string): Promise<void> {
    let cursor = '0';
    let iterationCount = 0;
    const maxIterations = 100; // Prevent infinite loops
    
    do {
      if (iterationCount++ >= maxIterations) {
        logger.warn({ pattern, iterationCount }, 'SCAN operation exceeded max iterations');
        break;
      }
      
      // Use circuit breaker for SCAN operations
      const result = await this.circuitBreaker.fire(() => 
        this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
      ) as [string, string[]];
      
      const [newCursor, matchedKeys] = result;
      
      if (matchedKeys.length > 0) {
        // Use circuit breaker for DELETE operations
        await this.circuitBreaker.fire(() => 
          this.client.del(...matchedKeys)
        );
        logger.debug({ pattern, count: matchedKeys.length }, 'Deleted keys matching pattern');
      }
      
      cursor = newCursor;
    } while (cursor !== '0');
  }

  /**
   * Invalidate cache by pattern with tenant isolation
   * @param tenantId - Tenant identifier
   * @param pattern - Pattern to match (supports wildcards)
   */
  async invalidateCache(tenantId: string, pattern: string | string[]): Promise<void> {
    await this.delete(tenantId, pattern);
  }

  /**
   * Flush all cache entries for a specific tenant
   * SECURITY: Only flushes the specified tenant's data
   * @param tenantId - Tenant identifier
   */
  async flushTenant(tenantId: string): Promise<void> {
    try {
      const pattern = `tenant:${tenantId}:*`;
      await this.scanAndDelete(pattern);
      logger.info({ tenantId }, 'Tenant cache flushed');
    } catch (error) {
      logger.error({ error, tenantId }, 'Cache flush error');
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): any {
    return {
      connected: this.client.status === 'ready'
    };
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.client.quit();
  }
}

export const serviceCache = new ServiceCache();
