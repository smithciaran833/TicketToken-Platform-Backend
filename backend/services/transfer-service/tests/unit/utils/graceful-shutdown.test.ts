import { FastifyInstance } from 'fastify';
import { Pool } from 'pg';
import { Redis } from 'ioredis';
import {
  createShutdownManager,
  createShutdownMiddleware,
  ShutdownManager
} from '../../../src/utils/graceful-shutdown';

describe('Graceful Shutdown - Unit Tests', () => {
  let mockFastify: jest.Mocked<FastifyInstance>;
  let mockPool: jest.Mocked<Pool>;
  let mockRedis: jest.Mocked<Redis>;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalProcessExit: typeof process.exit;
  let shutdownManager: ShutdownManager;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock console to avoid test output noise
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();

    // Mock process.exit
    originalProcessExit = process.exit;
    process.exit = jest.fn() as any;

    // Create mocks
    mockFastify = {
      close: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockPool = {
      end: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockRedis = {
      quit: jest.fn().mockResolvedValue('OK')
    } as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    process.exit = originalProcessExit;

    // Remove all listeners to prevent leaks
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
  });

  describe('createShutdownManager', () => {
    it('should create shutdown manager with all resources', () => {
      const manager = createShutdownManager(mockFastify, {
        db: mockPool,
        redis: mockRedis
      });

      expect(manager).toBeDefined();
      expect(manager.isShuttingDown).toBe(false);
      expect(typeof manager.shutdown).toBe('function');
    });

    it('should create shutdown manager without optional resources', () => {
      const manager = createShutdownManager(mockFastify, {});

      expect(manager).toBeDefined();
      expect(manager.isShuttingDown).toBe(false);
    });

    it('should register signal handlers', () => {
      const sigtermListeners = process.listenerCount('SIGTERM');
      const sigintListeners = process.listenerCount('SIGINT');

      createShutdownManager(mockFastify, {});

      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(sigtermListeners);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(sigintListeners);
    });

    it('should register uncaught exception handler', () => {
      const uncaughtListeners = process.listenerCount('uncaughtException');

      createShutdownManager(mockFastify, {});

      expect(process.listenerCount('uncaughtException')).toBeGreaterThan(uncaughtListeners);
    });

    it('should register unhandled rejection handler', () => {
      const rejectionListeners = process.listenerCount('unhandledRejection');

      createShutdownManager(mockFastify, {});

      expect(process.listenerCount('unhandledRejection')).toBeGreaterThan(rejectionListeners);
    });
  });

  describe('shutdown()', () => {
    beforeEach(() => {
      shutdownManager = createShutdownManager(mockFastify, {
        db: mockPool,
        redis: mockRedis
      });
    });

    it('should perform graceful shutdown in order', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      // Fast-forward through grace period
      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(mockFastify.close).toHaveBeenCalled();
      expect(mockPool.end).toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should close server first', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      const closeCallOrder = (mockFastify.close as jest.Mock).mock.invocationCallOrder[0];
      const dbCallOrder = (mockPool.end as jest.Mock).mock.invocationCallOrder[0];

      expect(closeCallOrder).toBeLessThan(dbCallOrder);
    });

    it('should wait grace period before closing connections', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      // Should not close DB yet
      expect(mockPool.end).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      // Now DB should be closed
      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should close database connections', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should close redis connections', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(mockRedis.quit).toHaveBeenCalled();
    });

    it('should run additional cleanup when provided', async () => {
      const additionalCleanup = jest.fn().mockResolvedValue(undefined);

      shutdownManager = createShutdownManager(mockFastify, {
        db: mockPool,
        redis: mockRedis,
        additionalCleanup
      });

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(additionalCleanup).toHaveBeenCalled();
    });

    it('should set isShuttingDown flag', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      expect(shutdownManager.isShuttingDown).toBe(true);

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;
    });

    it('should prevent duplicate shutdown', async () => {
      const promise1 = shutdownManager.shutdown('SIGTERM');
      const promise2 = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await Promise.all([promise1, promise2]);

      expect(mockFastify.close).toHaveBeenCalledTimes(1);
    });

    it('should exit with 0 on success', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should exit with 1 on error', async () => {
      mockFastify.close.mockRejectedValue(new Error('Close error'));

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should force exit after timeout', async () => {
      mockFastify.close.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 60000))
      );

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      // Fast-forward to timeout
      await jest.advanceTimersByTimeAsync(30000);

      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should work without database', async () => {
      shutdownManager = createShutdownManager(mockFastify, {
        redis: mockRedis
      });

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(mockPool.end).not.toHaveBeenCalled();
      expect(mockRedis.quit).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should work without redis', async () => {
      shutdownManager = createShutdownManager(mockFastify, {
        db: mockPool
      });

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(mockPool.end).toHaveBeenCalled();
      expect(mockRedis.quit).not.toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should work with only server', async () => {
      shutdownManager = createShutdownManager(mockFastify, {});

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(mockFastify.close).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle database close errors gracefully', async () => {
      mockPool.end.mockRejectedValue(new Error('DB close error'));

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(console.error).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle redis close errors gracefully', async () => {
      mockRedis.quit.mockRejectedValue(new Error('Redis close error'));

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(console.error).toHaveBeenCalled();
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should log shutdown signal', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('SIGTERM')
      );
    });

    it('should log each shutdown step', async () => {
      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Stopping new connections')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Waiting for ongoing requests')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Closing database connections')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Closing Redis connections')
      );
    });
  });

  describe('Signal Handlers', () => {
    it('should handle SIGTERM', async () => {
      shutdownManager = createShutdownManager(mockFastify, { db: mockPool });

      process.emit('SIGTERM' as any);

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockFastify.close).toHaveBeenCalled();
    });

    it('should handle SIGINT', async () => {
      shutdownManager = createShutdownManager(mockFastify, { db: mockPool });

      process.emit('SIGINT' as any);

      await jest.advanceTimersByTimeAsync(5000);

      expect(mockFastify.close).toHaveBeenCalled();
    });

    it('should handle uncaught exception', async () => {
      shutdownManager = createShutdownManager(mockFastify, { db: mockPool });

      const error = new Error('Uncaught error');
      process.emit('uncaughtException' as any, error);

      await jest.advanceTimersByTimeAsync(5000);

      expect(console.error).toHaveBeenCalledWith('Uncaught Exception:', error);
      expect(mockFastify.close).toHaveBeenCalled();
    });

    it('should handle unhandled rejection', async () => {
      shutdownManager = createShutdownManager(mockFastify, { db: mockPool });

      const reason = new Error('Unhandled rejection');
      const promise = Promise.reject(reason);
      
      process.emit('unhandledRejection' as any, reason, promise);

      await jest.advanceTimersByTimeAsync(5000);

      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Unhandled Rejection'),
        promise,
        expect.stringContaining('reason'),
        reason
      );
      expect(mockFastify.close).toHaveBeenCalled();
    });
  });

  describe('createShutdownMiddleware', () => {
    let mockRequest: any;
    let mockReply: any;
    let sendMock: jest.Mock;
    let codeMock: jest.Mock;

    beforeEach(() => {
      sendMock = jest.fn().mockReturnThis();
      codeMock = jest.fn().mockReturnThis();

      mockRequest = {};
      mockReply = {
        code: codeMock,
        send: sendMock
      };

      shutdownManager = createShutdownManager(mockFastify, {});
    });

    it('should create middleware function', () => {
      const middleware = createShutdownMiddleware(shutdownManager);

      expect(typeof middleware).toBe('function');
    });

    it('should allow requests when not shutting down', async () => {
      const middleware = createShutdownMiddleware(shutdownManager);

      await middleware(mockRequest, mockReply);

      expect(codeMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('should reject requests during shutdown', async () => {
      const middleware = createShutdownMiddleware(shutdownManager);

      // Start shutdown
      shutdownManager.shutdown('SIGTERM');

      await middleware(mockRequest, mockReply);

      expect(codeMock).toHaveBeenCalledWith(503);
      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Service Unavailable',
          message: expect.stringContaining('shutting down')
        })
      );
    });

    it('should return 503 status code', async () => {
      const middleware = createShutdownMiddleware(shutdownManager);

      shutdownManager.shutdown('SIGTERM');
      await middleware(mockRequest, mockReply);

      expect(codeMock).toHaveBeenCalledWith(503);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple shutdown signals', async () => {
      shutdownManager = createShutdownManager(mockFastify, { db: mockPool });

      process.emit('SIGTERM' as any);
      process.emit('SIGINT' as any);
      process.emit('SIGTERM' as any);

      await jest.advanceTimersByTimeAsync(5000);

      // Should only shutdown once
      expect(mockFastify.close).toHaveBeenCalledTimes(1);
    });

    it('should handle very fast shutdown', async () => {
      mockFastify.close.mockResolvedValue(undefined);
      mockPool.end.mockResolvedValue(undefined);
      mockRedis.quit.mockResolvedValue('OK');

      shutdownManager = createShutdownManager(mockFastify, {
        db: mockPool,
        redis: mockRedis
      });

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(process.exit).toHaveBeenCalledWith(0);
    });

    it('should handle slow fastify close', async () => {
      mockFastify.close.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 10000))
      );

      shutdownManager = createShutdownManager(mockFastify, { db: mockPool });

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(15000);
      await shutdownPromise;

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should clear timeout on successful shutdown', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      shutdownManager = createShutdownManager(mockFastify, {});

      const shutdownPromise = shutdownManager.shutdown('SIGTERM');

      await jest.advanceTimersByTimeAsync(5000);
      await shutdownPromise;

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });
});
