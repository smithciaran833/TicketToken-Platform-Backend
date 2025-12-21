/**
 * Cache Model - Migrated to @tickettoken/shared
 * 
 * 🚨 CRITICAL FIX: Replaced blocking redis.keys() in deletePattern with SCAN
 */

import { getCacheManager, getRedisClient } from '@tickettoken/shared';
import { CONSTANTS } from '../../config/constants';

export class CacheModel {
  private static cacheManager = getCacheManager();
  
  static async get<T>(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(key);
  }
  
  static async set(
    key: string,
    value: any,
    ttl?: number
  ): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }
  
  static async delete(key: string): Promise<void> {
    await this.cacheManager.delete(key);
  }
  
  static async deletePattern(pattern: string): Promise<number> {
    // 🚨 FIXED: Use invalidate which uses SCAN instead of blocking KEYS
    await this.cacheManager.invalidate(pattern);
    return 1; // Return success indicator
  }
  
  static async exists(key: string): Promise<boolean> {
    const value = await this.cacheManager.get(key);
    return value !== null;
  }
  
  static async expire(key: string, ttl: number): Promise<void> {
    // Get and re-set with new TTL
    const value = await this.cacheManager.get(key);
    if (value !== null) {
      await this.cacheManager.set(key, value, ttl);
    }
  }
  
  static async increment(key: string, by: number = 1): Promise<number> {
    const redis = await getRedisClient();
    return await redis.incrby(key, by);
  }
  
  static async decrement(key: string, by: number = 1): Promise<number> {
    const redis = await getRedisClient();
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
    // 🚨 FIXED: Uses SCAN-based invalidation
    await this.deletePattern(pattern);
  }
}
