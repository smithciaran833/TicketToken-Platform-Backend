import Redis from 'ioredis';
import { logger } from '../utils/logger';
const log = logger.child({ component: 'RedisService' });
class RedisServiceClass {
  private client: Redis | null = null;
  async initialize(): Promise<void> {
    const redisConfig: any = {
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      db: parseInt(process.env.REDIS_DB || '0', 10),
      lazyConnect: true,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    };
    // Only add password if it exists
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
      log.info('Redis password configured');
    } else {
      log.warn('REDIS_PASSWORD not set');
    }
    
    this.client = new Redis(redisConfig);
    
    // Attach error handler BEFORE connecting
    this.client.on('error', (err) => {
      log.error('Redis client error', { error: err.message });
    });
    
    this.client.on('connect', () => {
      log.info('Redis client connecting');
    });
    
    this.client.on('ready', () => {
      log.info('Redis client ready');
    });
    
    await this.client.connect();
    await this.client.ping();
    log.info('Redis connected');
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
  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    await this.client.setex(key, ttl, value);
  }
  async del(key: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    await this.client.del(key);
  }
  async exists(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.exists(key);
  }
  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }
  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      log.info('Redis disconnected');
    }
  }
}
export const RedisService = new RedisServiceClass();
