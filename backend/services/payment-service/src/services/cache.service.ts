/**
 * Cache Service - Migrated to @tickettoken/shared
 */

import { getCacheManager } from '@tickettoken/shared';

export class CacheService {
  private cacheManager = getCacheManager();

  async get<T>(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(key);
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async delete(key: string): Promise<void> {
    await this.cacheManager.delete(key);
  }

  async invalidate(pattern: string): Promise<void> {
    await this.cacheManager.invalidate(pattern);
  }

  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Compute the value
    const value = await computeFn();

    // Cache it
    await this.set(key, value, ttl);

    return value;
  }
}

export const cacheService = new CacheService();
