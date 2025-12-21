/**
 * Redis Service - Migrated to @tickettoken/shared
 * 
 * Maintains backwards compatibility wrapper while using shared Redis client
 */

import { getCacheManager } from '@tickettoken/shared';
import { getRedis, initRedis } from '../config/redis';
import { logger } from '../utils/logger';
import type Redis from 'ioredis';

class RedisServiceClass {
  private client: Redis | null = null;
  private log = logger.child({ component: 'RedisService' });
  private cacheManager = getCacheManager();

  async initialize(): Promise<void> {
    try {
      // Initialize Redis using config
      await initRedis();
      this.client = getRedis();
      this.log.info('Redis connection initialized via @tickettoken/shared');
    } catch (error) {
      this.log.error('Failed to initialize Redis:', error);
      throw error;
    }
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('Redis not initialized - call initialize() first');
    }
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.cacheManager.get<string>(key);
      return value;
    } catch (error: any) {
      this.log.error('Redis get failed:', { error: error.message, key });
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      await this.cacheManager.set(key, value, ttl);
    } catch (error: any) {
      this.log.error('Redis set failed:', { error: error.message, key });
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cacheManager.delete(key);
    } catch (error: any) {
      this.log.error('Redis del failed:', { error: error.message, key });
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const value = await this.cacheManager.get(key);
      return value !== null;
    } catch (error: any) {
      this.log.error('Redis exists failed:', { error: error.message, key });
      return false;
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const client = getRedis();
      return await client.incr(key);
    } catch (error: any) {
      this.log.error('Redis incr failed:', { error: error.message, key });
      throw error;
    }
  }

  async expire(key: string, ttl: number): Promise<void> {
    try {
      const client = getRedis();
      await client.expire(key, ttl);
    } catch (error: any) {
      this.log.error('Redis expire failed:', { error: error.message, key });
      throw error;
    }
  }

  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];

    try {
      const client = getRedis();
      return await client.mget(...keys);
    } catch (error: any) {
      this.log.error('Redis mget failed:', { error: error.message });
      return keys.map(() => null);
    }
  }

  async mset(pairs: { key: string; value: string }[]): Promise<void> {
    if (pairs.length === 0) return;

    try {
      const client = getRedis();
      const args: string[] = [];
      pairs.forEach(({ key, value }) => {
        args.push(key, value);
      });
      await client.mset(...args);
    } catch (error: any) {
      this.log.error('Redis mset failed:', { error: error.message });
      throw error;
    }
  }

  async close(): Promise<void> {
    // Connection managed by shared library
    this.log.info('Redis connection managed by @tickettoken/shared');
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = getRedis();
      const result = await client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}

export const RedisService = new RedisServiceClass();
