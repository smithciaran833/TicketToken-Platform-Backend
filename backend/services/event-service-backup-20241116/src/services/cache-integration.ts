import Redis from 'ioredis';
import { logger } from '../utils/logger';

class ServiceCache {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });
  }

  async get(key: string): Promise<any> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error({ error, key }, 'Cache get error');
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error({ error, key, ttl }, 'Cache set error');
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    try {
      if (Array.isArray(keys)) {
        for (const key of keys) {
          if (key.includes('*')) {
            const matchedKeys = await this.client.keys(key);
            if (matchedKeys.length > 0) {
              await this.client.del(...matchedKeys);
            }
          } else {
            await this.client.del(key);
          }
        }
      } else {
        if (keys.includes('*')) {
          const matchedKeys = await this.client.keys(keys);
          if (matchedKeys.length > 0) {
            await this.client.del(...matchedKeys);
          }
        } else {
          await this.client.del(keys);
        }
      }
    } catch (error) {
      logger.error({ error, keys }, 'Cache delete error');
    }
  }

  async invalidateCache(pattern: string | string[]): Promise<void> {
    await this.delete(pattern);
  }

  async flush(): Promise<void> {
    try {
      await this.client.flushdb();
    } catch (error) {
      logger.error({ error }, 'Cache flush error');
    }
  }

  getStats(): any {
    return {
      connected: this.client.status === 'ready'
    };
  }
}

export const serviceCache = new ServiceCache();
