/**
 * Comprehensive Unit Tests for src/middleware/request-logger.ts
 *
 * Tests request logging with child loggers and context
 */

// Mock logger
const mockLoggerChild = jest.fn();
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: mockLoggerChild,
};

// Child logger that gets returned from child()
const mockChildLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

mockLoggerChild.mockReturnValue(mockChildLogger);

jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

import {
  registerRequestLogger,
  getRequestLogger,
} from '../../../src/middleware/request-logger';

describe('src/middleware/request-logger.ts - Comprehensive Unit Tests', () => {
  let mockApp: any;
  let mockRequest: any;
  let mockReply: any;
  let onRequestHook: any;
  let onResponseHook: any;
  let onErrorHook: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env = { ...originalEnv };

    mockApp = {
      addHook: jest.fn((hookName, handler) => {
        if (hookName === 'onRequest') onRequestHook = handler;
        if (hookName === 'onResponse') onResponseHook = handler;
        if (hookName === 'onError') onErrorHook = handler;
      }),
    };

    mockRequest = {
      id: 'req-123',
      method: 'GET',
      url: '/api/v1/test',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'Mozilla/5.0',
        'content-type': 'application/json',
      },
      query: {},
    };

    mockReply = {
      getResponseTime: jest.fn(() => 123.456),
      statusCode: 200,
      getHeader: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // REGISTER REQUEST LOGGER
  // =============================================================================

  describe('registerRequestLogger()', () => {
    it('should register all three hooks', async () => {
      await registerRequestLogger(mockApp);

      expect(mockApp.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
      expect(mockApp.addHook).toHaveBeenCalledWith('onResponse', expect.any(Function));
      expect(mockApp.addHook).toHaveBeenCalledWith('onError', expect.any(Function));
    });
  });

  // =============================================================================
  // ON REQUEST HOOK (REQUEST START)
  // =============================================================================

  describe('onRequest Hook - Request Start', () => {
    beforeEach(async () => {
      await registerRequestLogger(mockApp);
    });

    it('should create child logger with request context', async () => {
      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalledWith({
        requestId: 'req-123',
        correlationId: 'req-123',
        method: 'GET',
        path: '/api/v1/test',
        tenant_id: undefined,
      });
    });

    it('should log incoming request', async () => {
      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'request_start',
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        }),
        'Incoming request'
      );
    });

    it('should attach child logger to request', async () => {
      await onRequestHook(mockRequest, mockReply);

      expect(mockRequest.log).toBe(mockChildLogger);
    });

    it('should include query parameters in log', async () => {
      mockRequest.query = { page: '1', limit: '10' };

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { page: '1', limit: '10' },
        }),
        'Incoming request'
      );
    });

    it('should include tenant_id from request', async () => {
      mockRequest.tenantId = 'tenant-123';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-123',
        })
      );
    });

    it('should include tenant_id from user', async () => {
      mockRequest.user = { userId: 'user-123', tenant_id: 'tenant-456' };

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-456',
        })
      );
    });

    it('should use correlationId if present', async () => {
      mockRequest.correlationId = 'corr-789';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-789',
        })
      );
    });

    it('should strip query params from path in context', async () => {
      mockRequest.url = '/api/v1/test?page=1&limit=10';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/api/v1/test',
        })
      );
    });
  });

  // =============================================================================
  // ON RESPONSE HOOK (REQUEST COMPLETE)
  // =============================================================================

  describe('onResponse Hook - Request Complete', () => {
    beforeEach(async () => {
      await registerRequestLogger(mockApp);
    });

    it('should log successful request at info level', async () => {
      mockRequest.log = mockChildLogger;
      mockReply.statusCode = 200;
      mockReply.getResponseTime.mockReturnValue(123.456);

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'request_complete',
          statusCode: 200,
          responseTime: 123.46,
        }),
        'Request completed: 200 in 123.46ms'
      );
    });

    it('should log 4xx errors at warn level', async () => {
      mockRequest.log = mockChildLogger;
      mockReply.statusCode = 404;

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
        }),
        expect.stringContaining('404')
      );
    });

    it('should log 5xx errors at error level', async () => {
      mockRequest.log = mockChildLogger;
      mockReply.statusCode = 500;

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
        }),
        expect.stringContaining('500')
      );
    });

    it('should round response time to 2 decimal places', async () => {
      mockRequest.log = mockChildLogger;
      mockReply.getResponseTime.mockReturnValue(123.456789);

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          responseTime: 123.46,
        }),
        expect.any(String)
      );
    });

    it('should include content length if available', async () => {
      mockRequest.log = mockChildLogger;
      mockReply.getHeader.mockReturnValue('1234');

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          contentLength: '1234',
        }),
        expect.any(String)
      );
    });

    it('should include userId from request', async () => {
      mockRequest.log = mockChildLogger;
      mockRequest.user = { userId: 'user-123' };

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
        }),
        expect.any(String)
      );
    });

    it('should include tenant_id from user', async () => {
      mockRequest.log = mockChildLogger;
      mockRequest.user = { userId: 'user-123', tenant_id: 'tenant-456' };

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'tenant-456',
        }),
        expect.any(String)
      );
    });

    it('should create logger if not attached to request', async () => {
      // No request.log
      await onResponseHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalled();
      expect(mockChildLogger.info).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // ON ERROR HOOK (ERROR LOGGING)
  // =============================================================================

  describe('onError Hook - Error Logging', () => {
    beforeEach(async () => {
      await registerRequestLogger(mockApp);
    });

    it('should log standard errors', async () => {
      mockRequest.log = mockChildLogger;
      const error = new Error('Something went wrong');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'request_error',
          error: {
            name: 'Error',
            message: 'Something went wrong',
            code: undefined,
            statusCode: undefined,
          },
        }),
        'Request error: Something went wrong'
      );
    });

    it('should detect rate limit errors by status code', async () => {
      mockRequest.log = mockChildLogger;
      const error: any = new Error('Rate limited');
      error.statusCode = 429;

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'rate_limit_exceeded',
        }),
        'Rate limit exceeded'
      );
    });

    it('should detect rate limit errors by message', async () => {
      mockRequest.log = mockChildLogger;
      const error = new Error('Rate limit exceeded for tenant');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'rate_limit_exceeded',
        }),
        'Rate limit exceeded'
      );
    });

    it('should include error code if available', async () => {
      mockRequest.log = mockChildLogger;
      const error: any = new Error('Database error');
      error.code = 'ECONNREFUSED';
      error.statusCode = 500;

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'ECONNREFUSED',
            statusCode: 500,
          }),
        }),
        expect.any(String)
      );
    });

    it('should include stack trace in development', async () => {
      process.env.NODE_ENV = 'development';
      mockRequest.log = mockChildLogger;
      const error = new Error('Test error');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: expect.any(String),
        }),
        expect.any(String)
      );
    });

    it('should not include stack trace in production', async () => {
      process.env.NODE_ENV = 'production';
      mockRequest.log = mockChildLogger;
      const error = new Error('Test error');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          stack: undefined,
        }),
        expect.any(String)
      );
    });

    it('should include userId and tenant_id', async () => {
      mockRequest.log = mockChildLogger;
      mockRequest.user = { userId: 'user-123', tenant_id: 'tenant-456' };
      const error = new Error('Test error');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          tenant_id: 'tenant-456',
        }),
        expect.any(String)
      );
    });

    it('should include IP address', async () => {
      mockRequest.log = mockChildLogger;
      mockRequest.ip = '192.168.1.100';
      const error = new Error('Test error');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.100',
        }),
        expect.any(String)
      );
    });

    it('should create logger if not attached to request', async () => {
      // No request.log
      const error = new Error('Test error');

      await onErrorHook(mockRequest, mockReply, error);

      expect(mockLogger.child).toHaveBeenCalled();
      expect(mockChildLogger.error).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // HEADER REDACTION
  // =============================================================================

  describe('Header Redaction', () => {
    beforeEach(async () => {
      await registerRequestLogger(mockApp);
    });

    it('should redact authorization header', async () => {
      mockRequest.headers.authorization = 'Bearer secret-token';

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: '[REDACTED]',
          }),
        }),
        expect.any(String)
      );
    });

    it('should redact cookie header', async () => {
      mockRequest.headers.cookie = 'session=abc123';

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            cookie: '[REDACTED]',
          }),
        }),
        expect.any(String)
      );
    });

    it('should redact x-api-key header', async () => {
      mockRequest.headers['x-api-key'] = 'api-key-123';

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': '[REDACTED]',
          }),
        }),
        expect.any(String)
      );
    });

    it('should redact x-jwt-token header', async () => {
      mockRequest.headers['x-jwt-token'] = 'jwt-token-123';

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-jwt-token': '[REDACTED]',
          }),
        }),
        expect.any(String)
      );
    });

    it('should not redact non-sensitive headers', async () => {
      mockRequest.headers['content-type'] = 'application/json';
      mockRequest.headers['accept'] = 'application/json';

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'content-type': 'application/json',
            'accept': 'application/json',
          }),
        }),
        expect.any(String)
      );
    });

    it('should be case-insensitive for redaction', async () => {
      mockRequest.headers.Authorization = 'Bearer token';
      mockRequest.headers.COOKIE = 'session=123';

      await onRequestHook(mockRequest, mockReply);

      expect(mockChildLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: '[REDACTED]',
            COOKIE: '[REDACTED]',
          }),
        }),
        expect.any(String)
      );
    });
  });

  // =============================================================================
  // PATH EXCLUSION
  // =============================================================================

  describe('Path Exclusion', () => {
    beforeEach(async () => {
      await registerRequestLogger(mockApp);
    });

    it('should skip logging for /health', async () => {
      mockRequest.url = '/health';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).not.toHaveBeenCalled();
      expect(mockChildLogger.info).not.toHaveBeenCalled();
    });

    it('should skip logging for /live', async () => {
      mockRequest.url = '/live';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).not.toHaveBeenCalled();
    });

    it('should skip logging for /ready', async () => {
      mockRequest.url = '/ready';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).not.toHaveBeenCalled();
    });

    it('should skip logging for /startup', async () => {
      mockRequest.url = '/startup';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).not.toHaveBeenCalled();
    });

    it('should skip logging for /metrics', async () => {
      mockRequest.url = '/metrics';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).not.toHaveBeenCalled();
    });

    it('should skip logging for /info', async () => {
      mockRequest.url = '/info';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).not.toHaveBeenCalled();
    });

    it('should skip response logging for excluded paths', async () => {
      mockRequest.url = '/health';

      await onResponseHook(mockRequest, mockReply);

      expect(mockChildLogger.info).not.toHaveBeenCalled();
    });

    it('should log non-excluded paths', async () => {
      mockRequest.url = '/api/v1/transactions';

      await onRequestHook(mockRequest, mockReply);

      expect(mockLogger.child).toHaveBeenCalled();
      expect(mockChildLogger.info).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // GET REQUEST LOGGER
  // =============================================================================

  describe('getRequestLogger()', () => {
    it('should return attached logger if present', () => {
      mockRequest.log = mockChildLogger;

      const logger = getRequestLogger(mockRequest);

      expect(logger).toBe(mockChildLogger);
    });

    it('should create new logger if not attached', () => {
      const logger = getRequestLogger(mockRequest);

      expect(mockLogger.child).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
        })
      );
      expect(logger).toBe(mockChildLogger);
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export registerRequestLogger function', () => {
      expect(typeof registerRequestLogger).toBe('function');
    });

    it('should export getRequestLogger function', () => {
      expect(typeof getRequestLogger).toBe('function');
    });
  });
});
