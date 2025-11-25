import { CacheService, initializeCache } from '../../../src/services/cache.service';
import { logger } from '../../../src/utils/logger';
import { withCircuitBreaker } from '../../../src/utils/circuitBreaker';
import { withRetry } from '../../../src/utils/retry';
import { CacheError } from '../../../src/utils/errors';
import Redis from 'ioredis';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('ioredis');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/utils/circuitBreaker');
jest.mock('../../../src/utils/retry');

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Redis
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      scan: jest.fn(),
      ttl: jest.fn(),
    } as any;

    // Mock withRetry to just execute the function
    (withRetry as jest.Mock).mockImplementation((fn: any) => fn());

    // Mock withCircuitBreaker to just execute the function
    (withCircuitBreaker as jest.Mock).mockImplementation((fn: any) => fn);

    // Create service instance
    cacheService = new CacheService(mockRedis);
  });

  // =============================================================================
  // constructor() - 3 test cases
  // =============================================================================

  describe('constructor()', () => {
    it('should initialize with Redis instance', () => {
      expect(cacheService).toBeDefined();
      expect((cacheService as any).redis).toBe(mockRedis);
    });

    it('should set default TTL to 3600 seconds', () => {
      expect((cacheService as any).defaultTTL).toBe(3600);
    });

    it('should set key prefix to venue:', () => {
      expect((cacheService as any).keyPrefix).toBe('venue:');
    });
  });

  // =============================================================================
  // get() - 8 test cases
  // =============================================================================

  describe('get()', () => {
    it('should get value from cache with prefix', async () => {
      const mockData = { id: '123', name: 'Test' };
      mockRedis.get.mockResolvedValue(JSON.stringify(mockData));

      const result = await cacheService.get('test-key');

      expect(result).toEqual(mockData);
      expect(mockRedis.get).toHaveBeenCalledWith('venue:test-key');
    });

    it('should parse JSON data correctly', async () => {
      const complexData = {
        id: '123',
        nested: { field: 'value' },
        array: [1, 2, 3],
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(complexData));

      const result = await cacheService.get('complex');

      expect(result).toEqual(complexData);
    });

    it('should return null for cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get('missing-key');

      expect(result).toBeNull();
    });

    it('should log cache hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'test' }));

      await cacheService.get('test-key');

      expect(logger.debug).toHaveBeenCalledWith(
        { key: 'venue:test-key' },
        'Cache hit'
      );
    });

    it('should log cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      await cacheService.get('missing-key');

      expect(logger.debug).toHaveBeenCalledWith(
        { key: 'venue:missing-key' },
        'Cache miss'
      );
    });

    it('should throw CacheError on Redis error', async () => {
      const error = new Error('Redis error');
      mockRedis.get.mockRejectedValue(error);

      await expect(cacheService.get('test-key')).rejects.toThrow(CacheError);
    });

    it('should log error on failure', async () => {
      const error = new Error('Redis error');
      mockRedis.get.mockRejectedValue(error);

      await expect(cacheService.get('test-key')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { error, key: 'test-key' },
        'Cache get error'
      );
    });

    it('should handle empty string value', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(''));

      const result = await cacheService.get('empty');

      expect(result).toBe('');
    });
  });

  // =============================================================================
  // set() - 8 test cases
  // =============================================================================

  describe('set()', () => {
    it('should set value in cache with prefix', async () => {
      const data = { id: '123', name: 'Test' };
      mockRedis.setex.mockResolvedValue('OK');

      await cacheService.set('test-key', data);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:test-key',
        3600,
        JSON.stringify(data)
      );
    });

    it('should use custom TTL when provided', async () => {
      const data = { test: 'data' };
      const customTTL = 1800;
      mockRedis.setex.mockResolvedValue('OK');

      await cacheService.set('test-key', data, customTTL);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:test-key',
        customTTL,
        JSON.stringify(data)
      );
    });

    it('should use default TTL when not provided', async () => {
      const data = { test: 'data' };
      mockRedis.setex.mockResolvedValue('OK');

      await cacheService.set('test-key', data);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:test-key',
        3600,
        expect.any(String)
      );
    });

    it('should serialize complex objects', async () => {
      const complexData = {
        nested: { deep: { value: 123 } },
        array: [1, 2, 3],
        date: new Date('2024-01-01'),
      };
      mockRedis.setex.mockResolvedValue('OK');

      await cacheService.set('complex', complexData);

      const serialized = JSON.stringify(complexData);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:complex',
        3600,
        serialized
      );
    });

    it('should log cache set', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await cacheService.set('test-key', { data: 'test' }, 1800);

      expect(logger.debug).toHaveBeenCalledWith(
        { key: 'venue:test-key', ttl: 1800 },
        'Cache set'
      );
    });

    it('should throw CacheError on Redis error', async () => {
      const error = new Error('Redis error');
      mockRedis.setex.mockRejectedValue(error);

      await expect(cacheService.set('test-key', { data: 'test' })).rejects.toThrow(
        CacheError
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Redis error');
      mockRedis.setex.mockRejectedValue(error);

      await expect(cacheService.set('test-key', { data: 'test' })).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { error, key: 'test-key' },
        'Cache set error'
      );
    });

    it('should handle null values', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      await cacheService.set('null-key', null);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:null-key',
        3600,
        'null'
      );
    });
  });

  // =============================================================================
  // del() - 5 test cases
  // =============================================================================

  describe('del()', () => {
    it('should delete key from cache with prefix', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cacheService.del('test-key');

      expect(mockRedis.del).toHaveBeenCalledWith('venue:test-key');
    });

    it('should log cache delete', async () => {
      mockRedis.del.mockResolvedValue(1);

      await cacheService.del('test-key');

      expect(logger.debug).toHaveBeenCalledWith(
        { key: 'venue:test-key' },
        'Cache deleted'
      );
    });

    it('should throw CacheError on Redis error', async () => {
      const error = new Error('Redis error');
      mockRedis.del.mockRejectedValue(error);

      await expect(cacheService.del('test-key')).rejects.toThrow(CacheError);
    });

    it('should log error on failure', async () => {
      const error = new Error('Redis error');
      mockRedis.del.mockRejectedValue(error);

      await expect(cacheService.del('test-key')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { error, key: 'test-key' },
        'Cache delete error'
      );
    });

    it('should handle deleting non-existent keys', async () => {
      mockRedis.del.mockResolvedValue(0);

      await expect(cacheService.del('non-existent')).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // clearVenueCache() - 5 test cases
  // =============================================================================

  describe('clearVenueCache()', () => {
    beforeEach(() => {
      mockRedis.scan.mockResolvedValue(['0', []]);
    });

    it('should clear all venue-related cache patterns', async () => {
      const venueId = 'venue-123';

      await cacheService.clearVenueCache(venueId);

      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `venue:${venueId}`,
        'COUNT',
        100
      );
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `venue:${venueId}:*`,
        'COUNT',
        100
      );
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `venue:list:*${venueId}*`,
        'COUNT',
        100
      );
      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `venue:tenant:*:${venueId}`,
        'COUNT',
        100
      );
    });

    it('should log success', async () => {
      await cacheService.clearVenueCache('venue-123');

      expect(logger.info).toHaveBeenCalledWith(
        { venueId: 'venue-123' },
        'Venue cache cleared'
      );
    });

    it('should throw CacheError on failure', async () => {
      const error = new Error('Scan failed');
      mockRedis.scan.mockRejectedValue(error);

      await expect(cacheService.clearVenueCache('venue-123')).rejects.toThrow(
        CacheError
      );
    });

    it('should log error on failure', async () => {
      const error = new Error('Scan failed');
      mockRedis.scan.mockRejectedValue(error);

      await expect(cacheService.clearVenueCache('venue-123')).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { error, venueId: 'venue-123' },
        'Failed to clear venue cache'
      );
    });

    it('should delete found keys in batches', async () => {
      const keys = Array.from({ length: 250 }, (_, i) => `key-${i}`);
      mockRedis.scan.mockResolvedValueOnce(['0', keys]);
      mockRedis.del.mockResolvedValue(100);

      await cacheService.clearVenueCache('venue-123');

      // Should be called 3 times (250 keys / 100 batch size = 3 batches)
      expect(mockRedis.del).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // clearTenantVenueCache() - 4 test cases
  // =============================================================================

  describe('clearTenantVenueCache()', () => {
    beforeEach(() => {
      mockRedis.scan.mockResolvedValue(['0', []]);
    });

    it('should clear tenant venue cache pattern', async () => {
      const tenantId = 'tenant-456';

      await cacheService.clearTenantVenueCache(tenantId);

      expect(mockRedis.scan).toHaveBeenCalledWith(
        '0',
        'MATCH',
        `venue:tenant:${tenantId}:*`,
        'COUNT',
        100
      );
    });

    it('should log success', async () => {
      await cacheService.clearTenantVenueCache('tenant-456');

      expect(logger.info).toHaveBeenCalledWith(
        { tenantId: 'tenant-456' },
        'Tenant venue cache cleared'
      );
    });

    it('should throw CacheError on failure', async () => {
      const error = new Error('Scan failed');
      mockRedis.scan.mockRejectedValue(error);

      await expect(
        cacheService.clearTenantVenueCache('tenant-456')
      ).rejects.toThrow(CacheError);
    });

    it('should log error on failure', async () => {
      const error = new Error('Scan failed');
      mockRedis.scan.mockRejectedValue(error);

      await expect(
        cacheService.clearTenantVenueCache('tenant-456')
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        { error, tenantId: 'tenant-456' },
        'Failed to clear tenant venue cache'
      );
    });
  });

  // =============================================================================
  // getOrSet() - 6 test cases
  // =============================================================================

  describe('getOrSet()', () => {
    it('should return cached value if exists', async () => {
      const cachedData = { id: '123', name: 'Cached' };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedData));
      const fetchFn = jest.fn();

      const result = await cacheService.getOrSet('test-key', fetchFn);

      expect(result).toEqual(cachedData);
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('should fetch and cache if not in cache', async () => {
      const fetchedData = { id: '456', name: 'Fetched' };
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);

      const result = await cacheService.getOrSet('test-key', fetchFn);

      expect(result).toEqual(fetchedData);
      expect(fetchFn).toHaveBeenCalled();
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it('should use custom TTL when provided', async () => {
      const fetchedData = { data: 'test' };
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockResolvedValue('OK');
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);
      const customTTL = 1800;

      await cacheService.getOrSet('test-key', fetchFn, customTTL);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:test-key',
        customTTL,
        JSON.stringify(fetchedData)
      );
    });

    it('should return fetched data even if caching fails', async () => {
      const fetchedData = { data: 'test' };
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(new Error('Cache set failed'));
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);

      const result = await cacheService.getOrSet('test-key', fetchFn);

      expect(result).toEqual(fetchedData);
    });

    it('should log error if caching fails but not throw', async () => {
      const fetchedData = { data: 'test' };
      const cacheError = new Error('Cache set failed');
      mockRedis.get.mockResolvedValue(null);
      mockRedis.setex.mockRejectedValue(cacheError);
      const fetchFn = jest.fn().mockResolvedValue(fetchedData);

      await cacheService.getOrSet('test-key', fetchFn);

      // Wait for promise to settle
      await new Promise(resolve => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ key: 'test-key' }),
        'Failed to cache after fetch'
      );
    });

    it('should propagate fetch function errors', async () => {
      const fetchError = new Error('Fetch failed');
      mockRedis.get.mockResolvedValue(null);
      const fetchFn = jest.fn().mockRejectedValue(fetchError);

      await expect(cacheService.getOrSet('test-key', fetchFn)).rejects.toThrow(
        'Fetch failed'
      );
    });
  });

  // =============================================================================
  // warmCache() - 4 test cases
  // =============================================================================

  describe('warmCache()', () => {
    it('should warm cache with multiple entries', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const entries = [
        { key: 'key1', value: { data: 'test1' } },
        { key: 'key2', value: { data: 'test2' } },
        { key: 'key3', value: { data: 'test3' } },
      ];

      await cacheService.warmCache(entries);

      expect(mockRedis.setex).toHaveBeenCalledTimes(3);
    });

    it('should use custom TTL for entries when provided', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const entries = [
        { key: 'key1', value: { data: 'test1' }, ttl: 1800 },
      ];

      await cacheService.warmCache(entries);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:key1',
        1800,
        JSON.stringify({ data: 'test1' })
      );
    });

    it('should use default TTL when not provided', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      const entries = [
        { key: 'key1', value: { data: 'test1' } },
      ];

      await cacheService.warmCache(entries);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'venue:key1',
        3600,
        JSON.stringify({ data: 'test1' })
      );
    });

    it('should log success and handle partial failures', async () => {
      mockRedis.setex
        .mockResolvedValueOnce('OK')
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce('OK');

      const entries = [
        { key: 'key1', value: { data: 'test1' } },
        { key: 'key2', value: { data: 'test2' } },
        { key: 'key3', value: { data: 'test3' } },
      ];

      await cacheService.warmCache(entries);

      expect(logger.info).toHaveBeenCalledWith(
        { count: 3 },
        'Cache warmed'
      );
    });
  });

  // =============================================================================
  // invalidateKeys() - 3 test cases
  // =============================================================================

  describe('invalidateKeys()', () => {
    it('should invalidate multiple keys', async () => {
      mockRedis.del.mockResolvedValue(1);
      const keys = ['key1', 'key2', 'key3'];

      await cacheService.invalidateKeys(keys);

      expect(mockRedis.del).toHaveBeenCalledTimes(3);
      expect(mockRedis.del).toHaveBeenCalledWith('venue:key1');
      expect(mockRedis.del).toHaveBeenCalledWith('venue:key2');
      expect(mockRedis.del).toHaveBeenCalledWith('venue:key3');
    });

    it('should log count of invalidated keys', async () => {
      mockRedis.del.mockResolvedValue(1);
      const keys = ['key1', 'key2'];

      await cacheService.invalidateKeys(keys);

      expect(logger.debug).toHaveBeenCalledWith(
        { count: 2 },
        'Keys invalidated'
      );
    });

    it('should handle partial failures gracefully', async () => {
      mockRedis.del
        .mockResolvedValueOnce(1)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(1);

      const keys = ['key1', 'key2', 'key3'];

      await expect(cacheService.invalidateKeys(keys)).resolves.not.toThrow();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // exists() - 4 test cases
  // =============================================================================

  describe('exists()', () => {
    it('should return true if key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('venue:test-key');
    });

    it('should return false if key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cacheService.exists('missing-key');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const error = new Error('Redis error');
      mockRedis.exists.mockRejectedValue(error);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log error on failure', async () => {
      const error = new Error('Redis error');
      mockRedis.exists.mockRejectedValue(error);

      await cacheService.exists('test-key');

      expect(logger.error).toHaveBeenCalledWith(
        { error, key: 'test-key' },
        'Cache exists check error'
      );
    });
  });

  // =============================================================================
  // ttl() - 4 test cases
  // =============================================================================

  describe('ttl()', () => {
    it('should return TTL for existing key', async () => {
      mockRedis.ttl.mockResolvedValue(3600);

      const result = await cacheService.ttl('test-key');

      expect(result).toBe(3600);
      expect(mockRedis.ttl).toHaveBeenCalledWith('venue:test-key');
    });

    it('should return -1 for key without TTL', async () => {
      mockRedis.ttl.mockResolvedValue(-1);

      const result = await cacheService.ttl('persistent-key');

      expect(result).toBe(-1);
    });

    it('should return -1 on error', async () => {
      const error = new Error('Redis error');
      mockRedis.ttl.mockRejectedValue(error);

      const result = await cacheService.ttl('test-key');

      expect(result).toBe(-1);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should log error on failure', async () => {
      const error = new Error('Redis error');
      mockRedis.ttl.mockRejectedValue(error);

      await cacheService.ttl('test-key');

      expect(logger.error).toHaveBeenCalledWith(
        { error, key: 'test-key' },
        'Failed to get TTL'
      );
    });
  });

  // =============================================================================
  // initializeCache() - 2 test cases
  // =============================================================================

  describe('initializeCache()', () => {
    it('should create cache instance', () => {
      const redis = {} as Redis;
      const cache = initializeCache(redis);

      expect(cache).toBeInstanceOf(CacheService);
    });

    it('should return same instance on multiple calls', () => {
      const redis = {} as Redis;
      const cache1 = initializeCache(redis);
      const cache2 = initializeCache(redis);

      expect(cache1).toBe(cache2);
    });
  });
});
