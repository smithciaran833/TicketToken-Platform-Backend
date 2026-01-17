// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { errorMiddleware } from '../../../src/middleware/error.middleware';
import { AppError, ValidationError, NotFoundError } from '../../../src/utils/errors';
import { logger } from '../../../src/utils/logger';

describe('Error Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockRequest = {
      url: '/api/test',
      method: 'POST',
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('logging', () => {
    it('should log error details for all errors', () => {
      const error = new Error('Something went wrong') as FastifyError;
      error.stack = 'Error: Something went wrong\n    at Test.fn';

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.error).toHaveBeenCalledWith('Error handling request:', {
        error: 'Something went wrong',
        stack: 'Error: Something went wrong\n    at Test.fn',
        path: '/api/test',
        method: 'POST',
      });
    });

    it('should log request path and method', () => {
      mockRequest.url = '/api/queues/123';
      mockRequest.method = 'DELETE';
      const error = new Error('Not found') as FastifyError;

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.error).toHaveBeenCalledWith('Error handling request:', {
        error: 'Not found',
        stack: expect.any(String),
        path: '/api/queues/123',
        method: 'DELETE',
      });
    });
  });

  describe('AppError handling', () => {
    it('should return correct status code for AppError', () => {
      const error = new AppError('Custom error', 422);

      errorMiddleware(
        error as unknown as FastifyError,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Custom error',
        code: 422,
      });
    });

    it('should handle AppError with default status code', () => {
      const error = new AppError('Server error');

      errorMiddleware(
        error as unknown as FastifyError,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Server error',
        code: 500,
      });
    });

    it('should handle ValidationError (extends AppError)', () => {
      const error = new ValidationError('Invalid input data');

      errorMiddleware(
        error as unknown as FastifyError,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Invalid input data',
        code: 400,
      });
    });

    it('should handle NotFoundError (extends AppError)', () => {
      const error = new NotFoundError('Resource not found');

      errorMiddleware(
        error as unknown as FastifyError,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Resource not found',
        code: 404,
      });
    });
  });

  describe('generic error handling', () => {
    it('should return 500 for non-AppError errors', () => {
      const error = new Error('Unknown error') as FastifyError;

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: undefined,
      });
    });

    it('should include error message in development mode', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Detailed error info') as FastifyError;

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Detailed error info',
      });
    });

    it('should hide error message in production mode', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Sensitive error details') as FastifyError;

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: undefined,
      });
    });

    it('should hide error message in test mode', () => {
      process.env.NODE_ENV = 'test';
      const error = new Error('Test error') as FastifyError;

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: undefined,
      });
    });
  });

  describe('FastifyError handling', () => {
    it('should handle FastifyError with statusCode', () => {
      const error: FastifyError = {
        name: 'FastifyError',
        message: 'Validation failed',
        code: 'FST_ERR_VALIDATION',
        statusCode: 400,
      };

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // FastifyError is not AppError, so it goes to default handler
      expect(mockReply.code).toHaveBeenCalledWith(500);
    });

    it('should handle error without stack trace', () => {
      const error = {
        message: 'Simple error',
        name: 'Error',
      } as FastifyError;

      errorMiddleware(
        error,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.error).toHaveBeenCalledWith('Error handling request:', {
        error: 'Simple error',
        stack: undefined,
        path: '/api/test',
        method: 'POST',
      });
    });
  });
});
