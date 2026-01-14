/**
 * Unit Tests for Cache Service
 * 
 * Tests cache operations including get, set, delete, invalidate, and getOrCompute.
 */

// Mock @tickettoken/shared before imports
const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  invalidate: jest.fn(),
};

jest.mock('@tickettoken/shared', () => ({
  getCacheManager: jest.fn(() => mockCacheManager),
}));

import { CacheService, cacheService } from '../../../src/services/cache.service';

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CacheService();
  });

  describe('get', () => {
    it('should retrieve a cached value', async () => {
      const cachedValue = { id: 'test-123', name: 'Test Item' };
      mockCacheManager.get.mockResolvedValue(cachedValue);

      const result = await service.get<typeof cachedValue>('test-key');

      expect(result).toEqual(cachedValue);
      expect(mockCacheManager.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null for non-existent key', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.get<string>('non-existent-key');

      expect(result).toBeNull();
      expect(mockCacheManager.get).toHaveBeenCalledWith('non-existent-key');
    });

    it('should handle different data types', async () => {
      // String
      mockCacheManager.get.mockResolvedValue('string-value');
      expect(await service.get<string>('string-key')).toBe('string-value');

      // Number
      mockCacheManager.get.mockResolvedValue(42);
      expect(await service.get<number>('number-key')).toBe(42);

      // Array
      mockCacheManager.get.mockResolvedValue([1, 2, 3]);
      expect(await service.get<number[]>('array-key')).toEqual([1, 2, 3]);

      // Boolean
      mockCacheManager.get.mockResolvedValue(true);
      expect(await service.get<boolean>('boolean-key')).toBe(true);
    });

    it('should handle cache errors', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.get('error-key')).rejects.toThrow('Redis connection failed');
    });

    it('should handle complex nested objects', async () => {
      const complexObject = {
        user: {
          id: 'user-1',
          profile: {
            name: 'Test User',
            preferences: {
              theme: 'dark',
              notifications: ['email', 'sms'],
            },
          },
        },
        metadata: {
          createdAt: '2026-01-10T12:00:00Z',
          version: 2,
        },
      };

      mockCacheManager.get.mockResolvedValue(complexObject);

      const result = await service.get<typeof complexObject>('complex-key');

      expect(result).toEqual(complexObject);
    });
  });

  describe('set', () => {
    it('should set a value without TTL', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('new-key', { data: 'value' });

      expect(mockCacheManager.set).toHaveBeenCalledWith('new-key', { data: 'value' }, undefined);
    });

    it('should set a value with TTL', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('expiring-key', 'value', 3600);

      expect(mockCacheManager.set).toHaveBeenCalledWith('expiring-key', 'value', 3600);
    });

    it('should handle different data types', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('string', 'hello');
      await service.set('number', 123);
      await service.set('array', [1, 2, 3]);
      await service.set('object', { a: 1 });
      await service.set('boolean', false);

      expect(mockCacheManager.set).toHaveBeenCalledTimes(5);
    });

    it('should handle set errors', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Write error'));

      await expect(service.set('error-key', 'value')).rejects.toThrow('Write error');
    });

    it('should handle zero TTL', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('zero-ttl-key', 'value', 0);

      expect(mockCacheManager.set).toHaveBeenCalledWith('zero-ttl-key', 'value', 0);
    });

    it('should handle large TTL values', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set('long-ttl-key', 'value', 86400 * 30); // 30 days

      expect(mockCacheManager.set).toHaveBeenCalledWith('long-ttl-key', 'value', 2592000);
    });
  });

  describe('delete', () => {
    it('should delete a key', async () => {
      mockCacheManager.delete.mockResolvedValue(undefined);

      await service.delete('key-to-delete');

      expect(mockCacheManager.delete).toHaveBeenCalledWith('key-to-delete');
    });

    it('should handle deleting non-existent keys gracefully', async () => {
      mockCacheManager.delete.mockResolvedValue(undefined);

      await expect(service.delete('non-existent')).resolves.toBeUndefined();
    });

    it('should handle delete errors', async () => {
      mockCacheManager.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(service.delete('error-key')).rejects.toThrow('Delete failed');
    });
  });

  describe('invalidate', () => {
    it('should invalidate keys matching pattern', async () => {
      mockCacheManager.invalidate.mockResolvedValue(undefined);

      await service.invalidate('payment:*');

      expect(mockCacheManager.invalidate).toHaveBeenCalledWith('payment:*');
    });

    it('should handle various pattern formats', async () => {
      mockCacheManager.invalidate.mockResolvedValue(undefined);

      await service.invalidate('user:123:*');
      await service.invalidate('session:*:tokens');
      await service.invalidate('tenant-abc:*');

      expect(mockCacheManager.invalidate).toHaveBeenCalledTimes(3);
      expect(mockCacheManager.invalidate).toHaveBeenCalledWith('user:123:*');
      expect(mockCacheManager.invalidate).toHaveBeenCalledWith('session:*:tokens');
      expect(mockCacheManager.invalidate).toHaveBeenCalledWith('tenant-abc:*');
    });

    it('should handle invalidate errors', async () => {
      mockCacheManager.invalidate.mockRejectedValue(new Error('Pattern match failed'));

      await expect(service.invalidate('error:*')).rejects.toThrow('Pattern match failed');
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value if exists', async () => {
      const cachedValue = { result: 'cached' };
      mockCacheManager.get.mockResolvedValue(cachedValue);

      const computeFn = jest.fn().mockResolvedValue({ result: 'computed' });

      const result = await service.getOrCompute('existing-key', computeFn, 3600);

      expect(result).toEqual(cachedValue);
      expect(computeFn).not.toHaveBeenCalled();
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('should compute and cache value if not cached', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);

      const computedValue = { result: 'computed' };
      const computeFn = jest.fn().mockResolvedValue(computedValue);

      const result = await service.getOrCompute('new-key', computeFn, 3600);

      expect(result).toEqual(computedValue);
      expect(computeFn).toHaveBeenCalled();
      expect(mockCacheManager.set).toHaveBeenCalledWith('new-key', computedValue, 3600);
    });

    it('should work without TTL', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);

      const computedValue = 'computed-value';
      const computeFn = jest.fn().mockResolvedValue(computedValue);

      const result = await service.getOrCompute('no-ttl-key', computeFn);

      expect(result).toBe(computedValue);
      expect(mockCacheManager.set).toHaveBeenCalledWith('no-ttl-key', computedValue, undefined);
    });

    it('should propagate compute function errors', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const computeFn = jest.fn().mockRejectedValue(new Error('Compute failed'));

      await expect(
        service.getOrCompute('error-key', computeFn)
      ).rejects.toThrow('Compute failed');
    });

    it('should handle expensive computations', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);

      const expensiveResult = {
        data: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: `item-${i}` })),
        computed: true,
      };

      const computeFn = jest.fn().mockImplementation(async () => {
        // Simulate expensive operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        return expensiveResult;
      });

      const result = await service.getOrCompute('expensive-key', computeFn, 7200);

      expect(result).toEqual(expensiveResult);
      expect(computeFn).toHaveBeenCalledTimes(1);
      expect(mockCacheManager.set).toHaveBeenCalledWith('expensive-key', expensiveResult, 7200);
    });

    it('should handle null return from compute function', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);

      // NOTE: If compute function returns null, it will still be cached
      // This test documents current behavior
      const computeFn = jest.fn().mockResolvedValue(null);

      const result = await service.getOrCompute('null-result-key', computeFn);

      expect(result).toBeNull();
      expect(mockCacheManager.set).toHaveBeenCalledWith('null-result-key', null, undefined);
    });

    it('should handle async compute function', async () => {
      mockCacheManager.get.mockResolvedValue(null);
      mockCacheManager.set.mockResolvedValue(undefined);

      const asyncComputeFn = async () => {
        return new Promise<{ data: string }>((resolve) => {
          setImmediate(() => {
            resolve({ data: 'async-result' });
          });
        });
      };

      const result = await service.getOrCompute('async-key', asyncComputeFn);

      expect(result).toEqual({ data: 'async-result' });
    });
  });

  describe('Singleton Export', () => {
    it('should export a singleton instance', () => {
      expect(cacheService).toBeDefined();
      expect(cacheService).toBeInstanceOf(CacheService);
    });

    it('should have all methods available', () => {
      expect(typeof cacheService.get).toBe('function');
      expect(typeof cacheService.set).toBe('function');
      expect(typeof cacheService.delete).toBe('function');
      expect(typeof cacheService.invalidate).toBe('function');
      expect(typeof cacheService.getOrCompute).toBe('function');
    });
  });

  describe('Key Patterns', () => {
    it('should handle keys with special characters', async () => {
      mockCacheManager.get.mockResolvedValue('value');

      await service.get('payment:tenant-123:order:abc-def-456');
      await service.get('user:123:session:token_xyz');
      await service.get('cache:v2:payment-intent:pi_12345');

      expect(mockCacheManager.get).toHaveBeenCalledTimes(3);
    });

    it('should handle empty string key', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.get('');

      expect(result).toBeNull();
      expect(mockCacheManager.get).toHaveBeenCalledWith('');
    });

    it('should handle very long keys', async () => {
      const longKey = 'a'.repeat(500);
      mockCacheManager.set.mockResolvedValue(undefined);

      await service.set(longKey, 'value');

      expect(mockCacheManager.set).toHaveBeenCalledWith(longKey, 'value', undefined);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent gets', async () => {
      mockCacheManager.get.mockImplementation(async (key: string) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `value-for-${key}`;
      });

      const results = await Promise.all([
        service.get('key-1'),
        service.get('key-2'),
        service.get('key-3'),
      ]);

      expect(results).toEqual(['value-for-key-1', 'value-for-key-2', 'value-for-key-3']);
      expect(mockCacheManager.get).toHaveBeenCalledTimes(3);
    });

    it('should handle concurrent sets', async () => {
      mockCacheManager.set.mockResolvedValue(undefined);

      await Promise.all([
        service.set('key-1', 'value-1'),
        service.set('key-2', 'value-2'),
        service.set('key-3', 'value-3'),
      ]);

      expect(mockCacheManager.set).toHaveBeenCalledTimes(3);
    });
  });
});
