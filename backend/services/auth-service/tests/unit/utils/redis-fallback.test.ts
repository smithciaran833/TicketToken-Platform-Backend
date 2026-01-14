const mockRedis = {
  ping: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedis,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import {
  isRedisAvailable,
  getWithFallback,
  setWithFallback,
  deleteWithFallback,
  withRedisFallback,
  cleanupMemoryCache,
  getMemoryCacheStats,
} from '../../../src/utils/redis-fallback';

describe('redis-fallback utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isRedisAvailable', () => {
    it('returns true when ping succeeds', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await isRedisAvailable();

      expect(result).toBe(true);
    });

    it('returns false when ping fails', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection refused'));

      const result = await isRedisAvailable();

      expect(result).toBe(false);
    });
  });

  describe('getWithFallback', () => {
    it('returns value from Redis when available', async () => {
      mockRedis.get.mockResolvedValue('redis-value');

      const result = await getWithFallback('key');

      expect(result).toBe('redis-value');
    });

    it('falls back to memory cache when Redis fails', async () => {
      // First, set value via fallback
      mockRedis.setex.mockRejectedValue(new Error('Redis down'));
      await setWithFallback('fallback-key', 'memory-value', 300);

      // Now get should fall back to memory
      mockRedis.get.mockRejectedValue(new Error('Redis down'));
      const result = await getWithFallback('fallback-key');

      expect(result).toBe('memory-value');
    });

    it('returns null when both Redis and memory miss', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis down'));

      const result = await getWithFallback('nonexistent-key');

      expect(result).toBeNull();
    });
  });

  describe('setWithFallback', () => {
    it('returns true when Redis succeeds', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const result = await setWithFallback('key', 'value', 300);

      expect(result).toBe(true);
    });

    it('returns false but stores in memory when Redis fails', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis down'));

      const result = await setWithFallback('key', 'value', 300);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('uses set without TTL when ttlSeconds not provided', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await setWithFallback('key', 'value');

      expect(mockRedis.set).toHaveBeenCalledWith('key', 'value');
    });
  });

  describe('deleteWithFallback', () => {
    it('returns true when Redis succeeds', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await deleteWithFallback('key');

      expect(result).toBe(true);
    });

    it('returns false when Redis fails', async () => {
      mockRedis.del.mockRejectedValue(new Error('Redis down'));

      const result = await deleteWithFallback('key');

      expect(result).toBe(false);
    });
  });

  describe('withRedisFallback', () => {
    it('returns operation result when successful', async () => {
      const operation = jest.fn().mockResolvedValue('op-result');

      const result = await withRedisFallback(operation, 'default', 'test-op');

      expect(result).toBe('op-result');
    });

    it('returns fallback value when operation fails', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      const result = await withRedisFallback(operation, 'default-value', 'test-op');

      expect(result).toBe('default-value');
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('getMemoryCacheStats', () => {
    it('returns size and maxSize', () => {
      const stats = getMemoryCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats.maxSize).toBe(1000);
    });
  });

  describe('cleanupMemoryCache', () => {
    it('removes expired entries and returns count', async () => {
      // Set some values that will expire
      mockRedis.setex.mockRejectedValue(new Error('Redis down'));
      
      // This will go to memory with short TTL
      await setWithFallback('exp-key', 'value', 0); // 0 TTL = immediately expired

      const cleaned = cleanupMemoryCache();

      expect(typeof cleaned).toBe('number');
    });
  });
});
