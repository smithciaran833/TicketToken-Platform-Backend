/**
 * Cache Integration Service Tests
 * Tests ServiceCache: get, set, delete (single/array/wildcard), invalidateCache, flush, getStats
 */

import { setupTestApp, teardownTestApp, TestContext, redis } from './setup';
import { serviceCache } from '../../src/services/cache-integration';

describe('ServiceCache', () => {
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestApp();
  }, 30000);

  afterAll(async () => { await teardownTestApp(context); });

  beforeEach(async () => { await redis.flushdb(); });

  describe('get/set', () => {
    it('should set and get a value', async () => {
      await serviceCache.set('test:key1', { foo: 'bar' });
      const result = await serviceCache.get('test:key1');
      expect(result).toEqual({ foo: 'bar' });
    });

    it('should return null for non-existent key', async () => {
      const result = await serviceCache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should set with custom TTL', async () => {
      await serviceCache.set('test:ttl', { data: 1 }, 1);
      const before = await serviceCache.get('test:ttl');
      expect(before).toEqual({ data: 1 });
      await new Promise(r => setTimeout(r, 1100));
      const after = await serviceCache.get('test:ttl');
      expect(after).toBeNull();
    });

    it('should handle complex objects', async () => {
      const complex = { arr: [1, 2, 3], nested: { a: 'b' }, num: 42 };
      await serviceCache.set('test:complex', complex);
      expect(await serviceCache.get('test:complex')).toEqual(complex);
    });
  });

  describe('delete', () => {
    it('should delete single key', async () => {
      await serviceCache.set('test:del1', 'value');
      await serviceCache.delete('test:del1');
      expect(await serviceCache.get('test:del1')).toBeNull();
    });

    it('should delete array of keys', async () => {
      await serviceCache.set('test:arr1', 'v1');
      await serviceCache.set('test:arr2', 'v2');
      await serviceCache.delete(['test:arr1', 'test:arr2']);
      expect(await serviceCache.get('test:arr1')).toBeNull();
      expect(await serviceCache.get('test:arr2')).toBeNull();
    });

    it('should delete with wildcard pattern', async () => {
      await serviceCache.set('event:1', 'e1');
      await serviceCache.set('event:2', 'e2');
      await serviceCache.set('other:1', 'o1');
      await serviceCache.delete('event:*');
      expect(await serviceCache.get('event:1')).toBeNull();
      expect(await serviceCache.get('event:2')).toBeNull();
      expect(await serviceCache.get('other:1')).toEqual('o1');
    });

    it('should handle wildcard in array', async () => {
      await serviceCache.set('a:1', '1');
      await serviceCache.set('a:2', '2');
      await serviceCache.set('b:1', '3');
      await serviceCache.delete(['a:*', 'b:1']);
      expect(await serviceCache.get('a:1')).toBeNull();
      expect(await serviceCache.get('a:2')).toBeNull();
      expect(await serviceCache.get('b:1')).toBeNull();
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate single pattern', async () => {
      await serviceCache.set('cache:x', 'x');
      await serviceCache.invalidateCache('cache:x');
      expect(await serviceCache.get('cache:x')).toBeNull();
    });

    it('should invalidate array of patterns', async () => {
      await serviceCache.set('c1:a', '1');
      await serviceCache.set('c2:b', '2');
      await serviceCache.invalidateCache(['c1:*', 'c2:*']);
      expect(await serviceCache.get('c1:a')).toBeNull();
      expect(await serviceCache.get('c2:b')).toBeNull();
    });
  });

  describe('flush', () => {
    it('should flush all keys', async () => {
      await serviceCache.set('f1', '1');
      await serviceCache.set('f2', '2');
      await serviceCache.flush();
      expect(await serviceCache.get('f1')).toBeNull();
      expect(await serviceCache.get('f2')).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return connection status', () => {
      const stats = serviceCache.getStats();
      expect(stats).toHaveProperty('connected');
      expect(typeof stats.connected).toBe('boolean');
    });
  });
});
