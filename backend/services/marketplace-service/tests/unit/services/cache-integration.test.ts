/**
 * Unit tests for Cache Integration module
 * Tests cache initialization and exports from @tickettoken/shared
 */

// Mock the shared library before imports
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  getStats: jest.fn().mockReturnValue({
    hits: 100,
    misses: 20,
    hitRate: 0.83
  })
};

const mockCacheMiddleware = jest.fn(() => (req: any, res: any, next: any) => next());

const mockCacheStrategies = {
  staleWhileRevalidate: jest.fn(),
  cacheFirst: jest.fn(),
  networkFirst: jest.fn()
};

const mockCacheInvalidator = {
  invalidate: jest.fn(),
  invalidatePattern: jest.fn(),
  invalidateAll: jest.fn()
};

jest.mock('@tickettoken/shared', () => ({
  createCache: jest.fn(() => ({
    service: mockCacheService,
    middleware: mockCacheMiddleware,
    strategies: mockCacheStrategies,
    invalidator: mockCacheInvalidator
  }))
}));

import { createCache } from '@tickettoken/shared';

describe('Cache Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Module Initialization', () => {
    it('should call createCache with Redis configuration', () => {
      // Re-require the module to trigger initialization
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            host: expect.any(String),
            port: expect.any(Number)
          })
        })
      );
    });

    it('should use REDIS_HOST from environment', () => {
      process.env.REDIS_HOST = 'custom-redis-host';
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            host: 'custom-redis-host'
          })
        })
      );
    });

    it('should default REDIS_HOST to "redis"', () => {
      delete process.env.REDIS_HOST;
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            host: 'redis'
          })
        })
      );
    });

    it('should use REDIS_PORT from environment', () => {
      process.env.REDIS_PORT = '6380';
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            port: 6380
          })
        })
      );
    });

    it('should default REDIS_PORT to 6379', () => {
      delete process.env.REDIS_PORT;
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            port: 6379
          })
        })
      );
    });

    it('should include REDIS_PASSWORD when set', () => {
      process.env.REDIS_PASSWORD = 'secret-password';
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            password: 'secret-password'
          })
        })
      );
    });

    it('should use SERVICE_NAME for key prefix', () => {
      process.env.SERVICE_NAME = 'custom-service';
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            keyPrefix: 'custom-service:'
          })
        })
      );
    });

    it('should default SERVICE_NAME to "marketplace-service"', () => {
      delete process.env.SERVICE_NAME;
      
      jest.isolateModules(() => {
        require('../../../src/services/cache-integration');
      });
      
      expect(createCache).toHaveBeenCalledWith(
        expect.objectContaining({
          redis: expect.objectContaining({
            keyPrefix: 'marketplace-service:'
          })
        })
      );
    });
  });

  describe('Exports', () => {
    let cacheModule: any;

    beforeEach(() => {
      jest.isolateModules(() => {
        cacheModule = require('../../../src/services/cache-integration');
      });
    });

    it('should export cache service', () => {
      expect(cacheModule.cache).toBeDefined();
      expect(cacheModule.cache).toBe(mockCacheService);
    });

    it('should export cacheMiddleware', () => {
      expect(cacheModule.cacheMiddleware).toBeDefined();
      expect(cacheModule.cacheMiddleware).toBe(mockCacheMiddleware);
    });

    it('should export cacheStrategies', () => {
      expect(cacheModule.cacheStrategies).toBeDefined();
      expect(cacheModule.cacheStrategies).toBe(mockCacheStrategies);
    });

    it('should export cacheInvalidator', () => {
      expect(cacheModule.cacheInvalidator).toBeDefined();
      expect(cacheModule.cacheInvalidator).toBe(mockCacheInvalidator);
    });

    it('should export getCacheStats function', () => {
      expect(cacheModule.getCacheStats).toBeDefined();
      expect(typeof cacheModule.getCacheStats).toBe('function');
    });
  });

  describe('getCacheStats', () => {
    let cacheModule: any;

    beforeEach(() => {
      jest.isolateModules(() => {
        cacheModule = require('../../../src/services/cache-integration');
      });
    });

    it('should call cache.getStats()', () => {
      cacheModule.getCacheStats();
      
      expect(mockCacheService.getStats).toHaveBeenCalled();
    });

    it('should return stats from cache service', () => {
      const stats = cacheModule.getCacheStats();
      
      expect(stats).toEqual({
        hits: 100,
        misses: 20,
        hitRate: 0.83
      });
    });
  });

  describe('Cache Service Methods', () => {
    let cacheModule: any;

    beforeEach(() => {
      jest.isolateModules(() => {
        cacheModule = require('../../../src/services/cache-integration');
      });
    });

    it('should have get method on cache', () => {
      expect(typeof cacheModule.cache.get).toBe('function');
    });

    it('should have set method on cache', () => {
      expect(typeof cacheModule.cache.set).toBe('function');
    });

    it('should have del method on cache', () => {
      expect(typeof cacheModule.cache.del).toBe('function');
    });

    it('should have getStats method on cache', () => {
      expect(typeof cacheModule.cache.getStats).toBe('function');
    });
  });

  describe('Cache Strategies', () => {
    let cacheModule: any;

    beforeEach(() => {
      jest.isolateModules(() => {
        cacheModule = require('../../../src/services/cache-integration');
      });
    });

    it('should have staleWhileRevalidate strategy', () => {
      expect(cacheModule.cacheStrategies.staleWhileRevalidate).toBeDefined();
    });

    it('should have cacheFirst strategy', () => {
      expect(cacheModule.cacheStrategies.cacheFirst).toBeDefined();
    });

    it('should have networkFirst strategy', () => {
      expect(cacheModule.cacheStrategies.networkFirst).toBeDefined();
    });
  });

  describe('Cache Invalidator', () => {
    let cacheModule: any;

    beforeEach(() => {
      jest.isolateModules(() => {
        cacheModule = require('../../../src/services/cache-integration');
      });
    });

    it('should have invalidate method', () => {
      expect(typeof cacheModule.cacheInvalidator.invalidate).toBe('function');
    });

    it('should have invalidatePattern method', () => {
      expect(typeof cacheModule.cacheInvalidator.invalidatePattern).toBe('function');
    });

    it('should have invalidateAll method', () => {
      expect(typeof cacheModule.cacheInvalidator.invalidateAll).toBe('function');
    });
  });
});
