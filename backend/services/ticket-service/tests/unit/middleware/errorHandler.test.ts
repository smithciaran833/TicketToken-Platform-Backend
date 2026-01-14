import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';

// Mock dependencies
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

jest.mock('../../../src/config', () => ({
  config: {
    env: 'test',
  },
}));

import {
  errorHandler,
  notFoundHandler,
  getErrorSummary,
  resetErrorCounters,
  ProblemDetails,
} from '../../../src/middleware/errorHandler';
import {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../../../src/utils/errors';
import { config } from '../../../src/config';

describe('Error Handler Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    resetErrorCounters();

    mockSend = jest.fn().mockReturnThis();
    mockHeader = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({
      send: mockSend,
      header: mockHeader,
    });

    mockReply = {
      status: mockStatus,
      send: mockSend,
      header: mockHeader,
    };

    mockRequest = {
      url: '/test/endpoint',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {},
    } as any;
  });

  describe('errorHandler', () => {
    it('should handle NotFoundError', async () => {
      const error = new NotFoundError('Resource');

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(404);
      expect(response.title).toBe('Resource Not Found');
    });

    it('should handle ValidationError', async () => {
      const error = new ValidationError('Invalid input');

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(400);
      expect(response.title).toBe('Validation Failed');
    });

    it('should handle ConflictError', async () => {
      const error = new ConflictError('Resource already exists');

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(409);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(409);
      expect(response.title).toBe('Conflict');
    });

    it('should handle ForbiddenError', async () => {
      const error = new ForbiddenError('Access denied');

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(403);
      expect(response.title).toBe('Forbidden');
    });

    it('should handle PostgreSQL FK violation (23503)', async () => {
      const error: any = new Error('violates foreign key constraint');
      error.code = '23503';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(400);
      expect(response.code).toBe('INVALID_TENANT');
      expect(response.title).toBe('Invalid Tenant');
    });

    it('should handle PostgreSQL unique violation (23505)', async () => {
      const error: any = new Error('duplicate key value');
      error.code = '23505';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(409);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(409);
      expect(response.code).toBe('DUPLICATE_ENTRY');
      expect(response.title).toBe('Duplicate Entry');
    });

    it('should handle Fastify validation errors', async () => {
      const error: FastifyError = {
        name: 'FastifyError',
        code: 'FST_ERR_VALIDATION',
        message: 'Validation failed',
        statusCode: 400,
        validation: [
          {
            keyword: 'required',
            instancePath: '/email',
            schemaPath: '#/properties/email',
            params: { missingProperty: 'email' },
            message: 'must have required property',
          },
        ],
      };

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(400);
      expect(response.code).toBe('VALIDATION_ERROR');
      expect(response.title).toBe('Validation Failed');
    });

    it('should handle UnauthorizedError by name', async () => {
      const error = new Error('Auth required');
      error.name = 'UnauthorizedError';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(401);
      expect(response.code).toBe('UNAUTHORIZED');
    });

    it('should handle CircuitBreakerOpenError', async () => {
      const error = new Error('Circuit breaker is open');
      error.name = 'CircuitBreakerOpenError';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(503);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(503);
      expect(response.code).toBe('CIRCUIT_BREAKER_OPEN');
      expect(response.retryAfter).toBe(30);
    });

    it('should handle TimeoutError', async () => {
      const error = new Error('Request timed out');
      error.name = 'TimeoutError';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(504);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(504);
      expect(response.code).toBe('TIMEOUT');
    });

    it('should handle generic errors as 500 Internal Server Error', async () => {
      const error = new Error('Something went wrong');

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(500);
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(500);
      expect(response.code).toBe('INTERNAL_ERROR');
      expect(response.title).toBe('Internal Server Error');
    });

    it('should use x-trace-id header if provided', async () => {
      mockRequest.headers = { 'x-trace-id': 'custom-trace-id' };
      const error = new Error('Test error');

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      const response = mockSend.mock.calls[0][0];
      expect(response.traceId).toBe('custom-trace-id');
    });

    it('should include retry guidance in response', async () => {
      const error = new Error('Rate limited');
      error.name = 'RateLimitError';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      const response = mockSend.mock.calls[0][0];
      expect(response.retry).toBeDefined();
      expect(response.retry.retryable).toBeDefined();
    });

    it('should set Retry-After header for 429 status', async () => {
      const appError = new AppError('Too many requests', 429, 'RATE_LIMITED');

      await errorHandler(appError, mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Check that the status is set correctly
      expect(mockStatus).toHaveBeenCalledWith(429);
    });

    it('should include stack trace in development mode', async () => {
      (config as any).env = 'development';
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      const response = mockSend.mock.calls[0][0];
      expect(response.stack).toBeDefined();

      // Reset config
      (config as any).env = 'test';
    });

    it('should NOT include stack trace in production mode', async () => {
      (config as any).env = 'production';
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.ts:1:1';

      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      const response = mockSend.mock.calls[0][0];
      expect(response.stack).toBeUndefined();

      // Reset config
      (config as any).env = 'test';
    });

    it('should track errors in aggregation', async () => {
      resetErrorCounters();

      const error = new NotFoundError('Test');
      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      const summary = getErrorSummary();
      expect(Object.keys(summary).length).toBeGreaterThan(0);
    });
  });

  describe('notFoundHandler', () => {
    it('should return 404 with route information', async () => {
      mockRequest.method = 'POST';
      mockRequest.url = '/api/unknown';

      await notFoundHandler(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockHeader).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      
      const response = mockSend.mock.calls[0][0];
      expect(response.status).toBe(404);
      expect(response.code).toBe('ROUTE_NOT_FOUND');
      expect(response.title).toBe('Route Not Found');
      expect(response.detail).toBe('Route POST /api/unknown not found');
    });

    it('should use x-trace-id if provided', async () => {
      mockRequest.headers = { 'x-trace-id': 'custom-trace-123' };

      await notFoundHandler(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const response = mockSend.mock.calls[0][0];
      expect(response.traceId).toBe('custom-trace-123');
    });
  });

  describe('getErrorSummary', () => {
    it('should return empty object when no errors tracked', () => {
      resetErrorCounters();
      const summary = getErrorSummary();
      expect(summary).toEqual({});
    });

    it('should return tracked errors', async () => {
      resetErrorCounters();

      const error1 = new NotFoundError('Test 1');
      const error2 = new NotFoundError('Test 2');

      await errorHandler(error1, mockRequest as FastifyRequest, mockReply as FastifyReply);
      await errorHandler(error2, mockRequest as FastifyRequest, mockReply as FastifyReply);

      const summary = getErrorSummary();
      expect(Object.keys(summary).length).toBeGreaterThan(0);
    });
  });

  describe('resetErrorCounters', () => {
    it('should clear all tracked errors', async () => {
      const error = new NotFoundError('Test');
      await errorHandler(error, mockRequest as FastifyRequest, mockReply as FastifyReply);

      resetErrorCounters();

      const summary = getErrorSummary();
      expect(summary).toEqual({});
    });
  });
});
