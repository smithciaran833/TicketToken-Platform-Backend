/**
 * Unit tests for src/middleware/error-handler.middleware.ts
 * Tests error handling middleware for various error types
 */

import { errorHandler } from '../../../src/middleware/error-handler.middleware';
import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';
import { AppError, NotFoundError, ValidationError, UnauthorizedError, ForbiddenError, ConflictError } from '../../../src/utils/errors';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock ErrorResponseBuilder
jest.mock('../../../src/utils/error-response', () => ({
  ErrorResponseBuilder: {
    send: jest.fn((reply: any, statusCode: number, message: string, code: string, details?: any) => {
      reply.status(statusCode);
      reply.send({
        success: false,
        error: message,
        code,
        details,
      });
    }),
    internal: jest.fn((reply: any, message: string) => {
      reply.status(500);
      reply.send({
        success: false,
        error: message,
        code: 'INTERNAL_ERROR',
      });
    }),
    validation: jest.fn((reply: any, errors: any[]) => {
      reply.status(400);
      reply.send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors,
      });
    }),
  },
}));

// Mock errors module
jest.mock('../../../src/utils/errors', () => {
  class MockAppError extends Error {
    statusCode: number;
    code?: string;
    details?: any;
    constructor(message: string, statusCode: number, code?: string, details?: any) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
      this.details = details;
    }
  }

  return {
    AppError: MockAppError,
    NotFoundError: class extends MockAppError {
      constructor(message: string) { super(message, 404, 'NOT_FOUND'); }
    },
    ValidationError: class extends MockAppError {
      constructor(message: string, details?: any) { super(message, 400, 'VALIDATION_ERROR', details); }
    },
    UnauthorizedError: class extends MockAppError {
      constructor(message: string) { super(message, 401, 'UNAUTHORIZED'); }
    },
    ForbiddenError: class extends MockAppError {
      constructor(message: string) { super(message, 403, 'FORBIDDEN'); }
    },
    ConflictError: class extends MockAppError {
      constructor(message: string) { super(message, 409, 'CONFLICT'); }
    },
    isAppError: (error: any) => error && typeof error.statusCode === 'number',
    mapDatabaseError: jest.fn((error: any) => ({
      statusCode: 500,
      message: 'Database error occurred',
      code: 'DATABASE_ERROR',
      details: { originalError: error.message },
    })),
  };
});

describe('middleware/error-handler.middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  const { logger } = require('../../../src/utils/logger');
  const { ErrorResponseBuilder } = require('../../../src/utils/error-response');

  beforeEach(() => {
    jest.clearAllMocks();
    mockReply = createMockReply();
    mockRequest = createMockRequest({
      method: 'GET',
      url: '/api/v1/venues/123',
      user: { id: 'user-123', email: 'test@example.com', permissions: ['venue:read'] },
    });
  });

  describe('error handler basics', () => {
    it('should handle null/undefined errors', async () => {
      await errorHandler(null as any, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalled();
      expect(ErrorResponseBuilder.internal).toHaveBeenCalledWith(mockReply, 'An unexpected error occurred');
    });

    it('should log error with request context', async () => {
      const error = new Error('Test error');

      await errorHandler(error, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          err: error,
          requestId: mockRequest.id,
          method: mockRequest.method,
          url: mockRequest.url,
          userId: 'user-123',
        }),
        'Request error'
      );
    });
  });

  describe('AppError handling', () => {
    it('should handle NotFoundError (404)', async () => {
      const { NotFoundError } = require('../../../src/utils/errors');
      const error = new NotFoundError('Venue not found');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        404,
        'Venue not found',
        'NOT_FOUND',
        undefined
      );
    });

    it('should handle ValidationError (400)', async () => {
      const { ValidationError } = require('../../../src/utils/errors');
      const error = new ValidationError('Invalid input', [{ field: 'name', message: 'required' }]);

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        400,
        'Invalid input',
        'VALIDATION_ERROR',
        expect.anything()
      );
    });

    it('should handle UnauthorizedError (401)', async () => {
      const { UnauthorizedError } = require('../../../src/utils/errors');
      const error = new UnauthorizedError('Invalid token');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        401,
        'Invalid token',
        'UNAUTHORIZED',
        undefined
      );
    });

    it('should handle ForbiddenError (403)', async () => {
      const { ForbiddenError } = require('../../../src/utils/errors');
      const error = new ForbiddenError('Access denied');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        403,
        'Access denied',
        'FORBIDDEN',
        undefined
      );
    });

    it('should handle ConflictError (409)', async () => {
      const { ConflictError } = require('../../../src/utils/errors');
      const error = new ConflictError('Resource already exists');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        409,
        'Resource already exists',
        'CONFLICT',
        undefined
      );
    });

    it('should include error details when provided', async () => {
      const { AppError } = require('../../../src/utils/errors');
      const error = new AppError('Custom error', 422, 'CUSTOM_ERROR', { extra: 'info' });

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        422,
        'Custom error',
        'CUSTOM_ERROR',
        { extra: 'info' }
      );
    });
  });

  describe('Fastify validation errors', () => {
    it('should handle Fastify validation errors', async () => {
      const error = {
        validation: [
          { dataPath: '.name', message: 'should be string' },
          { dataPath: '.email', message: 'should match pattern' },
        ],
      } as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.validation).toHaveBeenCalledWith(mockReply, error.validation);
    });

    it('should handle empty validation array', async () => {
      const error = {
        validation: [],
      } as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.validation).toHaveBeenCalledWith(mockReply, []);
    });
  });

  describe('circuit breaker errors', () => {
    it('should handle circuit breaker open error', async () => {
      const error = new Error('Circuit breaker is open for service XYZ');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        503,
        'Service temporarily unavailable',
        'SERVICE_UNAVAILABLE',
        { retryAfter: 30 }
      );
    });

    it('should handle circuit breaker in message', async () => {
      const error = new Error('Request failed: Circuit breaker is open');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.send).toHaveBeenCalledWith(
        mockReply,
        503,
        'Service temporarily unavailable',
        'SERVICE_UNAVAILABLE',
        expect.anything()
      );
    });
  });

  describe('database errors', () => {
    it('should handle QueryFailedError', async () => {
      const { mapDatabaseError } = require('../../../src/utils/errors');
      const error = new Error('Query failed');
      error.name = 'QueryFailedError';

      await errorHandler(error, mockRequest, mockReply);

      expect(mapDatabaseError).toHaveBeenCalledWith(error);
    });

    it('should handle errors with database in message', async () => {
      const { mapDatabaseError } = require('../../../src/utils/errors');
      const error = new Error('database connection timeout');

      await errorHandler(error, mockRequest, mockReply);

      expect(mapDatabaseError).toHaveBeenCalledWith(error);
    });
  });

  describe('default error handling', () => {
    it('should return internal server error for unknown errors in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Sensitive internal error details');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.internal).toHaveBeenCalledWith(
        mockReply,
        'Internal server error'
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should return error message in non-production for debugging', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Debug error message');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.internal).toHaveBeenCalledWith(
        mockReply,
        'Debug error message'
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should return error message in test environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const error = new Error('Test error message');

      await errorHandler(error, mockRequest, mockReply);

      expect(ErrorResponseBuilder.internal).toHaveBeenCalledWith(
        mockReply,
        'Test error message'
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('edge cases', () => {
    it('should handle error without message', async () => {
      const error = new Error();

      await errorHandler(error, mockRequest, mockReply);

      // Should still process without crashing
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle non-Error objects', async () => {
      const error = { custom: 'error object' } as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle string error', async () => {
      const error = 'String error message' as any;

      await errorHandler(error, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle request without user', async () => {
      mockRequest = createMockRequest({
        method: 'GET',
        url: '/api/v1/venues',
        user: null,
      });

      const error = new Error('Test error');

      await errorHandler(error, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: undefined,
        }),
        'Request error'
      );
    });
  });

  describe('security tests', () => {
    it('should not leak stack traces in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Internal error');
      error.stack = 'Error: Internal error\n    at sensitive/path/file.ts:42';

      await errorHandler(error, mockRequest, mockReply);

      // Should not include stack in response
      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.stack).toBeUndefined();
      expect(sendCall.error).not.toContain('sensitive/path');

      process.env.NODE_ENV = originalEnv;
    });

    it('should not expose database details in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('POSTGRES_PASSWORD=secret123 connection failed');
      error.name = 'QueryFailedError';

      await errorHandler(error, mockRequest, mockReply);

      // mapDatabaseError should sanitize the message
      const sendCall = mockReply.send.mock.calls[0][0];
      expect(sendCall.error).not.toContain('secret123');

      process.env.NODE_ENV = originalEnv;
    });

    it('should log errors for security monitoring', async () => {
      const error = new Error('Suspicious activity detected');

      await errorHandler(error, mockRequest, mockReply);

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: mockRequest.id,
          method: mockRequest.method,
          url: mockRequest.url,
        }),
        'Request error'
      );
    });
  });
});
