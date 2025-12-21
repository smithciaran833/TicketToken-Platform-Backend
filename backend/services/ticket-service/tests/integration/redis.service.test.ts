import { RedisService } from '../../src/services/redisService';
import Redis from 'ioredis';

/**
 * INTEGRATION TESTS FOR REDIS SERVICE
 * Uses real Redis connection. No mocks.
 */

describe('RedisService Integration Tests', () => {
  let client: Redis;

  beforeAll(async () => {
    await RedisService.initialize();
    client = RedisService.getClient();
  });

  afterEach(async () => {
    // Clean up test keys
    const keys = await client.keys('test:*');
    if (keys.length > 0) {
      await client.del(...keys);
    }
  });

  afterAll(async () => {
    await RedisService.close();
  });

  describe('initialize()', () => {
    it('should initialize Redis connection', () => {
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(Redis);
    });

    it('should return same client instance (singleton)', () => {
      const client1 = RedisService.getClient();
      const client2 = RedisService.getClient();
      expect(client1).toBe(client2);
    });
  });

  describe('get/set operations', () => {
    it('should set and get a value', async () => {
      await RedisService.set('test:key1', 'value1');
      const result = await RedisService.get('test:key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent key', async () => {
      const result = await RedisService.get('test:nonexistent');
      expect(result).toBeNull();
    });

    it('should set value with TTL', async () => {
      await RedisService.set('test:ttl', 'expiring', 1);
      const immediate = await RedisService.get('test:ttl');
      expect(immediate).toBe('expiring');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      const expired = await RedisService.get('test:ttl');
      expect(expired).toBeNull();
    });

    it('should overwrite existing value', async () => {
      await RedisService.set('test:overwrite', 'original');
      await RedisService.set('test:overwrite', 'updated');
      const result = await RedisService.get('test:overwrite');
      expect(result).toBe('updated');
    });

    it('should handle empty string values', async () => {
      await RedisService.set('test:empty', '');
      const result = await RedisService.get('test:empty');
      expect(result).toBe('');
    });

    it('should handle JSON string values', async () => {
      const jsonValue = JSON.stringify({ foo: 'bar', num: 42 });
      await RedisService.set('test:json', jsonValue);
      const result = await RedisService.get('test:json');
      expect(result).toBe(jsonValue);
      expect(JSON.parse(result!)).toEqual({ foo: 'bar', num: 42 });
    });
  });

  describe('del operation', () => {
    it('should delete existing key', async () => {
      await RedisService.set('test:delete', 'toDelete');
      await RedisService.del('test:delete');
      const result = await RedisService.get('test:delete');
      expect(result).toBeNull();
    });

    it('should not throw error when deleting non-existent key', async () => {
      await expect(RedisService.del('test:nonexistent')).resolves.not.toThrow();
    });
  });

  describe('exists operation', () => {
    it('should return true for existing key', async () => {
      await RedisService.set('test:exists', 'value');
      const result = await RedisService.exists('test:exists');
      expect(result).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const result = await RedisService.exists('test:nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('incr operation', () => {
    it('should increment non-existent key to 1', async () => {
      const result = await RedisService.incr('test:counter');
      expect(result).toBe(1);
    });

    it('should increment existing counter', async () => {
      await RedisService.set('test:counter2', '5');
      const result = await RedisService.incr('test:counter2');
      expect(result).toBe(6);
    });

    it('should increment multiple times', async () => {
      await RedisService.incr('test:counter3');
      await RedisService.incr('test:counter3');
      const result = await RedisService.incr('test:counter3');
      expect(result).toBe(3);
    });
  });

  describe('expire operation', () => {
    it('should set expiration on existing key', async () => {
      await RedisService.set('test:expire', 'value');
      await RedisService.expire('test:expire', 1);

      const immediate = await RedisService.get('test:expire');
      expect(immediate).toBe('value');

      await new Promise(resolve => setTimeout(resolve, 1100));
      const expired = await RedisService.get('test:expire');
      expect(expired).toBeNull();
    });
  });

  describe('mget operation', () => {
    it('should get multiple values', async () => {
      await RedisService.set('test:multi1', 'value1');
      await RedisService.set('test:multi2', 'value2');
      await RedisService.set('test:multi3', 'value3');

      const results = await RedisService.mget(['test:multi1', 'test:multi2', 'test:multi3']);
      expect(results).toEqual(['value1', 'value2', 'value3']);
    });

    it('should return null for missing keys in mget', async () => {
      await RedisService.set('test:multi4', 'value4');
      const results = await RedisService.mget(['test:multi4', 'test:nonexistent', 'test:alsomissing']);
      expect(results).toEqual(['value4', null, null]);
    });

    it('should handle empty array', async () => {
      const results = await RedisService.mget([]);
      expect(results).toEqual([]);
    });
  });

  describe('mset operation', () => {
    it('should set multiple values', async () => {
      await RedisService.mset([
        { key: 'test:mset1', value: 'val1' },
        { key: 'test:mset2', value: 'val2' },
        { key: 'test:mset3', value: 'val3' }
      ]);

      const val1 = await RedisService.get('test:mset1');
      const val2 = await RedisService.get('test:mset2');
      const val3 = await RedisService.get('test:mset3');

      expect(val1).toBe('val1');
      expect(val2).toBe('val2');
      expect(val3).toBe('val3');
    });

    it('should handle empty array', async () => {
      await expect(RedisService.mset([])).resolves.not.toThrow();
    });

    it('should overwrite existing keys', async () => {
      await RedisService.set('test:mset4', 'original');
      await RedisService.mset([
        { key: 'test:mset4', value: 'updated' }
      ]);

      const result = await RedisService.get('test:mset4');
      expect(result).toBe('updated');
    });
  });

  describe('isHealthy()', () => {
    it('should return true when Redis is healthy', async () => {
      const healthy = await RedisService.isHealthy();
      expect(healthy).toBe(true);
    });
  });

  describe('special characters and edge cases', () => {
    it('should handle keys with colons', async () => {
      await RedisService.set('test:key:with:colons', 'value');
      const result = await RedisService.get('test:key:with:colons');
      expect(result).toBe('value');
    });

    it('should handle values with special characters', async () => {
      const specialValue = 'value with !@#$%^&*()_+-=[]{};:\'",.<>?/\\|`~';
      await RedisService.set('test:special', specialValue);
      const result = await RedisService.get('test:special');
      expect(result).toBe(specialValue);
    });

    it('should handle unicode values', async () => {
      const unicode = '你好世界 🎉 مرحبا';
      await RedisService.set('test:unicode', unicode);
      const result = await RedisService.get('test:unicode');
      expect(result).toBe(unicode);
    });

    it('should handle very long keys', async () => {
      const longKey = 'test:' + 'a'.repeat(1000);
      await RedisService.set(longKey, 'value');
      const result = await RedisService.get(longKey);
      expect(result).toBe('value');
      await RedisService.del(longKey);
    });

    it('should handle very long values', async () => {
      const longValue = 'x'.repeat(10000);
      await RedisService.set('test:longvalue', longValue);
      const result = await RedisService.get('test:longvalue');
      expect(result).toBe(longValue);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent sets', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(RedisService.set(`test:concurrent${i}`, `value${i}`));
      }
      await Promise.all(promises);

      for (let i = 0; i < 10; i++) {
        const result = await RedisService.get(`test:concurrent${i}`);
        expect(result).toBe(`value${i}`);
      }
    });

    it('should handle concurrent increments', async () => {
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(RedisService.incr('test:concurrent_counter'));
      }
      await Promise.all(promises);

      const result = await RedisService.get('test:concurrent_counter');
      expect(result).toBe('10');
    });
  });

  describe('race conditions', () => {
    it('should handle rapid set/get cycles', async () => {
      for (let i = 0; i < 20; i++) {
        await RedisService.set('test:race', `value${i}`);
        const result = await RedisService.get('test:race');
        expect(result).toBe(`value${i}`);
      }
    });

    it('should handle set/delete/set pattern', async () => {
      await RedisService.set('test:pattern', 'first');
      await RedisService.del('test:pattern');
      await RedisService.set('test:pattern', 'second');

      const result = await RedisService.get('test:pattern');
      expect(result).toBe('second');
    });
  });

  describe('TTL behavior', () => {
    it('should respect TTL ordering', async () => {
      await RedisService.set('test:ttl1', 'expires_soon', 1);
      await RedisService.set('test:ttl2', 'expires_later', 3);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const result1 = await RedisService.get('test:ttl1');
      const result2 = await RedisService.get('test:ttl2');

      expect(result1).toBeNull();
      expect(result2).toBe('expires_later');
    });
  });

  describe('data types', () => {
    it('should store numeric strings', async () => {
      await RedisService.set('test:number', '12345');
      const result = await RedisService.get('test:number');
      expect(result).toBe('12345');
      expect(typeof result).toBe('string');
    });

    it('should store boolean strings', async () => {
      await RedisService.set('test:bool', 'true');
      const result = await RedisService.get('test:bool');
      expect(result).toBe('true');
    });
  });
});
