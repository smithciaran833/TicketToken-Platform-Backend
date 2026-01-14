/**
 * Unit tests for src/utils/resilience.ts
 * Tests fallback pattern (FB1), resource quota management (SR8), and utility functions
 */

import {
  withFallback,
  FallbackOptions,
  ResourceQuotaManager,
  ResourceQuota,
  fallbackValues,
  QUOTA_TIERS,
} from '../../../src/utils/resilience';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

describe('utils/resilience', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('withFallback()', () => {
    describe('happy path', () => {
      it('should return primary result when primary succeeds', async () => {
        const primary = jest.fn().mockResolvedValue('primary result');
        const fallback = jest.fn().mockResolvedValue('fallback result');

        const result = await withFallback({
          primary,
          fallback,
          name: 'test-operation',
        });

        expect(result).toBe('primary result');
        expect(primary).toHaveBeenCalledTimes(1);
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should return cached result when cache returns value', async () => {
        const primary = jest.fn().mockResolvedValue('primary result');
        const fallback = jest.fn().mockResolvedValue('fallback result');
        const cache = jest.fn().mockResolvedValue('cached result');

        const result = await withFallback({
          primary,
          fallback,
          cache,
          name: 'test-operation',
        });

        expect(result).toBe('cached result');
        expect(cache).toHaveBeenCalledTimes(1);
        expect(primary).not.toHaveBeenCalled();
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should call primary when cache returns null', async () => {
        const primary = jest.fn().mockResolvedValue('primary result');
        const fallback = jest.fn().mockResolvedValue('fallback result');
        const cache = jest.fn().mockResolvedValue(null);

        const result = await withFallback({
          primary,
          fallback,
          cache,
          name: 'test-operation',
        });

        expect(result).toBe('primary result');
        expect(cache).toHaveBeenCalledTimes(1);
        expect(primary).toHaveBeenCalledTimes(1);
      });
    });

    describe('fallback behavior', () => {
      it('should use fallback when primary fails', async () => {
        const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
        const fallback = jest.fn().mockResolvedValue('fallback result');

        const promise = withFallback({
          primary,
          fallback,
          name: 'test-operation',
          maxRetries: 1,
        });

        // Need to advance timers since there's no retry delay before fallback on single attempt
        const result = await promise;

        expect(result).toBe('fallback result');
        expect(primary).toHaveBeenCalledTimes(1);
        expect(fallback).toHaveBeenCalledTimes(1);
      });

      it('should use sync fallback function', async () => {
        const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
        const fallback = jest.fn().mockReturnValue('sync fallback');

        const result = await withFallback({
          primary,
          fallback,
          name: 'test-operation',
          maxRetries: 1,
        });

        expect(result).toBe('sync fallback');
      });

      it('should throw fallback error when both primary and fallback fail', async () => {
        const primary = jest.fn().mockRejectedValue(new Error('Primary failed'));
        const fallback = jest.fn().mockRejectedValue(new Error('Fallback failed'));

        await expect(
          withFallback({
            primary,
            fallback,
            name: 'test-operation',
            maxRetries: 1,
          })
        ).rejects.toThrow('Fallback failed');
      });
    });

    describe('retry behavior', () => {
      it('should retry primary before using fallback', async () => {
        let callCount = 0;
        const primary = jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount < 3) {
            return Promise.reject(new Error(`Attempt ${callCount} failed`));
          }
          return Promise.resolve('success on retry');
        });
        const fallback = jest.fn().mockResolvedValue('fallback result');

        const promise = withFallback({
          primary,
          fallback,
          name: 'test-operation',
          maxRetries: 3,
        });

        // Advance timers for retry delays (exponential backoff)
        await jest.advanceTimersByTimeAsync(200); // 2^1 * 100 = 200ms
        await jest.advanceTimersByTimeAsync(400); // 2^2 * 100 = 400ms

        const result = await promise;

        expect(result).toBe('success on retry');
        expect(primary).toHaveBeenCalledTimes(3);
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should use fallback after all retries exhausted', async () => {
        const primary = jest.fn().mockRejectedValue(new Error('Always fails'));
        const fallback = jest.fn().mockResolvedValue('fallback result');

        const promise = withFallback({
          primary,
          fallback,
          name: 'test-operation',
          maxRetries: 3,
        });

        // Advance timers for all retry delays
        await jest.advanceTimersByTimeAsync(200); // 2^1 * 100
        await jest.advanceTimersByTimeAsync(400); // 2^2 * 100

        const result = await promise;

        expect(result).toBe('fallback result');
        expect(primary).toHaveBeenCalledTimes(3);
        expect(fallback).toHaveBeenCalledTimes(1);
      });

      it('should default to 1 retry', async () => {
        const primary = jest.fn().mockRejectedValue(new Error('Fails'));
        const fallback = jest.fn().mockResolvedValue('fallback');

        await withFallback({
          primary,
          fallback,
          name: 'test-operation',
          // maxRetries not specified
        });

        expect(primary).toHaveBeenCalledTimes(1);
      });
    });

    describe('timeout behavior', () => {
      it('should timeout primary operation and use fallback', async () => {
        const primary = jest.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve('slow result'), 60000))
        );
        const fallback = jest.fn().mockResolvedValue('fallback after timeout');

        const promise = withFallback({
          primary,
          fallback,
          name: 'test-operation',
          maxRetries: 1,
          timeout: 1000,
        });

        // Advance past timeout
        await jest.advanceTimersByTimeAsync(1001);

        const result = await promise;

        expect(result).toBe('fallback after timeout');
        expect(fallback).toHaveBeenCalled();
      });

      it('should default to 30000ms timeout', async () => {
        const primary = jest.fn().mockImplementation(
          () => new Promise(resolve => setTimeout(() => resolve('result'), 25000))
        );
        const fallback = jest.fn().mockResolvedValue('fallback');

        const promise = withFallback({
          primary,
          fallback,
          name: 'test-operation',
          maxRetries: 1,
        });

        // Advance past 25s but before 30s default timeout
        await jest.advanceTimersByTimeAsync(25001);

        const result = await promise;

        // Should get primary result since it finishes before default timeout
        expect(result).toBe('result');
        expect(fallback).not.toHaveBeenCalled();
      });
    });

    describe('cache error handling', () => {
      it('should continue to primary when cache throws error', async () => {
        const primary = jest.fn().mockResolvedValue('primary result');
        const fallback = jest.fn().mockResolvedValue('fallback result');
        const cache = jest.fn().mockRejectedValue(new Error('Cache error'));

        const result = await withFallback({
          primary,
          fallback,
          cache,
          name: 'test-operation',
        });

        expect(result).toBe('primary result');
        expect(cache).toHaveBeenCalledTimes(1);
        expect(primary).toHaveBeenCalledTimes(1);
      });
    });

    describe('edge cases', () => {
      it('should handle primary returning undefined', async () => {
        const primary = jest.fn().mockResolvedValue(undefined);
        const fallback = jest.fn().mockResolvedValue('fallback');

        const result = await withFallback({
          primary,
          fallback,
          name: 'test-operation',
        });

        expect(result).toBeUndefined();
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should handle primary returning null', async () => {
        const primary = jest.fn().mockResolvedValue(null);
        const fallback = jest.fn().mockResolvedValue('fallback');

        const result = await withFallback({
          primary,
          fallback,
          name: 'test-operation',
        });

        expect(result).toBeNull();
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should handle primary returning empty object', async () => {
        const primary = jest.fn().mockResolvedValue({});
        const fallback = jest.fn().mockResolvedValue({ default: true });

        const result = await withFallback({
          primary,
          fallback,
          name: 'test-operation',
        });

        expect(result).toEqual({});
        expect(fallback).not.toHaveBeenCalled();
      });

      it('should handle primary returning empty array', async () => {
        const primary = jest.fn().mockResolvedValue([]);
        const fallback = jest.fn().mockResolvedValue(['default']);

        const result = await withFallback({
          primary,
          fallback,
          name: 'test-operation',
        });

        expect(result).toEqual([]);
        expect(fallback).not.toHaveBeenCalled();
      });
    });
  });

  describe('QUOTA_TIERS', () => {
    it('should have free tier with minimal limits', () => {
      expect(QUOTA_TIERS.free).toEqual({
        maxVenues: 1,
        maxEventsPerVenue: 10,
        maxIntegrationsPerVenue: 2,
        maxStorageMb: 100,
        maxApiCallsPerDay: 1000,
      });
    });

    it('should have basic tier with moderate limits', () => {
      expect(QUOTA_TIERS.basic).toEqual({
        maxVenues: 5,
        maxEventsPerVenue: 50,
        maxIntegrationsPerVenue: 5,
        maxStorageMb: 500,
        maxApiCallsPerDay: 10000,
      });
    });

    it('should have professional tier with high limits', () => {
      expect(QUOTA_TIERS.professional).toEqual({
        maxVenues: 20,
        maxEventsPerVenue: 200,
        maxIntegrationsPerVenue: 10,
        maxStorageMb: 2000,
        maxApiCallsPerDay: 50000,
      });
    });

    it('should have enterprise tier with unlimited (-1)', () => {
      expect(QUOTA_TIERS.enterprise).toEqual({
        maxVenues: -1,
        maxEventsPerVenue: -1,
        maxIntegrationsPerVenue: -1,
        maxStorageMb: -1,
        maxApiCallsPerDay: -1,
      });
    });

    it('should have exactly 4 tiers', () => {
      expect(Object.keys(QUOTA_TIERS)).toHaveLength(4);
    });
  });

  describe('ResourceQuotaManager', () => {
    let mockRedis: any;
    let mockDb: any;
    let manager: ResourceQuotaManager;

    beforeEach(() => {
      mockRedis = {
        get: jest.fn(),
        setex: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
        del: jest.fn(),
      };
      mockDb = jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        count: jest.fn().mockReturnThis(),
        first: jest.fn(),
      });
      manager = new ResourceQuotaManager(mockRedis, mockDb);
    });

    describe('getQuotaForTenant()', () => {
      it('should return tenant tier quota', async () => {
        mockDb().first.mockResolvedValue({
          subscription_tier: 'professional',
          custom_quotas: null,
        });

        const quota = await manager.getQuotaForTenant('tenant-123');

        expect(quota).toEqual(QUOTA_TIERS.professional);
        expect(mockDb).toHaveBeenCalledWith('tenants');
      });

      it('should return free tier when tenant not found', async () => {
        mockDb().first.mockResolvedValue(null);

        const quota = await manager.getQuotaForTenant('unknown-tenant');

        expect(quota).toEqual(QUOTA_TIERS.free);
      });

      it('should return free tier on database error', async () => {
        mockDb().first.mockRejectedValue(new Error('DB error'));

        const quota = await manager.getQuotaForTenant('tenant-123');

        expect(quota).toEqual(QUOTA_TIERS.free);
      });

      it('should return free tier for unknown subscription tier', async () => {
        mockDb().first.mockResolvedValue({
          subscription_tier: 'unknown_tier',
          custom_quotas: null,
        });

        const quota = await manager.getQuotaForTenant('tenant-123');

        expect(quota).toEqual(QUOTA_TIERS.free);
      });

      it('should merge custom quotas with tier quotas', async () => {
        mockDb().first.mockResolvedValue({
          subscription_tier: 'basic',
          custom_quotas: {
            maxVenues: 10, // Override basic's 5
            maxApiCallsPerDay: 20000, // Override basic's 10000
          },
        });

        const quota = await manager.getQuotaForTenant('tenant-123');

        expect(quota).toEqual({
          maxVenues: 10,
          maxEventsPerVenue: 50, // From basic
          maxIntegrationsPerVenue: 5, // From basic
          maxStorageMb: 500, // From basic
          maxApiCallsPerDay: 20000,
        });
      });

      it('should handle empty custom quotas', async () => {
        mockDb().first.mockResolvedValue({
          subscription_tier: 'basic',
          custom_quotas: {},
        });

        const quota = await manager.getQuotaForTenant('tenant-123');

        expect(quota).toEqual(QUOTA_TIERS.basic);
      });
    });

    describe('checkQuota()', () => {
      beforeEach(() => {
        // Setup default tenant as professional tier
        mockDb().first.mockResolvedValue({
          subscription_tier: 'professional',
          custom_quotas: null,
        });
      });

      it('should return allowed true when under quota', async () => {
        mockRedis.get.mockResolvedValue('5'); // Current venues

        const result = await manager.checkQuota('tenant-123', 'maxVenues');

        expect(result).toEqual({
          allowed: true,
          limit: 20,
          current: 5,
          remaining: 15,
        });
      });

      it('should return allowed false when at quota limit', async () => {
        mockRedis.get.mockResolvedValue('20'); // At limit

        const result = await manager.checkQuota('tenant-123', 'maxVenues');

        expect(result).toEqual({
          allowed: false,
          limit: 20,
          current: 20,
          remaining: 0,
        });
      });

      it('should return allowed false when over quota', async () => {
        mockRedis.get.mockResolvedValue('25'); // Over limit

        const result = await manager.checkQuota('tenant-123', 'maxVenues');

        expect(result).toEqual({
          allowed: false,
          limit: 20,
          current: 25,
          remaining: 0,
        });
      });

      it('should use provided currentCount instead of fetching', async () => {
        const result = await manager.checkQuota('tenant-123', 'maxVenues', 10);

        expect(result).toEqual({
          allowed: true,
          limit: 20,
          current: 10,
          remaining: 10,
        });
        expect(mockRedis.get).not.toHaveBeenCalled();
      });

      it('should return unlimited for enterprise tier', async () => {
        mockDb().first.mockResolvedValue({
          subscription_tier: 'enterprise',
          custom_quotas: null,
        });

        const result = await manager.checkQuota('tenant-123', 'maxVenues', 100);

        expect(result).toEqual({
          allowed: true,
          limit: -1,
          current: 100,
          remaining: -1,
        });
      });

      it('should calculate current usage from database when cache miss', async () => {
        mockRedis.get.mockResolvedValue(null); // Cache miss
        mockDb().first.mockImplementation(() => {
          // First call for quota, second for venue count
          if (mockDb().first.mock.calls.length === 1) {
            return Promise.resolve({ subscription_tier: 'professional', custom_quotas: null });
          }
          return Promise.resolve({ count: '8' });
        });

        const result = await manager.checkQuota('tenant-123', 'maxVenues');

        expect(result.current).toBe(8);
        expect(mockRedis.setex).toHaveBeenCalled(); // Cache the result
      });
    });

    describe('incrementApiCalls()', () => {
      it('should increment and return count', async () => {
        mockRedis.incr.mockResolvedValue(5);

        const count = await manager.incrementApiCalls('tenant-123');

        expect(count).toBe(5);
        expect(mockRedis.incr).toHaveBeenCalled();
      });

      it('should set expiry on first increment', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await manager.incrementApiCalls('tenant-123');

        expect(mockRedis.expire).toHaveBeenCalled();
      });

      it('should not set expiry on subsequent increments', async () => {
        mockRedis.incr.mockResolvedValue(5);

        await manager.incrementApiCalls('tenant-123');

        expect(mockRedis.expire).not.toHaveBeenCalled();
      });

      it('should return 0 on redis error', async () => {
        mockRedis.incr.mockRejectedValue(new Error('Redis error'));

        const count = await manager.incrementApiCalls('tenant-123');

        expect(count).toBe(0);
      });
    });

    describe('invalidateUsageCache()', () => {
      it('should delete cache key', async () => {
        mockRedis.del.mockResolvedValue(1);

        await manager.invalidateUsageCache('tenant-123', 'maxVenues');

        expect(mockRedis.del).toHaveBeenCalledWith('quota:usage:tenant-123:maxVenues');
      });

      it('should not throw on redis error', async () => {
        mockRedis.del.mockRejectedValue(new Error('Redis error'));

        await expect(
          manager.invalidateUsageCache('tenant-123', 'maxVenues')
        ).resolves.not.toThrow();
      });
    });
  });

  describe('fallbackValues', () => {
    describe('emptyArray()', () => {
      it('should return empty array', () => {
        expect(fallbackValues.emptyArray()).toEqual([]);
      });

      it('should return new array each time', () => {
        const arr1 = fallbackValues.emptyArray();
        const arr2 = fallbackValues.emptyArray();
        
        expect(arr1).not.toBe(arr2);
      });

      it('should be typed correctly', () => {
        const numbers: number[] = fallbackValues.emptyArray<number>();
        const strings: string[] = fallbackValues.emptyArray<string>();
        
        expect(numbers).toEqual([]);
        expect(strings).toEqual([]);
      });
    });

    describe('emptyObject()', () => {
      it('should return empty object', () => {
        expect(fallbackValues.emptyObject()).toEqual({});
      });

      it('should return new object each time', () => {
        const obj1 = fallbackValues.emptyObject();
        const obj2 = fallbackValues.emptyObject();
        
        expect(obj1).not.toBe(obj2);
      });

      it('should be typed correctly', () => {
        interface TestType {
          name?: string;
        }
        const typed: TestType = fallbackValues.emptyObject<TestType>();
        
        expect(typed).toEqual({});
      });
    });

    describe('defaultConfig()', () => {
      it('should return function that returns defaults', () => {
        const defaults = { key: 'value', count: 10 };
        const getter = fallbackValues.defaultConfig(defaults);
        
        expect(getter()).toEqual(defaults);
      });

      it('should return same defaults each time', () => {
        const defaults = { key: 'value' };
        const getter = fallbackValues.defaultConfig(defaults);
        
        expect(getter()).toBe(getter());
      });
    });

    describe('cachedValue()', () => {
      it('should return cached value when key exists', () => {
        const cache = new Map<string, string>();
        cache.set('myKey', 'cached value');
        
        const getter = fallbackValues.cachedValue(cache, 'myKey', 'default');
        
        expect(getter()).toBe('cached value');
      });

      it('should return default when key does not exist', () => {
        const cache = new Map<string, string>();
        
        const getter = fallbackValues.cachedValue(cache, 'missingKey', 'default value');
        
        expect(getter()).toBe('default value');
      });

      it('should handle empty cache', () => {
        const cache = new Map<string, number>();
        
        const getter = fallbackValues.cachedValue(cache, 'key', 42);
        
        expect(getter()).toBe(42);
      });

      it('should return default for falsy cached values due to || operator', () => {
        const cache = new Map<string, number>();
        cache.set('zero', 0);
        
        const getter = fallbackValues.cachedValue(cache, 'zero', 999);
        
        // Note: The implementation uses || operator which treats 0 as falsy
        // This is a known limitation - falsy values will trigger fallback
        expect(getter()).toBe(999);
      });

      it('should return default for undefined cached value', () => {
        const cache = new Map<string, string | undefined>();
        cache.set('undefined', undefined);
        
        const getter = fallbackValues.cachedValue(cache, 'undefined', 'default');
        
        // undefined || 'default' = 'default'
        expect(getter()).toBe('default');
      });
    });
  });

  describe('Integration scenarios', () => {
    it('should work with withFallback and fallbackValues together', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('API failed'));
      
      const result = await withFallback({
        primary,
        fallback: fallbackValues.emptyArray,
        name: 'fetch-items',
        maxRetries: 1,
      });

      expect(result).toEqual([]);
    });

    it('should work with withFallback and defaultConfig', async () => {
      const primary = jest.fn().mockRejectedValue(new Error('Config fetch failed'));
      const defaults = { theme: 'dark', language: 'en' };
      
      const result = await withFallback({
        primary,
        fallback: fallbackValues.defaultConfig(defaults),
        name: 'fetch-config',
        maxRetries: 1,
      });

      expect(result).toEqual(defaults);
    });
  });
});
