import { getRedis } from '../../config/redis';
import { CONSTANTS } from '../../config/constants';

export class CacheModel {
  private static redis = getRedis;
  
  static async get<T>(key: string): Promise<T | null> {
    const redis = this.redis();
    const value = await redis.get(key);
    
    if (value) {
      try {
        return JSON.parse(value);
      } catch {
        return value as any;
      }
    }
    
    return null;
  }
  
  static async set(
    key: string,
    value: any,
    ttl?: number
  ): Promise<void> {
    const redis = this.redis();
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await redis.setex(key, ttl, serialized);
    } else {
      await redis.set(key, serialized);
    }
  }
  
  static async delete(key: string): Promise<void> {
    const redis = this.redis();
    await redis.del(key);
  }
  
  static async deletePattern(pattern: string): Promise<number> {
    const redis = this.redis();
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      return await redis.del(...keys);
    }
    
    return 0;
  }
  
  static async exists(key: string): Promise<boolean> {
    const redis = this.redis();
    return (await redis.exists(key)) === 1;
  }
  
  static async expire(key: string, ttl: number): Promise<void> {
    const redis = this.redis();
    await redis.expire(key, ttl);
  }
  
  static async increment(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.incrby(key, by);
  }
  
  static async decrement(key: string, by: number = 1): Promise<number> {
    const redis = this.redis();
    return await redis.decrby(key, by);
  }
  
  // Cache helpers for specific data types
  static getCacheKey(type: string, ...parts: string[]): string {
    return `analytics:${type}:${parts.join(':')}`;
  }
  
  static async cacheMetric(
    venueId: string,
    metricType: string,
    value: any,
    ttl: number = CONSTANTS.CACHE_TTL.METRICS
  ): Promise<void> {
    const key = this.getCacheKey('metric', venueId, metricType);
    await this.set(key, value, ttl);
  }
  
  static async getCachedMetric<T>(
    venueId: string,
    metricType: string
  ): Promise<T | null> {
    const key = this.getCacheKey('metric', venueId, metricType);
    return await this.get<T>(key);
  }
  
  static async cacheWidget(
    widgetId: string,
    data: any,
    ttl: number = CONSTANTS.CACHE_TTL.DASHBOARD
  ): Promise<void> {
    const key = this.getCacheKey('widget', widgetId);
    await this.set(key, data, ttl);
  }
  
  static async getCachedWidget<T>(
    widgetId: string
  ): Promise<T | null> {
    const key = this.getCacheKey('widget', widgetId);
    return await this.get<T>(key);
  }
  
  static async invalidateVenueCache(venueId: string): Promise<void> {
    const pattern = this.getCacheKey('*', venueId, '*');
    await this.deletePattern(pattern);
  }
}
