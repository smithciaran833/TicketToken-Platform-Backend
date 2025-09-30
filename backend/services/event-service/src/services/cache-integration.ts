import Redis from 'ioredis';

class ServiceCache {
  private client: Redis;

  constructor() {
    const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
    const url = new URL(redisUrl);
    this.client = new Redis({
      host: url.hostname,
      port: parseInt(url.port || '6379'),
      password: url.password || undefined
    });
  }

  async get(key: string): Promise<any> {
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      await this.client.setex(key, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async delete(keys: string | string[]): Promise<void> {
    try {
      if (Array.isArray(keys)) {
        for (const key of keys) {
          // Handle wildcards
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
        // Handle single key with possible wildcard
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
      console.error('Cache delete error:', error);
    }
  }

  async invalidateCache(pattern: string | string[]): Promise<void> {
    // Just use delete since it handles the same logic
    await this.delete(pattern);
  }

  async flush(): Promise<void> {
    try {
      await this.client.flushdb();
    } catch (error) {
      console.error('Cache flush error:', error);
    }
  }

  getStats(): any {
    return {
      connected: this.client.status === 'ready'
    };
  }
}

export const serviceCache = new ServiceCache();
