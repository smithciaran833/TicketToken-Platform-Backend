import Redis from 'ioredis';
import { LRUCache } from 'lru-cache';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { CacheConfig, defaultConfig } from './cache-config';
import { CacheMetrics } from './cache-metrics';
import { createLogger } from './logger';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export type CacheLevel = 'L1' | 'L2' | 'BOTH';
export type CacheStrategy = 'cache-aside' | 'write-through' | 'write-behind';

export interface CacheOptions {
  ttl?: number;
  level?: CacheLevel;
  compress?: boolean;
  tags?: string[];
}

export class CacheService {
  private redis: Redis;
  private local: LRUCache<string, any>;
  private config: CacheConfig;
  private metrics: CacheMetrics;
  private logger = createLogger('cache-service');
  private locks: Map<string, Promise<any>> = new Map();

  constructor(config?: Partial<CacheConfig>) {
    this.config = { ...defaultConfig, ...config };
    
    // Initialize Redis
    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db,
      keyPrefix: this.config.redis.keyPrefix,
      maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
      enableReadyCheck: this.config.redis.enableReadyCheck,
      retryStrategy: this.config.redis.retryStrategy,
      lazyConnect: false
    });

    // Initialize LRU Cache
    this.local = new LRUCache({
      max: this.config.local.max,
      ttl: this.config.local.ttl,
      updateAgeOnGet: this.config.local.updateAgeOnGet,
      updateAgeOnHas: this.config.local.updateAgeOnHas
    });

    // Initialize metrics
    this.metrics = new CacheMetrics();

    // Redis event handlers
    this.redis.on('connect', () => {
      this.logger.info('Redis connected');
    });

    this.redis.on('error', (err) => {
      this.logger.error({ err }, 'Redis error');
    });

    this.redis.on('ready', () => {
      this.logger.info('Redis ready');
    });
  }

  /**
   * Get value from cache with cache-aside pattern
   */
  async get<T>(
    key: string,
    fetcher?: (() => Promise<T>) | undefined,
    options: CacheOptions = {}
  ): Promise<T | null> {
    const startTime = Date.now();
    const level = options.level || 'BOTH';

    try {
      // Check L1 cache
      if (level === 'L1' || level === 'BOTH') {
        const localValue = this.local.get(key);
        if (localValue !== undefined) {
          this.metrics.recordHit('L1');
          this.logger.debug({ key, level: 'L1', time: Date.now() - startTime }, 'Cache hit');
          return localValue;
        }
      }

      // Check L2 cache
      if (level === 'L2' || level === 'BOTH') {
        const redisValue = await this.redis.get(key);
        if (redisValue) {
          this.metrics.recordHit('L2');
          const value = await this.deserialize(redisValue, options.compress);
          
          // Populate L1 if using BOTH
          if (level === 'BOTH') {
            this.local.set(key, value, { ttl: options.ttl ? options.ttl * 1000 : undefined });
          }
          
          this.logger.debug({ key, level: 'L2', time: Date.now() - startTime }, 'Cache hit');
          return value;
        }
      }

      // Cache miss
      this.metrics.recordMiss();
      
      if (!fetcher) {
        return null;
      }

      // Prevent cache stampede with locking
      const lockKey = `lock:${key}`;
      let lockPromise = this.locks.get(lockKey);
      
      if (lockPromise) {
        this.logger.debug({ key }, 'Waiting for lock');
        return await lockPromise;
      }

      lockPromise = this.fetchAndCache(key, fetcher, options);
      this.locks.set(lockKey, lockPromise);
      
      try {
        const value = await lockPromise;
        return value;
      } finally {
        this.locks.delete(lockKey);
      }

    } catch (error) {
      this.logger.error({ error, key }, 'Cache get error');
      if (fetcher) {
        return await fetcher();
      }
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const level = options.level || 'BOTH';
    const ttl = options.ttl || this.getTTLForKey(key);

    try {
      // Set in L1
      if (level === 'L1' || level === 'BOTH') {
        this.local.set(key, value, { ttl: ttl * 1000 });
      }

      // Set in L2
      if (level === 'L2' || level === 'BOTH') {
        const serialized = await this.serialize(value, options.compress);
        await this.redis.setex(key, ttl, serialized);
        
        // Handle tags for invalidation
        if (options.tags && options.tags.length > 0) {
          await this.addToTags(key, options.tags);
        }
      }

      this.logger.debug({ key, ttl, level }, 'Cache set');
    } catch (error) {
      this.logger.error({ error, key }, 'Cache set error');
      throw error;
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string | string[], level: CacheLevel = 'BOTH'): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    
    try {
      if (level === 'L1' || level === 'BOTH') {
        keys.forEach(k => this.local.delete(k));
      }

      if (level === 'L2' || level === 'BOTH') {
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }

      this.logger.debug({ keys, level }, 'Cache delete');
    } catch (error) {
      this.logger.error({ error, keys }, 'Cache delete error');
    }
  }

  /**
   * Delete all keys with matching tags
   */
  async deleteByTags(tags: string[]): Promise<void> {
    try {
      const keys = new Set<string>();
      
      for (const tag of tags) {
        const taggedKeys = await this.redis.smembers(`tag:${tag}`);
        taggedKeys.forEach(k => keys.add(k));
      }

      if (keys.size > 0) {
        await this.delete(Array.from(keys));
        
        // Clean up tag sets
        for (const tag of tags) {
          await this.redis.del(`tag:${tag}`);
        }
      }

      this.logger.info({ tags, count: keys.size }, 'Deleted keys by tags');
    } catch (error) {
      this.logger.error({ error, tags }, 'Delete by tags error');
    }
  }

  /**
   * Flush all cache
   */
  async flush(level: CacheLevel = 'BOTH'): Promise<void> {
    try {
      if (level === 'L1' || level === 'BOTH') {
        this.local.clear();
      }

      if (level === 'L2' || level === 'BOTH') {
        await this.redis.flushdb();
      }

      this.logger.info({ level }, 'Cache flushed');
    } catch (error) {
      this.logger.error({ error }, 'Cache flush error');
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      local: {
        size: this.local.size,
        max: this.local.max,
        calculatedSize: this.local.calculatedSize
      },
      metrics: this.metrics.getStats(),
      locks: this.locks.size
    };
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.redis.quit();
    this.local.clear();
  }

  // Private methods
  private async fetchAndCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions
  ): Promise<T> {
    const value = await fetcher();
    
    if (value !== null && value !== undefined) {
      await this.set(key, value, options);
    }
    
    return value;
  }

  private async serialize(value: any, compress?: boolean): Promise<string> {
    const json = JSON.stringify(value);
    
    if (compress || (this.config.compression.enabled && 
        Buffer.byteLength(json) > this.config.compression.threshold)) {
      const compressed = await gzipAsync(json);
      return compressed.toString('base64');
    }
    
    return json;
  }

  private async deserialize(value: string, compressed?: boolean): Promise<any> {
    try {
      if (compressed || (this.config.compression.enabled && this.isBase64(value))) {
        const buffer = Buffer.from(value, 'base64');
        const decompressed = await gunzipAsync(buffer);
        return JSON.parse(decompressed.toString());
      }
      
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private isBase64(str: string): boolean {
    try {
      return Buffer.from(str, 'base64').toString('base64') === str;
    } catch {
      return false;
    }
  }

  private getTTLForKey(key: string): number {
    const [service, entity] = key.split(':');
    
    switch (entity) {
      case 'session': return this.config.ttls.session;
      case 'user': return this.config.ttls.user;
      case 'event': return this.config.ttls.event;
      case 'venue': return this.config.ttls.venue;
      case 'ticket': return this.config.ttls.ticket;
      case 'template': return this.config.ttls.template;
      case 'search': return this.config.ttls.search;
      default: return 300; // 5 minutes default
    }
  }

  private async addToTags(key: string, tags: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const tag of tags) {
      pipeline.sadd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, 86400); // 24 hour expiry on tag sets
    }
    
    await pipeline.exec();
  }
}
