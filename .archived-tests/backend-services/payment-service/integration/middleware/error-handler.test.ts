/**
 * Error Handler Middleware Integration Tests
 * Comprehensive tests for all error handling paths
 */

import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import { errorHandler, notFoundHandler, AppError } from '../../../src/middleware/error-handler';

describe('Error Handler Middleware', () => {
  let app: FastifyInstance;
  const originalEnv = process.env.NODE_ENV;

  beforeAll(async () => {
    app = Fastify();
    app.setErrorHandler(errorHandler);

    // Route that throws AppError with various status codes
    app.get('/app-error-400', async () => {
      throw new AppError('Bad request error', 400, 'BAD_REQUEST');
    });

    app.get('/app-error-401', async () => {
      throw new AppError('Unauthorized error', 401, 'UNAUTHORIZED');
    });

    app.get('/app-error-403', async () => {
      throw new AppError('Forbidden error', 403, 'FORBIDDEN');
    });

    app.get('/app-error-404', async () => {
      throw new AppError('Not found error', 404, 'NOT_FOUND');
    });

    app.get('/app-error-409', async () => {
      throw new AppError('Conflict error', 409, 'CONFLICT');
    });

    app.get('/app-error-422', async () => {
      throw new AppError('Unprocessable entity', 422, 'UNPROCESSABLE');
    });

    app.get('/app-error-500', async () => {
      throw new AppError('Internal server error', 500, 'SERVER_ERROR');
    });

    app.get('/app-error-503', async () => {
      throw new AppError('Service unavailable', 503, 'SERVICE_UNAVAILABLE');
    });

    // Route that throws Fastify validation error
    app.get('/fastify-validation-error', async () => {
      const error: any = new Error('Validation failed');
      error.validation = [
        { keyword: 'required', dataPath: '.email', message: 'should have required property email' },
        { keyword: 'type', dataPath: '.age', message: 'should be number' }
      ];
      throw error;
    });

    // Route that throws ValidationError (by name)
    app.get('/validation-error', async () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';
      throw error;
    });

    // Route that throws UnauthorizedError
    app.get('/unauthorized-error', async () => {
      const error = new Error('Unauthorized access');
      error.name = 'UnauthorizedError';
      throw error;
    });

    // Route that throws JsonWebTokenError
    app.get('/jwt-error', async () => {
      const error = new Error('jwt malformed');
      error.name = 'JsonWebTokenError';
      throw error;
    });

    // Route that throws TokenExpiredError
    app.get('/token-expired-error', async () => {
      const error = new Error('jwt expired');
      error.name = 'TokenExpiredError';
      throw error;
    });

    // Route that throws Fastify error with statusCode
    app.get('/fastify-status-error', async () => {
      const error: any = new Error('Rate limit exceeded');
      error.statusCode = 429;
      throw error;
    });

    // Route that throws generic Error (no special handling)
    app.get('/generic-error', async () => {
      throw new Error('Something went wrong internally');
    });

    // Route that throws with empty message
    app.get('/empty-message-error', async () => {
      throw new Error('');
    });

    // Route that throws TypeError
    app.get('/type-error', async () => {
      throw new TypeError('Cannot read property of undefined');
    });

    // Route that throws ReferenceError
    app.get('/reference-error', async () => {
      throw new ReferenceError('x is not defined');
    });

    // Route with authenticated user context
    app.get('/error-with-user', async (request) => {
      (request as any).user = { id: 'user-123', email: 'test@example.com' };
      throw new AppError('User-specific error', 400, 'USER_ERROR');
    });

    // Route that throws error with special characters
    app.get('/special-chars-error', async () => {
      throw new AppError('Error with <script>alert("xss")</script>', 400, 'XSS_TEST');
    });

    // Route that throws error with unicode
    app.get('/unicode-error', async () => {
      throw new AppError('エラーが発生しました', 400, 'UNICODE_ERROR');
    });

    // Route that throws error with very long message
    app.get('/long-message-error', async () => {
      const longMessage = 'A'.repeat(10000);
      throw new AppError(longMessage, 400, 'LONG_MESSAGE');
    });

    await app.ready();
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    await app.close();
  });

  describe('AppError handling', () => {
    it('should handle 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-400',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Bad request error');
      expect(body.code).toBe('BAD_REQUEST');
      expect(body.timestamp).toBeDefined();
      expect(body.path).toBe('/app-error-400');
    });

    it('should handle 401 Unauthorized', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-401',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized error');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should handle 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-403',
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Forbidden error');
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should handle 404 Not Found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-404',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Not found error');
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should handle 409 Conflict', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-409',
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Conflict error');
      expect(body.code).toBe('CONFLICT');
    });

    it('should handle 422 Unprocessable Entity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-422',
      });

      expect(response.statusCode).toBe(422);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unprocessable entity');
      expect(body.code).toBe('UNPROCESSABLE');
    });

    it('should handle 500 Internal Server Error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-500',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
      expect(body.code).toBe('SERVER_ERROR');
    });

    it('should handle 503 Service Unavailable', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-503',
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service unavailable');
      expect(body.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('Fastify validation error handling', () => {
    it('should handle Fastify validation errors with details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/fastify-validation-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Validation error');
      expect(body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Named error handling', () => {
    it('should handle ValidationError by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/validation-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Validation error');
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should handle UnauthorizedError by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unauthorized-error',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should handle JsonWebTokenError by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/jwt-error',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Invalid token');
      expect(body.code).toBe('INVALID_TOKEN');
    });

    it('should handle TokenExpiredError by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/token-expired-error',
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Token expired');
      expect(body.code).toBe('TOKEN_EXPIRED');
    });
  });

  describe('Fastify statusCode handling', () => {
    it('should use statusCode from Fastify error', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/fastify-status-error',
      });

      expect(response.statusCode).toBe(429);
    });
  });

  describe('Generic error handling', () => {
    it('should handle generic Error with 500 status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/generic-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal server error');
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should handle TypeError', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/type-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should handle ReferenceError', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/reference-error',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Response format', () => {
    it('should include timestamp in ISO format', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-400',
      });

      const body = JSON.parse(response.body);
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('should include request path in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-400',
      });

      const body = JSON.parse(response.body);
      expect(body.path).toBe('/app-error-400');
    });

    it('should handle paths with query strings', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/app-error-400?foo=bar&baz=qux',
      });

      const body = JSON.parse(response.body);
      expect(body.path).toContain('/app-error-400');
    });
  });

  describe('Edge cases', () => {
    it('should handle error with special characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/special-chars-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('<script>');
    });

    it('should handle error with unicode characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/unicode-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('エラーが発生しました');
    });

    it('should handle error with very long message', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/long-message-error',
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.error.length).toBe(10000);
    });
  });
});

describe('AppError class', () => {
  describe('constructor', () => {
    it('should create error with all properties', () => {
      const error = new AppError('Test message', 400, 'TEST_CODE');

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('TEST_CODE');
      expect(error.isOperational).toBe(true);
    });

    it('should be instance of Error', () => {
      const error = new AppError('Test', 500, 'TEST');
      expect(error).toBeInstanceOf(Error);
    });

    it('should be instance of AppError', () => {
      const error = new AppError('Test', 500, 'TEST');
      expect(error).toBeInstanceOf(AppError);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test', 500, 'TEST');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should work with various status codes', () => {
      const statusCodes = [200, 201, 204, 301, 302, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504];
      
      statusCodes.forEach(statusCode => {
        const error = new AppError('Test', statusCode, 'TEST');
        expect(error.statusCode).toBe(statusCode);
      });
    });

    it('should preserve error name as Error', () => {
      const error = new AppError('Test', 500, 'TEST');
      expect(error.name).toBe('Error');
    });

    it('should allow empty code', () => {
      const error = new AppError('Test', 500, '');
      expect(error.code).toBe('');
    });

    it('should allow empty message', () => {
      const error = new AppError('', 500, 'EMPTY_MSG');
      expect(error.message).toBe('');
    });

    it('should handle special characters in message', () => {
      const specialMessage = 'Error: "test" \'value\' <tag> & symbol';
      const error = new AppError(specialMessage, 400, 'SPECIAL');
      expect(error.message).toBe(specialMessage);
    });

    it('should handle special characters in code', () => {
      const error = new AppError('Test', 400, 'CODE_WITH_UNDERSCORE');
      expect(error.code).toBe('CODE_WITH_UNDERSCORE');
    });
  });

  describe('isOperational flag', () => {
    it('should always be true', () => {
      const error = new AppError('Test', 500, 'TEST');
      expect(error.isOperational).toBe(true);
    });

    it('should distinguish from non-operational errors', () => {
      const appError = new AppError('Operational', 500, 'OP');
      const genericError = new Error('Non-operational');

      expect(appError.isOperational).toBe(true);
      expect((genericError as any).isOperational).toBeUndefined();
    });
  });
});

describe('notFoundHandler', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    app.setNotFoundHandler(notFoundHandler);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('response format', () => {
    it('should return 404 status code', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return proper error structure', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Resource not found');
      expect(body.code).toBe('NOT_FOUND');
      expect(body.path).toBe('/nonexistent');
      expect(body.method).toBe('GET');
    });

    it('should include correct path in response', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/some/nested/path/that/does/not/exist',
      });

      const body = JSON.parse(response.body);
      expect(body.path).toBe('/some/nested/path/that/does/not/exist');
    });

    it('should handle paths with query parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent?param=value&another=test',
      });

      expect(response.statusCode).toBe(404);
    });

    it('should handle paths with special characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/path-with-dashes_and_underscores',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.path).toBe('/path-with-dashes_and_underscores');
    });
  });

  describe('HTTP methods', () => {
    it('should handle GET method', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.method).toBe('GET');
    });

    it('should handle POST method', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.method).toBe('POST');
    });

    it('should handle PUT method', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.method).toBe('PUT');
    });

    it('should handle DELETE method', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.method).toBe('DELETE');
    });

    it('should handle PATCH method', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.method).toBe('PATCH');
    });

    it('should handle OPTIONS method', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/nonexistent',
      });

      const body = JSON.parse(response.body);
      expect(body.method).toBe('OPTIONS');
    });

    it('should handle HEAD method', async () => {
      const response = await app.inject({
        method: 'HEAD',
        url: '/nonexistent',
      });

      // HEAD responses don't have body
      expect(response.statusCode).toBe(404);
    });
  });
});
