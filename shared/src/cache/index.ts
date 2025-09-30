import { createClient, RedisClientType } from 'redis';

export class CacheService {
  private client: RedisClientType | null = null;
  private connected: boolean = false;

  async connect(url?: string): Promise<void> {
    if (this.connected) return;
    
    this.client = createClient({
      url: url || process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.client.on('error', (err) => console.error('Redis Client Error', err));
    await this.client.connect();
    this.connected = true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) return;
    if (ttl) {
      await this.client.setEx(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.client) return;
    await this.client.del(key);
  }

  async flush(): Promise<void> {
    if (!this.client) return;
    await this.client.flushAll();
  }
}

export default new CacheService();
