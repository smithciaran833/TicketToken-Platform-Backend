import Redis from 'ioredis';
import { logger } from '../utils/logger';

export interface CacheStrategy {
  ttl: number; // Time to live in seconds
  keyPrefix: string;
  version: number; // For cache invalidation
}

// Define caching strategies for different data types
export const cacheStrategies: Record<string, CacheStrategy> = {
  // Real-time metrics - very short TTL
  realTimeMetrics: {
    ttl: 5, // 5 seconds
    keyPrefix: 'rtm',
    version: 1
  },
  
  // Aggregated metrics - medium TTL
  aggregatedMetrics: {
    ttl: 300, // 5 minutes
    keyPrefix: 'agg',
    version: 1
  },
  
  // Customer profiles - longer TTL
  customerProfile: {
    ttl: 3600, // 1 hour
    keyPrefix: 'cust',
    version: 1
  },
  
  // Dashboard configs - long TTL
  dashboardConfig: {
    ttl: 86400, // 24 hours
    keyPrefix: 'dash',
    version: 1
  },
  
  // Widget data - varies by widget
  widgetData: {
    ttl: 60, // 1 minute default
    keyPrefix: 'widget',
    version: 1
  },
  
  // Session data - medium TTL
  sessionData: {
    ttl: 1800, // 30 minutes
    keyPrefix: 'sess',
    version: 1
  }
};

export class CacheManager {
  private redis: Redis;
  private prefix: string;
  
  constructor(redis: Redis, prefix: string = 'analytics') {
    this.redis = redis;
    this.prefix = prefix;
  }
  
  // Generate cache key with versioning
  private generateKey(strategy: CacheStrategy, identifier: string): string {
    return `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${identifier}`;
  }
  
  // Set cache with strategy
  async set(
    strategyName: string,
    identifier: string,
    data: any,
    customTTL?: number
  ): Promise<void> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      logger.warn(`Unknown cache strategy: ${strategyName}`);
      return;
    }
    
    const key = this.generateKey(strategy, identifier);
    const ttl = customTTL || strategy.ttl;
    
    try {
      await this.redis.setex(
        key,
        ttl,
        JSON.stringify(data)
      );
      
      logger.debug(`Cached ${strategyName} for ${identifier} with TTL ${ttl}s`);
    } catch (error) {
      logger.error(`Cache set error for ${strategyName}:`, error);
    }
  }
  
  // Get from cache
  async get(strategyName: string, identifier: string): Promise<any | null> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return null;
    }
    
    const key = this.generateKey(strategy, identifier);
    
    try {
      const data = await this.redis.get(key);
      if (data) {
        logger.debug(`Cache hit for ${strategyName}: ${identifier}`);
        return JSON.parse(data);
      }
      logger.debug(`Cache miss for ${strategyName}: ${identifier}`);
      return null;
    } catch (error) {
      logger.error(`Cache get error for ${strategyName}:`, error);
      return null;
    }
  }
  
  // Invalidate cache by pattern
  async invalidate(strategyName: string, pattern?: string): Promise<void> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return;
    }
    
    const keyPattern = pattern
      ? `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:${pattern}*`
      : `${this.prefix}:${strategy.keyPrefix}:v${strategy.version}:*`;
    
    try {
      const keys = await this.redis.keys(keyPattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info(`Invalidated ${keys.length} cache entries for ${strategyName}`);
      }
    } catch (error) {
      logger.error(`Cache invalidation error for ${strategyName}:`, error);
    }
  }
  
  // Implement cache-aside pattern
  async getOrSet<T>(
    strategyName: string,
    identifier: string,
    fetchFunction: () => Promise<T>,
    customTTL?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get(strategyName, identifier);
    if (cached !== null) {
      return cached;
    }
    
    // Fetch fresh data
    const data = await fetchFunction();
    
    // Cache the result
    await this.set(strategyName, identifier, data, customTTL);
    
    return data;
  }
  
  // Batch get with multi-get optimization
  async mget(strategyName: string, identifiers: string[]): Promise<Map<string, any>> {
    const strategy = cacheStrategies[strategyName];
    if (!strategy) {
      return new Map();
    }
    
    const keys = identifiers.map(id => this.generateKey(strategy, id));
    const results = new Map<string, any>();
    
    try {
      const values = await this.redis.mget(...keys);
      
      identifiers.forEach((id, index) => {
        const value = values[index];
        if (value) {
          try {
            results.set(id, JSON.parse(value));
          } catch (e) {
            logger.error(`Failed to parse cached value for ${id}:`, e);
          }
        }
      });
      
      logger.debug(`Cache multi-get: ${results.size}/${identifiers.length} hits`);
    } catch (error) {
      logger.error(`Cache mget error for ${strategyName}:`, error);
    }
    
    return results;
  }
  
  // Get cache statistics
  async getStats(): Promise<Record<string, any>> {
    const info = await this.redis.info('stats');
    const dbSize = await this.redis.dbsize();
    
    return {
      dbSize,
      info: info.split('\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          acc[key.trim()] = value.trim();
        }
        return acc;
      }, {} as Record<string, string>)
    };
  }
}

export default CacheManager;
