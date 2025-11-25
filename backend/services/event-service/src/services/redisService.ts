import Redis from 'ioredis';
import { logger } from '../utils/logger';

class RedisServiceClass {
  private client: Redis | null = null;

  async initialize(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'tickettoken-redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => Math.min(times * 50, 2000)
    });
    await this.client.ping();
    logger.info('Redis connection verified');
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    if (ttl) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    await this.client.del(key);
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }
}

export const RedisService = new RedisServiceClass();
