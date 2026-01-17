/**
 * CacheService Unit Tests
 */

import * as crypto from 'crypto';

// Constants matching the implementation
const CACHE_SECRET = 'test-cache-secret-for-unit-tests-minimum-32-characters';

// Helper to generate valid signature matching the implementation
function generateValidSignature(key: string, value: any): string {
  const data = JSON.stringify({ key, value });
  return crypto.createHmac('sha256', CACHE_SECRET).update(data).digest('hex');
}

// Mock CacheModel
const mockCacheModel = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  deletePattern: jest.fn(),
  exists: jest.fn(),
  expire: jest.fn(),
  increment: jest.fn(),
  invalidateVenueCache: jest.fn(),
  getCacheKey: jest.fn((...args: string[]) => `analytics:${args.join(':')}`),
};

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  CacheModel: mockCacheModel,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue(mockLogger),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    cache: {
      secret: CACHE_SECRET,
    },
  },
}));

describe('CacheService', () => {
  let cacheService: any;
  let CacheService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset all mocks
    mockCacheModel.get.mockReset();
    mockCacheModel.set.mockResolvedValue(undefined);
    mockCacheModel.delete.mockResolvedValue(undefined);
    mockCacheModel.deletePattern.mockResolvedValue(1);
    mockCacheModel.exists.mockResolvedValue(true);
    mockCacheModel.expire.mockResolvedValue(undefined);
    mockCacheModel.increment.mockResolvedValue(1);
    mockCacheModel.invalidateVenueCache.mockResolvedValue(undefined);

    // Set default environment
    process.env.SERVICE_ID = 'analytics-service';
    process.env.NODE_ENV = 'test';

    // Reset modules to get fresh singleton
    jest.resetModules();
    
    // Re-apply mocks
    jest.doMock('../../../src/models', () => ({
      CacheModel: mockCacheModel,
    }));
    jest.doMock('../../../src/utils/logger', () => ({
      logger: { child: jest.fn().mockReturnValue(mockLogger) },
    }));
    jest.doMock('../../../src/config', () => ({
      config: { cache: { secret: CACHE_SECRET } },
    }));

    const module = require('../../../src/services/cache.service');
    CacheService = module.CacheService;
    cacheService = CacheService.getInstance();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = CacheService.getInstance();
      const instance2 = CacheService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('get', () => {
    describe('non-protected keys', () => {
      it('should return cached value for non-protected key', async () => {
        const testValue = { data: 'test' };
        mockCacheModel.get.mockResolvedValue(testValue);

        const result = await cacheService.get('user:123');

        expect(result).toEqual(testValue);
        expect(mockCacheModel.get).toHaveBeenCalledWith('user:123');
      });

      it('should return null when key does not exist', async () => {
        mockCacheModel.get.mockResolvedValue(null);

        const result = await cacheService.get('nonexistent');

        expect(result).toBeNull();
      });

      it('should return null and log error on cache failure', async () => {
        mockCacheModel.get.mockRejectedValue(new Error('Redis connection failed'));

        const result = await cacheService.get('user:123');

        expect(result).toBeNull();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });

    describe('protected keys', () => {
      const protectedPrefixes = ['stats:', 'metrics:', 'aggregate:', 'event:'];

      protectedPrefixes.forEach(prefix => {
        it(`should validate and return value for ${prefix} prefixed keys with valid signature`, async () => {
          const key = `${prefix}test-key`;
          const value = { count: 100 };
          const signature = generateValidSignature(key, value);

          mockCacheModel.get.mockResolvedValue({ value, signature });

          const result = await cacheService.get(key);

          expect(result).toEqual(value);
        });

        it(`should return null and delete corrupted ${prefix} key with invalid signature`, async () => {
          const key = `${prefix}test-key`;
          const value = { count: 100 };
          // Signature with same length but wrong value
          const invalidSignature = 'a'.repeat(64);

          mockCacheModel.get.mockResolvedValue({ value, signature: invalidSignature });

          const result = await cacheService.get(key);

          expect(result).toBeNull();
          expect(mockCacheModel.delete).toHaveBeenCalledWith(key);
          expect(mockLogger.warn).toHaveBeenCalledWith(
            'Cache signature validation failed',
            { key }
          );
        });
      });

      it('should return null when protected key does not exist', async () => {
        mockCacheModel.get.mockResolvedValue(null);

        const result = await cacheService.get('stats:venue:123');

        expect(result).toBeNull();
      });

      it('should handle signature length mismatch gracefully', async () => {
        const key = 'stats:test-key';
        mockCacheModel.get.mockResolvedValue({ 
          value: { count: 100 }, 
          signature: 'short' // Wrong length causes timingSafeEqual to throw
        });

        const result = await cacheService.get(key);

        // Error caught, returns null
        expect(result).toBeNull();
      });
    });
  });

  describe('set', () => {
    describe('non-protected keys', () => {
      it('should set value directly for non-protected key', async () => {
        await cacheService.set('user:123', { name: 'test' }, 3600);

        expect(mockCacheModel.set).toHaveBeenCalledWith(
          'user:123',
          { name: 'test' },
          3600
        );
      });

      it('should set value without TTL', async () => {
        await cacheService.set('user:123', { name: 'test' });

        expect(mockCacheModel.set).toHaveBeenCalledWith(
          'user:123',
          { name: 'test' },
          undefined
        );
      });
    });

    describe('protected keys', () => {
      it('should sign and store protected key when authorized', async () => {
        await cacheService.set('stats:venue:123', { count: 50 }, 3600);

        expect(mockCacheModel.set).toHaveBeenCalledWith(
          'stats:venue:123',
          expect.objectContaining({
            value: { count: 50 },
            signature: expect.any(String),
          }),
          3600
        );

        // Verify the signature is correct
        const callArgs = mockCacheModel.set.mock.calls[0];
        const storedData = callArgs[1];
        const expectedSig = generateValidSignature('stats:venue:123', { count: 50 });
        expect(storedData.signature).toBe(expectedSig);
      });

      it('should throw error when unauthorized service writes to stats:', async () => {
        process.env.SERVICE_ID = 'unauthorized-service';
        
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
        jest.doMock('../../../src/utils/logger', () => ({
          logger: { child: jest.fn().mockReturnValue(mockLogger) },
        }));
        jest.doMock('../../../src/config', () => ({
          config: { cache: { secret: CACHE_SECRET } },
        }));

        const freshModule = require('../../../src/services/cache.service');
        const freshService = freshModule.CacheService.getInstance();

        await expect(
          freshService.set('stats:venue:123', { count: 50 })
        ).rejects.toThrow('Unauthorized cache write attempt to protected key');
      });

      it('should throw error when unauthorized service writes to metrics:', async () => {
        process.env.SERVICE_ID = 'payment-service';
        
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
        jest.doMock('../../../src/utils/logger', () => ({
          logger: { child: jest.fn().mockReturnValue(mockLogger) },
        }));
        jest.doMock('../../../src/config', () => ({
          config: { cache: { secret: CACHE_SECRET } },
        }));

        const freshModule = require('../../../src/services/cache.service');
        const freshService = freshModule.CacheService.getInstance();

        await expect(
          freshService.set('metrics:sales:123', { value: 100 })
        ).rejects.toThrow('Unauthorized cache write attempt to protected key');
      });

      it('should allow event-service to write to event: keys', async () => {
        process.env.SERVICE_ID = 'event-service';
        
        jest.resetModules();
        jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
        jest.doMock('../../../src/utils/logger', () => ({
          logger: { child: jest.fn().mockReturnValue(mockLogger) },
        }));
        jest.doMock('../../../src/config', () => ({
          config: { cache: { secret: CACHE_SECRET } },
        }));

        const freshModule = require('../../../src/services/cache.service');
        const freshService = freshModule.CacheService.getInstance();

        await freshService.set('event:123', { data: 'test' });

        expect(mockCacheModel.set).toHaveBeenCalled();
      });
    });

    it('should re-throw errors on cache set failure', async () => {
      mockCacheModel.set.mockRejectedValue(new Error('Redis write failed'));

      await expect(
        cacheService.set('user:123', { data: 'test' })
      ).rejects.toThrow('Redis write failed');
    });
  });

  describe('delete', () => {
    it('should delete non-protected key', async () => {
      await cacheService.delete('user:123');

      expect(mockCacheModel.delete).toHaveBeenCalledWith('user:123');
    });

    it('should delete protected key when authorized', async () => {
      await cacheService.delete('stats:venue:123');

      expect(mockCacheModel.delete).toHaveBeenCalledWith('stats:venue:123');
    });

    it('should throw error when unauthorized service deletes protected key', async () => {
      process.env.SERVICE_ID = 'unauthorized-service';
      
      jest.resetModules();
      jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { child: jest.fn().mockReturnValue(mockLogger) },
      }));
      jest.doMock('../../../src/config', () => ({
        config: { cache: { secret: CACHE_SECRET } },
      }));

      const freshModule = require('../../../src/services/cache.service');
      const freshService = freshModule.CacheService.getInstance();

      await expect(
        freshService.delete('aggregate:venue:123')
      ).rejects.toThrow('Unauthorized cache delete attempt for protected key');
    });

    it('should re-throw errors on delete failure', async () => {
      mockCacheModel.delete.mockRejectedValue(new Error('Delete failed'));

      await expect(cacheService.delete('user:123')).rejects.toThrow('Delete failed');
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      const result = await cacheService.deletePattern('user:*');

      expect(result).toBe(1);
      expect(mockCacheModel.deletePattern).toHaveBeenCalledWith('user:*');
    });

    it('should validate permission for patterns affecting protected keys when authorized', async () => {
      const result = await cacheService.deletePattern('stats:*');

      expect(result).toBe(1);
      expect(mockCacheModel.deletePattern).toHaveBeenCalledWith('stats:*');
    });

    it('should return 0 for unauthorized pattern delete on protected keys', async () => {
      process.env.SERVICE_ID = 'other-service';
      
      jest.resetModules();
      jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { child: jest.fn().mockReturnValue(mockLogger) },
      }));
      jest.doMock('../../../src/config', () => ({
        config: { cache: { secret: CACHE_SECRET } },
      }));

      const freshModule = require('../../../src/services/cache.service');
      const freshService = freshModule.CacheService.getInstance();

      // Error is caught, returns 0
      const result = await freshService.deletePattern('metrics:*');

      expect(result).toBe(0);
    });

    it('should return 0 for unauthorized wildcard pattern', async () => {
      process.env.SERVICE_ID = 'other-service';
      
      jest.resetModules();
      jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { child: jest.fn().mockReturnValue(mockLogger) },
      }));
      jest.doMock('../../../src/config', () => ({
        config: { cache: { secret: CACHE_SECRET } },
      }));

      const freshModule = require('../../../src/services/cache.service');
      const freshService = freshModule.CacheService.getInstance();

      const result = await freshService.deletePattern('*');

      expect(result).toBe(0);
    });

    it('should return 0 on error', async () => {
      mockCacheModel.deletePattern.mockRejectedValue(new Error('Pattern delete failed'));

      const result = await cacheService.deletePattern('user:*');

      expect(result).toBe(0);
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockCacheModel.exists.mockResolvedValue(true);

      const result = await cacheService.exists('user:123');

      expect(result).toBe(true);
      expect(mockCacheModel.exists).toHaveBeenCalledWith('user:123');
    });

    it('should return false when key does not exist', async () => {
      mockCacheModel.exists.mockResolvedValue(false);

      const result = await cacheService.exists('nonexistent');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      mockCacheModel.exists.mockRejectedValue(new Error('Connection failed'));

      const result = await cacheService.exists('user:123');

      expect(result).toBe(false);
    });
  });

  describe('expire', () => {
    it('should set expiry on non-protected key', async () => {
      await cacheService.expire('user:123', 3600);

      expect(mockCacheModel.expire).toHaveBeenCalledWith('user:123', 3600);
    });

    it('should set expiry on protected key when authorized', async () => {
      await cacheService.expire('stats:venue:123', 7200);

      expect(mockCacheModel.expire).toHaveBeenCalledWith('stats:venue:123', 7200);
    });

    it('should throw error for unauthorized expire on protected key', async () => {
      process.env.SERVICE_ID = 'unauthorized-service';
      
      jest.resetModules();
      jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { child: jest.fn().mockReturnValue(mockLogger) },
      }));
      jest.doMock('../../../src/config', () => ({
        config: { cache: { secret: CACHE_SECRET } },
      }));

      const freshModule = require('../../../src/services/cache.service');
      const freshService = freshModule.CacheService.getInstance();

      await expect(
        freshService.expire('metrics:venue:123', 3600)
      ).rejects.toThrow('Unauthorized cache expire attempt for protected key');
    });

    it('should re-throw errors on expire failure', async () => {
      mockCacheModel.expire.mockRejectedValue(new Error('Expire failed'));

      await expect(cacheService.expire('user:123', 3600)).rejects.toThrow('Expire failed');
    });
  });

  describe('increment', () => {
    it('should increment non-protected key directly', async () => {
      mockCacheModel.increment.mockResolvedValue(5);

      const result = await cacheService.increment('counter:views', 1);

      expect(result).toBe(5);
      expect(mockCacheModel.increment).toHaveBeenCalledWith('counter:views', 1);
    });

    it('should increment by custom value', async () => {
      mockCacheModel.increment.mockResolvedValue(15);

      const result = await cacheService.increment('counter:views', 5);

      expect(result).toBe(15);
      expect(mockCacheModel.increment).toHaveBeenCalledWith('counter:views', 5);
    });

    it('should use get/set for protected key increment', async () => {
      const key = 'stats:counter:123';
      const existingValue = 10;
      const signature = generateValidSignature(key, existingValue);

      mockCacheModel.get.mockResolvedValue({ value: existingValue, signature });

      const result = await cacheService.increment(key, 5);

      expect(result).toBe(15);
      expect(mockCacheModel.set).toHaveBeenCalledWith(
        key,
        expect.objectContaining({ value: 15 }),
        undefined
      );
    });

    it('should start from 0 for non-existent protected key', async () => {
      mockCacheModel.get.mockResolvedValue(null);

      const result = await cacheService.increment('stats:new:counter', 3);

      expect(result).toBe(3);
    });

    it('should return 0 on error', async () => {
      mockCacheModel.increment.mockRejectedValue(new Error('Increment failed'));

      const result = await cacheService.increment('counter:views');

      expect(result).toBe(0);
    });
  });

  describe('getOrSet', () => {
    it('should return cached value if exists', async () => {
      const cachedValue = { data: 'cached' };
      mockCacheModel.get.mockResolvedValue(cachedValue);
      const factory = jest.fn();

      const result = await cacheService.getOrSet('key:123', factory, 3600);

      expect(result).toEqual(cachedValue);
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result when key does not exist', async () => {
      const factoryValue = { data: 'new' };
      mockCacheModel.get.mockResolvedValue(null);
      const factory = jest.fn().mockResolvedValue(factoryValue);

      const result = await cacheService.getOrSet('key:123', factory, 3600);

      expect(result).toEqual(factoryValue);
      expect(factory).toHaveBeenCalled();
      expect(mockCacheModel.set).toHaveBeenCalledWith('key:123', factoryValue, 3600);
    });

    it('should return factory result even if cache set fails', async () => {
      const factoryValue = { data: 'new' };
      mockCacheModel.get.mockResolvedValue(null);
      mockCacheModel.set.mockRejectedValue(new Error('Set failed'));
      const factory = jest.fn().mockResolvedValue(factoryValue);

      const result = await cacheService.getOrSet('key:123', factory, 3600);

      expect(result).toEqual(factoryValue);
    });

    it('should call factory if get fails', async () => {
      const factoryValue = { data: 'fallback' };
      mockCacheModel.get.mockRejectedValue(new Error('Get failed'));
      const factory = jest.fn().mockResolvedValue(factoryValue);

      const result = await cacheService.getOrSet('key:123', factory, 3600);

      expect(result).toEqual(factoryValue);
    });
  });

  describe('invalidateVenueCache', () => {
    it('should invalidate venue cache when authorized', async () => {
      await cacheService.invalidateVenueCache('venue-123');

      expect(mockCacheModel.invalidateVenueCache).toHaveBeenCalledWith('venue-123');
      expect(mockLogger.info).toHaveBeenCalledWith('Venue cache invalidated', { venueId: 'venue-123' });
    });

    it('should re-throw errors on invalidation failure', async () => {
      mockCacheModel.invalidateVenueCache.mockRejectedValue(new Error('Invalidation failed'));

      await expect(
        cacheService.invalidateVenueCache('venue-123')
      ).rejects.toThrow('Invalidation failed');
    });
  });

  describe('warmupCache', () => {
    it('should complete warmup without errors', async () => {
      await expect(cacheService.warmupCache('venue-123')).resolves.not.toThrow();
      expect(mockLogger.info).toHaveBeenCalledWith('Cache warmup started', { venueId: 'venue-123' });
      expect(mockLogger.info).toHaveBeenCalledWith('Cache warmup completed', { venueId: 'venue-123' });
    });
  });

  describe('getCacheStats', () => {
    it('should return default cache statistics', async () => {
      const stats = await cacheService.getCacheStats();

      expect(stats).toEqual({
        hits: 0,
        misses: 0,
        hitRate: 0,
        keys: 0,
        memory: 0,
      });
    });
  });

  describe('flushAll', () => {
    it('should flush all cache in test environment', async () => {
      process.env.NODE_ENV = 'test';

      await cacheService.flushAll();

      expect(mockCacheModel.deletePattern).toHaveBeenCalledWith('*');
      expect(mockLogger.warn).toHaveBeenCalledWith('All cache data flushed');
    });

    it('should flush all cache for admin service in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SERVICE_ID = 'admin-service';
      
      jest.resetModules();
      jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { child: jest.fn().mockReturnValue(mockLogger) },
      }));
      jest.doMock('../../../src/config', () => ({
        config: { cache: { secret: CACHE_SECRET } },
      }));

      const freshModule = require('../../../src/services/cache.service');
      const freshService = freshModule.CacheService.getInstance();

      await freshService.flushAll();

      expect(mockCacheModel.deletePattern).toHaveBeenCalledWith('*');
    });

    it('should throw error for unauthorized flush in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.SERVICE_ID = 'other-service';
      
      jest.resetModules();
      jest.doMock('../../../src/models', () => ({ CacheModel: mockCacheModel }));
      jest.doMock('../../../src/utils/logger', () => ({
        logger: { child: jest.fn().mockReturnValue(mockLogger) },
      }));
      jest.doMock('../../../src/config', () => ({
        config: { cache: { secret: CACHE_SECRET } },
      }));

      const freshModule = require('../../../src/services/cache.service');
      const freshService = freshModule.CacheService.getInstance();

      await expect(freshService.flushAll()).rejects.toThrow('Unauthorized cache flush attempt');
    });

    it('should re-throw errors on flush failure', async () => {
      process.env.NODE_ENV = 'test';
      mockCacheModel.deletePattern.mockRejectedValue(new Error('Flush failed'));

      await expect(cacheService.flushAll()).rejects.toThrow('Flush failed');
    });
  });
});
