import { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import {
  setupErrorHandler,
  errorRecoveryMiddleware,
} from '../../../src/middleware/error-handler.middleware';
import { createRequestLogger, logError } from '../../../src/utils/logger';
import { ApiError } from '../../../src/types';

jest.mock('../../../src/utils/logger');

describe('error-handler.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let mockLogger: any;
  let notFoundHandler: Function;
  let errorHandler: Function;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    };

    (createRequestLogger as jest.Mock).mockReturnValue(mockLogger);
    (logError as jest.Mock).mockReturnValue(undefined);

    mockServer = {
      setNotFoundHandler: jest.fn((handler: Function) => {
        notFoundHandler = handler;
      }),
      setErrorHandler: jest.fn((handler: Function) => {
        errorHandler = handler;
      }),
      close: jest.fn((callback: Function) => callback()),
      log: {
        debug: jest.fn(),
      },
    };

    mockRequest = {
      id: 'test-request-id',
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
      params: {},
      query: {},
      body: {},
      user: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      elapsedTime: 100,
      statusCode: 200,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('setupErrorHandler', () => {
    it('sets not found handler', async () => {
      await setupErrorHandler(mockServer);

      expect(mockServer.setNotFoundHandler).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('sets global error handler', async () => {
      await setupErrorHandler(mockServer);

      expect(mockServer.setErrorHandler).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });
  });

  describe('notFoundHandler', () => {
    beforeEach(async () => {
      await setupErrorHandler(mockServer);
    });

    it('returns 404 status code', async () => {
      await notFoundHandler(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('returns RFC 7807 problem details', async () => {
      await notFoundHandler(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: "The requested resource '/api/test' was not found",
          instance: '/api/test',
          correlationId: 'test-request-id',
          timestamp: expect.any(String),
        })
      );
    });

    it('sets Content-Type header to application/problem+json', async () => {
      await notFoundHandler(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Type',
        'application/problem+json'
      );
    });

    it('sets X-Correlation-ID header', async () => {
      await notFoundHandler(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'X-Correlation-ID',
        'test-request-id'
      );
    });

    it('logs warning with request details', async () => {
      mockRequest.url = '/nonexistent';
      mockRequest.method = 'POST';
      mockRequest.ip = '192.168.1.1';

      await notFoundHandler(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          method: 'POST',
          url: '/nonexistent',
          ip: '192.168.1.1',
        },
        'Route not found'
      );
    });

    it('includes timestamp in ISO format', async () => {
      await notFoundHandler(mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('errorHandler - ApiError', () => {
    beforeEach(async () => {
      await setupErrorHandler(mockServer);
    });

    it('handles ApiError with correct status and details', async () => {
      const apiError = new ApiError(400, 'Test error', 'TEST_ERROR', { field: 'test' });

      await errorHandler(apiError, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/test_error',
          title: 'ApiError',
          status: 400,
          detail: 'Test error',
          code: 'TEST_ERROR',
        })
      );
    });

    it('includes error details in non-production', async () => {
      process.env.NODE_ENV = 'development';
      const apiError = new ApiError(400, 'Test error', 'TEST_ERROR', { field: 'value' });

      await errorHandler(apiError, mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.details).toEqual({ field: 'value' });
    });

    it('excludes error details in production', async () => {
      process.env.NODE_ENV = 'production';
      const apiError = new ApiError(400, 'Test error', 'TEST_ERROR', { field: 'value' });

      await errorHandler(apiError, mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.details).toBeUndefined();
    });

    it('logs API error with full context', async () => {
      const apiError = new ApiError(500, 'API error', 'API_ERROR');
      mockRequest.params = { id: '123' };
      mockRequest.query = { filter: 'active' };

      await errorHandler(apiError, mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            name: 'ApiError',
            message: 'API error',
            code: 'API_ERROR',
            statusCode: 500,
          }),
          request: {
            method: 'GET',
            url: '/api/test',
            params: { id: '123' },
            query: { filter: 'active' },
          },
        }),
        'API error occurred'
      );
    });

    it('uses venueId from request context in logger', async () => {
      (mockRequest as any).venueContext = { venueId: 'venue-123' };
      const apiError = new ApiError(400, 'Test', 'TEST');

      await errorHandler(apiError, mockRequest, mockReply);

      expect(createRequestLogger).toHaveBeenCalledWith('test-request-id', 'venue-123');
    });

    it('uses venueId from user when venueContext not present', async () => {
      (mockRequest.user as any).venueId = 'venue-456';
      const apiError = new ApiError(400, 'Test', 'TEST');

      await errorHandler(apiError, mockRequest, mockReply);

      expect(createRequestLogger).toHaveBeenCalledWith('test-request-id', 'venue-456');
    });
  });

  describe('errorHandler - validation errors', () => {
    beforeEach(async () => {
      await setupErrorHandler(mockServer);
    });

    it('handles Fastify validation errors', async () => {
      const validationError: any = new Error('Validation failed');
      validationError.validation = [
        {
          instancePath: '/email',
          message: 'must be a valid email',
          params: { format: 'email' },
        },
      ];

      await errorHandler(validationError, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(422);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/validation-error',
          title: 'Validation Error',
          status: 422,
          code: 'VALIDATION_ERROR',
        })
      );
    });

    it('formats validation errors correctly', async () => {
      const validationError: any = new Error('Validation failed');
      validationError.validation = [
        {
          instancePath: '/email',
          message: 'must be a valid email',
          value: 'invalid',
          params: { format: 'email' },
        },
        {
          dataPath: '.age',
          message: 'must be greater than 0',
          value: -1,
          params: { minimum: 0 },
        },
      ];

      await errorHandler(validationError, mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.errors).toHaveLength(2);
      expect(sentData.errors[0]).toEqual({
        field: '/email',
        message: 'must be a valid email',
        value: 'invalid',
        constraint: { format: 'email' },
      });
      expect(sentData.errors[1]).toEqual({
        field: '.age',
        message: 'must be greater than 0',
        value: -1,
        constraint: { minimum: 0 },
      });
    });

    it('logs validation errors with request body', async () => {
      const validationError: any = new Error('Validation failed');
      validationError.validation = [{ message: 'invalid' }];
      mockRequest.body = { email: 'bad-email' };

      await errorHandler(validationError, mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: {
            validation: [{ message: 'invalid' }],
          },
          request: expect.objectContaining({
            body: { email: 'bad-email' },
          }),
        }),
        'Validation error occurred'
      );
    });
  });

  describe('errorHandler - HTTP errors', () => {
    beforeEach(async () => {
      await setupErrorHandler(mockServer);
    });

    it('handles 401 Unauthorized error', async () => {
      const error: any = new Error('Unauthorized');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/unauthorized',
          title: 'Unauthorized',
          status: 401,
        })
      );
    });

    it('handles 403 Forbidden error', async () => {
      const error: any = new Error('Forbidden');
      error.statusCode = 403;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/forbidden',
          title: 'Forbidden',
          status: 403,
        })
      );
    });

    it('handles 429 Rate Limit error with Retry-After header', async () => {
      const error: any = new Error('Too many requests');
      error.statusCode = 429;
      error.retryAfter = 120;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', '120');
      expect(mockReply.code).toHaveBeenCalledWith(429);
    });

    it('uses default 60s for Retry-After when not specified', async () => {
      const error: any = new Error('Too many requests');
      error.statusCode = 429;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', '60');
    });

    it('logs server errors with error level', async () => {
      const error: any = new Error('Internal error');
      error.statusCode = 500;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Internal error',
            statusCode: 500,
          }),
        }),
        'Server error occurred'
      );
    });

    it('logs client errors with warn level', async () => {
      const error: any = new Error('Bad request');
      error.statusCode = 400;

      await errorHandler(error, mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Bad request',
            statusCode: 400,
          }),
        }),
        'Client error occurred'
      );
    });
  });

  describe('errorHandler - unknown errors', () => {
    beforeEach(async () => {
      await setupErrorHandler(mockServer);
    });

    it('handles unknown errors with 500 status', async () => {
      const error = new Error('Unknown error');

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://api.tickettoken.com/errors/internal-error',
          title: 'Internal Server Error',
          status: 500,
        })
      );
    });

    it('calls logError for unknown errors', async () => {
      const error = new Error('Unknown error');

      await errorHandler(error, mockRequest, mockReply);

      expect(logError).toHaveBeenCalledWith(
        error,
        'Unhandled error',
        expect.objectContaining({
          correlationId: 'test-request-id',
          method: 'GET',
          url: '/api/test',
        })
      );
    });

    it('includes error message in non-production', async () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Detailed error message');

      await errorHandler(error, mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.detail).toBe('Detailed error message');
      expect(sentData.stack).toBeDefined();
    });

    it('hides error details in production', async () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Detailed error message');

      await errorHandler(error, mockRequest, mockReply);

      const sentData = mockReply.send.mock.calls[0][0];
      expect(sentData.detail).toBe('An unexpected error occurred');
      expect(sentData.stack).toBeUndefined();
    });
  });

  describe('errorHandler - response headers', () => {
    beforeEach(async () => {
      await setupErrorHandler(mockServer);
    });

    it('sets all required headers', async () => {
      const error = new Error('Test');

      await errorHandler(error, mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      expect(mockReply.header).toHaveBeenCalledWith('X-Correlation-ID', 'test-request-id');
      expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'test-request-id');
      expect(mockReply.header).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
      );
    });
  });

  describe('errorRecoveryMiddleware', () => {
    let processOnSpy: jest.SpyInstance;
    let handlers: Map<string, Function[]>;

    beforeEach(() => {
      handlers = new Map();
      
      processOnSpy = jest.spyOn(process, 'on').mockImplementation((event: any, handler: any) => {
        if (!handlers.has(event)) {
          handlers.set(event, []);
        }
        handlers.get(event)!.push(handler);
        return process;
      });
    });

    afterEach(() => {
      processOnSpy.mockRestore();
    });

    it('registers unhandledRejection handler', () => {
      errorRecoveryMiddleware(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('unhandledRejection', expect.any(Function));
    });

    it('registers uncaughtException handler', () => {
      errorRecoveryMiddleware(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('registers warning handler', () => {
      errorRecoveryMiddleware(mockServer);

      expect(processOnSpy).toHaveBeenCalledWith('warning', expect.any(Function));
    });

    it('logs unhandled promise rejections', () => {
      errorRecoveryMiddleware(mockServer);

      const handler = handlers.get('unhandledRejection')![0];
      const reason = new Error('Promise rejected');
      const mockPromise = { then: jest.fn(), catch: jest.fn() };
      
      handler(reason, mockPromise);

      expect(mockLogger.error).toHaveBeenCalledWith(
        { reason, promise: mockPromise },
        'Unhandled promise rejection'
      );
    });

    it('logs Node.js warnings', () => {
      errorRecoveryMiddleware(mockServer);

      const handler = handlers.get('warning')![0];
      const warning: any = new Error('Deprecation warning');
      warning.name = 'DeprecationWarning';
      
      handler(warning);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          warning: {
            name: 'DeprecationWarning',
            message: 'Deprecation warning',
            stack: expect.any(String),
          },
        },
        'Node.js warning'
      );
    });

    it('logs fatal error on uncaught exception', () => {
      const mockClose = jest.fn((callback: Function) => callback());
      mockServer.close = mockClose;

      errorRecoveryMiddleware(mockServer);

      const handler = handlers.get('uncaughtException')![0];
      const error = new Error('Uncaught error');

      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);

      handler(error);

      expect(mockLogger.fatal).toHaveBeenCalledWith(
        {
          error: {
            message: 'Uncaught error',
            stack: expect.any(String),
          },
        },
        'Uncaught exception'
      );

      expect(mockClose).toHaveBeenCalled();
      
      exitSpy.mockRestore();
    });
  });
});
