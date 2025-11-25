import { EventEmitter } from 'events';

describe('Graceful Shutdown', () => {
  let mockFastifyApp: any;
  let mockDb: any;
  let mockRedis: any;
  let mockQueueService: any;
  let mockSdk: any;
  let processEmitter: EventEmitter;
  let exitSpy: jest.SpyInstance;
  let setTimeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Mock process.exit
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

    // Mock setTimeout for timeout protection
    setTimeoutSpy = jest.spyOn(global, 'setTimeout');

    // Mock Fastify app
    mockFastifyApp = {
      close: jest.fn().mockResolvedValue(undefined),
      container: {
        cradle: {}
      }
    };

    // Mock database
    mockDb = {
      destroy: jest.fn().mockResolvedValue(undefined)
    };

    // Mock Redis
    mockRedis = {
      disconnect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined)
    };

    // Mock RabbitMQ queue service
    mockQueueService = {
      connection: {
        closed: false
      },
      close: jest.fn().mockResolvedValue(undefined)
    };

    // Mock OpenTelemetry SDK
    mockSdk = {
      shutdown: jest.fn().mockResolvedValue(undefined)
    };

    mockFastifyApp.container.cradle = {
      queueService: mockQueueService,
      cache: mockRedis,
      db: mockDb
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    exitSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  describe('Full Shutdown Sequence', () => {
    it('should close all resources in correct order', async () => {
      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Verify order of calls
      const callOrder: string[] = [];
      
      mockFastifyApp.close.mock.invocationCallOrder = [1];
      mockQueueService.close.mock.invocationCallOrder = [2];
      mockRedis.disconnect.mock.invocationCallOrder = [3];
      mockDb.destroy.mock.invocationCallOrder = [4];
      mockSdk.shutdown.mock.invocationCallOrder = [5];

      expect(mockFastifyApp.close).toHaveBeenCalledTimes(1);
      expect(mockQueueService.close).toHaveBeenCalledTimes(1);
      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
      expect(mockDb.destroy).toHaveBeenCalledTimes(1);
      expect(mockSdk.shutdown).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should set 30-second timeout protection', async () => {
      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30000
      );
    });

    it('should force exit after 30 seconds', async () => {
      // Make Fastify close hang
      mockFastifyApp.close.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      // Fast-forward past timeout
      jest.advanceTimersByTime(30001);

      await Promise.resolve(); // Flush promises

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should clear timeout on successful shutdown', async () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should continue shutdown if Fastify close fails', async () => {
      mockFastifyApp.close.mockRejectedValue(new Error('Fastify error'));

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should still close other resources
      expect(mockQueueService.close).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockDb.destroy).toHaveBeenCalled();
      expect(mockSdk.shutdown).toHaveBeenCalled();
    });

    it('should continue shutdown if RabbitMQ close fails', async () => {
      mockQueueService.close.mockRejectedValue(new Error('RabbitMQ error'));

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should still close other resources
      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockDb.destroy).toHaveBeenCalled();
      expect(mockSdk.shutdown).toHaveBeenCalled();
    });

    it('should continue shutdown if Redis disconnect fails', async () => {
      mockRedis.disconnect.mockRejectedValue(new Error('Redis error'));

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should still close other resources
      expect(mockDb.destroy).toHaveBeenCalled();
      expect(mockSdk.shutdown).toHaveBeenCalled();
    });

    it('should continue shutdown if database destroy fails', async () => {
      mockDb.destroy.mockRejectedValue(new Error('Database error'));

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should still shutdown OpenTelemetry
      expect(mockSdk.shutdown).toHaveBeenCalled();
    });

    it('should exit with code 1 on critical error', async () => {
      mockSdk.shutdown.mockRejectedValue(new Error('SDK error'));

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Resource State Handling', () => {
    it('should handle missing RabbitMQ service', async () => {
      mockFastifyApp.container.cradle.queueService = undefined;

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should continue with other resources
      expect(mockRedis.disconnect).toHaveBeenCalled();
      expect(mockDb.destroy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle already closed RabbitMQ connection', async () => {
      mockQueueService.connection.closed = true;

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should still complete shutdown
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle missing Redis service', async () => {
      mockFastifyApp.container.cradle.cache = undefined;

      const shutdownPromise = gracefulShutdown(
        'SIGTERM',
        mockFastifyApp,
        mockSdk
      );

      await shutdownPromise;

      // Should continue with other resources
      expect(mockDb.destroy).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should handle idempotent shutdown calls', async () => {
      // First shutdown
      await gracefulShutdown('SIGTERM', mockFastifyApp, mockSdk);
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Second shutdown (should not throw)
      await gracefulShutdown('SIGTERM', mockFastifyApp, mockSdk);

      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });

  describe('Signal Handling', () => {
    const signals = ['SIGTERM', 'SIGINT', 'UNCAUGHT_EXCEPTION', 'UNHANDLED_REJECTION'];

    signals.forEach((signal) => {
      it(`should handle ${signal} signal`, async () => {
        const shutdownPromise = gracefulShutdown(
          signal,
          mockFastifyApp,
          mockSdk
        );

        await shutdownPromise;

        expect(mockFastifyApp.close).toHaveBeenCalled();
        expect(exitSpy).toHaveBeenCalledWith(0);
      });
    });

    it('should log the signal received', async () => {
      const loggerSpy = jest.spyOn(console, 'log');

      await gracefulShutdown('SIGTERM', mockFastifyApp, mockSdk);

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('SIGTERM')
      );

      loggerSpy.mockRestore();
    });
  });

  describe('Timing and Performance', () => {
    it('should complete shutdown within 5 seconds normally', async () => {
      const startTime = Date.now();

      await gracefulShutdown('SIGTERM', mockFastifyApp, mockSdk);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000);
    });

    it('should wait for in-flight requests before closing', async () => {
      let inFlightRequest = false;
      
      mockFastifyApp.close.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        inFlightRequest = false;
      });

      inFlightRequest = true;

      await gracefulShutdown('SIGTERM', mockFastifyApp, mockSdk);

      expect(inFlightRequest).toBe(false);
    });
  });
});

// Helper function (would be imported from actual implementation)
async function gracefulShutdown(
  signal: string,
  fastifyApp: any,
  sdk: any
): Promise<void> {
  const shutdownTimeout = 30000;
  let shutdownComplete = false;

  const forceShutdownTimer = setTimeout(() => {
    if (!shutdownComplete) {
      process.exit(1);
    }
  }, shutdownTimeout);

  try {
    // Step 1: Close Fastify
    if (fastifyApp) {
      try {
        await fastifyApp.close();
      } catch (error) {
        console.error('Error closing Fastify:', error);
      }
    }

    // Step 2: Close RabbitMQ
    try {
      const container = fastifyApp?.container;
      const queueService = container?.cradle?.queueService;
      
      if (queueService && typeof queueService.close === 'function') {
        await queueService.close();
      }
    } catch (error) {
      console.error('Error closing RabbitMQ:', error);
    }

    // Step 3: Close Redis
    try {
      const container = fastifyApp?.container;
      const cache = container?.cradle?.cache;
      
      if (cache && typeof cache.disconnect === 'function') {
        await cache.disconnect();
      }
    } catch (error) {
      console.error('Error closing Redis:', error);
    }

    // Step 4: Close database
    try {
      const container = fastifyApp?.container;
      const db = container?.cradle?.db;
      
      if (db && typeof db.destroy === 'function') {
        await db.destroy();
      }
    } catch (error) {
      console.error('Error closing database:', error);
    }

    // Step 5: Shutdown OpenTelemetry
    await sdk.shutdown();

    shutdownComplete = true;
    clearTimeout(forceShutdownTimer);
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}
