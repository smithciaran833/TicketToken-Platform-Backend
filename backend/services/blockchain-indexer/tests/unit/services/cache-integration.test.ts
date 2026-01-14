/**
 * Comprehensive Unit Tests for src/services/cache-integration.ts
 *
 * Tests cache service integration wrapper
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock cache utilities
const mockCacheManager = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
};

const mockInitializeCache = jest.fn(() => mockCacheManager);
const mockGetCache = jest.fn(() => mockCacheManager);

jest.mock('../../../src/utils/cache', () => ({
  initializeCache: mockInitializeCache,
  getCache: mockGetCache,
  CacheManager: jest.fn(),
}));

describe('src/services/cache-integration.ts - Comprehensive Unit Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    
    process.env = {
      ...originalEnv,
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // INITIALIZE CACHE SERVICE
  // =============================================================================

  describe('initializeCacheService()', () => {
    it('should initialize cache with config from environment', () => {
      const { initializeCacheService } = require('../../../src/services/cache-integration');

      const result = initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: undefined,
        keyPrefix: 'blockchain-indexer:',
        defaultTTL: 300,
      });
      expect(result).toBe(mockCacheManager);
      expect(mockLogger.info).toHaveBeenCalledWith('Cache service initialized');
    });

    it('should use custom Redis host from env', () => {
      process.env.REDIS_HOST = 'redis.example.com';
      jest.resetModules();

      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'redis.example.com',
        })
      );
    });

    it('should use custom Redis port from env', () => {
      process.env.REDIS_PORT = '6380';
      jest.resetModules();

      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 6380,
        })
      );
    });

    it('should use Redis password from env if provided', () => {
      process.env.REDIS_PASSWORD = 'secret123';
      jest.resetModules();

      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          password: 'secret123',
        })
      );
    });

    it('should use default host if not provided', () => {
      delete process.env.REDIS_HOST;
      jest.resetModules();

      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          host: 'localhost',
        })
      );
    });

    it('should use default port if not provided', () => {
      delete process.env.REDIS_PORT;
      jest.resetModules();

      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 6379,
        })
      );
    });

    it('should set keyPrefix to blockchain-indexer', () => {
      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          keyPrefix: 'blockchain-indexer:',
        })
      );
    });

    it('should set default TTL to 300 seconds', () => {
      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultTTL: 300,
        })
      );
    });

    it('should return existing instance on subsequent calls', () => {
      const { initializeCacheService } = require('../../../src/services/cache-integration');

      const first = initializeCacheService();
      const second = initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });

    it('should handle initialization errors', () => {
      mockInitializeCache.mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const { initializeCacheService } = require('../../../src/services/cache-integration');

      expect(() => initializeCacheService()).toThrow('Connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Failed to initialize cache service'
      );
    });

    it('should handle invalid port gracefully', () => {
      process.env.REDIS_PORT = 'invalid';
      jest.resetModules();

      const { initializeCacheService } = require('../../../src/services/cache-integration');
      initializeCacheService();

      expect(mockInitializeCache).toHaveBeenCalledWith(
        expect.objectContaining({
          port: NaN,
        })
      );
    });
  });

  // =============================================================================
  // GET CACHE SERVICE
  // =============================================================================

  describe('getCacheService()', () => {
    it('should return existing cache instance', () => {
      const { initializeCacheService, getCacheService } = require('../../../src/services/cache-integration');

      initializeCacheService();
      const result = getCacheService();

      expect(result).toBe(mockCacheManager);
      expect(mockInitializeCache).toHaveBeenCalledTimes(1);
    });

    it('should initialize cache if not already initialized', () => {
      const { getCacheService } = require('../../../src/services/cache-integration');

      const result = getCacheService();

      expect(mockInitializeCache).toHaveBeenCalled();
      expect(result).toBe(mockCacheManager);
    });

    it('should not reinitialize on subsequent calls', () => {
      const { getCacheService } = require('../../../src/services/cache-integration');

      getCacheService();
      getCacheService();
      getCacheService();

      expect(mockInitializeCache).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // DEFAULT EXPORT
  // =============================================================================

  describe('Default Export', () => {
    it('should export initialize and get methods', () => {
      const cacheIntegration = require('../../../src/services/cache-integration').default;

      expect(cacheIntegration).toHaveProperty('initialize');
      expect(cacheIntegration).toHaveProperty('get');
      expect(typeof cacheIntegration.initialize).toBe('function');
      expect(typeof cacheIntegration.get).toBe('function');
    });

    it('should call initializeCacheService when using default.initialize', () => {
      const cacheIntegration = require('../../../src/services/cache-integration').default;

      const result = cacheIntegration.initialize();

      expect(mockInitializeCache).toHaveBeenCalled();
      expect(result).toBe(mockCacheManager);
    });

    it('should call getCacheService when using default.get', () => {
      const cacheIntegration = require('../../../src/services/cache-integration').default;

      cacheIntegration.initialize();
      const result = cacheIntegration.get();

      expect(result).toBe(mockCacheManager);
    });
  });

  // =============================================================================
  // SINGLETON PATTERN
  // =============================================================================

  describe('Singleton Pattern', () => {
    it('should maintain single instance across multiple imports', () => {
      const module1 = require('../../../src/services/cache-integration');
      const module2 = require('../../../src/services/cache-integration');

      const instance1 = module1.initializeCacheService();
      const instance2 = module2.getCacheService();

      expect(instance1).toBe(instance2);
      expect(mockInitializeCache).toHaveBeenCalledTimes(1);
    });

    it('should reuse instance across named and default exports', () => {
      const { initializeCacheService } = require('../../../src/services/cache-integration');
      const defaultExport = require('../../../src/services/cache-integration').default;

      const instance1 = initializeCacheService();
      const instance2 = defaultExport.get();

      expect(instance1).toBe(instance2);
      expect(mockInitializeCache).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export initializeCacheService function', () => {
      const { initializeCacheService } = require('../../../src/services/cache-integration');

      expect(typeof initializeCacheService).toBe('function');
    });

    it('should export getCacheService function', () => {
      const { getCacheService } = require('../../../src/services/cache-integration');

      expect(typeof getCacheService).toBe('function');
    });

    it('should export default object', () => {
      const defaultExport = require('../../../src/services/cache-integration').default;

      expect(defaultExport).toBeDefined();
      expect(typeof defaultExport).toBe('object');
    });
  });
});
