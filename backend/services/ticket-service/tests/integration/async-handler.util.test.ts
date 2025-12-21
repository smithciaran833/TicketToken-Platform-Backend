import { setupGlobalErrorHandlers } from '../../src/utils/async-handler';

/**
 * INTEGRATION TESTS FOR ASYNC HANDLER UTILITY
 * Tests global error handler setup and error catching
 */

describe('Async Handler Utility Integration Tests', () => {
  let originalUncaughtException: any;
  let originalUnhandledRejection: any;
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    // Save original handlers
    originalUncaughtException = process.listeners('uncaughtException');
    originalUnhandledRejection = process.listeners('unhandledRejection');

    // Remove all existing listeners
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    // Mock process.exit
    exitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process.exit called with code ${code}`);
      return undefined as never;
    }) as any;
  });

  afterEach(() => {
    // Restore original handlers
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    
    originalUncaughtException.forEach((listener: any) => {
      process.on('uncaughtException', listener);
    });
    
    originalUnhandledRejection.forEach((listener: any) => {
      process.on('unhandledRejection', listener);
    });

    // Restore process.exit
    exitSpy.mockRestore();
  });

  describe('setupGlobalErrorHandlers', () => {
    it('should register uncaughtException handler', () => {
      setupGlobalErrorHandlers();

      const listeners = process.listeners('uncaughtException');
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('should register unhandledRejection handler', () => {
      setupGlobalErrorHandlers();

      const listeners = process.listeners('unhandledRejection');
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('should handle uncaughtException and exit with code 1', () => {
      setupGlobalErrorHandlers();

      const testError = new Error('Test uncaught exception');
      
      expect(() => {
        process.emit('uncaughtException' as any, testError);
      }).toThrow('Process.exit called with code 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle unhandledRejection and exit with code 1', () => {
      setupGlobalErrorHandlers();

      const testReason = new Error('Test unhandled rejection');
      const testPromise = Promise.reject(testReason);
      testPromise.catch(() => {}); // Prevent actual unhandled rejection
      
      expect(() => {
        process.emit('unhandledRejection' as any, testReason, testPromise);
      }).toThrow('Process.exit called with code 1');

      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle uncaughtException with error stack', () => {
      setupGlobalErrorHandlers();

      const testError = new Error('Test error with stack');
      testError.stack = 'Error: Test error with stack\n    at Object.<anonymous>';
      
      expect(() => {
        process.emit('uncaughtException' as any, testError);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle unhandledRejection with non-Error reason', () => {
      setupGlobalErrorHandlers();

      const testReason = 'String rejection reason';
      const testPromise = Promise.reject(testReason);
      testPromise.catch(() => {}); // Prevent actual unhandled rejection
      
      expect(() => {
        process.emit('unhandledRejection' as any, testReason, testPromise);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle unhandledRejection with null reason', () => {
      setupGlobalErrorHandlers();

      const testPromise = Promise.reject(null);
      testPromise.catch(() => {}); // Prevent actual unhandled rejection
      
      expect(() => {
        process.emit('unhandledRejection' as any, null, testPromise);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle unhandledRejection with undefined reason', () => {
      setupGlobalErrorHandlers();

      const testPromise = Promise.reject(undefined);
      testPromise.catch(() => {}); // Prevent actual unhandled rejection
      
      expect(() => {
        process.emit('unhandledRejection' as any, undefined, testPromise);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle unhandledRejection with object reason', () => {
      setupGlobalErrorHandlers();

      const testReason = { code: 'ERR_TEST', message: 'Test object rejection' };
      const testPromise = Promise.reject(testReason);
      testPromise.catch(() => {}); // Prevent actual unhandled rejection
      
      expect(() => {
        process.emit('unhandledRejection' as any, testReason, testPromise);
      }).toThrow('Process.exit called with code 1');
    });

    it('should allow multiple calls to setupGlobalErrorHandlers', () => {
      setupGlobalErrorHandlers();
      setupGlobalErrorHandlers();
      setupGlobalErrorHandlers();

      const uncaughtListeners = process.listeners('uncaughtException');
      const rejectionListeners = process.listeners('unhandledRejection');

      expect(uncaughtListeners.length).toBeGreaterThan(0);
      expect(rejectionListeners.length).toBeGreaterThan(0);
    });

    it('should handle errors with custom properties', () => {
      setupGlobalErrorHandlers();

      const testError: any = new Error('Custom error');
      testError.code = 'ERR_CUSTOM';
      testError.statusCode = 500;
      testError.customData = { foo: 'bar' };
      
      expect(() => {
        process.emit('uncaughtException' as any, testError);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle TypeError instances', () => {
      setupGlobalErrorHandlers();

      const testError = new TypeError('Test type error');
      
      expect(() => {
        process.emit('uncaughtException' as any, testError);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle ReferenceError instances', () => {
      setupGlobalErrorHandlers();

      const testError = new ReferenceError('Test reference error');
      
      expect(() => {
        process.emit('uncaughtException' as any, testError);
      }).toThrow('Process.exit called with code 1');
    });

    it('should handle SyntaxError instances', () => {
      setupGlobalErrorHandlers();

      const testError = new SyntaxError('Test syntax error');
      
      expect(() => {
        process.emit('uncaughtException' as any, testError);
      }).toThrow('Process.exit called with code 1');
    });

    it('should exit process when uncaughtException is emitted', () => {
      setupGlobalErrorHandlers();

      try {
        process.emit('uncaughtException' as any, new Error('Test'));
      } catch (e) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit process when unhandledRejection is emitted', () => {
      setupGlobalErrorHandlers();

      const testPromise = Promise.reject('Test');
      testPromise.catch(() => {}); // Prevent actual unhandled rejection

      try {
        process.emit('unhandledRejection' as any, 'Test', testPromise);
      } catch (e) {
        // Expected to throw
      }

      expect(exitSpy).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
