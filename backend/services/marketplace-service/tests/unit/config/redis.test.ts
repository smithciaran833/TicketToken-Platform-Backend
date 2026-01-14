/**
 * Unit Tests for Redis Configuration
 * Tests Redis client initialization, pub/sub, and cache helpers
 */

// Mock the shared package
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  exists: jest.fn()
};

const mockConnectionManager = {
  disconnect: jest.fn()
};

jest.mock('@tickettoken/shared', () => ({
  getRedisClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisPubClient: jest.fn().mockResolvedValue(mockRedisClient),
  getRedisSubClient: jest.fn().mockResolvedValue(mockRedisClient),
  getConnectionManager: jest.fn().mockReturnValue(mockConnectionManager)
}));

describe('Redis Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  describe('initRedis', () => {
    it('should initialize redis clients', async () => {
      const { initRedis } = require('../../../src/config/redis');
      const shared = require('@tickettoken/shared');
      
      await initRedis();
      
      expect(shared.getRedisClient).toHaveBeenCalled();
      expect(shared.getRedisPubClient).toHaveBeenCalled();
      expect(shared.getRedisSubClient).toHaveBeenCalled();
    });

    it('should only initialize once', async () => {
      const { initRedis } = require('../../../src/config/redis');
      const shared = require('@tickettoken/shared');
      
      await initRedis();
      await initRedis();
      
      expect(shared.getRedisClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRedis', () => {
    it('should return redis client after initialization', async () => {
      const { initRedis, getRedis } = require('../../../src/config/redis');
      
      await initRedis();
      const client = getRedis();
      
      expect(client).toBeDefined();
    });

    it('should throw error if not initialized', () => {
      jest.resetModules();
      const { getRedis } = require('../../../src/config/redis');
      
      expect(() => getRedis()).toThrow('Redis not initialized');
    });
  });

  describe('getPub', () => {
    it('should return redis pub client after initialization', async () => {
      const { initRedis, getPub } = require('../../../src/config/redis');
      
      await initRedis();
      const client = getPub();
      
      expect(client).toBeDefined();
    });

    it('should throw error if not initialized', () => {
      jest.resetModules();
      const { getPub } = require('../../../src/config/redis');
      
      expect(() => getPub()).toThrow('Redis pub not initialized');
    });
  });

  describe('getSub', () => {
    it('should return redis sub client after initialization', async () => {
      const { initRedis, getSub } = require('../../../src/config/redis');
      
      await initRedis();
      const client = getSub();
      
      expect(client).toBeDefined();
    });

    it('should throw error if not initialized', () => {
      jest.resetModules();
      const { getSub } = require('../../../src/config/redis');
      
      expect(() => getSub()).toThrow('Redis sub not initialized');
    });
  });

  describe('closeRedisConnections', () => {
    it('should disconnect all connections', async () => {
      const { initRedis, closeRedisConnections } = require('../../../src/config/redis');
      const shared = require('@tickettoken/shared');
      
      await initRedis();
      await closeRedisConnections();
      
      expect(mockConnectionManager.disconnect).toHaveBeenCalled();
    });

    it('should allow re-initialization after close', async () => {
      const { initRedis, closeRedisConnections } = require('../../../src/config/redis');
      const shared = require('@tickettoken/shared');
      
      await initRedis();
      await closeRedisConnections();
      
      // Reset call count for re-init check
      jest.clearAllMocks();
      
      await initRedis();
      
      expect(shared.getRedisClient).toHaveBeenCalled();
    });
  });

  describe('cache helper functions', () => {
    describe('cache.get', () => {
      it('should return parsed value from redis', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
        
        const result = await cache.get('test-key');
        
        expect(result).toEqual({ foo: 'bar' });
        expect(mockRedisClient.get).toHaveBeenCalledWith('test-key');
      });

      it('should return null when key does not exist', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.get.mockResolvedValue(null);
        
        const result = await cache.get('nonexistent-key');
        
        expect(result).toBeNull();
      });

      it('should return null on error', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.get.mockRejectedValue(new Error('Redis error'));
        
        const result = await cache.get('error-key');
        
        expect(result).toBeNull();
      });
    });

    describe('cache.set', () => {
      it('should set value without TTL', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.set.mockResolvedValue('OK');
        
        await cache.set('test-key', { foo: 'bar' });
        
        expect(mockRedisClient.set).toHaveBeenCalledWith('test-key', JSON.stringify({ foo: 'bar' }));
      });

      it('should set value with TTL', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.setex.mockResolvedValue('OK');
        
        await cache.set('test-key', { foo: 'bar' }, 3600);
        
        expect(mockRedisClient.setex).toHaveBeenCalledWith('test-key', 3600, JSON.stringify({ foo: 'bar' }));
      });

      it('should silently fail on error', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.set.mockRejectedValue(new Error('Redis error'));
        
        // Should not throw
        await expect(cache.set('error-key', { data: 'test' })).resolves.toBeUndefined();
      });
    });

    describe('cache.del', () => {
      it('should delete key', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.del.mockResolvedValue(1);
        
        await cache.del('test-key');
        
        expect(mockRedisClient.del).toHaveBeenCalledWith('test-key');
      });

      it('should silently fail on error', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.del.mockRejectedValue(new Error('Redis error'));
        
        // Should not throw
        await expect(cache.del('error-key')).resolves.toBeUndefined();
      });
    });

    describe('cache.exists', () => {
      it('should return true when key exists', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.exists.mockResolvedValue(1);
        
        const result = await cache.exists('test-key');
        
        expect(result).toBe(true);
        expect(mockRedisClient.exists).toHaveBeenCalledWith('test-key');
      });

      it('should return false when key does not exist', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.exists.mockResolvedValue(0);
        
        const result = await cache.exists('nonexistent-key');
        
        expect(result).toBe(false);
      });

      it('should return false on error', async () => {
        const { initRedis, cache } = require('../../../src/config/redis');
        
        await initRedis();
        mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));
        
        const result = await cache.exists('error-key');
        
        expect(result).toBe(false);
      });
    });
  });

  describe('cache edge cases', () => {
    it('should handle null values in get', async () => {
      const { initRedis, cache } = require('../../../src/config/redis');
      
      await initRedis();
      mockRedisClient.get.mockResolvedValue('null');
      
      const result = await cache.get('null-key');
      
      expect(result).toBeNull();
    });

    it('should handle array values', async () => {
      const { initRedis, cache } = require('../../../src/config/redis');
      
      await initRedis();
      mockRedisClient.get.mockResolvedValue(JSON.stringify([1, 2, 3]));
      
      const result = await cache.get('array-key');
      
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle string values', async () => {
      const { initRedis, cache } = require('../../../src/config/redis');
      
      await initRedis();
      mockRedisClient.get.mockResolvedValue('"hello world"');
      
      const result = await cache.get('string-key');
      
      expect(result).toBe('hello world');
    });

    it('should handle number values', async () => {
      const { initRedis, cache } = require('../../../src/config/redis');
      
      await initRedis();
      mockRedisClient.get.mockResolvedValue('42');
      
      const result = await cache.get('number-key');
      
      expect(result).toBe(42);
    });

    it('should handle invalid JSON gracefully', async () => {
      const { initRedis, cache } = require('../../../src/config/redis');
      
      await initRedis();
      mockRedisClient.get.mockResolvedValue('not valid json');
      
      const result = await cache.get('invalid-json-key');
      
      expect(result).toBeNull();
    });
  });
});
