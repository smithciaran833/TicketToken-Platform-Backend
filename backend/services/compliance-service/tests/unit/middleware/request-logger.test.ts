/**
 * Unit Tests for Request Logger Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock metrics
jest.mock('../../../src/utils/metrics', () => ({
  incrementMetric: jest.fn()
}));

describe('Request Logger Middleware', () => {
  let createRequestLogger: any;
  let setupRequestLogger: any;
  let logRateLimitEvent: any;
  let logAuthFailure: any;
  let getSecurityMetrics: any;
  let resetSecurityMetrics: any;
  let logger: any;
  let incrementMetric: any;

  let mockRequest: any;
  let mockReply: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    process.env = { ...originalEnv };

    const loggerModule = await import('../../../src/utils/logger');
    logger = loggerModule.logger;

    const metricsModule = await import('../../../src/utils/metrics');
    incrementMetric = metricsModule.incrementMetric;

    const module = await import('../../../src/middleware/request-logger');
    createRequestLogger = module.createRequestLogger;
    setupRequestLogger = module.setupRequestLogger;
    logRateLimitEvent = module.logRateLimitEvent;
    logAuthFailure = module.logAuthFailure;
    getSecurityMetrics = module.getSecurityMetrics;
    resetSecurityMetrics = module.resetSecurityMetrics;

    // Reset metrics before each test
    resetSecurityMetrics();

    mockRequest = {
      url: '/api/test',
      method: 'GET',
      headers: {
        'user-agent': 'test-agent',
        'content-length': '100'
      },
      requestId: 'req-123',
      id: 'req-123',
      ip: '127.0.0.1',
      body: null,
      user: null,
      tenantId: 'tenant-123'
    };

    mockReply = {
      raw: {
        on: jest.fn<(event: string, callback: () => void) => void>()
      },
      statusCode: 200,
      getHeader: jest.fn<(name: string) => string | undefined>().mockReturnValue('100'),
      code: jest.fn<(code: number) => any>().mockReturnThis(),
      send: jest.fn<(body: any) => any>().mockReturnThis()
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('createRequestLogger', () => {
    it('should log incoming request', async () => {
      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          method: 'GET',
          path: '/api/test',
          ip: '127.0.0.1'
        }),
        'Incoming request'
      );
    });

    it('should skip health check paths', async () => {
      mockRequest.url = '/health';

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should skip /ready path', async () => {
      mockRequest.url = '/ready';

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should skip /metrics path', async () => {
      mockRequest.url = '/metrics';

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should log body for POST requests', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { name: 'test', value: 123 };

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ name: 'test' })
        }),
        'Incoming request'
      );
    });

    it('should redact sensitive fields from body', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = {
        username: 'john',
        password: 'secret123',
        token: 'abc123',
        ssn: '123-45-6789'
      };

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      const logCall = logger.info.mock.calls[0][0];
      expect(logCall.body.username).toBe('john');
      expect(logCall.body.password).toBe('[REDACTED]');
      expect(logCall.body.token).toBe('[REDACTED]');
      expect(logCall.body.ssn).toBe('[REDACTED]');
    });

    it('should truncate large bodies', async () => {
      mockRequest.method = 'POST';
      mockRequest.body = { data: 'x'.repeat(2000) };

      const middleware = createRequestLogger({ maxBodyLogSize: 100 });
      await middleware(mockRequest, mockReply);

      const logCall = logger.info.mock.calls[0][0];
      expect(logCall.body._truncated).toBe(true);
    });

    it('should register finish handler for response logging', async () => {
      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(mockReply.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });

    it('should log response on finish', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      finishCallback();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200
        }),
        'Request completed'
      );
    });

    it('should log slow requests as warning', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });

      const middleware = createRequestLogger({ slowRequestThresholdMs: 0 });
      await middleware(mockRequest, mockReply);

      finishCallback();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          threshold: 0
        }),
        'Slow request detected'
      );
    });

    it('should log 5xx errors as error', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });
      mockReply.statusCode = 500;

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      finishCallback();

      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500
        }),
        'Request completed with server error'
      );
    });

    it('should log 4xx errors as warning', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });
      mockReply.statusCode = 400;

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      finishCallback();

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400
        }),
        'Request completed with client error'
      );
    });

    it('should use x-forwarded-for for client IP', async () => {
      mockRequest.headers['x-forwarded-for'] = '192.168.1.100, 10.0.0.1';

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.100'
        }),
        'Incoming request'
      );
    });

    it('should use x-real-ip as fallback', async () => {
      mockRequest.headers['x-real-ip'] = '192.168.1.200';
      delete mockRequest.headers['x-forwarded-for'];

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.200'
        }),
        'Incoming request'
      );
    });

    it('should include user and tenant info when available', async () => {
      mockRequest.user = { id: 'user-456' };
      mockRequest.tenantId = 'tenant-789';

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456',
          tenantId: 'tenant-789'
        }),
        'Incoming request'
      );
    });

    it('should increment metrics on response', async () => {
      let finishCallback: () => void = () => {};
      mockReply.raw.on = jest.fn<(event: string, cb: () => void) => void>((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      });

      const middleware = createRequestLogger();
      await middleware(mockRequest, mockReply);

      finishCallback();

      expect(incrementMetric).toHaveBeenCalledWith(
        'http_requests_total',
        expect.objectContaining({
          method: 'GET',
          status: '200'
        })
      );
    });
  });

  describe('setupRequestLogger', () => {
    it('should register onRequest hook', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>(),
        setErrorHandler: jest.fn<(handler: any) => void>(),
        setNotFoundHandler: jest.fn<(handler: any) => void>()
      };

      setupRequestLogger(mockFastify as any);

      expect(mockFastify.addHook).toHaveBeenCalledWith('onRequest', expect.any(Function));
    });

    it('should register error handler', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>(),
        setErrorHandler: jest.fn<(handler: any) => void>(),
        setNotFoundHandler: jest.fn<(handler: any) => void>()
      };

      setupRequestLogger(mockFastify as any);

      expect(mockFastify.setErrorHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should register 404 handler', () => {
      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>(),
        setErrorHandler: jest.fn<(handler: any) => void>(),
        setNotFoundHandler: jest.fn<(handler: any) => void>()
      };

      setupRequestLogger(mockFastify as any);

      expect(mockFastify.setNotFoundHandler).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should hide stack traces in production', () => {
      process.env.NODE_ENV = 'production';

      const mockFastify = {
        addHook: jest.fn<(name: string, handler: any) => void>(),
        setErrorHandler: jest.fn<(handler: any) => void>(),
        setNotFoundHandler: jest.fn<(handler: any) => void>()
      };

      setupRequestLogger(mockFastify as any);

      const errorHandler = mockFastify.setErrorHandler.mock.calls[0][0];
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at Test.fn';

      errorHandler(error, mockRequest, mockReply);

      const logCall = logger.error.mock.calls[0][0];
      expect(logCall.stack).toBeUndefined();
    });
  });

  describe('logRateLimitEvent', () => {
    it('should log rate limit exceeded', () => {
      logRateLimitEvent(mockRequest, {
        limited: true,
        remaining: 0,
        limit: 100,
        resetTime: Date.now() + 60000,
        key: 'user-123'
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 100,
          remaining: 0,
          rateKey: 'user-123'
        }),
        'Rate limit exceeded'
      );
    });

    it('should increment blocked metric', () => {
      logRateLimitEvent(mockRequest, {
        limited: true,
        remaining: 0,
        limit: 100
      });

      expect(incrementMetric).toHaveBeenCalledWith('rate_limit_blocked_total');
    });

    it('should log warning when approaching limit', () => {
      logRateLimitEvent(mockRequest, {
        limited: false,
        remaining: 3,
        limit: 100
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          remaining: 3
        }),
        'Rate limit approaching'
      );
    });

    it('should not log when not limited and above threshold', () => {
      logRateLimitEvent(mockRequest, {
        limited: false,
        remaining: 50,
        limit: 100
      });

      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should track metrics correctly', () => {
      logRateLimitEvent(mockRequest, { limited: true, remaining: 0, limit: 100 });
      logRateLimitEvent(mockRequest, { limited: true, remaining: 0, limit: 100 });
      logRateLimitEvent(mockRequest, { limited: false, remaining: 3, limit: 100 });

      const metrics = getSecurityMetrics();
      expect(metrics.rateLimit.blocked).toBe(2);
      expect(metrics.rateLimit.warnings).toBe(1);
    });
  });

  describe('logAuthFailure', () => {
    it('should log invalid token failure', () => {
      logAuthFailure(mockRequest, 'invalid_token', { tokenType: 'jwt' });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'invalid_token',
          tokenType: 'jwt'
        }),
        'Authentication failure'
      );
    });

    it('should log expired token failure', () => {
      logAuthFailure(mockRequest, 'expired_token');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'expired_token'
        }),
        'Authentication failure'
      );
    });

    it('should log missing token failure', () => {
      logAuthFailure(mockRequest, 'missing_token');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'missing_token'
        }),
        'Authentication failure'
      );
    });

    it('should log insufficient permissions failure', () => {
      logAuthFailure(mockRequest, 'insufficient_permissions');

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'insufficient_permissions'
        }),
        'Authentication failure'
      );
    });

    it('should increment auth failure metric', () => {
      logAuthFailure(mockRequest, 'invalid_token');

      expect(incrementMetric).toHaveBeenCalledWith('auth_failure_total', { reason: 'invalid_token' });
    });

    it('should track auth failure counts', () => {
      logAuthFailure(mockRequest, 'invalid_token');
      logAuthFailure(mockRequest, 'invalid_token');
      logAuthFailure(mockRequest, 'expired_token');
      logAuthFailure(mockRequest, 'missing_token');

      const metrics = getSecurityMetrics();
      expect(metrics.authFailures.invalid_token).toBe(2);
      expect(metrics.authFailures.expired_token).toBe(1);
      expect(metrics.authFailures.missing_token).toBe(1);
    });
  });

  describe('getSecurityMetrics', () => {
    it('should return current metrics', () => {
      const metrics = getSecurityMetrics();

      expect(metrics).toHaveProperty('rateLimit');
      expect(metrics).toHaveProperty('authFailures');
    });
  });

  describe('resetSecurityMetrics', () => {
    it('should reset all metrics to zero', () => {
      logAuthFailure(mockRequest, 'invalid_token');
      logRateLimitEvent(mockRequest, { limited: true, remaining: 0, limit: 100 });

      resetSecurityMetrics();

      const metrics = getSecurityMetrics();
      expect(metrics.rateLimit.blocked).toBe(0);
      expect(metrics.authFailures.invalid_token).toBe(0);
    });
  });
});
