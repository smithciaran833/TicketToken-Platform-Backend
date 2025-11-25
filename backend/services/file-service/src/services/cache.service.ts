import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { metricsService } from './metrics.service';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

/**
 * Cache Service for Redis-backed caching
 * Improves performance by caching frequently accessed data
 */
export class CacheService {
  private redis: Redis | null = null;
  private connected: boolean = false;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Redis connection
   */
  private async initialize() {
    try {
      const redisHost = process.env.REDIS_HOST || 'localhost';
      const redisPort = parseInt(process.env.REDIS_PORT || '6379');
      const redisPassword = process.env.REDIS_PASSWORD;

      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true
      });

      await this.redis.connect();

      this.redis.on('connect', () => {
        this.connected = true;
        logger.info('Cache service connected to Redis');
      });

      this.redis.on('error', (error) => {
        logger.error('Redis error:', error);
        this.connected = false;
      });

      this.redis.on('close', () => {
        this.connected = false;
        logger.warn('Redis connection closed');
      });

      // Update cache hit rate metrics every 30 seconds
      setInterval(() => {
        this.updateMetrics();
      }, 30000);

    } catch (error) {
      logger.error('Failed to initialize cache service:', error);
      this.connected = false;
    }
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.connected || !this.redis) {
      this.cacheMisses++;
      return null;
    }

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const value = await this.redis.get(fullKey);

      if (value === null) {
        this.cacheMisses++;
        logger.debug(`Cache miss: ${fullKey}`);
        return null;
      }

      this.cacheHits++;
      logger.debug(`Cache hit: ${fullKey}`);
      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      this.cacheMisses++;
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const serialized = JSON.stringify(value);
      const ttl = options?.ttl || 3600; // Default 1 hour

      await this.redis.setex(fullKey, ttl, serialized);
      logger.debug(`Cache set: ${fullKey} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      await this.redis.del(fullKey);
      logger.debug(`Cache delete: ${fullKey}`);
      return true;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete all keys matching pattern
   */
  async deletePattern(pattern: string, options?: CacheOptions): Promise<number> {
    if (!this.connected || !this.redis) {
      return 0;
    }

    try {
      const fullPattern = this.buildKey(pattern, options?.prefix);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }

      await this.redis.del(...keys);
      logger.info(`Cache pattern delete: ${fullPattern} (${keys.length} keys)`);
      return keys.length;
    } catch (error) {
      logger.error(`Cache pattern delete error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get or set pattern: retrieve from cache or compute and store
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, compute value
    const value = await factory();
    
    // Store in cache
    await this.set(key, value, options);
    
    return value;
  }

  /**
   * Increment a counter in cache
   */
  async increment(key: string, options?: CacheOptions): Promise<number> {
    if (!this.connected || !this.redis) {
      return 0;
    }

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const value = await this.redis.incr(fullKey);

      // Set expiry if specified
      if (options?.ttl) {
        await this.redis.expire(fullKey, options.ttl);
      }

      return value;
    } catch (error) {
      logger.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Set multiple values at once
   */
  async mset(entries: Array<{ key: string; value: any }>, options?: CacheOptions): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      const pipeline = this.redis.pipeline();
      const ttl = options?.ttl || 3600;

      for (const entry of entries) {
        const fullKey = this.buildKey(entry.key, options?.prefix);
        const serialized = JSON.stringify(entry.value);
        pipeline.setex(fullKey, ttl, serialized);
      }

      await pipeline.exec();
      logger.debug(`Cache mset: ${entries.length} keys`);
      return true;
    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Get multiple values at once
   */
  async mget<T>(keys: string[], options?: CacheOptions): Promise<Array<T | null>> {
    if (!this.connected || !this.redis) {
      return keys.map(() => null);
    }

    try {
      const fullKeys = keys.map(key => this.buildKey(key, options?.prefix));
      const values = await this.redis.mget(...fullKeys);

      return values.map(value => {
        if (value === null) {
          this.cacheMisses++;
          return null;
        }
        this.cacheHits++;
        return JSON.parse(value) as T;
      });
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Clear entire cache (use with caution!)
   */
  async clear(prefix?: string): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      if (prefix) {
        const pattern = `${prefix}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        logger.warn(`Cache cleared for prefix: ${prefix} (${keys.length} keys)`);
      } else {
        await this.redis.flushdb();
        logger.warn('Cache completely cleared (flushdb)');
      }
      return true;
    } catch (error) {
      logger.error('Cache clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? (this.cacheHits / total) * 100 : 0;

    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      total,
      hitRate: Math.round(hitRate * 100) / 100,
      connected: this.connected
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Update metrics service with cache statistics
   */
  private updateMetrics() {
    const stats = this.getStats();
    metricsService.cacheHitRate.set(stats.hitRate);
  }

  /**
   * Build full cache key with prefix
   */
  private buildKey(key: string, prefix?: string): string {
    const servicePrefix = 'file-service';
    const parts = [servicePrefix];
    
    if (prefix) {
      parts.push(prefix);
    }
    
    parts.push(key);
    
    return parts.join(':');
  }

  /**
   * Check if cache service is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (!this.connected || !this.redis) {
      return false;
    }

    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close() {
    if (this.redis) {
      await this.redis.quit();
      this.connected = false;
      logger.info('Cache service disconnected');
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Common cache TTLs (in seconds)
export const CacheTTL = {
  SHORT: 300,        // 5 minutes
  MEDIUM: 1800,      // 30 minutes
  LONG: 3600,        // 1 hour
  VERY_LONG: 86400,  // 24 hours
  WEEK: 604800       // 7 days
};

// Common cache prefixes
export const CachePrefix = {
  FILE: 'file',
  FILE_METADATA: 'file:metadata',
  FILE_CONTENT: 'file:content',
  USER: 'user',
  SCAN_RESULT: 'scan',
  THUMBNAIL: 'thumbnail',
  STATS: 'stats'
};
