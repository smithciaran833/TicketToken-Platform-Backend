import Redis from 'ioredis';
import { logger } from '../utils/logger';

class RedisServiceClass {
  private client: Redis | null = null;

  async initialize(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.client.on('error', (err) => {
      logger.error('Redis connection error', { error: err });
    });

    this.client.on('connect', () => {
      logger.info('Redis connected');
    });

    await this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.del(key);
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
    }
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }
}

export const RedisService = new RedisServiceClass();
