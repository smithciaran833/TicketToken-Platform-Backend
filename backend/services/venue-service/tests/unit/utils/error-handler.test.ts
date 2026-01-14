/**
 * Unit tests for src/utils/error-handler.ts
 * Tests RFC 7807 error handlers and security middleware
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import {
  notFoundHandler,
  errorHandler,
  createProblemDetails,
  rateLimitHandler,
  securityHeaders,
  registerErrorHandlers,
} from '../../../src/utils/error-handler';
import { AppError, ValidationError, NotFoundError } from '../../../src/utils/errors';

// Mock the logger
const mockLogWarn = jest.fn();
const mockLogError = jest.fn();
const mockLogInfo = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: (...args: any[]) => mockLogWarn(...args),
    error: (...args: any[]) => mockLogError(...args),
    info: (...args: any[]) => mockLogInfo(...args),
    debug: jest.fn(),
    child: jest.fn(() => ({
      warn: (...args: any[]) => mockLogWarn(...args),
      error: (...args: any[]) => mockLogError(...args),
      info: (...args: any[]) => mockLogInfo(...args),
      debug: jest.fn(),
    })),
  },
}));

describe('utils/error-handler', () => {
  // Helper to create mock request
  const createMockRequest = (overrides = {}): Partial<FastifyRequest> => ({
    id: 'req-123',
    method: 'GET',
    url: '/api/venues/123',
    headers: {},
    ip: '127.0.0.1',
    ...overrides,
  });

  // Helper to create mock reply
  const createMockReply = () => {
    const reply: Partial<FastifyReply> = {
      code: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    };
    return reply;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  describe('createProblemDetails()', () => {
    it('should create RFC 7807 compliant response', () => {
      const result = createProblemDetails(404, 'Not Found');
      
      expect(result).toHaveProperty('type');
      expect(result).toHaveProperty('title', 'Not Found');
      expect(result).toHaveProperty('status', 404);
      expect(result).toHaveProperty('timestamp');
    });

    it('should include default type URL', () => {
      const result = createProblemDetails(400, 'Bad Request');
      
      expect(result.type).toBe('https://api.tickettoken.com/problems/400');
    });

    it('should use custom type when provided', () => {
      const result = createProblemDetails(404, 'Not Found', {
        type: 'https://custom.example.com/not-found',
      });
      
      expect(result.type).toBe('https://custom.example.com/not-found');
    });

    it('should include detail when provided', () => {
      const result = createProblemDetails(400, 'Bad Request', {
        detail: 'Invalid input data',
      });
      
      expect(result.detail).toBe('Invalid input data');
    });

    it('should include instance when provided', () => {
      const result = createProblemDetails(404, 'Not Found', {
        instance: '/api/venues/123',
      });
      
      expect(result.instance).toBe('/api/venues/123');
    });

    it('should include correlation_id when provided', () => {
      const result = createProblemDetails(500, 'Server Error', {
        correlationId: 'corr-456',
      });
      
      expect(result.correlation_id).toBe('corr-456');
    });

    it('should include code extension when provided', () => {
      const result = createProblemDetails(400, 'Bad Request', {
        code: 'VALIDATION_ERROR',
      });
      
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should include errors extension when provided', () => {
      const result = createProblemDetails(422, 'Validation Error', {
        errors: [
          { field: 'name', message: 'Name is required' },
          { field: 'email', message: 'Invalid email format' },
        ],
      });
      
      expect(result.errors).toEqual([
        { field: 'name', message: 'Name is required' },
        { field: 'email', message: 'Invalid email format' },
      ]);
    });

    it('should include ISO timestamp', () => {
      const result = createProblemDetails(200, 'OK');
      
      expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('notFoundHandler()', () => {
    it('should return 404 status code', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      expect(reply.code).toHaveBeenCalledWith(404);
    });

    it('should set Content-Type to application/problem+json', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
    });

    it('should include request method and URL in detail', () => {
      const req = createMockRequest({
        method: 'POST',
        url: '/api/events',
      }) as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.detail).toContain('POST');
      expect(sentResponse.detail).toContain('/api/events');
    });

    it('should include correlation ID from request ID', () => {
      const req = createMockRequest({ id: 'req-789' }) as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.correlation_id).toBe('req-789');
    });

    it('should use x-request-id header if no request ID', () => {
      const req = createMockRequest({
        id: undefined,
        headers: { 'x-request-id': 'header-id' },
      }) as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.correlation_id).toBe('header-id');
    });

    it('should log the not found request', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it('should set instance to request URL', () => {
      const req = createMockRequest({ url: '/api/test/path' }) as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      notFoundHandler(req, reply);
      
      const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.instance).toBe('/api/test/path');
    });
  });

  describe('errorHandler()', () => {
    describe('AppError Handling', () => {
      it('should use status code from AppError', () => {
        const error = new ValidationError('Invalid data');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(reply.code).toHaveBeenCalledWith(422);
      });

      it('should include error message in detail', () => {
        const error = new NotFoundError('Venue');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
        expect(sentResponse.detail).toBe('Venue not found');
      });

      it('should include error code in response', () => {
        const error = new ValidationError('Invalid data');
        (error as any).code = 'VALIDATION_ERROR';
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
        expect(sentResponse.code).toBe('VALIDATION_ERROR');
      });

      it('should include invalid fields as errors array', () => {
        const error = new ValidationError('Invalid data', { invalidFields: ['name', 'email'] });
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
        expect(sentResponse.errors).toContainEqual(
          expect.objectContaining({ field: 'name' })
        );
        expect(sentResponse.errors).toContainEqual(
          expect.objectContaining({ field: 'email' })
        );
      });
    });

    describe('Fastify Error Handling', () => {
      it('should handle Fastify error with statusCode', () => {
        const error: any = new Error('Bad Gateway');
        error.statusCode = 502;
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(reply.code).toHaveBeenCalledWith(502);
      });

      it('should handle Fastify validation error', () => {
        const error: any = new Error('Validation failed');
        error.validation = [
          { instancePath: '/name', message: 'must be string' },
        ];
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(reply.code).toHaveBeenCalledWith(400);
        const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
        expect(sentResponse.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('Generic Error Handling', () => {
      it('should default to 500 for unknown errors', () => {
        const error = new Error('Unknown error');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(reply.code).toHaveBeenCalledWith(500);
      });

      it('should hide error details in production', () => {
        process.env.NODE_ENV = 'production';
        const error = new Error('Internal database error with sensitive info');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
        expect(sentResponse.detail).toBe('An unexpected error occurred');
      });

      it('should show error details in non-production', () => {
        process.env.NODE_ENV = 'development';
        const error = new Error('Detailed error message');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
        expect(sentResponse.detail).toBe('Detailed error message');
      });
    });

    describe('Response Headers', () => {
      it('should set Content-Type to application/problem+json', () => {
        const error = new Error('Test error');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(reply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      });

      it('should include X-Correlation-ID header', () => {
        const error = new Error('Test error');
        const req = createMockRequest({ id: 'corr-123' }) as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(reply.header).toHaveBeenCalledWith('X-Correlation-ID', 'corr-123');
      });
    });

    describe('Logging', () => {
      it('should log 5xx errors as error level', () => {
        const error = new Error('Server error');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(mockLogError).toHaveBeenCalled();
      });

      it('should log 4xx errors as warn level', () => {
        const error = new ValidationError('Bad request');
        const req = createMockRequest() as FastifyRequest;
        const reply = createMockReply() as FastifyReply;
        
        errorHandler(error, req, reply);
        
        expect(mockLogWarn).toHaveBeenCalled();
      });
    });
  });

  describe('rateLimitHandler()', () => {
    it('should return 429 status code', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
      });
      
      expect(reply.code).toHaveBeenCalledWith(429);
    });

    it('should set RateLimit-Limit header', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
      });
      
      expect(reply.header).toHaveBeenCalledWith('RateLimit-Limit', '100');
    });

    it('should set RateLimit-Remaining header', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
        remaining: 0,
      });
      
      expect(reply.header).toHaveBeenCalledWith('RateLimit-Remaining', '0');
    });

    it('should set RateLimit-Reset header', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      const resetTime = new Date(Date.now() + 60000);
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
        resetTime,
      });
      
      expect(reply.header).toHaveBeenCalledWith(
        'RateLimit-Reset',
        expect.any(String)
      );
    });

    it('should set Retry-After header', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
      });
      
      expect(reply.header).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );
    });

    it('should include reset time in detail message', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
      });
      
      const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.detail).toContain('Rate limit exceeded');
    });

    it('should log rate limit exceeded', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
      });
      
      expect(mockLogWarn).toHaveBeenCalled();
    });

    it('should include RATE_LIMIT_EXCEEDED code', () => {
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      rateLimitHandler(req, reply, {
        max: 100,
        timeWindow: '1 minute',
      });
      
      const sentResponse = (reply.send as jest.Mock).mock.calls[0][0];
      expect(sentResponse.code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('securityHeaders()', () => {
    it('should add security headers hook', () => {
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      expect(mockFastify.addHook).toHaveBeenCalledWith(
        'onRequest',
        expect.any(Function)
      );
    });

    it('should set X-Content-Type-Options header', async () => {
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      const hook = (mockFastify.addHook as jest.Mock).mock.calls[0][1];
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      await hook(req, reply);
      
      expect(reply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    });

    it('should set X-Frame-Options header', async () => {
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      const hook = (mockFastify.addHook as jest.Mock).mock.calls[0][1];
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      await hook(req, reply);
      
      expect(reply.header).toHaveBeenCalledWith('X-Frame-Options', 'DENY');
    });

    it('should set X-XSS-Protection header', async () => {
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      const hook = (mockFastify.addHook as jest.Mock).mock.calls[0][1];
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      await hook(req, reply);
      
      expect(reply.header).toHaveBeenCalledWith('X-XSS-Protection', '1; mode=block');
    });

    it('should set Referrer-Policy header', async () => {
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      const hook = (mockFastify.addHook as jest.Mock).mock.calls[0][1];
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      await hook(req, reply);
      
      expect(reply.header).toHaveBeenCalledWith('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    it('should set HSTS header in production', async () => {
      process.env.NODE_ENV = 'production';
      
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      const hook = (mockFastify.addHook as jest.Mock).mock.calls[0][1];
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      await hook(req, reply);
      
      expect(reply.header).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('max-age=')
      );
    });

    it('should not set HSTS header in non-production', async () => {
      process.env.NODE_ENV = 'development';
      
      const mockFastify: Partial<FastifyInstance> = {
        addHook: jest.fn(),
      };
      
      securityHeaders(mockFastify as FastifyInstance);
      
      const hook = (mockFastify.addHook as jest.Mock).mock.calls[0][1];
      const req = createMockRequest() as FastifyRequest;
      const reply = createMockReply() as FastifyReply;
      
      await hook(req, reply);
      
      expect(reply.header).not.toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.any(String)
      );
    });
  });

  describe('registerErrorHandlers()', () => {
    it('should register not found handler', () => {
      const mockFastify: Partial<FastifyInstance> = {
        setNotFoundHandler: jest.fn(),
        setErrorHandler: jest.fn(),
      };
      
      registerErrorHandlers(mockFastify as FastifyInstance);
      
      expect(mockFastify.setNotFoundHandler).toHaveBeenCalledWith(notFoundHandler);
    });

    it('should register error handler', () => {
      const mockFastify: Partial<FastifyInstance> = {
        setNotFoundHandler: jest.fn(),
        setErrorHandler: jest.fn(),
      };
      
      registerErrorHandlers(mockFastify as FastifyInstance);
      
      expect(mockFastify.setErrorHandler).toHaveBeenCalledWith(errorHandler);
    });

    it('should log registration', () => {
      const mockFastify: Partial<FastifyInstance> = {
        setNotFoundHandler: jest.fn(),
        setErrorHandler: jest.fn(),
      };
      
      registerErrorHandlers(mockFastify as FastifyInstance);
      
      expect(mockLogInfo).toHaveBeenCalled();
    });
  });
});
