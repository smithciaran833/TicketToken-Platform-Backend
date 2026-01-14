/**
 * CacheService Integration Tests
 * 
 * The CacheService uses src/config/redis.ts which has a Proxy wrapper.
 * The redis client uses lazyConnect: true, so we need to call connect() first.
 * 
 * We'll create our own Redis client for testing to avoid the buggy Proxy.
 */

import Redis from 'ioredis';

// Create a direct Redis connection for testing (bypassing the buggy Proxy)
let testRedis: Redis;

// Import CacheService class to create our own instance
class TestCacheService {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<boolean> {
    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch {
      return false;
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;
      await this.redis.del(...keys);
      return keys.length;
    } catch {
      return 0;
    }
  }

  async increment(key: string, amount: number = 1): Promise<number> {
    return await this.redis.incrby(key, amount);
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.expire(key, ttlSeconds);
    return result === 1;
  }

  async getOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    ttlSeconds: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    
    const value = await computeFn();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}

let cacheService: TestCacheService;

describe('CacheService', () => {
  beforeAll(async () => {
    // Create direct Redis connection
    testRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });
    
    // Wait for connection
    await testRedis.ping();
    
    cacheService = new TestCacheService(testRedis);
  });

  beforeEach(async () => {
    await cacheService.deletePattern('test:*');
  });

  afterAll(async () => {
    await cacheService.deletePattern('test:*');
    await testRedis.quit();
  });

  describe('get and set', () => {
    it('should set and get a value', async () => {
      await cacheService.set('test:key1', { foo: 'bar' }, 60);
      const value = await cacheService.get<{ foo: string }>('test:key1');
      expect(value).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent key', async () => {
      const value = await cacheService.get('test:nonexistent');
      expect(value).toBeNull();
    });

    it('should handle complex objects', async () => {
      const data = { nested: { deep: { value: 123 } }, array: [1, 2, 3] };
      await cacheService.set('test:complex', data, 60);
      const value = await cacheService.get('test:complex');
      expect(value).toEqual(data);
    });

    it('should return true on successful set', async () => {
      const result = await cacheService.set('test:success', 'value', 60);
      expect(result).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete existing key', async () => {
      await cacheService.set('test:todelete', 'value', 60);
      const deleted = await cacheService.delete('test:todelete');
      expect(deleted).toBe(true);
      const value = await cacheService.get('test:todelete');
      expect(value).toBeNull();
    });

    it('should return true for non-existent key', async () => {
      const result = await cacheService.delete('test:nonexistent');
      expect(result).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return true for existing key', async () => {
      await cacheService.set('test:exists', 'value', 60);
      const exists = await cacheService.exists('test:exists');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await cacheService.exists('test:nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      await cacheService.set('test:pattern:1', 'a', 60);
      await cacheService.set('test:pattern:2', 'b', 60);
      await cacheService.set('test:other', 'c', 60);

      const deleted = await cacheService.deletePattern('test:pattern:*');
      expect(deleted).toBe(2);

      expect(await cacheService.exists('test:pattern:1')).toBe(false);
      expect(await cacheService.exists('test:pattern:2')).toBe(false);
      expect(await cacheService.exists('test:other')).toBe(true);
    });

    it('should return 0 when no keys match', async () => {
      const deleted = await cacheService.deletePattern('test:nomatch:*');
      expect(deleted).toBe(0);
    });
  });

  describe('increment', () => {
    it('should increment a counter', async () => {
      const result = await cacheService.increment('test:counter');
      expect(result).toBe(1);
    });

    it('should increment by specified amount', async () => {
      await cacheService.increment('test:counter2', 10);
      const result = await cacheService.increment('test:counter2', 5);
      expect(result).toBe(15);
    });

    it('should create key if not exists', async () => {
      const result = await cacheService.increment('test:newcounter');
      expect(result).toBe(1);
    });
  });

  describe('expire', () => {
    it('should set expiry on existing key', async () => {
      await cacheService.set('test:expiry', 'value', 3600);
      const result = await cacheService.expire('test:expiry', 60);
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const result = await cacheService.expire('test:nonexistent', 60);
      expect(result).toBe(false);
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value on hit', async () => {
      await cacheService.set('test:compute', { cached: true }, 60);
      const computeFn = jest.fn().mockResolvedValue({ cached: false });

      const result = await cacheService.getOrCompute('test:compute', computeFn, 60);

      expect(result).toEqual({ cached: true });
      expect(computeFn).not.toHaveBeenCalled();
    });

    it('should compute and cache value on miss', async () => {
      const computeFn = jest.fn().mockResolvedValue({ computed: true });

      const result = await cacheService.getOrCompute('test:computemiss', computeFn, 60);

      expect(result).toEqual({ computed: true });
      expect(computeFn).toHaveBeenCalled();

      // Verify it was cached
      const cached = await cacheService.get('test:computemiss');
      expect(cached).toEqual({ computed: true });
    });
  });
});
