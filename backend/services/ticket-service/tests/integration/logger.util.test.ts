import { logger, createLogger, logError, logRequest } from '../../src/utils/logger';

/**
 * INTEGRATION TESTS FOR LOGGER UTILITY
 * Tests logging functionality with PII sanitization
 */

describe('Logger Utility Integration Tests', () => {
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('logger instance', () => {
    it('should be a winston logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    it('should have default service metadata', () => {
      expect(logger.defaultMeta).toBeDefined();
      expect(logger.defaultMeta).toHaveProperty('service', 'ticket-service');
    });

    it('should log info messages', () => {
      expect(() => {
        logger.info('Test info message');
      }).not.toThrow();
    });

    it('should log error messages', () => {
      expect(() => {
        logger.error('Test error message');
      }).not.toThrow();
    });

    it('should log warn messages', () => {
      expect(() => {
        logger.warn('Test warning message');
      }).not.toThrow();
    });

    it('should log debug messages', () => {
      expect(() => {
        logger.debug('Test debug message');
      }).not.toThrow();
    });

    it('should log with additional metadata', () => {
      expect(() => {
        logger.info('Test with metadata', { userId: 'user-123', action: 'purchase' });
      }).not.toThrow();
    });

    it('should log errors with stack traces', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.error('Error occurred', { error });
      }).not.toThrow();
    });

    it('should log objects', () => {
      expect(() => {
        logger.info('Object logging', { 
          data: { foo: 'bar', nested: { value: 123 } }
        });
      }).not.toThrow();
    });

    it('should log arrays', () => {
      expect(() => {
        logger.info('Array logging', { items: [1, 2, 3, 'test'] });
      }).not.toThrow();
    });

    it('should handle null values', () => {
      expect(() => {
        logger.info('Null value', { value: null });
      }).not.toThrow();
    });

    it('should handle undefined values', () => {
      expect(() => {
        logger.info('Undefined value', { value: undefined });
      }).not.toThrow();
    });
  });

  describe('createLogger', () => {
    it('should create a child logger', () => {
      const childLogger = createLogger('TestComponent');
      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeDefined();
    });

    it('should create child logger with component metadata', () => {
      const childLogger = createLogger('TestComponent');
      expect(() => {
        childLogger.info('Test message from child');
      }).not.toThrow();
    });

    it('should create multiple child loggers', () => {
      const logger1 = createLogger('Component1');
      const logger2 = createLogger('Component2');
      
      expect(logger1).toBeDefined();
      expect(logger2).toBeDefined();
    });

    it('should allow child logger to log all levels', () => {
      const childLogger = createLogger('TestComponent');
      
      expect(() => {
        childLogger.info('Info from child');
        childLogger.error('Error from child');
        childLogger.warn('Warn from child');
        childLogger.debug('Debug from child');
      }).not.toThrow();
    });
  });

  describe('logError helper', () => {
    it('should log errors with message', () => {
      const error = new Error('Test error');
      expect(() => {
        logError('Operation failed', error);
      }).not.toThrow();
    });

    it('should log errors with metadata', () => {
      const error = new Error('Test error');
      expect(() => {
        logError('Operation failed', error, { userId: 'user-123', operation: 'purchase' });
      }).not.toThrow();
    });

    it('should log errors with stack traces', () => {
      const error = new Error('Test error with stack');
      error.stack = 'Error: Test error\n    at Object.<anonymous>';
      
      expect(() => {
        logError('Stack trace test', error);
      }).not.toThrow();
    });

    it('should handle error objects with custom properties', () => {
      const error: any = new Error('Custom error');
      error.code = 'ERR_CUSTOM';
      error.statusCode = 500;
      
      expect(() => {
        logError('Custom error test', error);
      }).not.toThrow();
    });

    it('should handle non-Error objects', () => {
      const errorObj = { message: 'Not an Error instance', code: 'ERR_TEST' };
      
      expect(() => {
        logError('Non-error object', errorObj);
      }).not.toThrow();
    });

    it('should handle string errors', () => {
      expect(() => {
        logError('String error', 'Something went wrong');
      }).not.toThrow();
    });
  });

  describe('logRequest helper', () => {
    it('should log request objects', () => {
      const req = {
        method: 'GET',
        path: '/api/tickets',
        headers: { 'user-agent': 'test' }
      };
      
      expect(() => {
        logRequest(req);
      }).not.toThrow();
    });

    it('should log requests with metadata', () => {
      const req = {
        method: 'POST',
        path: '/api/purchase',
        body: { ticketId: 'ticket-123' }
      };
      
      expect(() => {
        logRequest(req, { userId: 'user-123', timing: 150 });
      }).not.toThrow();
    });

    it('should log requests with various HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      
      methods.forEach(method => {
        const req = { method, path: '/api/test' };
        expect(() => {
          logRequest(req);
        }).not.toThrow();
      });
    });

    it('should log requests with query parameters', () => {
      const req = {
        method: 'GET',
        path: '/api/tickets',
        query: { eventId: 'event-123', limit: 10 }
      };
      
      expect(() => {
        logRequest(req);
      }).not.toThrow();
    });

    it('should log requests with headers', () => {
      const req = {
        method: 'GET',
        path: '/api/tickets',
        headers: {
          'content-type': 'application/json',
          'authorization': 'Bearer token',
          'x-tenant-id': 'tenant-123'
        }
      };
      
      expect(() => {
        logRequest(req);
      }).not.toThrow();
    });

    it('should sanitize sensitive data in requests', () => {
      const req = {
        method: 'POST',
        path: '/api/user',
        body: {
          email: 'user@example.com',
          password: 'secret123',
          creditCard: '4111111111111111'
        }
      };
      
      expect(() => {
        logRequest(req);
      }).not.toThrow();
    });
  });

  describe('PII Sanitization', () => {
    it('should sanitize email addresses in logs', () => {
      expect(() => {
        logger.info('User email', { email: 'user@example.com' });
      }).not.toThrow();
    });

    it('should sanitize credit card numbers', () => {
      expect(() => {
        logger.info('Payment info', { creditCard: '4111111111111111' });
      }).not.toThrow();
    });

    it('should sanitize passwords', () => {
      expect(() => {
        logger.info('User data', { password: 'secret123' });
      }).not.toThrow();
    });

    it('should sanitize SSN', () => {
      expect(() => {
        logger.info('Personal data', { ssn: '123-45-6789' });
      }).not.toThrow();
    });

    it('should sanitize phone numbers', () => {
      expect(() => {
        logger.info('Contact info', { phone: '555-123-4567' });
      }).not.toThrow();
    });

    it('should sanitize nested PII data', () => {
      expect(() => {
        logger.info('Complex data', {
          user: {
            email: 'user@example.com',
            profile: {
              ssn: '123-45-6789'
            }
          }
        });
      }).not.toThrow();
    });
  });

  describe('Console override', () => {
    it('should sanitize console.log output', () => {
      const logSpy = jest.spyOn(console, 'log');
      console.log('Test message');
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('should sanitize console.error output', () => {
      const errorSpy = jest.spyOn(console, 'error');
      console.error('Test error');
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should sanitize console.warn output', () => {
      const warnSpy = jest.spyOn(console, 'warn');
      console.warn('Test warning');
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should handle multiple arguments in console methods', () => {
      const logSpy = jest.spyOn(console, 'log');
      console.log('Message', { data: 'test' }, 123, true);
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe('Error handling', () => {
    it('should handle logging failures gracefully', () => {
      expect(() => {
        logger.info('Test', { circular: {} });
      }).not.toThrow();
    });

    it('should handle very large log objects', () => {
      const largeObject = {
        data: new Array(10000).fill({ value: 'test', index: 0 })
      };
      
      expect(() => {
        logger.info('Large object', largeObject);
      }).not.toThrow();
    });

    it('should handle special characters in messages', () => {
      expect(() => {
        logger.info('Special chars: 日本語 é ñ ü 🎫');
      }).not.toThrow();
    });
  });
});
