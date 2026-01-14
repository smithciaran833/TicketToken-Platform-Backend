// =============================================================================
// TEST SUITE: cache-integration
// =============================================================================

describe('cache-integration', () => {
  let cacheIntegration: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
    // Set up environment before importing
    process.env.SERVICE_NAME = 'payment-service';
    process.env.REDIS_HOST = 'redis';
    process.env.REDIS_PORT = '6379';
    
    // Mock the cache package
    jest.mock('@tickettoken/cache', () => ({
      createCache: jest.fn(() => ({
        service: {
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn(),
          getStats: jest.fn(() => ({ hits: 10, misses: 5 })),
        },
        middleware: jest.fn(),
        strategies: {
          ttl: jest.fn(),
          lru: jest.fn(),
        },
        invalidator: {
          invalidate: jest.fn(),
          invalidatePattern: jest.fn(),
        },
      })),
    }));
    
    cacheIntegration = require('../../../src/services/cache-integration');
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  // ===========================================================================
  // Exported Values - 6 test cases
  // ===========================================================================

  describe('Exported Values', () => {
    it('should export cache service', () => {
      expect(cacheIntegration.cache).toBeDefined();
      expect(cacheIntegration.cache).toHaveProperty('get');
      expect(cacheIntegration.cache).toHaveProperty('set');
      expect(cacheIntegration.cache).toHaveProperty('del');
      expect(cacheIntegration.cache).toHaveProperty('getStats');
    });

    it('should export cache middleware', () => {
      expect(cacheIntegration.cacheMiddleware).toBeDefined();
      expect(typeof cacheIntegration.cacheMiddleware).toBe('function');
    });

    it('should export cache strategies', () => {
      expect(cacheIntegration.cacheStrategies).toBeDefined();
      expect(cacheIntegration.cacheStrategies).toHaveProperty('ttl');
      expect(cacheIntegration.cacheStrategies).toHaveProperty('lru');
    });

    it('should export cache invalidator', () => {
      expect(cacheIntegration.cacheInvalidator).toBeDefined();
      expect(cacheIntegration.cacheInvalidator).toHaveProperty('invalidate');
      expect(cacheIntegration.cacheInvalidator).toHaveProperty('invalidatePattern');
    });

    it('should export getCacheStats function', () => {
      expect(typeof cacheIntegration.getCacheStats).toBe('function');
    });

    it('should export serviceCache object', () => {
      expect(cacheIntegration.serviceCache).toBeDefined();
      expect(typeof cacheIntegration.serviceCache).toBe('object');
    });
  });

  // ===========================================================================
  // Cache Service Methods - 4 test cases
  // ===========================================================================

  describe('Cache Service Methods', () => {
    it('should have get method', () => {
      expect(cacheIntegration.cache.get).toBeDefined();
      expect(typeof cacheIntegration.cache.get).toBe('function');
    });

    it('should have set method', () => {
      expect(cacheIntegration.cache.set).toBeDefined();
      expect(typeof cacheIntegration.cache.set).toBe('function');
    });

    it('should have del method', () => {
      expect(cacheIntegration.cache.del).toBeDefined();
      expect(typeof cacheIntegration.cache.del).toBe('function');
    });

    it('should have getStats method', () => {
      expect(cacheIntegration.cache.getStats).toBeDefined();
      expect(typeof cacheIntegration.cache.getStats).toBe('function');
    });
  });

  // ===========================================================================
  // getCacheStats Function - 3 test cases
  // ===========================================================================

  describe('getCacheStats Function', () => {
    it('should be callable', () => {
      expect(() => cacheIntegration.getCacheStats()).not.toThrow();
    });

    it('should return cache statistics', () => {
      const stats = cacheIntegration.getCacheStats();
      
      expect(stats).toBeDefined();
      expect(typeof stats).toBe('object');
    });

    it('should return stats with expected structure', () => {
      const stats = cacheIntegration.getCacheStats();
      
      expect(stats).toHaveProperty('hits');
      expect(stats).toHaveProperty('misses');
    });
  });

  // ===========================================================================
  // Cache Invalidator Methods - 2 test cases
  // ===========================================================================

  describe('Cache Invalidator Methods', () => {
    it('should have invalidate method', () => {
      expect(cacheIntegration.cacheInvalidator.invalidate).toBeDefined();
      expect(typeof cacheIntegration.cacheInvalidator.invalidate).toBe('function');
    });

    it('should have invalidatePattern method', () => {
      expect(cacheIntegration.cacheInvalidator.invalidatePattern).toBeDefined();
      expect(typeof cacheIntegration.cacheInvalidator.invalidatePattern).toBe('function');
    });
  });

  // ===========================================================================
  // Cache Strategies - 2 test cases
  // ===========================================================================

  describe('Cache Strategies', () => {
    it('should have ttl strategy', () => {
      expect(cacheIntegration.cacheStrategies.ttl).toBeDefined();
      expect(typeof cacheIntegration.cacheStrategies.ttl).toBe('function');
    });

    it('should have lru strategy', () => {
      expect(cacheIntegration.cacheStrategies.lru).toBeDefined();
      expect(typeof cacheIntegration.cacheStrategies.lru).toBe('function');
    });
  });
});
