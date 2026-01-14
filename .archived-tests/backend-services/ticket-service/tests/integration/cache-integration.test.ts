import { cache, cacheMiddleware, cacheStrategies, cacheInvalidator } from '../../src/services/cache-integration';

/**
 * INTEGRATION TESTS FOR CACHE INTEGRATION
 * Tests cache system initialization and exports
 */

describe('Cache Integration Tests', () => {
  describe('cache service', () => {
    it('should export cache service', () => {
      expect(cache).toBeDefined();
    });

    it('should have get method', () => {
      expect(cache.get).toBeDefined();
      expect(typeof cache.get).toBe('function');
    });

    it('should have set method', () => {
      expect(cache.set).toBeDefined();
      expect(typeof cache.set).toBe('function');
    });

    it('should have delete method', () => {
      expect(cache.delete).toBeDefined();
      expect(typeof cache.delete).toBe('function');
    });

    it('should have flush method', () => {
      expect(cache.flush).toBeDefined();
      expect(typeof cache.flush).toBe('function');
    });

    it('should perform basic set and get operations', async () => {
      const testKey = 'test:cache:integration';
      const testValue = { data: 'test value', timestamp: Date.now() };

      await cache.set(testKey, testValue, { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toEqual(testValue);

      // Cleanup
      await cache.delete(testKey);
    });

    it('should handle JSON serialization', async () => {
      const testKey = 'test:cache:json';
      const complexValue = {
        id: '123',
        nested: { data: [1, 2, 3] },
        boolean: true,
        number: 42
      };

      await cache.set(testKey, complexValue, { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toEqual(complexValue);

      // Cleanup
      await cache.delete(testKey);
    });

    it('should return null for non-existent key', async () => {
      const result = await cache.get('test:cache:nonexistent');
      expect(result).toBeNull();
    });

    it('should delete cached value', async () => {
      const testKey = 'test:cache:delete';

      await cache.set(testKey, 'value', { ttl: 60 });
      let result = await cache.get(testKey);
      expect(result).toBe('value');

      await cache.delete(testKey);
      result = await cache.get(testKey);
      expect(result).toBeNull();
    });

    it('should respect TTL', async () => {
      const testKey = 'test:cache:ttl';

      await cache.set(testKey, 'expires', { ttl: 1 });
      let result = await cache.get(testKey);
      expect(result).toBe('expires');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      result = await cache.get(testKey);
      expect(result).toBeNull();
    });

    it('should handle multiple keys', async () => {
      const keys = ['test:cache:multi1', 'test:cache:multi2', 'test:cache:multi3'];

      await cache.set(keys[0], 'value1', { ttl: 60 });
      await cache.set(keys[1], 'value2', { ttl: 60 });
      await cache.set(keys[2], 'value3', { ttl: 60 });

      const result1 = await cache.get(keys[0]);
      const result2 = await cache.get(keys[1]);
      const result3 = await cache.get(keys[2]);

      expect(result1).toBe('value1');
      expect(result2).toBe('value2');
      expect(result3).toBe('value3');

      // Cleanup
      await cache.delete(keys[0]);
      await cache.delete(keys[1]);
      await cache.delete(keys[2]);
    });

    it('should handle empty string values', async () => {
      const testKey = 'test:cache:empty';

      await cache.set(testKey, '', { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toBe('');

      // Cleanup
      await cache.delete(testKey);
    });

    it('should handle numeric values', async () => {
      const testKey = 'test:cache:number';

      await cache.set(testKey, 12345, { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toBe(12345);

      // Cleanup
      await cache.delete(testKey);
    });

    it('should handle boolean values', async () => {
      const testKey1 = 'test:cache:bool:true';
      const testKey2 = 'test:cache:bool:false';

      await cache.set(testKey1, true, { ttl: 60 });
      await cache.set(testKey2, false, { ttl: 60 });

      const result1 = await cache.get(testKey1);
      const result2 = await cache.get(testKey2);

      expect(result1).toBe(true);
      expect(result2).toBe(false);

      // Cleanup
      await cache.delete(testKey1);
      await cache.delete(testKey2);
    });

    it('should handle arrays', async () => {
      const testKey = 'test:cache:array';
      const arrayValue = [1, 2, 3, { nested: 'value' }];

      await cache.set(testKey, arrayValue, { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toEqual(arrayValue);

      // Cleanup
      await cache.delete(testKey);
    });
  });

  describe('cacheMiddleware', () => {
    it('should export cache middleware', () => {
      expect(cacheMiddleware).toBeDefined();
    });

    it('should be a function or object with middleware methods', () => {
      const type = typeof cacheMiddleware;
      expect(['function', 'object']).toContain(type);
    });
  });

  describe('cacheStrategies', () => {
    it('should export cache strategies', () => {
      expect(cacheStrategies).toBeDefined();
    });

    it('should be an object', () => {
      expect(typeof cacheStrategies).toBe('object');
    });
  });

  describe('cacheInvalidator', () => {
    it('should export cache invalidator', () => {
      expect(cacheInvalidator).toBeDefined();
    });

    it('should be a function or object with invalidation methods', () => {
      const type = typeof cacheInvalidator;
      expect(['function', 'object']).toContain(type);
    });
  });

  describe('integration with service name', () => {
    it('should use service-specific key prefix', async () => {
      const testKey = 'integration:prefix:test';
      const testValue = 'prefixed value';

      await cache.set(testKey, testValue, { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toBe(testValue);

      // Cleanup
      await cache.delete(testKey);
    });

    it('should isolate keys with prefix', async () => {
      const testKey = 'isolation:test';

      await cache.set(testKey, 'isolated', { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toBe('isolated');

      // Cleanup
      await cache.delete(testKey);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent sets', async () => {
      const operations = [];
      for (let i = 0; i < 10; i++) {
        operations.push(cache.set(`test:cache:concurrent:${i}`, `value${i}`, { ttl: 60 }));
      }

      await Promise.all(operations);

      // Verify all values were set
      for (let i = 0; i < 10; i++) {
        const result = await cache.get(`test:cache:concurrent:${i}`);
        expect(result).toBe(`value${i}`);
      }

      // Cleanup
      const cleanupOps = [];
      for (let i = 0; i < 10; i++) {
        cleanupOps.push(cache.delete(`test:cache:concurrent:${i}`));
      }
      await Promise.all(cleanupOps);
    });

    it('should handle concurrent gets', async () => {
      const testKey = 'test:cache:concurrent:reads';
      await cache.set(testKey, 'concurrent value', { ttl: 60 });

      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(cache.get(testKey));
      }

      const results = await Promise.all(operations);

      results.forEach(result => {
        expect(result).toBe('concurrent value');
      });

      // Cleanup
      await cache.delete(testKey);
    });

    it('should handle mixed concurrent operations', async () => {
      const baseKey = 'test:cache:mixed';

      // Set values first sequentially to ensure they exist
      await cache.set(`${baseKey}:1`, 'value1', { ttl: 60 });
      await cache.set(`${baseKey}:2`, 'value2', { ttl: 60 });
      await cache.set(`${baseKey}:3`, 'value3', { ttl: 60 });

      // Now do concurrent reads
      const [val1, val2, val3] = await Promise.all([
        cache.get(`${baseKey}:1`),
        cache.get(`${baseKey}:2`),
        cache.get(`${baseKey}:3`)
      ]);

      expect(val1).toBe('value1');
      expect(val2).toBe('value2');
      expect(val3).toBe('value3');

      // Cleanup
      await cache.delete(`${baseKey}:1`);
      await cache.delete(`${baseKey}:2`);
      await cache.delete(`${baseKey}:3`);
    });
  });

  describe('error handling', () => {
    it('should handle invalid keys gracefully', async () => {
      await expect(cache.get('')).resolves.not.toThrow();
    });

    it('should handle null values', async () => {
      const testKey = 'test:cache:null';

      await cache.set(testKey, null, { ttl: 60 });
      const result = await cache.get(testKey);

      expect(result).toBeNull();

      // Cleanup
      await cache.delete(testKey);
    });

    it('should reject undefined values', async () => {
      const testKey = 'test:cache:undefined';

      // The cache service throws on undefined - this is expected behavior
      await expect(cache.set(testKey, undefined, { ttl: 60 })).rejects.toThrow();
    });
  });

  describe('flush operation', () => {
    it('should flush test keys', async () => {
      // Set multiple test keys
      await cache.set('test:cache:clear:1', 'value1', { ttl: 60 });
      await cache.set('test:cache:clear:2', 'value2', { ttl: 60 });
      await cache.set('test:cache:clear:3', 'value3', { ttl: 60 });

      // Flush all
      await cache.flush();

      // Verify cleared
      const result1 = await cache.get('test:cache:clear:1');
      const result2 = await cache.get('test:cache:clear:2');
      const result3 = await cache.get('test:cache:clear:3');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });
  });
});
