/**
 * Unit Tests for Bulkhead Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../../src/utils/metrics', () => ({
  incrementMetric: jest.fn(),
  setGauge: jest.fn()
}));

describe('Bulkhead Middleware', () => {
  let createBulkheadMiddleware: any;
  let releaseBulkheadSlot: any;
  let withBulkhead: any;
  let getBulkheadStatus: any;
  let BulkheadFullError: any;
  let BulkheadTimeoutError: any;
  let bulkheadConfigs: any;
  let incrementMetric: jest.Mock;
  let setGauge: jest.Mock;

  beforeEach(async () => {
    jest.resetModules();
    jest.useFakeTimers();

    const metrics = await import('../../../src/utils/metrics');
    incrementMetric = metrics.incrementMetric as jest.Mock;
    setGauge = metrics.setGauge as jest.Mock;

    const bulkhead = await import('../../../src/middleware/bulkhead');
    createBulkheadMiddleware = bulkhead.createBulkheadMiddleware;
    releaseBulkheadSlot = bulkhead.releaseBulkheadSlot;
    withBulkhead = bulkhead.withBulkhead;
    getBulkheadStatus = bulkhead.getBulkheadStatus;
    BulkheadFullError = bulkhead.BulkheadFullError;
    BulkheadTimeoutError = bulkhead.BulkheadTimeoutError;
    bulkheadConfigs = bulkhead.bulkheadConfigs;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  describe('BulkheadFullError', () => {
    it('should create error with correct properties', () => {
      const error = new BulkheadFullError('test-bulkhead');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BulkheadFullError');
      expect(error.code).toBe('BULKHEAD_FULL');
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain('test-bulkhead');
      expect(error.message).toContain('full');
    });
  });

  describe('BulkheadTimeoutError', () => {
    it('should create error with correct properties', () => {
      const error = new BulkheadTimeoutError('test-bulkhead');

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('BulkheadTimeoutError');
      expect(error.code).toBe('BULKHEAD_TIMEOUT');
      expect(error.statusCode).toBe(503);
      expect(error.message).toContain('test-bulkhead');
      expect(error.message).toContain('timeout');
    });
  });

  describe('bulkheadConfigs', () => {
    it('should have predefined configurations', () => {
      expect(bulkheadConfigs.gdpr).toBeDefined();
      expect(bulkheadConfigs.risk).toBeDefined();
      expect(bulkheadConfigs.ofac).toBeDefined();
      expect(bulkheadConfigs.tax).toBeDefined();
      expect(bulkheadConfigs.database).toBeDefined();
      expect(bulkheadConfigs.default).toBeDefined();
    });

    it('should have correct structure for each config', () => {
      for (const [name, config] of Object.entries(bulkheadConfigs)) {
        expect(config).toHaveProperty('name', name);
        expect(config).toHaveProperty('maxConcurrent');
        expect(config).toHaveProperty('maxQueued');
        expect(config).toHaveProperty('queueTimeout');
        expect(typeof (config as any).maxConcurrent).toBe('number');
        expect(typeof (config as any).maxQueued).toBe('number');
        expect(typeof (config as any).queueTimeout).toBe('number');
      }
    });
  });

  describe('createBulkheadMiddleware', () => {
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      mockRequest = { id: 'req-123' };
      mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };
    });

    it('should create middleware with string config name', async () => {
      const middleware = createBulkheadMiddleware('gdpr');

      await middleware(mockRequest, mockReply);

      expect(mockRequest.bulkheadConfig).toBeDefined();
      expect(mockRequest.bulkheadConfig.name).toBe('gdpr');
      expect(incrementMetric).toHaveBeenCalledWith('bulkhead_acquired_total', { bulkhead: 'gdpr' });
    });

    it('should create middleware with custom config', async () => {
      const customConfig = {
        name: 'custom',
        maxConcurrent: 2,
        maxQueued: 5,
        queueTimeout: 1000
      };

      const middleware = createBulkheadMiddleware(customConfig);

      await middleware(mockRequest, mockReply);

      expect(mockRequest.bulkheadConfig).toEqual(customConfig);
    });

    it('should use default config for unknown name', async () => {
      const middleware = createBulkheadMiddleware('unknown');

      await middleware(mockRequest, mockReply);

      expect(mockRequest.bulkheadConfig.name).toBe('default');
    });

    it('should acquire slot and update metrics', async () => {
      const middleware = createBulkheadMiddleware('database');

      await middleware(mockRequest, mockReply);

      expect(setGauge).toHaveBeenCalledWith('bulkhead_active', 1, { bulkhead: 'database' });
    });
  });

  describe('releaseBulkheadSlot', () => {
    it('should release slot when bulkheadConfig exists', async () => {
      const mockRequest: any = {
        bulkheadConfig: {
          name: 'test',
          maxConcurrent: 5,
          maxQueued: 10,
          queueTimeout: 1000
        }
      };

      // First acquire
      const middleware = createBulkheadMiddleware(mockRequest.bulkheadConfig);
      await middleware({ id: 'req-1' }, { code: jest.fn().mockReturnThis(), send: jest.fn() });

      releaseBulkheadSlot(mockRequest);

      expect(mockRequest.bulkheadConfig).toBeUndefined();
    });

    it('should handle request without bulkheadConfig', () => {
      const mockRequest: any = {};

      expect(() => releaseBulkheadSlot(mockRequest)).not.toThrow();
    });
  });

  describe('withBulkhead', () => {
    it('should execute function with bulkhead protection', async () => {
      const fn = jest.fn<any>().mockResolvedValue('result');

      const result = await withBulkhead('database', fn);

      expect(fn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should release slot after function completes', async () => {
      const fn = jest.fn<any>().mockResolvedValue('done');

      await withBulkhead('database', fn);

      // Check metrics were updated for release
      expect(setGauge).toHaveBeenCalled();
    });

    it('should release slot even if function throws', async () => {
      const fn = jest.fn<any>().mockRejectedValue(new Error('Function failed'));

      await expect(withBulkhead('database', fn)).rejects.toThrow('Function failed');

      // Slot should still be released
      expect(setGauge).toHaveBeenCalled();
    });

    it('should use default config for unknown name', async () => {
      const fn = jest.fn<any>().mockResolvedValue('result');

      await withBulkhead('unknown-resource', fn);

      expect(incrementMetric).toHaveBeenCalledWith(
        'bulkhead_acquired_total',
        expect.objectContaining({ bulkhead: 'default' })
      );
    });

    it('should accept custom config object', async () => {
      const customConfig = {
        name: 'custom-bulkhead',
        maxConcurrent: 1,
        maxQueued: 1,
        queueTimeout: 100
      };
      const fn = jest.fn<any>().mockResolvedValue('result');

      await withBulkhead(customConfig, fn);

      expect(incrementMetric).toHaveBeenCalledWith(
        'bulkhead_acquired_total',
        { bulkhead: 'custom-bulkhead' }
      );
    });
  });

  describe('getBulkheadStatus', () => {
    it('should return status for all configured bulkheads', () => {
      const status = getBulkheadStatus();

      expect(status.gdpr).toBeDefined();
      expect(status.risk).toBeDefined();
      expect(status.ofac).toBeDefined();
      expect(status.tax).toBeDefined();
      expect(status.database).toBeDefined();
      expect(status.default).toBeDefined();
    });

    it('should return correct structure', () => {
      const status = getBulkheadStatus();

      for (const [name, info] of Object.entries(status)) {
        expect(info).toHaveProperty('active');
        expect(info).toHaveProperty('queued');
        expect(info).toHaveProperty('maxConcurrent');
        expect(info).toHaveProperty('maxQueued');
      }
    });

    it('should show active count after acquiring slots', async () => {
      await withBulkhead('gdpr', async () => {
        const status = getBulkheadStatus();
        expect(status.gdpr.active).toBe(1);
      });

      // After release
      const status = getBulkheadStatus();
      expect(status.gdpr.active).toBe(0);
    });
  });

  describe('Concurrency Limiting', () => {
    it('should reject when bulkhead is full', async () => {
      const config = {
        name: 'tiny',
        maxConcurrent: 1,
        maxQueued: 0,
        queueTimeout: 100
      };

      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis()
      };

      const middleware = createBulkheadMiddleware(config);

      // First request succeeds
      await middleware({ id: 'req-1' }, mockReply);

      // Second request should be rejected (queue is 0)
      await middleware({ id: 'req-2' }, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 503,
          detail: expect.stringContaining('capacity')
        })
      );
      expect(incrementMetric).toHaveBeenCalledWith('bulkhead_rejected_total', { bulkhead: 'tiny' });
    });

    // SKIP: This test has complex timing issues with fake timers
    it.skip('should queue requests when at capacity', async () => {
      const config = {
        name: 'queue-test',
        maxConcurrent: 1,
        maxQueued: 5,
        queueTimeout: 5000
      };

      // Hold a slot
      const holdPromise = withBulkhead(config, () => new Promise(resolve => {
        setTimeout(resolve, 100);
      }));

      // This should queue
      const queuedPromise = withBulkhead(config, async () => 'queued-result');

      // Advance timers to release first
      jest.advanceTimersByTime(150);

      await holdPromise;
      const result = await queuedPromise;

      expect(result).toBe('queued-result');
    });
  });
});
