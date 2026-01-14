/**
 * Unit tests for src/services/cache.service.ts
 * Tests Redis caching with tenant isolation (SR1, SR4), circuit breakers, and retry logic
 */

import { CacheService } from '../../../src/services/cache.service';
import { createRedisMock, createFailingRedisMock, RedisMock } from '../../__mocks__/redis.mock';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock circuit breaker to pass through
jest.mock('../../../src/utils/circuitBreaker', () => ({
  withCircuitBreaker: jest.fn((fn: any) => fn),
}));

// Mock retry to pass through
jest.mock('../../../src/utils/retry', () => ({
  withRetry: jest.fn((fn: any) => fn()),
}));

describe('services/cache.service', () => {
  let cacheService: CacheService;
  let redisMock: RedisMock;

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock = createRedisMock();
    cacheService = new CacheService(redisMock as any);
  });

  describe('constructor', () => {
    it('should create cache service with redis client', () => {
      expect(cacheService).toBeInstanceOf(CacheService);
    });
  });

  describe('setTenantContext()', () => {
    it('should set tenant context', () => {
      cacheService.setTenantContext('tenant-123');
      // Verify by checking generated cache keys include tenant
      const key = (cacheService as any).getCacheKey('test-key');
      expect(key).toContain('tenant:tenant-123');
    });

    it('should clear tenant context when null', () => {
      cacheService.setTenantContext('tenant-123');
      cacheService.setTenantContext(null);
      const key = (cacheService as any).getCacheKey('test-key');
      expect(key).toContain('global');
    });
  });

  describe('getCacheKey() (private)', () => {
    it('should generate tenant-scoped key when tenant is set', () => {
      cacheService.setTenantContext('tenant-abc');
      const key = (cacheService as any).getCacheKey('venue:123');
      expect(key).toBe('venue:tenant:tenant-abc:venue:123');
    });

    it('should generate global key when no tenant context', () => {
      cacheService.setTenantContext(null);
      const key = (cacheService as any).getCacheKey('venue:123');
      expect(key).toBe('venue:global:venue:123');
    });

    it('should use provided tenantId over context', () => {
      cacheService.setTenantContext('context-tenant');
      const key = (cacheService as any).getCacheKey('venue:123', 'override-tenant');
      expect(key).toBe('venue:tenant:override-tenant:venue:123');
    });
  });

  describe('get()', () => {
    it('should return parsed JSON data on cache hit', async () => {
      const testData = { id: '123', name: 'Test Venue' };
      redisMock.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cacheService.get('venue:123');

      expect(result).toEqual(testData);
      expect(redisMock.get).toHaveBeenCalled();
    });

    it('should return null on cache miss', async () => {
      redisMock.get.mockResolvedValue(null);

      const result = await cacheService.get('venue:nonexistent');

      expect(result).toBeNull();
    });

    it('should throw CacheError on Redis error', async () => {
      redisMock.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(cacheService.get('venue:123')).rejects.toThrow('Cache get failed');
    });

    it('should use tenant-scoped key', async () => {
      cacheService.setTenantContext('tenant-xyz');
      redisMock.get.mockResolvedValue(null);

      await cacheService.get('venue:123');

      expect(redisMock.get).toHaveBeenCalledWith('venue:tenant:tenant-xyz:venue:123');
    });

    it('should accept explicit tenantId parameter', async () => {
      redisMock.get.mockResolvedValue(null);

      await cacheService.get('venue:123', 'explicit-tenant');

      expect(redisMock.get).toHaveBeenCalledWith('venue:tenant:explicit-tenant:venue:123');
    });
  });

  describe('set()', () => {
    it('should stringify and store data with default TTL', async () => {
      const testData = { id: '123', name: 'Test Venue' };
      redisMock.setex.mockResolvedValue('OK');

      await cacheService.set('venue:123', testData);

      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.any(String),
        3600, // default TTL
        JSON.stringify(testData)
      );
    });

    it('should use provided TTL', async () => {
      const testData = { id: '123' };
      redisMock.setex.mockResolvedValue('OK');

      await cacheService.set('venue:123', testData, 300);

      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.any(String),
        300,
        JSON.stringify(testData)
      );
    });

    it('should throw CacheError on Redis error', async () => {
      redisMock.setex.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.set('venue:123', {})).rejects.toThrow('Cache set failed');
    });

    it('should use tenant-scoped key', async () => {
      cacheService.setTenantContext('tenant-abc');
      redisMock.setex.mockResolvedValue('OK');

      await cacheService.set('venue:123', { test: true });

      expect(redisMock.setex).toHaveBeenCalledWith(
        'venue:tenant:tenant-abc:venue:123',
        3600,
        expect.any(String)
      );
    });
  });

  describe('del()', () => {
    it('should delete key from cache', async () => {
      redisMock.del.mockResolvedValue(1);

      await cacheService.del('venue:123');

      expect(redisMock.del).toHaveBeenCalled();
    });

    it('should throw CacheError on Redis error', async () => {
      redisMock.del.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.del('venue:123')).rejects.toThrow('Cache delete failed');
    });

    it('should use tenant-scoped key', async () => {
      cacheService.setTenantContext('tenant-del');
      redisMock.del.mockResolvedValue(1);

      await cacheService.del('venue:123');

      expect(redisMock.del).toHaveBeenCalledWith('venue:tenant:tenant-del:venue:123');
    });
  });

  describe('clearVenueCache()', () => {
    it('should clear venue cache with tenant-scoped patterns', async () => {
      cacheService.setTenantContext('tenant-clear');
      redisMock.scan.mockResolvedValue(['0', []]);

      await cacheService.clearVenueCache('venue-123');

      // Should have called scan with tenant-scoped patterns
      expect(redisMock.scan).toHaveBeenCalled();
    });

    it('should clear venue cache without tenant (legacy pattern)', async () => {
      cacheService.setTenantContext(null);
      redisMock.scan.mockResolvedValue(['0', []]);

      await cacheService.clearVenueCache('venue-123');

      expect(redisMock.scan).toHaveBeenCalled();
    });

    it('should accept explicit tenantId', async () => {
      redisMock.scan.mockResolvedValue(['0', []]);

      await cacheService.clearVenueCache('venue-123', 'explicit-tenant');

      expect(redisMock.scan).toHaveBeenCalled();
    });

    it('should throw CacheError on scan failure', async () => {
      redisMock.scan.mockRejectedValue(new Error('Scan failed'));

      await expect(cacheService.clearVenueCache('venue-123')).rejects.toThrow('Cache clear failed');
    });

    it('should delete keys in batches when found', async () => {
      const mockKeys = Array.from({ length: 150 }, (_, i) => `key-${i}`);
      redisMock.scan
        .mockResolvedValueOnce(['1', mockKeys.slice(0, 100)])
        .mockResolvedValueOnce(['0', mockKeys.slice(100)]);
      redisMock.del.mockResolvedValue(100);

      cacheService.setTenantContext('tenant-batch');
      await cacheService.clearVenueCache('venue-123');

      // Should delete in batches of 100
      expect(redisMock.del).toHaveBeenCalled();
    });
  });

  describe('clearTenantVenueCache()', () => {
    it('should clear all venue cache for a tenant', async () => {
      redisMock.scan.mockResolvedValue(['0', []]);

      await cacheService.clearTenantVenueCache('tenant-xyz');

      expect(redisMock.scan).toHaveBeenCalled();
    });

    it('should throw CacheError on failure', async () => {
      redisMock.scan.mockRejectedValue(new Error('Scan failed'));

      await expect(cacheService.clearTenantVenueCache('tenant-xyz')).rejects.toThrow('Cache clear failed');
    });
  });

  describe('getOrSet()', () => {
    it('should return cached value if exists', async () => {
      const cachedData = { id: '123', cached: true };
      redisMock.get.mockResolvedValue(JSON.stringify(cachedData));
      const fetchFn = jest.fn();

      const result = await cacheService.getOrSet('venue:123', fetchFn);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not in cache', async () => {
      const fetchedData = { id: '123', fetched: true };
      redisMock.get.mockResolvedValue(null);
      redisMock.setex.mockResolvedValue('OK');
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);

      const result = await cacheService.getOrSet('venue:123', fetchFn);

      expect(result).toEqual(fetchedData);
      expect(fetchFn).toHaveBeenCalledTimes(1);
      // Note: set is fire-and-forget, so we check it was called
      expect(redisMock.setex).toHaveBeenCalled();
    });

    it('should use default TTL', async () => {
      redisMock.get.mockResolvedValue(null);
      redisMock.setex.mockResolvedValue('OK');
      const fetchFn = jest.fn().mockResolvedValue({ data: true });

      await cacheService.getOrSet('venue:123', fetchFn);

      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.any(String),
        3600,
        expect.any(String)
      );
    });

    it('should use provided TTL', async () => {
      redisMock.get.mockResolvedValue(null);
      redisMock.setex.mockResolvedValue('OK');
      const fetchFn = jest.fn().mockResolvedValue({ data: true });

      await cacheService.getOrSet('venue:123', fetchFn, 600);

      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.any(String),
        600,
        expect.any(String)
      );
    });

    it('should still return data even if caching fails', async () => {
      const fetchedData = { id: '123' };
      redisMock.get.mockResolvedValue(null);
      redisMock.setex.mockRejectedValue(new Error('Cache error'));
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);

      // Should not throw, just log error
      const result = await cacheService.getOrSet('venue:123', fetchFn);

      expect(result).toEqual(fetchedData);
    });
  });

  describe('warmCache()', () => {
    it('should cache multiple entries', async () => {
      redisMock.setex.mockResolvedValue('OK');
      const entries = [
        { key: 'venue:1', value: { id: '1' } },
        { key: 'venue:2', value: { id: '2' } },
        { key: 'venue:3', value: { id: '3' } },
      ];

      await cacheService.warmCache(entries);

      expect(redisMock.setex).toHaveBeenCalledTimes(3);
    });

    it('should use default TTL for entries without TTL', async () => {
      redisMock.setex.mockResolvedValue('OK');
      const entries = [{ key: 'venue:1', value: { id: '1' } }];

      await cacheService.warmCache(entries);

      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.any(String),
        3600,
        expect.any(String)
      );
    });

    it('should use provided TTL for entries', async () => {
      redisMock.setex.mockResolvedValue('OK');
      const entries = [{ key: 'venue:1', value: { id: '1' }, ttl: 120 }];

      await cacheService.warmCache(entries);

      expect(redisMock.setex).toHaveBeenCalledWith(
        expect.any(String),
        120,
        expect.any(String)
      );
    });

    it('should continue on individual entry failure', async () => {
      redisMock.setex
        .mockResolvedValueOnce('OK')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('OK');
      const entries = [
        { key: 'venue:1', value: { id: '1' } },
        { key: 'venue:2', value: { id: '2' } },
        { key: 'venue:3', value: { id: '3' } },
      ];

      // Should not throw
      await cacheService.warmCache(entries);

      expect(redisMock.setex).toHaveBeenCalledTimes(3);
    });
  });

  describe('invalidateKeys()', () => {
    it('should delete multiple keys', async () => {
      redisMock.del.mockResolvedValue(1);
      const keys = ['venue:1', 'venue:2', 'venue:3'];

      await cacheService.invalidateKeys(keys);

      expect(redisMock.del).toHaveBeenCalledTimes(3);
    });

    it('should continue on individual key failure', async () => {
      redisMock.del
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(1);
      const keys = ['venue:1', 'venue:2', 'venue:3'];

      await cacheService.invalidateKeys(keys);

      expect(redisMock.del).toHaveBeenCalledTimes(3);
    });

    it('should handle empty keys array', async () => {
      await cacheService.invalidateKeys([]);

      expect(redisMock.del).not.toHaveBeenCalled();
    });
  });

  describe('exists()', () => {
    it('should return true if key exists', async () => {
      redisMock.exists.mockResolvedValue(1);

      const result = await cacheService.exists('venue:123');

      expect(result).toBe(true);
    });

    it('should return false if key does not exist', async () => {
      redisMock.exists.mockResolvedValue(0);

      const result = await cacheService.exists('venue:nonexistent');

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      redisMock.exists.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.exists('venue:123');

      expect(result).toBe(false);
    });

    it('should use tenant-scoped key', async () => {
      cacheService.setTenantContext('tenant-exists');
      redisMock.exists.mockResolvedValue(1);

      await cacheService.exists('venue:123');

      expect(redisMock.exists).toHaveBeenCalledWith('venue:tenant:tenant-exists:venue:123');
    });
  });

  describe('ttl()', () => {
    it('should return TTL for existing key', async () => {
      redisMock.ttl.mockResolvedValue(1800);

      const result = await cacheService.ttl('venue:123');

      expect(result).toBe(1800);
    });

    it('should return -2 for non-existent key', async () => {
      redisMock.ttl.mockResolvedValue(-2);

      const result = await cacheService.ttl('venue:nonexistent');

      expect(result).toBe(-2);
    });

    it('should return -1 for key without TTL', async () => {
      redisMock.ttl.mockResolvedValue(-1);

      const result = await cacheService.ttl('venue:no-ttl');

      expect(result).toBe(-1);
    });

    it('should return -1 on Redis error', async () => {
      redisMock.ttl.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.ttl('venue:123');

      expect(result).toBe(-1);
    });

    it('should use tenant-scoped key', async () => {
      cacheService.setTenantContext('tenant-ttl');
      redisMock.ttl.mockResolvedValue(600);

      await cacheService.ttl('venue:123');

      expect(redisMock.ttl).toHaveBeenCalledWith('venue:tenant:tenant-ttl:venue:123');
    });
  });

  describe('Security: Tenant Isolation (SR1)', () => {
    it('should never allow cross-tenant cache access', async () => {
      // Set up data for tenant A
      cacheService.setTenantContext('tenant-A');
      redisMock.setex.mockResolvedValue('OK');
      await cacheService.set('venue:123', { secret: 'tenant-A-data' });

      const tenantAKey = redisMock.setex.mock.calls[0][0];
      expect(tenantAKey).toContain('tenant-A');

      // Switch to tenant B
      cacheService.setTenantContext('tenant-B');
      redisMock.get.mockResolvedValue(null);
      await cacheService.get('venue:123');

      // Should request different key
      const tenantBKey = redisMock.get.mock.calls[0][0];
      expect(tenantBKey).toContain('tenant-B');
      expect(tenantBKey).not.toEqual(tenantAKey);
    });

    it('should use explicit tenantId over context for security', async () => {
      cacheService.setTenantContext('context-tenant');
      redisMock.get.mockResolvedValue(null);

      // Explicit tenantId should take precedence
      await cacheService.get('venue:123', 'explicit-tenant');

      expect(redisMock.get).toHaveBeenCalledWith('venue:tenant:explicit-tenant:venue:123');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty string values', async () => {
      redisMock.get.mockResolvedValue('""');

      const result = await cacheService.get('empty-string');

      expect(result).toBe('');
    });

    it('should handle boolean false values', async () => {
      redisMock.get.mockResolvedValue('false');

      const result = await cacheService.get('boolean-false');

      expect(result).toBe(false);
    });

    it('should handle numeric zero values', async () => {
      redisMock.get.mockResolvedValue('0');

      const result = await cacheService.get('numeric-zero');

      expect(result).toBe(0);
    });

    it('should handle arrays', async () => {
      const array = [1, 2, 3, 'test'];
      redisMock.get.mockResolvedValue(JSON.stringify(array));

      const result = await cacheService.get('array-key');

      expect(result).toEqual(array);
    });

    it('should handle deeply nested objects', async () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };
      redisMock.get.mockResolvedValue(JSON.stringify(nested));

      const result = await cacheService.get('nested-key');

      expect(result).toEqual(nested);
    });

    it('should handle special characters in keys', async () => {
      redisMock.get.mockResolvedValue(null);

      await cacheService.get('venue:with:colons:and-dashes_and_underscores');

      expect(redisMock.get).toHaveBeenCalled();
    });
  });
});
