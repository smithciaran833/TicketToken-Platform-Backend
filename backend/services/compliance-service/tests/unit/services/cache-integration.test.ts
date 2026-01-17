/**
 * Unit Tests for Cache Integration
 *
 * Tests service cache wrapper functions
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockCacheGet = jest.fn();
const mockCacheSet = jest.fn();
const mockCacheDelete = jest.fn();
const mockCacheFlush = jest.fn();
const mockGetStats = jest.fn();

const mockCacheService = {
  get: mockCacheGet,
  set: mockCacheSet,
  delete: mockCacheDelete,
  flush: mockCacheFlush,
  getStats: mockGetStats
};

const mockCacheMiddleware = jest.fn();
const mockCacheStrategies = { staleWhileRevalidate: jest.fn() };
const mockCacheInvalidator = { invalidate: jest.fn() };

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => ({
    service: mockCacheService,
    middleware: mockCacheMiddleware,
    strategies: mockCacheStrategies,
    invalidator: mockCacheInvalidator
  }))
}));

// Import module under test AFTER mocks
import { 
  cache, 
  serviceCache, 
  cacheMiddleware, 
  cacheStrategies, 
  cacheInvalidator,
  getCacheStats 
} from '../../../src/services/cache-integration';

// =============================================================================
// TESTS
// =============================================================================

describe('Cache Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================================
  // Exports Tests
  // ===========================================================================

  describe('exports', () => {
    it('should export cache service', () => {
      expect(cache).toBeDefined();
    });

    it('should export cacheMiddleware', () => {
      expect(cacheMiddleware).toBeDefined();
    });

    it('should export cacheStrategies', () => {
      expect(cacheStrategies).toBeDefined();
    });

    it('should export cacheInvalidator', () => {
      expect(cacheInvalidator).toBeDefined();
    });

    it('should export serviceCache', () => {
      expect(serviceCache).toBeDefined();
      expect(typeof serviceCache.get).toBe('function');
      expect(typeof serviceCache.set).toBe('function');
      expect(typeof serviceCache.delete).toBe('function');
      expect(typeof serviceCache.flush).toBe('function');
    });
  });

  // ===========================================================================
  // serviceCache.get Tests
  // ===========================================================================

  describe('serviceCache.get', () => {
    it('should call cache.get with correct parameters', async () => {
      mockCacheGet.mockResolvedValue('cached-value');

      const result = await serviceCache.get('test-key');

      expect(mockCacheGet).toHaveBeenCalledWith(
        'test-key',
        undefined,
        { ttl: 300, level: 'BOTH' }
      );
      expect(result).toBe('cached-value');
    });

    it('should pass fetcher function if provided', async () => {
      const fetcher = jest.fn().mockResolvedValue('fetched-value');
      mockCacheGet.mockResolvedValue('fetched-value');

      await serviceCache.get('test-key', fetcher);

      expect(mockCacheGet).toHaveBeenCalledWith(
        'test-key',
        fetcher,
        { ttl: 300, level: 'BOTH' }
      );
    });

    it('should use custom TTL if provided', async () => {
      mockCacheGet.mockResolvedValue('value');

      await serviceCache.get('test-key', undefined, 600);

      expect(mockCacheGet).toHaveBeenCalledWith(
        'test-key',
        undefined,
        { ttl: 600, level: 'BOTH' }
      );
    });

    it('should use default TTL of 300 seconds', async () => {
      mockCacheGet.mockResolvedValue('value');

      await serviceCache.get('test-key');

      expect(mockCacheGet).toHaveBeenCalledWith(
        'test-key',
        undefined,
        expect.objectContaining({ ttl: 300 })
      );
    });

    it('should use BOTH cache level', async () => {
      mockCacheGet.mockResolvedValue('value');

      await serviceCache.get('test-key');

      expect(mockCacheGet).toHaveBeenCalledWith(
        'test-key',
        undefined,
        expect.objectContaining({ level: 'BOTH' })
      );
    });
  });

  // ===========================================================================
  // serviceCache.set Tests
  // ===========================================================================

  describe('serviceCache.set', () => {
    it('should call cache.set with correct parameters', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await serviceCache.set('test-key', { data: 'test' });

      expect(mockCacheSet).toHaveBeenCalledWith(
        'test-key',
        { data: 'test' },
        { ttl: 300, level: 'BOTH' }
      );
    });

    it('should use custom TTL if provided', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await serviceCache.set('test-key', 'value', 1800);

      expect(mockCacheSet).toHaveBeenCalledWith(
        'test-key',
        'value',
        { ttl: 1800, level: 'BOTH' }
      );
    });

    it('should use default TTL of 300 seconds', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      await serviceCache.set('test-key', 'value');

      expect(mockCacheSet).toHaveBeenCalledWith(
        'test-key',
        'value',
        expect.objectContaining({ ttl: 300 })
      );
    });

    it('should handle various value types', async () => {
      mockCacheSet.mockResolvedValue(undefined);

      // Object
      await serviceCache.set('key1', { foo: 'bar' });
      expect(mockCacheSet).toHaveBeenCalledWith('key1', { foo: 'bar' }, expect.any(Object));

      // Array
      await serviceCache.set('key2', [1, 2, 3]);
      expect(mockCacheSet).toHaveBeenCalledWith('key2', [1, 2, 3], expect.any(Object));

      // String
      await serviceCache.set('key3', 'string-value');
      expect(mockCacheSet).toHaveBeenCalledWith('key3', 'string-value', expect.any(Object));

      // Number
      await serviceCache.set('key4', 42);
      expect(mockCacheSet).toHaveBeenCalledWith('key4', 42, expect.any(Object));
    });
  });

  // ===========================================================================
  // serviceCache.delete Tests
  // ===========================================================================

  describe('serviceCache.delete', () => {
    it('should call cache.delete with single key', async () => {
      mockCacheDelete.mockResolvedValue(undefined);

      await serviceCache.delete('test-key');

      expect(mockCacheDelete).toHaveBeenCalledWith('test-key');
    });

    it('should call cache.delete with array of keys', async () => {
      mockCacheDelete.mockResolvedValue(undefined);

      await serviceCache.delete(['key1', 'key2', 'key3']);

      expect(mockCacheDelete).toHaveBeenCalledWith(['key1', 'key2', 'key3']);
    });
  });

  // ===========================================================================
  // serviceCache.flush Tests
  // ===========================================================================

  describe('serviceCache.flush', () => {
    it('should call cache.flush', async () => {
      mockCacheFlush.mockResolvedValue(undefined);

      await serviceCache.flush();

      expect(mockCacheFlush).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // getCacheStats Tests
  // ===========================================================================

  describe('getCacheStats', () => {
    it('should call cache.getStats', () => {
      const mockStats = { hits: 100, misses: 20 };
      mockGetStats.mockReturnValue(mockStats);

      const stats = getCacheStats();

      expect(mockGetStats).toHaveBeenCalled();
      expect(stats).toEqual(mockStats);
    });
  });
});
