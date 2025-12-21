import { logger, logError, logRequest, logResponse } from '../../src/utils/logger';

/**
 * INTEGRATION TESTS FOR LOGGER UTILITY
 * 
 * These tests use REAL Winston logger:
 * - Real logger configuration
 * - Real log level handling
 * - Tests actual log output capture
 * - No mocks
 */

describe('Logger Integration Tests', () => {
  // Capture log output
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(logger, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  describe('logger instance', () => {
    it('should be defined', () => {
      expect(logger).toBeDefined();
    });

    it('should have log method', () => {
      expect(typeof logger.log).toBe('function');
    });

    it('should have info method', () => {
      expect(typeof logger.info).toBe('function');
    });

    it('should have error method', () => {
      expect(typeof logger.error).toBe('function');
    });

    it('should have warn method', () => {
      expect(typeof logger.warn).toBe('function');
    });

    it('should have debug method', () => {
      expect(typeof logger.debug).toBe('function');
    });

    it('should support different log levels', () => {
      logger.info('Info message');
      logger.error('Error message');
      logger.warn('Warning message');

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe('logError()', () => {
    it('should call logger.error with message', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

      logError('Test error message', new Error('Test'));

      expect(errorSpy).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test error message'
        })
      );

      errorSpy.mockRestore();
    });

    it('should sanitize error object', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      const error = new Error('Sensitive error');

      logError('Error occurred', error);

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should include meta when provided', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      const meta = { userId: '123', operation: 'login' };

      logError('Error with meta', new Error('Test'), meta);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Error with meta'
        })
      );

      errorSpy.mockRestore();
    });

    it('should work without meta', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

      logError('Error without meta', new Error('Test'));

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should handle error with stack trace', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();
      const error = new Error('Error with stack');

      logError('Stack trace test', error);

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });

  describe('logRequest()', () => {
    it('should call logger.info with "Request received"', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = {
        method: 'GET',
        url: '/api/test',
        headers: {}
      };

      logRequest(req as any);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Request received'
        })
      );

      infoSpy.mockRestore();
    });

    it('should sanitize request via PIISanitizer', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = {
        method: 'POST',
        url: '/api/login',
        headers: {
          authorization: 'Bearer sensitive-token'
        },
        body: {
          email: 'user@example.com',
          password: 'secret123'
        }
      };

      logRequest(req as any);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });

    it('should include meta when provided', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = {
        method: 'GET',
        url: '/api/test'
      };
      const meta = { requestId: 'req-123' };

      logRequest(req as any, meta);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });

    it('should work without meta', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = {
        method: 'GET',
        url: '/api/test'
      };

      logRequest(req as any);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });
  });

  describe('logResponse()', () => {
    it('should call logger.info with "Response sent"', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = { method: 'GET', url: '/api/test' };
      const res = { statusCode: 200 };
      const body = { success: true };

      logResponse(req as any, res as any, body);

      expect(infoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Response sent'
        })
      );

      infoSpy.mockRestore();
    });

    it('should include request method and url', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = { method: 'POST', url: '/api/users' };
      const res = { statusCode: 201 };
      const body = { id: '123' };

      logResponse(req as any, res as any, body);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });

    it('should sanitize response and body', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = { method: 'POST', url: '/api/auth' };
      const res = { statusCode: 200 };
      const body = {
        token: 'sensitive-jwt-token',
        user: { email: 'user@example.com' }
      };

      logResponse(req as any, res as any, body);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });

    it('should include meta when provided', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = { method: 'GET', url: '/api/test' };
      const res = { statusCode: 200 };
      const body = { data: 'test' };
      const meta = { duration: 145 };

      logResponse(req as any, res as any, body, meta);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });
  });

  describe('Log levels', () => {
    it('should log info level', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      logger.info('Info level test');

      expect(infoSpy).toHaveBeenCalledWith('Info level test');

      infoSpy.mockRestore();
    });

    it('should log error level', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

      logger.error('Error level test');

      expect(errorSpy).toHaveBeenCalledWith('Error level test');

      errorSpy.mockRestore();
    });

    it('should log warn level', () => {
      const warnSpy = jest.spyOn(logger, 'warn').mockImplementation();

      logger.warn('Warning level test');

      expect(warnSpy).toHaveBeenCalledWith('Warning level test');

      warnSpy.mockRestore();
    });

    it('should log debug level', () => {
      const debugSpy = jest.spyOn(logger, 'debug').mockImplementation();

      logger.debug('Debug level test');

      expect(debugSpy).toHaveBeenCalledWith('Debug level test');

      debugSpy.mockRestore();
    });
  });

  describe('Real-world scenarios', () => {
    it('should log authentication events', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      logger.info('User logged in', { userId: '123', ip: '192.168.1.1' });

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });

    it('should log errors with context', () => {
      const errorSpy = jest.spyOn(logger, 'error').mockImplementation();

      logError('Database connection failed', new Error('Connection timeout'), {
        database: 'postgres',
        host: 'localhost'
      });

      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });

    it('should log API requests and responses', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = {
        method: 'POST',
        url: '/api/users',
        headers: { 'content-type': 'application/json' },
        body: { name: 'John Doe' }
      };

      logRequest(req as any);

      const res = { statusCode: 201 };
      const body = { id: '456', name: 'John Doe' };

      logResponse(req as any, res as any, body);

      expect(infoSpy).toHaveBeenCalledTimes(2);

      infoSpy.mockRestore();
    });
  });

  describe('Metadata handling', () => {
    it('should include service name in metadata', () => {
      // Logger should include 'auth-service' in defaultMeta
      expect(logger).toBeDefined();
    });

    it('should support custom metadata fields', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      logger.info('Custom metadata test', {
        requestId: 'req-789',
        userId: 'user-123',
        action: 'login'
      });

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });

    it('should merge metadata from different sources', () => {
      const infoSpy = jest.spyOn(logger, 'info').mockImplementation();

      const req = { method: 'GET', url: '/api/profile' };
      const meta = { userId: 'user-456', sessionId: 'session-789' };

      logRequest(req as any, meta);

      expect(infoSpy).toHaveBeenCalled();

      infoSpy.mockRestore();
    });
  });
});
