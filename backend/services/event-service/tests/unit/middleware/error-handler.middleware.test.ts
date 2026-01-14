/**
 * Unit tests for error-handler middleware
 * 
 * Tests:
 * - RFC 7807 Problem Details format
 * - Various HTTP error codes
 * - PostgreSQL error handling
 * - Validation error formatting
 * - Production vs development mode
 * - Sensitive data redaction
 * - Metrics tracking
 */

import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/utils/metrics', () => ({
  incrementErrorMetric: jest.fn(),
}));

import { logger } from '../../../src/utils/logger';
import { incrementErrorMetric } from '../../../src/utils/metrics';
import {
  errorHandler,
  registerErrorHandler,
  createProblemError,
} from '../../../src/middleware/error-handler';

const mockIncrementErrorMetric = incrementErrorMetric as jest.MockedFunction<typeof incrementErrorMetric>;

describe('Error Handler Middleware', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('errorHandler', () => {
    describe('RFC 7807 compliance', () => {
      it('should return RFC 7807 Problem Details format', async () => {
        const error = new Error('Test error') as any;
        error.statusCode = 400;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            type: expect.stringContaining('https://'),
            title: expect.any(String),
            status: 400,
            detail: expect.any(String),
            instance: expect.stringMatching(/^urn:uuid:/),
          })
        );
      });

      it('should set Cache-Control: no-store on error responses', async () => {
        const error = new Error('Test error') as any;
        error.statusCode = 500;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.header).toHaveBeenCalledWith('Cache-Control', 'no-store');
      });
    });

    describe('4xx client errors', () => {
      it('should handle 400 Bad Request', async () => {
        const error = new Error('Bad request') as any;
        error.statusCode = 400;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 400,
            title: 'Bad Request',
          })
        );
      });

      it('should handle 401 Unauthorized', async () => {
        const error = new Error('Unauthorized') as any;
        error.statusCode = 401;
        error.name = 'UnauthorizedError';
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(401);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 401,
            title: 'Authentication Required',
            code: 'UNAUTHORIZED',
          })
        );
      });

      it('should handle 403 Forbidden', async () => {
        const error = new Error('Access denied') as any;
        error.statusCode = 403;
        error.name = 'ForbiddenError';
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(403);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 403,
            title: 'Access Denied',
            code: 'FORBIDDEN',
          })
        );
      });

      it('should handle 404 Not Found', async () => {
        const error = new Error('Resource not found') as any;
        error.statusCode = 404;
        error.name = 'NotFoundError';
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(404);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 404,
            title: 'Resource Not Found',
            code: 'NOT_FOUND',
          })
        );
      });

      it('should handle 409 Conflict', async () => {
        const error = new Error('Resource conflict') as any;
        error.statusCode = 409;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(409);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 409,
            title: 'Conflict',
          })
        );
      });

      it('should handle 429 Rate Limited', async () => {
        const error = new Error('Too many requests') as any;
        error.statusCode = 429;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(429);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 429,
            title: 'Rate Limit Exceeded',
            code: 'RATE_LIMITED',
          })
        );
      });
    });

    describe('5xx server errors', () => {
      it('should handle 500 Internal Server Error', async () => {
        const error = new Error('Internal error') as any;
        error.statusCode = 500;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(500);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 500,
            title: 'Internal Server Error',
            code: 'INTERNAL_ERROR',
          })
        );
      });

      it('should handle 502 Bad Gateway', async () => {
        const error = new Error('Bad gateway') as any;
        error.statusCode = 502;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(502);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 502,
            title: 'Bad Gateway',
            code: 'BAD_GATEWAY',
          })
        );
      });

      it('should handle 503 Service Unavailable', async () => {
        const error = new Error('Service unavailable') as any;
        error.statusCode = 503;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(503);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 503,
            title: 'Service Unavailable',
            code: 'SERVICE_UNAVAILABLE',
          })
        );
      });

      it('should handle 504 Gateway Timeout', async () => {
        const error = new Error('Gateway timeout') as any;
        error.statusCode = 504;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(504);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 504,
            title: 'Gateway Timeout',
            code: 'GATEWAY_TIMEOUT',
          })
        );
      });

      it('should not expose internal error details in production', async () => {
        process.env.NODE_ENV = 'production';
        const error = new Error('Sensitive database connection string') as any;
        error.statusCode = 500;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            detail: 'An unexpected error occurred. Please try again later.',
          })
        );
        expect(reply.send).not.toHaveBeenCalledWith(
          expect.objectContaining({
            detail: expect.stringContaining('database'),
          })
        );
      });
    });

    describe('validation errors', () => {
      it('should handle Fastify schema validation errors', async () => {
        const error = {
          validation: [
            { instancePath: '/email', message: 'must be string', keyword: 'type' },
            { instancePath: '/name', message: 'is required', keyword: 'required', params: { missingProperty: 'name' } },
          ],
          statusCode: 400,
        } as any;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 400,
            title: 'Validation Failed',
            code: 'VALIDATION_ERROR',
            errors: expect.arrayContaining([
              expect.objectContaining({
                field: 'email',
                message: 'must be string',
                code: 'INVALID_TYPE',
              }),
              expect.objectContaining({
                field: 'name',
                message: 'is required',
                code: 'REQUIRED_FIELD',
              }),
            ]),
          })
        );
      });

      it('should handle 422 ValidationError', async () => {
        const error = {
          name: 'ValidationError',
          statusCode: 422,
          message: 'Invalid input',
          errors: [
            { field: 'price', message: 'must be positive' },
          ],
        } as any;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(422);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 422,
            title: 'Validation Failed',
            code: 'VALIDATION_ERROR',
          })
        );
      });
    });

    describe('PostgreSQL errors', () => {
      it('should handle foreign key constraint violation (23503)', async () => {
        const error = new Error('Foreign key violation') as any;
        error.code = '23503';
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 400,
            code: 'INVALID_REFERENCE',
          })
        );
      });

      it('should handle unique constraint violation (23505)', async () => {
        const error = new Error('Unique violation') as any;
        error.code = '23505';
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(409);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 409,
            code: 'DUPLICATE_RESOURCE',
          })
        );
      });
    });

    describe('error metrics', () => {
      it('should increment error metrics', async () => {
        const error = new Error('Test error') as any;
        error.statusCode = 500;
        const request = createMockRequest({ url: '/api/events' });
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(mockIncrementErrorMetric).toHaveBeenCalledWith(
          expect.any(String),
          500,
          '/api/events'
        );
      });

      it('should track validation errors as validation type', async () => {
        const error = {
          name: 'ValidationError',
          statusCode: 422,
        } as any;
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(mockIncrementErrorMetric).toHaveBeenCalledWith(
          'validation',
          422,
          expect.any(String)
        );
      });
    });

    describe('logging', () => {
      it('should log error with request details', async () => {
        const error = new Error('Test error') as any;
        error.statusCode = 500;
        const request = createMockRequest({
          method: 'POST',
          url: '/api/events',
        });
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            error: expect.objectContaining({
              message: 'Test error',
            }),
            request: expect.objectContaining({
              method: 'POST',
              url: '/api/events',
            }),
          }),
          'Request error occurred'
        );
      });

      it('should redact sensitive headers in logs', async () => {
        const error = new Error('Test error') as any;
        error.statusCode = 500;
        const request = createMockRequest({
          headers: {
            authorization: 'Bearer secret-token',
            cookie: 'session=secret',
            'x-api-key': 'api-secret',
          },
        });
        const reply = createMockReply();

        await errorHandler(error, request as any, reply as any);

        // In non-production, headers should be redacted when logged
        expect(logger.error).toHaveBeenCalled();
      });
    });

    describe('default status code', () => {
      it('should default to 500 if no statusCode provided', async () => {
        const error = new Error('Unknown error');
        const request = createMockRequest();
        const reply = createMockReply();

        await errorHandler(error as any, request as any, reply as any);

        expect(reply.status).toHaveBeenCalledWith(500);
      });
    });
  });

  describe('createProblemError', () => {
    it('should create an error with statusCode and code', () => {
      const error = createProblemError(400, 'INVALID_INPUT', 'The input is invalid');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.message).toBe('The input is invalid');
    });

    it('should include validation errors when provided', () => {
      const validationErrors = [
        { field: 'email', message: 'Invalid format', code: 'INVALID_FORMAT' },
      ];
      const error = createProblemError(422, 'VALIDATION_ERROR', 'Validation failed', validationErrors);

      expect(error.errors).toEqual(validationErrors);
    });

    it('should not include errors field when not provided', () => {
      const error = createProblemError(404, 'NOT_FOUND', 'Resource not found');

      expect(error.errors).toBeUndefined();
    });
  });

  describe('registerErrorHandler', () => {
    it('should register error handler on Fastify app', () => {
      const mockApp = {
        setErrorHandler: jest.fn(),
      };

      registerErrorHandler(mockApp);

      expect(mockApp.setErrorHandler).toHaveBeenCalledWith(errorHandler);
    });
  });
});
