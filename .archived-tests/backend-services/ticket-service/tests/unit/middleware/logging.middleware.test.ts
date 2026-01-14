// =============================================================================
// TEST SUITE - logging.middleware.ts
// =============================================================================

import { Request, Response, NextFunction } from 'express';
import { loggingMiddleware, errorLoggingMiddleware } from '../../../src/middleware/logging.middleware';

describe('logging middleware', () => {
  let mockRequest: any;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockLogger: any;
  let finishCallback: () => void;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
    };

    mockRequest = {
      method: 'GET',
      path: '/api/tickets',
      ip: '127.0.0.1',
    };

    mockResponse = {
      statusCode: 200,
      on: jest.fn((event: string, callback: () => void) => {
        if (event === 'finish') {
          finishCallback = callback;
        }
        return mockResponse as Response;
      }),
    };

    mockNext = jest.fn();
  });

  describe('loggingMiddleware', () => {
    it('should return middleware function', () => {
      const middleware = loggingMiddleware(mockLogger);

      expect(typeof middleware).toBe('function');
    });

    it('should log incoming request', () => {
      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.info).toHaveBeenCalledWith({
        type: 'request',
        method: 'GET',
        path: '/api/tickets',
        ip: '127.0.0.1',
      });
    });

    it('should call next', () => {
      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should log response on finish', () => {
      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      finishCallback();

      expect(mockLogger.info).toHaveBeenCalledWith({
        type: 'response',
        method: 'GET',
        path: '/api/tickets',
        status: 200,
        duration: expect.stringMatching(/\d+ms/),
      });
    });

    it('should calculate duration', () => {
      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      setTimeout(() => {
        finishCallback();

        const responseLog = mockLogger.info.mock.calls[1][0];
        expect(responseLog.duration).toMatch(/\d+ms/);
      }, 10);
    });

    it('should handle POST requests', () => {
      mockRequest.method = 'POST';
      mockRequest.path = '/api/orders';

      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.info).toHaveBeenCalledWith({
        type: 'request',
        method: 'POST',
        path: '/api/orders',
        ip: '127.0.0.1',
      });
    });

    it('should handle different status codes', () => {
      mockResponse.statusCode = 404;

      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      finishCallback();

      const responseLog = mockLogger.info.mock.calls[1][0];
      expect(responseLog.status).toBe(404);
    });

    it('should handle error status codes', () => {
      mockResponse.statusCode = 500;

      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      finishCallback();

      const responseLog = mockLogger.info.mock.calls[1][0];
      expect(responseLog.status).toBe(500);
    });

    it('should log both request and response', () => {
      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      finishCallback();

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
      expect(mockLogger.info.mock.calls[0][0].type).toBe('request');
      expect(mockLogger.info.mock.calls[1][0].type).toBe('response');
    });

    it('should register finish event listener', () => {
      const middleware = loggingMiddleware(mockLogger);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should work with multiple requests', () => {
      const middleware = loggingMiddleware(mockLogger);
      
      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      finishCallback();

      middleware(mockRequest as Request, mockResponse as Response, mockNext);
      finishCallback();

      expect(mockLogger.info).toHaveBeenCalledTimes(4);
    });
  });

  describe('errorLoggingMiddleware', () => {
    let mockError: Error;

    beforeEach(() => {
      mockError = new Error('Test error');
      mockError.stack = 'Error: Test error\n    at test.js:10:5';
    });

    it('should return error middleware function', () => {
      const middleware = errorLoggingMiddleware(mockLogger);

      expect(typeof middleware).toBe('function');
    });

    it('should log error details', () => {
      const middleware = errorLoggingMiddleware(mockLogger);
      middleware(mockError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith({
        type: 'error',
        method: 'GET',
        path: '/api/tickets',
        error: 'Test error',
        stack: expect.any(String),
      });
    });

    it('should call next with error', () => {
      const middleware = errorLoggingMiddleware(mockLogger);
      middleware(mockError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(mockError);
    });

    it('should log error stack', () => {
      const middleware = errorLoggingMiddleware(mockLogger);
      middleware(mockError, mockRequest as Request, mockResponse as Response, mockNext);

      const errorLog = mockLogger.error.mock.calls[0][0];
      expect(errorLog.stack).toContain('Error: Test error');
    });

    it('should handle different error messages', () => {
      const error = new Error('Different error');
      
      const middleware = errorLoggingMiddleware(mockLogger);
      middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      const errorLog = mockLogger.error.mock.calls[0][0];
      expect(errorLog.error).toBe('Different error');
    });

    it('should handle POST requests', () => {
      mockRequest.method = 'POST';
      mockRequest.path = '/api/orders';

      const middleware = errorLoggingMiddleware(mockLogger);
      middleware(mockError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledWith({
        type: 'error',
        method: 'POST',
        path: '/api/orders',
        error: 'Test error',
        stack: expect.any(String),
      });
    });

    it('should pass error to next middleware', () => {
      const middleware = errorLoggingMiddleware(mockLogger);
      const customError = new Error('Custom error');
      
      middleware(customError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(customError);
    });

    it('should handle errors without stack', () => {
      const error: any = { message: 'Error without stack' };

      const middleware = errorLoggingMiddleware(mockLogger);
      middleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should log before calling next', () => {
      const middleware = errorLoggingMiddleware(mockLogger);
      
      middleware(mockError, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle multiple errors', () => {
      const middleware = errorLoggingMiddleware(mockLogger);
      
      middleware(new Error('Error 1'), mockRequest as Request, mockResponse as Response, mockNext);
      middleware(new Error('Error 2'), mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockLogger.error).toHaveBeenCalledTimes(2);
    });
  });
});
