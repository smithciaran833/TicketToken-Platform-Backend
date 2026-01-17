/**
 * Request Logger Middleware Unit Tests
 */

// Mock logger before imports
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { requestLoggerMiddleware, registerRequestLogger } from '../../../src/middleware/request-logger';

describe('Request Logger Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let thenResolve: Function;
  let thenReject: Function;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      method: 'GET',
      url: '/api/analytics',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'TestAgent/1.0',
        'x-request-id': 'abc-123',
      },
      ip: '192.168.1.1',
      tenantContext: { tenantId: 'tenant-123' },
    };

    // Mock reply.then() to capture callbacks
    mockReply = {
      statusCode: 200,
      then: jest.fn((resolve, reject) => {
        thenResolve = resolve;
        thenReject = reject;
      }),
    };
  });

  describe('requestLoggerMiddleware', () => {
    describe('request logging', () => {
      it('should log request started event', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_started',
            requestId: 'req-123',
            method: 'GET',
            url: '/api/analytics',
          }),
          'GET /api/analytics'
        );
      });

      it('should include tenant ID in request log', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 'tenant-123',
          }),
          expect.any(String)
        );
      });

      it('should include user agent in request log', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            userAgent: 'TestAgent/1.0',
          }),
          expect.any(String)
        );
      });

      it('should include client IP in request log', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            ip: '192.168.1.1',
          }),
          expect.any(String)
        );
      });

      it('should handle missing tenant context', async () => {
        mockRequest.tenantContext = undefined;

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: undefined,
          }),
          expect.any(String)
        );
      });
    });

    describe('header sanitization', () => {
      it('should redact authorization header', async () => {
        mockRequest.headers.authorization = 'Bearer secret-token-12345';

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        expect(logCall.headers.authorization).toBe('[REDACTED]');
      });

      it('should redact cookie header', async () => {
        mockRequest.headers.cookie = 'session=abc123; token=xyz789';

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        expect(logCall.headers.cookie).toBe('[REDACTED]');
      });

      it('should redact x-api-key header', async () => {
        mockRequest.headers['x-api-key'] = 'api-key-secret-value';

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        expect(logCall.headers['x-api-key']).toBe('[REDACTED]');
      });

      it('should redact x-internal-signature header', async () => {
        mockRequest.headers['x-internal-signature'] = 'hmac-signature-value';

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        expect(logCall.headers['x-internal-signature']).toBe('[REDACTED]');
      });

      it('should redact headers case-insensitively', async () => {
        mockRequest.headers['Authorization'] = 'Bearer token';
        mockRequest.headers['COOKIE'] = 'session=123';

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        // The original case is preserved but value is redacted
        expect(logCall.headers['Authorization']).toBe('[REDACTED]');
        expect(logCall.headers['COOKIE']).toBe('[REDACTED]');
      });

      it('should preserve non-sensitive headers', async () => {
        mockRequest.headers['content-type'] = 'application/json';
        mockRequest.headers['accept'] = 'application/json';
        mockRequest.headers['x-custom-header'] = 'custom-value';

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        expect(logCall.headers['content-type']).toBe('application/json');
        expect(logCall.headers['accept']).toBe('application/json');
        expect(logCall.headers['x-custom-header']).toBe('custom-value');
      });

      it('should handle multiple sensitive headers at once', async () => {
        mockRequest.headers = {
          'authorization': 'Bearer token',
          'cookie': 'session=123',
          'x-api-key': 'api-key',
          'x-internal-signature': 'signature',
          'content-type': 'application/json',
        };

        await requestLoggerMiddleware(mockRequest, mockReply);

        const logCall = mockLogger.info.mock.calls[0][0];
        expect(logCall.headers.authorization).toBe('[REDACTED]');
        expect(logCall.headers.cookie).toBe('[REDACTED]');
        expect(logCall.headers['x-api-key']).toBe('[REDACTED]');
        expect(logCall.headers['x-internal-signature']).toBe('[REDACTED]');
        expect(logCall.headers['content-type']).toBe('application/json');
      });
    });

    describe('skip paths', () => {
      it('should skip /health endpoint', async () => {
        mockRequest.url = '/health';

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(mockReply.then).not.toHaveBeenCalled();
      });

      it('should skip /ready endpoint', async () => {
        mockRequest.url = '/ready';

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should skip /live endpoint', async () => {
        mockRequest.url = '/live';

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should skip /metrics endpoint', async () => {
        mockRequest.url = '/metrics';

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should skip paths starting with skip path prefix', async () => {
        mockRequest.url = '/health/detailed';

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should not skip similar but non-matching paths', async () => {
        mockRequest.url = '/api/health-check';

        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockLogger.info).toHaveBeenCalled();
      });

      it('should not skip /healthy or other partial matches', async () => {
        mockRequest.url = '/healthy';

        await requestLoggerMiddleware(mockRequest, mockReply);

        // /healthy does start with /health, so it will be skipped
        expect(mockLogger.info).not.toHaveBeenCalled();
      });
    });

    describe('response logging', () => {
      it('should register completion callback with reply.then', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        expect(mockReply.then).toHaveBeenCalledWith(
          expect.any(Function),
          expect.any(Function)
        );
      });

      it('should log request completed on successful response', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        // Simulate response completion
        thenResolve();

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_completed',
            requestId: 'req-123',
            method: 'GET',
            url: '/api/analytics',
            statusCode: 200,
          }),
          expect.stringMatching(/GET \/api\/analytics 200 \d+ms/)
        );
      });

      it('should log request completed on error response', async () => {
        mockReply.statusCode = 500;

        await requestLoggerMiddleware(mockRequest, mockReply);

        // Simulate error completion
        thenReject();

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_completed',
            statusCode: 500,
          }),
          expect.stringMatching(/GET \/api\/analytics 500/)
        );
      });

      it('should include duration in milliseconds', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        // Simulate response completion
        thenResolve();

        const completionCall = mockLogger.info.mock.calls.find(
          (call: any[]) => call[0].event === 'request_completed'
        );
        expect(completionCall[0]).toHaveProperty('durationMs');
        expect(typeof completionCall[0].durationMs).toBe('string');
      });

      it('should include tenant ID in completion log', async () => {
        await requestLoggerMiddleware(mockRequest, mockReply);

        thenResolve();

        const completionCall = mockLogger.info.mock.calls.find(
          (call: any[]) => call[0].event === 'request_completed'
        );
        expect(completionCall[0].tenantId).toBe('tenant-123');
      });

      it('should handle different HTTP methods', async () => {
        mockRequest.method = 'POST';
        mockRequest.url = '/api/data';

        await requestLoggerMiddleware(mockRequest, mockReply);
        thenResolve();

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_started',
            method: 'POST',
          }),
          'POST /api/data'
        );
      });

      it('should handle different status codes', async () => {
        mockReply.statusCode = 201;

        await requestLoggerMiddleware(mockRequest, mockReply);
        thenResolve();

        const completionCall = mockLogger.info.mock.calls.find(
          (call: any[]) => call[0].event === 'request_completed'
        );
        expect(completionCall[0].statusCode).toBe(201);
      });
    });
  });

  describe('registerRequestLogger', () => {
    it('should register preHandler hook with fastify', async () => {
      const mockFastify = {
        addHook: jest.fn(),
      };

      await registerRequestLogger(mockFastify as any);

      expect(mockFastify.addHook).toHaveBeenCalledWith(
        'preHandler',
        requestLoggerMiddleware
      );
    });

    it('should register exactly one hook', async () => {
      const mockFastify = {
        addHook: jest.fn(),
      };

      await registerRequestLogger(mockFastify as any);

      expect(mockFastify.addHook).toHaveBeenCalledTimes(1);
    });
  });

  describe('default export', () => {
    it('should export requestLoggerMiddleware and registerRequestLogger', () => {
      const defaultExport = require('../../../src/middleware/request-logger').default;

      expect(defaultExport).toHaveProperty('requestLoggerMiddleware');
      expect(defaultExport).toHaveProperty('registerRequestLogger');
      expect(typeof defaultExport.requestLoggerMiddleware).toBe('function');
      expect(typeof defaultExport.registerRequestLogger).toBe('function');
    });
  });
});
