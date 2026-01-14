/**
 * Unit Tests for src/services/cache-integration.ts
 */

const mockCacheSystem = {
  service: { get: jest.fn(), set: jest.fn() },
  middleware: jest.fn(),
  strategies: { ttl: jest.fn() },
  invalidator: { invalidate: jest.fn() },
};

const mockCreateCache = jest.fn().mockReturnValue(mockCacheSystem);

jest.mock('@tickettoken/shared', () => ({
  createCache: mockCreateCache,
}));

describe('services/cache-integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('exports cache service', () => {
    const { cache } = require('../../../src/services/cache-integration');
    expect(cache).toBe(mockCacheSystem.service);
  });

  it('exports cacheMiddleware', () => {
    const { cacheMiddleware } = require('../../../src/services/cache-integration');
    expect(cacheMiddleware).toBe(mockCacheSystem.middleware);
  });

  it('exports cacheStrategies', () => {
    const { cacheStrategies } = require('../../../src/services/cache-integration');
    expect(cacheStrategies).toBe(mockCacheSystem.strategies);
  });

  it('exports cacheInvalidator', () => {
    const { cacheInvalidator } = require('../../../src/services/cache-integration');
    expect(cacheInvalidator).toBe(mockCacheSystem.invalidator);
  });

  it('initializes with redis config', () => {
    jest.resetModules();
    require('../../../src/services/cache-integration');

    // createCache is called during module initialization
    expect(mockCreateCache).toHaveBeenCalled();
  });
});
