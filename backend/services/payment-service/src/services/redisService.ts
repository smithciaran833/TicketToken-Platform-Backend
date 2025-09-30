import Redis from 'ioredis';

class RedisServiceClass {
  private client: Redis | null = null;

  async initialize(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });
    await this.client.ping();
    console.log('Redis connected');
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

  async del(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.del(key);
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }
}

export const RedisService = new RedisServiceClass();
