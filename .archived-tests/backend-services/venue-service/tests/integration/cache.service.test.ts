/**
 * CacheService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_VENUE_ID,
  db,
} from './setup';
import { CacheService } from '../../src/services/cache.service';

describe('CacheService', () => {
  let context: TestContext;
  let cacheService: CacheService;

  beforeAll(async () => {
    context = await setupTestApp();
    cacheService = new CacheService(context.redis);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clear all cache keys
    const keys = await context.redis.keys('venue:*');
    if (keys.length > 0) {
      await context.redis.del(...keys);
    }
  });

  // ==========================================================================
  // get / set
  // ==========================================================================
  describe('get and set', () => {
    it('should set and get a value', async () => {
      const testData = { name: 'Test Venue', id: TEST_VENUE_ID };

      await cacheService.set('test-key', testData);
      const result = await cacheService.get('test-key');

      expect(result).toEqual(testData);
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheService.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should set value with custom TTL', async () => {
      await cacheService.set('ttl-test', { data: 'test' }, 60);

      const ttl = await context.redis.ttl('venue:ttl-test');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should handle complex objects', async () => {
      const complexData = {
        id: TEST_VENUE_ID,
        name: 'Complex Venue',
        settings: {
          nested: {
            value: 123,
            array: [1, 2, 3],
          },
        },
        tags: ['music', 'sports'],
      };

      await cacheService.set('complex-key', complexData);
      const result = await cacheService.get('complex-key');

      expect(result).toEqual(complexData);
    });
  });

  // ==========================================================================
  // del
  // ==========================================================================
  describe('del', () => {
    it('should delete a cached value', async () => {
      await cacheService.set('delete-test', { data: 'to be deleted' });

      // Verify it exists
      let result = await cacheService.get('delete-test');
      expect(result).not.toBeNull();

      // Delete it
      await cacheService.del('delete-test');

      // Verify it's gone
      result = await cacheService.get('delete-test');
      expect(result).toBeNull();
    });

    it('should not throw when deleting non-existent key', async () => {
      await expect(cacheService.del('non-existent')).resolves.not.toThrow();
    });
  });

  // ==========================================================================
  // exists
  // ==========================================================================
  describe('exists', () => {
    it('should return true for existing key', async () => {
      await cacheService.set('exists-test', { data: 'test' });

      const exists = await cacheService.exists('exists-test');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await cacheService.exists('non-existent');

      expect(exists).toBe(false);
    });
  });

  // ==========================================================================
  // ttl
  // ==========================================================================
  describe('ttl', () => {
    it('should return remaining TTL for key', async () => {
      await cacheService.set('ttl-key', { data: 'test' }, 120);

      const ttl = await cacheService.ttl('ttl-key');

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(120);
    });

    it('should return -2 for non-existent key', async () => {
      const ttl = await cacheService.ttl('non-existent');

      expect(ttl).toBe(-2);
    });
  });

  // ==========================================================================
  // clearVenueCache
  // ==========================================================================
  describe('clearVenueCache', () => {
    it('should clear all cache entries for a venue', async () => {
      // Set multiple cache entries for the venue
      await cacheService.set(TEST_VENUE_ID, { data: 'main' });
      await cacheService.set(`${TEST_VENUE_ID}:details`, { data: 'details' });
      await cacheService.set(`${TEST_VENUE_ID}:stats`, { data: 'stats' });

      // Clear venue cache
      await cacheService.clearVenueCache(TEST_VENUE_ID);

      // Verify all are cleared
      expect(await cacheService.get(TEST_VENUE_ID)).toBeNull();
      expect(await cacheService.get(`${TEST_VENUE_ID}:details`)).toBeNull();
      expect(await cacheService.get(`${TEST_VENUE_ID}:stats`)).toBeNull();
    });

    it('should not affect other venue caches', async () => {
      const otherVenueId = '00000000-0000-0000-0000-000000000099';

      await cacheService.set(`${TEST_VENUE_ID}:data`, { venue: 'test' });
      await cacheService.set(`${otherVenueId}:data`, { venue: 'other' });

      await cacheService.clearVenueCache(TEST_VENUE_ID);

      expect(await cacheService.get(`${TEST_VENUE_ID}:data`)).toBeNull();
      expect(await cacheService.get(`${otherVenueId}:data`)).toEqual({ venue: 'other' });
    });
  });

  // ==========================================================================
  // clearTenantVenueCache
  // ==========================================================================
  describe('clearTenantVenueCache', () => {
    it('should clear all venue cache for a tenant', async () => {
      await cacheService.set(`tenant:${TEST_TENANT_ID}:venue1`, { data: 'v1' });
      await cacheService.set(`tenant:${TEST_TENANT_ID}:venue2`, { data: 'v2' });

      await cacheService.clearTenantVenueCache(TEST_TENANT_ID);

      expect(await cacheService.get(`tenant:${TEST_TENANT_ID}:venue1`)).toBeNull();
      expect(await cacheService.get(`tenant:${TEST_TENANT_ID}:venue2`)).toBeNull();
    });
  });

  // ==========================================================================
  // getOrSet
  // ==========================================================================
  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cachedData = { source: 'cache' };
      await cacheService.set('getOrSet-test', cachedData);

      const fetchFn = jest.fn().mockResolvedValue({ source: 'fetch' });

      const result = await cacheService.getOrSet('getOrSet-test', fetchFn);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not in cache', async () => {
      const fetchedData = { source: 'fetch', timestamp: Date.now() };
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);

      const result = await cacheService.getOrSet('new-key', fetchFn, 300);

      expect(result).toEqual(fetchedData);
      expect(fetchFn).toHaveBeenCalledTimes(1);

      // Verify it was cached
      const cached = await cacheService.get('new-key');
      expect(cached).toEqual(fetchedData);
    });
  });

  // ==========================================================================
  // warmCache
  // ==========================================================================
  describe('warmCache', () => {
    it('should cache multiple entries at once', async () => {
      const entries = [
        { key: 'warm-1', value: { data: 'one' } },
        { key: 'warm-2', value: { data: 'two' } },
        { key: 'warm-3', value: { data: 'three' }, ttl: 60 },
      ];

      await cacheService.warmCache(entries);

      expect(await cacheService.get('warm-1')).toEqual({ data: 'one' });
      expect(await cacheService.get('warm-2')).toEqual({ data: 'two' });
      expect(await cacheService.get('warm-3')).toEqual({ data: 'three' });
    });
  });

  // ==========================================================================
  // invalidateKeys
  // ==========================================================================
  describe('invalidateKeys', () => {
    it('should invalidate multiple keys at once', async () => {
      await cacheService.set('inv-1', { data: '1' });
      await cacheService.set('inv-2', { data: '2' });
      await cacheService.set('inv-3', { data: '3' });

      await cacheService.invalidateKeys(['inv-1', 'inv-2']);

      expect(await cacheService.get('inv-1')).toBeNull();
      expect(await cacheService.get('inv-2')).toBeNull();
      expect(await cacheService.get('inv-3')).toEqual({ data: '3' }); // Not invalidated
    });
  });
});
