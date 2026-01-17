// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/metrics.ts
 */

jest.mock('prom-client');

describe('src/utils/metrics.ts - Comprehensive Unit Tests', () => {
  let promClient: any;
  let mockCounter: any;
  let mockHistogram: any;
  let mockRegister: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Mock Counter
    mockCounter = {
      inc: jest.fn(),
      reset: jest.fn()
    };

    // Mock Histogram
    mockHistogram = {
      observe: jest.fn(),
      reset: jest.fn()
    };

    // Mock register
    mockRegister = {
      registerMetric: jest.fn(),
      clear: jest.fn(),
      metrics: jest.fn()
    };

    // Mock prom-client
    promClient = require('prom-client');
    promClient.Counter = jest.fn().mockImplementation(() => mockCounter);
    promClient.Histogram = jest.fn().mockImplementation(() => mockHistogram);
    promClient.register = mockRegister;
  });

  // =============================================================================
  // searchCounter - Initialization
  // =============================================================================

  describe('searchCounter - Initialization', () => {
    it('should create Counter with correct name', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'search_requests_total'
        })
      );
    });

    it('should create Counter with help text', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          help: 'Total number of search requests'
        })
      );
    });

    it('should create Counter with labelNames', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Counter).toHaveBeenCalledWith(
        expect.objectContaining({
          labelNames: ['type', 'status']
        })
      );
    });

    it('should export searchCounter', () => {
      const { searchCounter } = require('../../../src/utils/metrics');

      expect(searchCounter).toBe(mockCounter);
    });

    it('should register searchCounter', () => {
      require('../../../src/utils/metrics');

      expect(mockRegister.registerMetric).toHaveBeenCalledWith(mockCounter);
    });
  });

  // =============================================================================
  // searchDuration - Initialization
  // =============================================================================

  describe('searchDuration - Initialization', () => {
    it('should create Histogram with correct name', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'search_duration_seconds'
        })
      );
    });

    it('should create Histogram with help text', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          help: 'Search request duration in seconds'
        })
      );
    });

    it('should create Histogram with labelNames', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          labelNames: ['type']
        })
      );
    });

    it('should create Histogram with buckets', () => {
      require('../../../src/utils/metrics');

      expect(promClient.Histogram).toHaveBeenCalledWith(
        expect.objectContaining({
          buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
        })
      );
    });

    it('should have correct number of buckets', () => {
      require('../../../src/utils/metrics');

      const call = promClient.Histogram.mock.calls[0][0];
      expect(call.buckets).toHaveLength(9);
    });

    it('should export searchDuration', () => {
      const { searchDuration } = require('../../../src/utils/metrics');

      expect(searchDuration).toBe(mockHistogram);
    });

    it('should register searchDuration', () => {
      require('../../../src/utils/metrics');

      expect(mockRegister.registerMetric).toHaveBeenCalledWith(mockHistogram);
    });
  });

  // =============================================================================
  // cacheHitRate - Initialization
  // =============================================================================

  describe('cacheHitRate - Initialization', () => {
    it('should create Counter with correct name', () => {
      require('../../../src/utils/metrics');

      const calls = promClient.Counter.mock.calls;
      const cacheHitCall = calls.find(call => call[0].name === 'cache_hits_total');

      expect(cacheHitCall).toBeDefined();
    });

    it('should create Counter with help text', () => {
      require('../../../src/utils/metrics');

      const calls = promClient.Counter.mock.calls;
      const cacheHitCall = calls.find(call => call[0].name === 'cache_hits_total');

      expect(cacheHitCall[0].help).toBe('Number of cache hits');
    });

    it('should create Counter with labelNames', () => {
      require('../../../src/utils/metrics');

      const calls = promClient.Counter.mock.calls;
      const cacheHitCall = calls.find(call => call[0].name === 'cache_hits_total');

      expect(cacheHitCall[0].labelNames).toEqual(['type']);
    });

    it('should export cacheHitRate', () => {
      const { cacheHitRate } = require('../../../src/utils/metrics');

      expect(cacheHitRate).toBeDefined();
    });

    it('should register cacheHitRate', () => {
      require('../../../src/utils/metrics');

      // Should be called 3 times (searchCounter, searchDuration, cacheHitRate)
      expect(mockRegister.registerMetric).toHaveBeenCalledTimes(3);
    });
  });

  // =============================================================================
  // Register Export
  // =============================================================================

  describe('Register Export', () => {
    it('should export register', () => {
      const { register } = require('../../../src/utils/metrics');

      expect(register).toBe(mockRegister);
    });

    it('should be the prom-client register', () => {
      const { register } = require('../../../src/utils/metrics');

      expect(register).toBe(promClient.register);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export searchCounter', () => {
      const module = require('../../../src/utils/metrics');

      expect(module.searchCounter).toBeDefined();
    });

    it('should export searchDuration', () => {
      const module = require('../../../src/utils/metrics');

      expect(module.searchDuration).toBeDefined();
    });

    it('should export cacheHitRate', () => {
      const module = require('../../../src/utils/metrics');

      expect(module.cacheHitRate).toBeDefined();
    });

    it('should export register', () => {
      const module = require('../../../src/utils/metrics');

      expect(module.register).toBeDefined();
    });

    it('should have all expected exports', () => {
      const module = require('../../../src/utils/metrics');

      expect(Object.keys(module).sort()).toEqual([
        'cacheHitRate',
        'register',
        'searchCounter',
        'searchDuration'
      ].sort());
    });
  });
});
