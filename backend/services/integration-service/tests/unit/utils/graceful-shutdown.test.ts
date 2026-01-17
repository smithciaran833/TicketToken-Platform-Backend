// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock health check service
jest.mock('../../../src/services/health-check.service', () => ({
  healthCheckService: {
    stopMonitoring: jest.fn(),
  },
}));

// Mock idempotency service
jest.mock('../../../src/services/idempotency.service', () => ({
  idempotencyService: {
    stopCleanup: jest.fn(),
  },
}));

// Mock performance metrics service
jest.mock('../../../src/services/performance-metrics.service', () => ({
  performanceMetricsService: {
    clearOldMetrics: jest.fn(),
  },
}));

import { gracefulShutdown, onShutdown } from '../../../src/utils/graceful-shutdown';
import { logger } from '../../../src/utils/logger';
import { healthCheckService } from '../../../src/services/health-check.service';
import { idempotencyService } from '../../../src/services/idempotency.service';
import { performanceMetricsService } from '../../../src/services/performance-metrics.service';

describe('GracefulShutdown', () => {
  let mockServer: any;
  let processOnSpy: jest.SpyInstance;
  let processExitSpy: jest.SpyInstance;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;
  let timeoutCallbacks: Map<number, () => void>;
  let timeoutId: number;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock server
    mockServer = {
      close: jest.fn().mockResolvedValue(undefined),
    };

    // Track process.on calls
    processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);

    // Mock process.exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: number) => {
      return undefined as never;
    });

    // Mock setTimeout/clearTimeout
    timeoutCallbacks = new Map();
    timeoutId = 0;
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    global.setTimeout = ((fn: () => void, _ms: number) => {
      const id = ++timeoutId;
      timeoutCallbacks.set(id, fn);
      return id as unknown as NodeJS.Timeout;
    }) as typeof setTimeout;

    global.clearTimeout = ((id: NodeJS.Timeout) => {
      timeoutCallbacks.delete(id as unknown as number);
    }) as typeof clearTimeout;
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processExitSpy.mockRestore();
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  describe('init', () => {
    it('should register SIGTERM handler', () => {
      gracefulShutdown.init(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should register SIGINT handler', () => {
      gracefulShutdown.init(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });

    it('should register uncaughtException handler', () => {
      gracefulShutdown.init(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should register unhandledRejection handler', () => {
      gracefulShutdown.init(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('should log initialization with default timeout', () => {
      gracefulShutdown.init(mockServer);

      expect(logger.info).toHaveBeenCalledWith('Graceful shutdown initialized', { timeout: 30000 });
    });

    it('should log initialization with custom timeout', () => {
      gracefulShutdown.init(mockServer, { timeout: 60000 });

      expect(logger.info).toHaveBeenCalledWith('Graceful shutdown initialized', { timeout: 60000 });
    });
  });

  describe('isShutdownInProgress', () => {
    it('should return false initially', () => {
      // Create fresh instance for this test
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      expect(instance.isShutdownInProgress()).toBe(false);
    });
  });

  describe('middleware', () => {
    it('should return a middleware function', () => {
      const middleware = gracefulShutdown.middleware();

      expect(typeof middleware).toBe('function');
    });

    it('should not reject requests when not shutting down', async () => {
      // Create fresh instance
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      const middleware = instance.middleware();
      const mockRequest = {};
      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });

    it('should reject requests with 503 when shutting down', async () => {
      // Create fresh instance and set shutting down state
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();
      (instance as any).isShuttingDown = true;

      const middleware = instance.middleware();
      const mockRequest = {};
      const mockReply = {
        code: jest.fn().mockReturnThis(),
        send: jest.fn(),
      };

      await middleware(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(503);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: 'Service is shutting down',
      });
    });
  });

  describe('shutdown', () => {
    let freshInstance: any;

    beforeEach(() => {
      // Create fresh instance for shutdown tests
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      freshInstance = new GracefulShutdownClass();
    });

    it('should prevent multiple shutdown attempts', async () => {
      freshInstance.init(mockServer);

      // Get the SIGTERM handler
      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      // Manually set shutting down
      freshInstance.isShuttingDown = true;

      // Call handler
      await sigtermHandler();

      expect(logger.warn).toHaveBeenCalledWith('Shutdown already in progress');
    });

    it('should close server during shutdown', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      // Get the SIGTERM handler
      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(mockServer.close).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Server closed successfully');
    });

    it('should stop health check monitoring', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(healthCheckService.stopMonitoring).toHaveBeenCalled();
    });

    it('should stop idempotency cleanup', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(idempotencyService.stopCleanup).toHaveBeenCalled();
    });

    it('should clear old performance metrics', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(performanceMetricsService.clearOldMetrics).toHaveBeenCalled();
    });

    it('should run custom shutdown handler if provided', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      const customHandler = jest.fn().mockResolvedValue(undefined);
      instance.init(mockServer, { onShutdown: customHandler });

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(customHandler).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Running custom shutdown handler...');
    });

    it('should exit with code 0 on successful shutdown', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(processExitSpy).toHaveBeenCalledWith(0);
      expect(logger.info).toHaveBeenCalledWith('Graceful shutdown completed successfully');
    });

    it('should exit with code 1 on shutdown error', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      const failingServer = {
        close: jest.fn().mockRejectedValue(new Error('Close failed')),
      };

      instance.init(failingServer);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown', {
        error: 'Close failed',
      });
    });

    it('should handle non-Error objects during shutdown failure', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      const failingServer = {
        close: jest.fn().mockRejectedValue('string error'),
      };

      instance.init(failingServer);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(logger.error).toHaveBeenCalledWith('Error during graceful shutdown', {
        error: 'Unknown error',
      });
    });

    it('should log signal type on shutdown', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const sigintCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGINT');
      const sigintHandler = sigintCall[1];

      await sigintHandler();

      expect(logger.info).toHaveBeenCalledWith('Received SIGINT, starting graceful shutdown...');
    });

    it('should handle uncaughtException with error logging', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const uncaughtCall = processOnSpy.mock.calls.find(call => call[0] === 'uncaughtException');
      const uncaughtHandler = uncaughtCall[1];

      const testError = new Error('Test uncaught error');
      await uncaughtHandler(testError);

      expect(logger.error).toHaveBeenCalledWith('Uncaught exception', {
        error: 'Test uncaught error',
        stack: testError.stack,
      });
    });

    it('should handle unhandledRejection with logging', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(mockServer);

      const rejectionCall = processOnSpy.mock.calls.find(call => call[0] === 'unhandledRejection');
      const rejectionHandler = rejectionCall[1];

      const reason = 'Test rejection reason';
      const promise = Promise.resolve();

      await rejectionHandler(reason, promise);

      expect(logger.error).toHaveBeenCalledWith('Unhandled rejection', { reason, promise });
    });

    it('should work without server', async () => {
      const GracefulShutdownClass = (gracefulShutdown as any).constructor;
      const instance = new GracefulShutdownClass();

      instance.init(null as any);

      const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
      const sigtermHandler = sigtermCall[1];

      await sigtermHandler();

      expect(processExitSpy).toHaveBeenCalledWith(0);
    });
  });
});

describe('onShutdown', () => {
  let processOnSpy: jest.SpyInstance;
  let processListenersSpy: jest.SpyInstance;
  let processRemoveListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    processOnSpy = jest.spyOn(process, 'on').mockImplementation(() => process);
    processListenersSpy = jest.spyOn(process, 'listeners');
    processRemoveListenerSpy = jest.spyOn(process, 'removeListener').mockImplementation(() => process);
  });

  afterEach(() => {
    processOnSpy.mockRestore();
    processListenersSpy.mockRestore();
    processRemoveListenerSpy.mockRestore();
  });

  it('should register a SIGTERM handler', () => {
    processListenersSpy.mockReturnValue([]);

    const cleanup = jest.fn().mockResolvedValue(undefined);
    onShutdown(cleanup);

    expect(processOnSpy).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
  });

  it('should call cleanup function when SIGTERM received', async () => {
    processListenersSpy.mockReturnValue([]);

    const cleanup = jest.fn().mockResolvedValue(undefined);
    onShutdown(cleanup);

    // Get the registered handler
    const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
    const handler = sigtermCall[1];

    await handler();

    expect(cleanup).toHaveBeenCalled();
  });

  it('should remove existing handler and call it after cleanup', async () => {
    const existingHandler = jest.fn();
    processListenersSpy.mockReturnValue([existingHandler]);

    const cleanup = jest.fn().mockResolvedValue(undefined);
    onShutdown(cleanup);

    expect(processRemoveListenerSpy).toHaveBeenCalledWith('SIGTERM', existingHandler);

    // Get the new handler and call it
    const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
    const handler = sigtermCall[1];

    await handler();

    expect(cleanup).toHaveBeenCalled();
    expect(existingHandler).toHaveBeenCalled();
  });

  it('should log error if cleanup fails', async () => {
    processListenersSpy.mockReturnValue([]);

    const cleanup = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
    onShutdown(cleanup);

    const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
    const handler = sigtermCall[1];

    await handler();

    expect(logger.error).toHaveBeenCalledWith('Error in shutdown cleanup', {
      error: 'Cleanup failed',
    });
  });

  it('should handle non-Error objects in cleanup failure', async () => {
    processListenersSpy.mockReturnValue([]);

    const cleanup = jest.fn().mockRejectedValue('string error');
    onShutdown(cleanup);

    const sigtermCall = processOnSpy.mock.calls.find(call => call[0] === 'SIGTERM');
    const handler = sigtermCall[1];

    await handler();

    expect(logger.error).toHaveBeenCalledWith('Error in shutdown cleanup', {
      error: 'Unknown error',
    });
  });
});
