/**
 * Unit Tests for Redis Service
 * 
 * Tests Redis caching operations and connection management.
 */

// Mock dependencies before imports
jest.mock('@tickettoken/shared', () => ({
  getCacheManager: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  })),
}));

jest.mock('../../../src/config/redis', () => ({
  getRedis: jest.fn(() => ({
    incr: jest.fn(),
    expire: jest.fn(),
  })),
  initRedis: jest.fn(),
  closeRedisConnection: jest.fn(),
}));

import { RedisService } from '../../../src/services/redisService';
import { getCacheManager } from '@tickettoken/shared';
import { getRedis, initRedis, closeRedisConnection } from '../../../src/config/redis';

describe('RedisService', () => {
  let mockCacheManager: any;
  let mockRedisClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
    };

    mockRedisClient = {
      incr: jest.fn(),
      expire: jest.fn(),
    };

    (getCacheManager as jest.Mock).mockReturnValue(mockCacheManager);
    (getRedis as jest.Mock).mockReturnValue(mockRedisClient);
  });

  describe('initialize', () => {
    it('should initialize Redis connection', async () => {
      await RedisService.initialize();

      expect(initRedis).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close Redis connection', async () => {
      await RedisService.close();

      expect(closeRedisConnection).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should get value from cache', async () => {
      mockCacheManager.get.mockResolvedValue('cached-value');

      const result = await RedisService.get('test-key');

      expect(mockCacheManager.get).toHaveBeenCalledWith('test-key');
      expect(result).toBe('cached-value');
    });

    it('should return null for missing key', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await RedisService.get('missing-key');

      expect(result).toBeNull();
    });

    it('should handle complex keys', async () => {
      mockCacheManager.get.mockResolvedValue('data');

      await RedisService.get('payment:pi_123:status');

      expect(mockCacheManager.get).toHaveBeenCalledWith('payment:pi_123:status');
    });
  });

  describe('set', () => {
    it('should set value in cache', async () => {
      await RedisService.set('test-key', 'test-value');

      expect(mockCacheManager.set).toHaveBeenCalledWith('test-key', 'test-value', undefined);
    });

    it('should set value with TTL', async () => {
      await RedisService.set('ttl-key', 'ttl-value', 3600);

      expect(mockCacheManager.set).toHaveBeenCalledWith('ttl-key', 'ttl-value', 3600);
    });

    it('should handle JSON stringified values', async () => {
      const jsonValue = JSON.stringify({ foo: 'bar' });

      await RedisService.set('json-key', jsonValue, 300);

      expect(mockCacheManager.set).toHaveBeenCalledWith('json-key', jsonValue, 300);
    });
  });

  describe('del', () => {
    it('should delete key from cache', async () => {
      await RedisService.del('delete-key');

      expect(mockCacheManager.delete).toHaveBeenCalledWith('delete-key');
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockCacheManager.get.mockResolvedValue('some-value');

      const result = await RedisService.exists('existing-key');

      expect(result).toBe(true);
    });

    it('should return false when key does not exist', async () => {
      mockCacheManager.get.mockResolvedValue(null);

      const result = await RedisService.exists('non-existing-key');

      expect(result).toBe(false);
    });
  });

  describe('incr', () => {
    it('should increment counter', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      const result = await RedisService.incr('counter-key');

      expect(mockRedisClient.incr).toHaveBeenCalledWith('counter-key');
      expect(result).toBe(5);
    });

    it('should return 1 for new counter', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      const result = await RedisService.incr('new-counter');

      expect(result).toBe(1);
    });
  });

  describe('expire', () => {
    it('should set expiration on key', async () => {
      await RedisService.expire('expire-key', 3600);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('expire-key', 3600);
    });

    it('should handle short TTL values', async () => {
      await RedisService.expire('short-ttl', 60);

      expect(mockRedisClient.expire).toHaveBeenCalledWith('short-ttl', 60);
    });
  });

  describe('setex', () => {
    it('should set value with expiration', async () => {
      await RedisService.setex('setex-key', 3600, 'setex-value');

      expect(mockCacheManager.set).toHaveBeenCalledWith('setex-key', 'setex-value', 3600);
    });
  });

  describe('getClient', () => {
    it('should return raw Redis client', () => {
      const client = RedisService.getClient();

      expect(getRedis).toHaveBeenCalled();
      expect(client).toBe(mockRedisClient);
    });
  });

  describe('Error Handling', () => {
    it('should propagate get errors', async () => {
      mockCacheManager.get.mockRejectedValue(new Error('Redis error'));

      await expect(RedisService.get('error-key')).rejects.toThrow('Redis error');
    });

    it('should propagate set errors', async () => {
      mockCacheManager.set.mockRejectedValue(new Error('Set failed'));

      await expect(RedisService.set('key', 'value')).rejects.toThrow('Set failed');
    });

    it('should propagate delete errors', async () => {
      mockCacheManager.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(RedisService.del('key')).rejects.toThrow('Delete failed');
    });

    it('should propagate incr errors', async () => {
      mockRedisClient.incr.mockRejectedValue(new Error('Incr failed'));

      await expect(RedisService.incr('counter')).rejects.toThrow('Incr failed');
    });
  });

  describe('Cache Key Patterns', () => {
    it('should handle namespaced keys', async () => {
      mockCacheManager.get.mockResolvedValue('value');

      await RedisService.get('payment-service:config:fees');

      expect(mockCacheManager.get).toHaveBeenCalledWith('payment-service:config:fees');
    });

    it('should handle keys with special characters', async () => {
      mockCacheManager.get.mockResolvedValue('value');

      await RedisService.get('user@email.com:session');

      expect(mockCacheManager.get).toHaveBeenCalledWith('user@email.com:session');
    });
  });

  describe('TTL Values', () => {
    it('should handle zero TTL (no expiration)', async () => {
      await RedisService.set('no-expire', 'value', 0);

      expect(mockCacheManager.set).toHaveBeenCalledWith('no-expire', 'value', 0);
    });

    it('should handle large TTL values', async () => {
      const oneWeek = 604800;

      await RedisService.set('long-cache', 'value', oneWeek);

      expect(mockCacheManager.set).toHaveBeenCalledWith('long-cache', 'value', oneWeek);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple get operations', async () => {
      mockCacheManager.get
        .mockResolvedValueOnce('value1')
        .mockResolvedValueOnce('value2')
        .mockResolvedValueOnce('value3');

      const results = await Promise.all([
        RedisService.get('key1'),
        RedisService.get('key2'),
        RedisService.get('key3'),
      ]);

      expect(results).toEqual(['value1', 'value2', 'value3']);
    });

    it('should handle multiple set operations', async () => {
      await Promise.all([
        RedisService.set('key1', 'value1'),
        RedisService.set('key2', 'value2'),
        RedisService.set('key3', 'value3'),
      ]);

      expect(mockCacheManager.set).toHaveBeenCalledTimes(3);
    });
  });
});
