// =============================================================================
// MOCKS
// =============================================================================

const mockCache = {
  getStats: jest.fn().mockReturnValue({
    hits: 100,
    misses: 20,
    keys: 50,
  }),
};

const mockMiddleware = jest.fn();
const mockStrategies = {
  ttl: jest.fn(),
  lru: jest.fn(),
};
const mockInvalidator = {
  invalidate: jest.fn(),
};

const mockCreateCache = jest.fn().mockReturnValue({
  service: mockCache,
  middleware: mockMiddleware,
  strategies: mockStrategies,
  invalidator: mockInvalidator,
});

// Mock the shared cache module before importing
jest.mock('@tickettoken/shared', () => ({
  createCache: mockCreateCache,
}), { virtual: true });

// =============================================================================
// TEST SUITE
// =============================================================================

describe('cache-integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.SERVICE_NAME;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.REDIS_PASSWORD;
  });

  it('should initialize cache with correct config', () => {
    process.env.SERVICE_NAME = 'ticket-service';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith({
      redis: {
        host: 'localhost',
        port: 6379,
        password: undefined,
        keyPrefix: 'ticket-service:',
      },
    });
  });

  it('should export cache service', () => {
    const cacheIntegration = require('../../../src/services/cache-integration');
    
    expect(cacheIntegration.cache).toBeDefined();
    expect(cacheIntegration.cache).toBe(mockCache);
  });

  it('should export cache middleware', () => {
    const cacheIntegration = require('../../../src/services/cache-integration');
    
    expect(cacheIntegration.cacheMiddleware).toBeDefined();
    expect(cacheIntegration.cacheMiddleware).toBe(mockMiddleware);
  });

  it('should export cache strategies', () => {
    const cacheIntegration = require('../../../src/services/cache-integration');
    
    expect(cacheIntegration.cacheStrategies).toBeDefined();
    expect(cacheIntegration.cacheStrategies).toBe(mockStrategies);
  });

  it('should export cache invalidator', () => {
    const cacheIntegration = require('../../../src/services/cache-integration');
    
    expect(cacheIntegration.cacheInvalidator).toBeDefined();
    expect(cacheIntegration.cacheInvalidator).toBe(mockInvalidator);
  });

  it('should export getCacheStats function', () => {
    const cacheIntegration = require('../../../src/services/cache-integration');
    
    expect(cacheIntegration.getCacheStats).toBeDefined();
    expect(typeof cacheIntegration.getCacheStats).toBe('function');
  });

  it('should get cache stats', () => {
    const cacheIntegration = require('../../../src/services/cache-integration');
    
    const stats = cacheIntegration.getCacheStats();

    expect(stats).toEqual({
      hits: 100,
      misses: 20,
      keys: 50,
    });
    expect(mockCache.getStats).toHaveBeenCalled();
  });

  it('should use default redis host if not provided', () => {
    process.env.SERVICE_NAME = 'ticket-service';
    process.env.REDIS_PORT = '6379';
    delete process.env.REDIS_HOST;

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: expect.objectContaining({
          host: 'redis',
        }),
      })
    );
  });

  it('should use default redis port if not provided', () => {
    process.env.SERVICE_NAME = 'ticket-service';
    process.env.REDIS_HOST = 'localhost';
    delete process.env.REDIS_PORT;

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: expect.objectContaining({
          port: 6379,
        }),
      })
    );
  });

  it('should use default service name if not provided', () => {
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    delete process.env.SERVICE_NAME;

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: expect.objectContaining({
          keyPrefix: 'ticket-service:',
        }),
      })
    );
  });

  it('should include redis password if provided', () => {
    process.env.SERVICE_NAME = 'ticket-service';
    process.env.REDIS_HOST = 'localhost';
    process.env.REDIS_PORT = '6379';
    process.env.REDIS_PASSWORD = 'secret123';

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: expect.objectContaining({
          password: 'secret123',
        }),
      })
    );
  });

  it('should parse redis port as integer', () => {
    process.env.REDIS_PORT = '9999';

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: expect.objectContaining({
          port: 9999,
        }),
      })
    );
  });

  it('should use custom service name from environment', () => {
    process.env.SERVICE_NAME = 'custom-service';

    require('../../../src/services/cache-integration');

    expect(mockCreateCache).toHaveBeenCalledWith(
      expect.objectContaining({
        redis: expect.objectContaining({
          keyPrefix: 'custom-service:',
        }),
      })
    );
  });
});
