/**
 * Redis Service - Migrated to @tickettoken/shared
 * 
 * Maintains backwards compatibility while using shared library
 */

import { getCacheManager } from '@tickettoken/shared';
import { getRedis, initRedis, closeRedisConnection } from '../config/redis';

class RedisServiceClass {
  private cacheManager = getCacheManager();

  async initialize(): Promise<void> {
    await initRedis();
  }

  async close(): Promise<void> {
    await closeRedisConnection();
  }

  async get(key: string): Promise<string | null> {
    return await this.cacheManager.get<string>(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const value = await this.cacheManager.get(key);
    return value !== null;
  }

  async incr(key: string): Promise<number> {
    const client = getRedis();
    return await client.incr(key);
  }

  async expire(key: string, ttl: number): Promise<void> {
    const client = getRedis();
    await client.expire(key, ttl);
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  getClient() {
    return getRedis();
  }
}

export const RedisService = new RedisServiceClass();
