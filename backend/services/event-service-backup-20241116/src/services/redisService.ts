import Redis from 'ioredis';
import { logger } from '../utils/logger';

class RedisServiceClass {
  private client: Redis | null = null;
  async initialize(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'tickettoken-redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    await this.client.ping();
    logger.info('Redis connection verified');
  }
  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.get(key);
  }
  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    await this.client.setex(key, ttl, value);
  }
  async del(pattern: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    if (pattern.endsWith('*')) {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } else {
      await this.client.del(pattern);
    }
  }
  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }
}
export const RedisService = new RedisServiceClass();
