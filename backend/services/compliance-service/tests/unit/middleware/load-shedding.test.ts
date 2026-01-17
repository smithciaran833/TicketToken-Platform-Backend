/**
 * Unit Tests for Load Shedding Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('Load Shedding Middleware', () => {
  let createLoadSheddingMiddleware: any;
  let setupLoadShedding: any;
  let getLoadState: any;
  let forceOverload: any;
  let clearOverload: any;
  let stopMonitoring: any;
  let logger: any;

  let mockRequest: any;
  let mockReply: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    process.env = { ...originalEnv };

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const module = await import('../../../src/middleware/load-shedding');
    createLoadSheddingMiddleware = module.createLoadSheddingMiddleware;
    setupLoadShedding = module.setupLoadShedding;
    getLoadState = module.getLoadState;
    forceOverload = module.forceOverload;
    clearOverload = module.clearOverload;
    stopMonitoring = module.stopMonitoring;

    // Clear any previous state
    clearOverload();

    mockRequest = {
      url: '/api/test',
      method: 'GET',
      requestId: 'req-123'
    };

    mockReply = {
      raw: {
        on: jest.fn<(event: string, callback: () => void) => void>()
      },
      code: jest.fn<(code: number) => any>().mockReturnThis(),
      header: jest.fn<(name: string, value: any) => any>().mockReturnThis(),
      send: jest.fn<(body: any) => any>().mockReturnThis()
    };
  });

  afterEach(async () => {
    process.env = originalEnv;
    stopMonitoring();
    clearOverload();
    jest.clearAllMocks();
    // Small delay to let any pending promises resolve
    await new Promise(resolve => setImmediate(resolve));
  });

  describe('createLoadSheddingMiddleware', () => {
    it('should allow requests when not overloaded', async () => {
      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should reject requests when overloaded', async () => {
      forceOverload('Test overload');

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', 30);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 503,
          title: 'Service Unavailable'
        })
      );
    });

    it('should exclude health check paths', async () => {
      forceOverload('Test overload');
      mockRequest.url = '/health';

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalledWith(503);
    });

    it('should exclude /ready path', async () => {
      forceOverload('Test overload');
      mockRequest.url = '/ready';

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalledWith(503);
    });

    it('should exclude /metrics path', async () => {
      forceOverload('Test overload');
      mockRequest.url = '/metrics';

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalledWith(503);
    });

    it('should exclude paths with query strings', async () => {
      forceOverload('Test overload');
      mockRequest.url = '/health?check=true';

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalledWith(503);
    });

    it('should use custom retry-after value', async () => {
      forceOverload('Test overload');

      const middleware = createLoadSheddingMiddleware({ 
        retryAfterSeconds: 60,
        checkIntervalMs: 60000 
      });
      await middleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', 60);
    });

    it('should log warning when rejecting request', async () => {
      forceOverload('High memory usage');

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          reason: 'High memory usage'
        }),
        expect.stringContaining('Request rejected due to load shedding')
      );
    });

    it('should include request instance in error response', async () => {
      forceOverload('Test overload');
      mockRequest.requestId = 'unique-req-456';

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          instance: 'unique-req-456'
        })
      );
    });

    it('should increment concurrent request counter', async () => {
      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      
      const initialState = getLoadState();
      const initialConcurrent = initialState.concurrentRequests;

      await middleware(mockRequest, mockReply);

      const newState = getLoadState();
      expect(newState.concurrentRequests).toBe(initialConcurrent + 1);
    });

    it('should decrement counter on response finish', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      const stateBeforeFinish = getLoadState();
      finishCallback();
      const stateAfterFinish = getLoadState();

      expect(stateAfterFinish.concurrentRequests).toBe(stateBeforeFinish.concurrentRequests - 1);
    });

    it('should not go below zero concurrent requests', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });

      const middleware = createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      await middleware(mockRequest, mockReply);

      // Call finish multiple times
      finishCallback();
      finishCallback();
      finishCallback();

      const state = getLoadState();
      expect(state.concurrentRequests).toBeGreaterThanOrEqual(0);
    });

    it('should use custom exclude paths', async () => {
      forceOverload('Test overload');
      mockRequest.url = '/custom/path';

      const middleware = createLoadSheddingMiddleware({
        excludePaths: ['/custom/path'],
        checkIntervalMs: 60000
      });
      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalledWith(503);
    });
  });

  describe('setupLoadShedding', () => {
    it('should register preHandler hook', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>()
      };

      setupLoadShedding(mockFastify as any, { checkIntervalMs: 60000 });

      expect(mockFastify.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should register onClose hook for cleanup', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>()
      };

      setupLoadShedding(mockFastify as any, { checkIntervalMs: 60000 });

      expect(mockFastify.addHook).toHaveBeenCalledWith('onClose', expect.any(Function));
    });

    it('should log initialization with config', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>()
      };

      setupLoadShedding(mockFastify as any, {
        eventLoopLagCritical: 500,
        memoryCritical: 0.95,
        checkIntervalMs: 60000
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            eventLoopLagCritical: 500
          })
        }),
        expect.stringContaining('Load shedding middleware initialized')
      );
    });

    it('should use custom config values', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>()
      };

      setupLoadShedding(mockFastify as any, {
        maxConcurrentRequests: 500,
        retryAfterSeconds: 45,
        checkIntervalMs: 60000
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            maxConcurrentRequests: 500
          })
        }),
        expect.any(String)
      );
    });
  });

  describe('getLoadState', () => {
    it('should return current load state', () => {
      const state = getLoadState();

      expect(state).toHaveProperty('eventLoopLag');
      expect(state).toHaveProperty('memoryUsage');
      expect(state).toHaveProperty('concurrentRequests');
      expect(state).toHaveProperty('lastCheck');
      expect(state).toHaveProperty('isOverloaded');
      expect(state).toHaveProperty('overloadReason');
    });

    it('should return immutable copy', () => {
      const state1 = getLoadState();
      const state2 = getLoadState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('forceOverload', () => {
    it('should set overloaded state', () => {
      forceOverload('Test reason');

      const state = getLoadState();
      expect(state.isOverloaded).toBe(true);
      expect(state.overloadReason).toBe('Test reason');
    });
  });

  describe('clearOverload', () => {
    it('should clear overloaded state', () => {
      forceOverload('Test reason');
      clearOverload();

      const state = getLoadState();
      expect(state.isOverloaded).toBe(false);
      expect(state.overloadReason).toBeNull();
    });
  });

  describe('stopMonitoring', () => {
    it('should stop background monitoring', () => {
      createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      
      // Should not throw
      expect(() => stopMonitoring()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      createLoadSheddingMiddleware({ checkIntervalMs: 60000 });
      
      expect(() => {
        stopMonitoring();
        stopMonitoring();
        stopMonitoring();
      }).not.toThrow();
    });
  });

  describe('default export', () => {
    it('should export setupLoadShedding as default', async () => {
      const module = await import('../../../src/middleware/load-shedding');
      
      expect(module.default).toBe(setupLoadShedding);
    });
  });
});
