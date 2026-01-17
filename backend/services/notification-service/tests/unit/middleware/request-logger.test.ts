/**
 * Unit tests for request-logger.ts
 * Tests structured request/response logging with PII redaction
 */

import {
  requestLoggerOnRequest,
  requestLoggerOnResponse,
  requestLoggerOnError,
  addCorrelationIdHeader,
  redactSensitiveData,
  redactHeaders
} from '../../../src/middleware/request-logger';
import { logger } from '../../../src/utils/logger';

jest.mock('../../../src/utils/logger');

describe('Request Logger Middleware', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      method: 'POST',
      url: '/api/v1/notifications',
      routerPath: '/api/v1/notifications',
      query: {},
      headers: {
        'user-agent': 'Mozilla/5.0',
        'content-length': '256'
      },
      ip: '192.168.1.1'
    };

    mockReply = {
      statusCode: 200,
      getHeader: jest.fn(),
      header: jest.fn().mockReturnThis()
    };
  });

  describe('requestLoggerOnRequest', () => {
    describe('Request Logging', () => {
      it('should log request start with basic info', async () => {
        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_start',
            method: 'POST',
            url: '/api/v1/notifications'
          })
        );
      });

      it('should attach correlation ID to request', async () => {
        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBeDefined();
        expect(typeof mockRequest.correlationId).toBe('string');
      });

      it('should use existing request ID when available', async () => {
        mockRequest.id = 'existing-id';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBe('existing-id');
      });

      it('should use X-Request-Id header when request ID not available', async () => {
        mockRequest.id = undefined;
        mockRequest.headers['x-request-id'] = 'header-id';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(mockRequest.correlationId).toBe('header-id');
      });

      it('should generate new ID when neither request ID nor header present', async () => {
        mockRequest.id = undefined;
        mockRequest.headers['x-request-id'] = undefined;

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(mockRequest.correlationId).toMatch(/^req_/);
      });

      it('should store start time for duration calculation', async () => {
        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(mockRequest.startTime).toBeDefined();
        expect(typeof mockRequest.startTime).toBe('bigint');
      });

      it('should log query parameters', async () => {
        mockRequest.query = { page: '1', limit: '10' };

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            query: { page: '1', limit: '10' }
          })
        );
      });

      it('should log user agent', async () => {
        mockRequest.headers['user-agent'] = 'Test Agent';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            userAgent: 'Test Agent'
          })
        );
      });

      it('should log content length', async () => {
        mockRequest.headers['content-length'] = '1024';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            contentLength: '1024'
          })
        );
      });

      it('should log tenant ID when available', async () => {
        mockRequest.tenantId = 'tenant-123';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 'tenant-123'
          })
        );
      });

      it('should log user ID when available', async () => {
        mockRequest.userId = 'user-456';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-456'
          })
        );
      });
    });

    describe('Client IP Extraction', () => {
      it('should extract IP from direct connection', async () => {
        mockRequest.ip = '10.0.0.5';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            clientIp: '10.0.0.5'
          })
        );
      });

      it('should extract first IP from X-Forwarded-For', async () => {
        mockRequest.headers['x-forwarded-for'] = '203.0.113.1, 198.51.100.1';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            clientIp: '203.0.113.1'
          })
        );
      });

      it('should handle array X-Forwarded-For header', async () => {
        mockRequest.headers['x-forwarded-for'] = ['203.0.113.1', '198.51.100.1'];

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            clientIp: '203.0.113.1'
          })
        );
      });

      it('should trim whitespace from IP', async () => {
        mockRequest.headers['x-forwarded-for'] = '  203.0.113.1  , 198.51.100.1';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            clientIp: '203.0.113.1'
          })
        );
      });

      it('should fallback to request.ip when header not present', async () => {
        mockRequest.headers['x-forwarded-for'] = undefined;
        mockRequest.ip = '192.168.1.1';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            clientIp: '192.168.1.1'
          })
        );
      });
    });

    describe('Path Extraction', () => {
      it('should use routerPath when available', async () => {
        mockRequest.routerPath = '/api/v1/notifications/:id';
        mockRequest.url = '/api/v1/notifications/123?page=1';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v1/notifications/:id'
          })
        );
      });

      it('should extract path from URL when routerPath not available', async () => {
        mockRequest.routerPath = undefined;
        mockRequest.url = '/api/v1/notifications?page=1&limit=10';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v1/notifications'
          })
        );
      });

      it('should strip query parameters from URL', async () => {
        mockRequest.routerPath = undefined;
        mockRequest.url = '/api/v1/notifications?test=value';

        await requestLoggerOnRequest(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            path: '/api/v1/notifications'
          })
        );
      });
    });

    describe('Header Redaction', () => {
      it('should redact authorization header', async () => {
        mockRequest.headers.authorization = 'Bearer secret-token';

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.headers.authorization).toBe('[REDACTED]');
      });

      it('should redact cookie header', async () => {
        mockRequest.headers.cookie = 'session=abc123';

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.headers.cookie).toBe('[REDACTED]');
      });

      it('should redact x-api-key header', async () => {
        mockRequest.headers['x-api-key'] = 'secret-key';

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.headers['x-api-key']).toBe('[REDACTED]');
      });

      it('should not redact non-sensitive headers', async () => {
        mockRequest.headers['content-type'] = 'application/json';
        mockRequest.headers['accept'] = 'application/json';

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.headers['content-type']).toBe('application/json');
        expect(logCall.headers['accept']).toBe('application/json');
      });
    });

    describe('Query Parameter Redaction', () => {
      it('should redact password in query params', async () => {
        mockRequest.query = { username: 'user', password: 'secret' };

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.query.password).toBe('[REDACTED]');
        expect(logCall.query.username).toBe('user');
      });

      it('should redact token in query params', async () => {
        mockRequest.query = { token: 'secret-token', data: 'value' };

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.query.token).toBe('[REDACTED]');
        expect(logCall.query.data).toBe('value');
      });

      it('should redact API key in query params', async () => {
        mockRequest.query = { apiKey: 'secret', api_key: 'secret2' };

        await requestLoggerOnRequest(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.query.apiKey).toBe('[REDACTED]');
        expect(logCall.query.api_key).toBe('[REDACTED]');
      });
    });
  });

  describe('requestLoggerOnResponse', () => {
    beforeEach(() => {
      mockRequest.startTime = process.hrtime.bigint();
      mockRequest.correlationId = 'correlation-123';
    });

    describe('Response Logging', () => {
      it('should log successful response', async () => {
        mockReply.statusCode = 200;

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_complete',
            statusCode: 200
          })
        );
      });

      it('should calculate request duration', async () => {
        await requestLoggerOnResponse(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.duration).toBeDefined();
        expect(logCall.durationMs).toBeDefined();
        expect(typeof logCall.duration).toBe('number');
      });

      it('should include correlation ID', async () => {
        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: 'correlation-123'
          })
        );
      });

      it('should log content length from response', async () => {
        mockReply.getHeader = jest.fn().mockReturnValue('512');

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalledWith(
          expect.objectContaining({
            contentLength: '512'
          })
        );
      });

      it('should handle missing start time gracefully', async () => {
        mockRequest.startTime = undefined;

        await requestLoggerOnResponse(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.duration).toBe(0);
      });
    });

    describe('Log Level Based on Status Code', () => {
      it('should use info level for 2xx responses', async () => {
        mockReply.statusCode = 200;

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('should use info level for 3xx responses', async () => {
        mockReply.statusCode = 301;

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.info).toHaveBeenCalled();
      });

      it('should use warn level for 4xx responses', async () => {
        mockReply.statusCode = 400;

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalled();
        expect(logger.error).not.toHaveBeenCalled();
      });

      it('should use warn level for 404 responses', async () => {
        mockReply.statusCode = 404;

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalled();
      });

      it('should use error level for 5xx responses', async () => {
        mockReply.statusCode = 500;

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.error).toHaveBeenCalled();
        expect(logger.warn).not.toHaveBeenCalled();
      });
    });

    describe('Performance Classification', () => {
      it('should classify fast requests (<100ms)', async () => {
        mockRequest.startTime = process.hrtime.bigint() - BigInt(50_000_000); // 50ms ago

        await requestLoggerOnResponse(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.performance).toBe('fast');
      });

      it('should classify normal requests (100-500ms)', async () => {
        mockRequest.startTime = process.hrtime.bigint() - BigInt(300_000_000); // 300ms ago

        await requestLoggerOnResponse(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.performance).toBe('normal');
      });

      it('should classify slow requests (500-1000ms)', async () => {
        mockRequest.startTime = process.hrtime.bigint() - BigInt(750_000_000); // 750ms ago

        await requestLoggerOnResponse(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.performance).toBe('slow');
      });

      it('should classify very slow requests (>1000ms)', async () => {
        mockRequest.startTime = process.hrtime.bigint() - BigInt(1_500_000_000); // 1500ms ago

        await requestLoggerOnResponse(mockRequest, mockReply);

        const logCall = (logger.info as jest.Mock).mock.calls[0][0];
        expect(logCall.performance).toBe('very_slow');
      });
    });

    describe('Slow Request Warning', () => {
      it('should log separate warning for slow requests', async () => {
        mockRequest.startTime = process.hrtime.bigint() - BigInt(1_500_000_000); // 1500ms

        await requestLoggerOnResponse(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'slow_request',
            threshold: 1000
          })
        );
      });

      it('should not log slow warning for fast requests', async () => {
        mockRequest.startTime = process.hrtime.bigint() - BigInt(500_000_000); // 500ms

        await requestLoggerOnResponse(mockRequest, mockReply);

        const warnCalls = (logger.warn as jest.Mock).mock.calls;
        const hasSlowWarning = warnCalls.some(call => call[0]?.event === 'slow_request');
        expect(hasSlowWarning).toBe(false);
      });
    });
  });

  describe('requestLoggerOnError', () => {
    beforeEach(() => {
      mockRequest.correlationId = 'correlation-123';
    });

    describe('Error Logging', () => {
      it('should log error with full details', async () => {
        const error = new Error('Test error');

        await requestLoggerOnError(mockRequest, mockReply, error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'request_error',
            error: {
              name: 'Error',
              message: 'Test error',
              stack: undefined
            }
          })
        );
      });

      it('should include correlation ID', async () => {
        const error = new Error('Test error');

        await requestLoggerOnError(mockRequest, mockReply, error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            requestId: 'correlation-123'
          })
        );
      });

      it('should log status code', async () => {
        mockReply.statusCode = 500;
        const error = new Error('Internal error');

        await requestLoggerOnError(mockRequest, mockReply, error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 500
          })
        );
      });

      it('should include stack trace in development', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const error = new Error('Test error');
        error.stack = 'Stack trace here';

        await requestLoggerOnError(mockRequest, mockReply, error);

        const logCall = (logger.error as jest.Mock).mock.calls[0][0];
        expect(logCall.error.stack).toBeDefined();

        process.env.NODE_ENV = originalEnv;
      });

      it('should not include stack trace in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const error = new Error('Test error');
        error.stack = 'Stack trace here';

        await requestLoggerOnError(mockRequest, mockReply, error);

        const logCall = (logger.error as jest.Mock).mock.calls[0][0];
        expect(logCall.error.stack).toBeUndefined();

        process.env.NODE_ENV = originalEnv;
      });

      it('should log tenant ID when available', async () => {
        mockRequest.tenantId = 'tenant-123';
        const error = new Error('Test error');

        await requestLoggerOnError(mockRequest, mockReply, error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            tenantId: 'tenant-123'
          })
        );
      });

      it('should log user ID when available', async () => {
        mockRequest.userId = 'user-456';
        const error = new Error('Test error');

        await requestLoggerOnError(mockRequest, mockReply, error);

        expect(logger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-456'
          })
        );
      });
    });
  });

  describe('addCorrelationIdHeader', () => {
    it('should add X-Correlation-Id header', async () => {
      mockRequest.correlationId = 'correlation-123';

      await addCorrelationIdHeader(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('x-correlation-id', 'correlation-123');
    });

    it('should add X-Request-Id header', async () => {
      mockRequest.correlationId = 'correlation-123';

      await addCorrelationIdHeader(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('x-request-id', 'correlation-123');
    });

    it('should not add headers if correlation ID not present', async () => {
      mockRequest.correlationId = undefined;

      await addCorrelationIdHeader(mockRequest, mockReply);

      expect(mockReply.header).not.toHaveBeenCalled();
    });
  });

  describe('redactSensitiveData', () => {
    describe('Field Redaction', () => {
      it('should redact password field', () => {
        const data = { username: 'user', password: 'secret' };
        const redacted = redactSensitiveData(data);

        expect(redacted.password).toBe('[REDACTED]');
        expect(redacted.username).toBe('user');
      });

      it('should redact token fields', () => {
        const data = { token: 'secret', accessToken: 'secret2', access_token: 'secret3' };
        const redacted = redactSensitiveData(data);

        expect(redacted.token).toBe('[REDACTED]');
        expect(redacted.accessToken).toBe('[REDACTED]');
        expect(redacted.access_token).toBe('[REDACTED]');
      });

      it('should redact API key fields', () => {
        const data = { apiKey: 'secret', api_key: 'secret2' };
        const redacted = redactSensitiveData(data);

        expect(redacted.apiKey).toBe('[REDACTED]');
        expect(redacted.api_key).toBe('[REDACTED]');
      });

      it('should redact credit card information', () => {
        const data = { creditCard: '4111111111111111', cardNumber: '5555555555554444', cvv: '123' };
        const redacted = redactSensitiveData(data);

        expect(redacted.creditCard).toBe('[REDACTED]');
        expect(redacted.cardNumber).toBe('[REDACTED]');
        expect(redacted.cvv).toBe('[REDACTED]');
      });

      it('should redact PII fields', () => {
        const data = { email: 'user@example.com', phone: '555-1234', ssn: '123-45-6789' };
        const redacted = redactSensitiveData(data);

        expect(redacted.email).toBe('[REDACTED]');
        expect(redacted.phone).toBe('[REDACTED]');
        expect(redacted.ssn).toBe('[REDACTED]');
      });

      it('should handle case-insensitive field names', () => {
        const data = { PASSWORD: 'secret', Token: 'secret2' };
        const redacted = redactSensitiveData(data);

        expect(redacted.PASSWORD).toBe('[REDACTED]');
        expect(redacted.Token).toBe('[REDACTED]');
      });

      it('should not redact non-sensitive fields', () => {
        const data = { username: 'user', email_verified: true, public_data: 'value' };
        const redacted = redactSensitiveData(data);

        expect(redacted.username).toBe('user');
        expect(redacted.email_verified).toBe(true);
        expect(redacted.public_data).toBe('value');
      });
    });

    describe('Nested Objects', () => {
      it('should redact sensitive fields in nested objects', () => {
        const data = {
          user: {
            name: 'John',
            password: 'secret'
          }
        };
        const redacted = redactSensitiveData(data);

        expect(redacted.user.name).toBe('John');
        expect(redacted.user.password).toBe('[REDACTED]');
      });

      it('should redact deeply nested sensitive fields', () => {
        const data = {
          level1: {
            level2: {
              level3: {
                password: 'secret'
              }
            }
          }
        };
        const redacted = redactSensitiveData(data);

        expect(redacted.level1.level2.level3.password).toBe('[REDACTED]');
      });

      it('should stop at max depth to prevent infinite recursion', () => {
        const data: any = { level: 0 };
        let current = data;
        for (let i = 1; i <= 15; i++) {
          current.next = { level: i };
          current = current.next;
        }

        const redacted = redactSensitiveData(data);
        expect(redacted).toBeDefined();
      });
    });

    describe('Arrays', () => {
      it('should redact sensitive fields in arrays', () => {
        const data = [
          { username: 'user1', password: 'secret1' },
          { username: 'user2', password: 'secret2' }
        ];
        const redacted = redactSensitiveData(data);

        expect(redacted[0].password).toBe('[REDACTED]');
        expect(redacted[1].password).toBe('[REDACTED]');
        expect(redacted[0].username).toBe('user1');
        expect(redacted[1].username).toBe('user2');
      });

      it('should handle arrays with nested objects', () => {
        const data = {
          users: [
            { name: 'User1', credentials: { password: 'secret' } }
          ]
        };
        const redacted = redactSensitiveData(data);

        expect(redacted.users[0].credentials.password).toBe('[REDACTED]');
        expect(redacted.users[0].name).toBe('User1');
      });
    });

    describe('Edge Cases', () => {
      it('should handle null values', () => {
        const redacted = redactSensitiveData(null);
        expect(redacted).toBeNull();
      });

      it('should handle undefined values', () => {
        const redacted = redactSensitiveData(undefined);
        expect(redacted).toBeUndefined();
      });

      it('should handle primitive values', () => {
        expect(redactSensitiveData('string')).toBe('string');
        expect(redactSensitiveData(123)).toBe(123);
        expect(redactSensitiveData(true)).toBe(true);
      });

      it('should handle empty objects', () => {
        const redacted = redactSensitiveData({});
        expect(redacted).toEqual({});
      });

      it('should handle empty arrays', () => {
        const redacted = redactSensitiveData([]);
        expect(redacted).toEqual([]);
      });
    });
  });

  describe('redactHeaders', () => {
    it('should redact authorization header', () => {
      const headers = { authorization: 'Bearer token', 'content-type': 'application/json' };
      const redacted = redactHeaders(headers);

      expect(redacted.authorization).toBe('[REDACTED]');
      expect(redacted['content-type']).toBe('application/json');
    });

    it('should redact cookie header', () => {
      const headers = { cookie: 'session=abc', 'user-agent': 'Mozilla' };
      const redacted = redactHeaders(headers);

      expect(redacted.cookie).toBe('[REDACTED]');
      expect(redacted['user-agent']).toBe('Mozilla');
    });

    it('should redact set-cookie header', () => {
      const headers = { 'set-cookie': 'session=abc; HttpOnly' };
      const redacted = redactHeaders(headers);

      expect(redacted['set-cookie']).toBe('[REDACTED]');
    });

    it('should redact x-api-key header', () => {
      const headers = { 'x-api-key': 'secret-key' };
      const redacted = redactHeaders(headers);

      expect(redacted['x-api-key']).toBe('[REDACTED]');
    });

    it('should redact x-auth-token header', () => {
      const headers = { 'x-auth-token': 'token123' };
      const redacted = redactHeaders(headers);

      expect(redacted['x-auth-token']).toBe('[REDACTED]');
    });

    it('should handle case-insensitive header names', () => {
      const headers = { Authorization: 'Bearer token', Cookie: 'session=abc' };
      const redacted = redactHeaders(headers);

      expect(redacted.Authorization).toBe('[REDACTED]');
      expect(redacted.Cookie).toBe('[REDACTED]');
    });

    it('should not redact non-sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': 'Mozilla/5.0'
      };
      const redacted = redactHeaders(headers);

      expect(redacted['content-type']).toBe('application/json');
      expect(redacted['accept']).toBe('application/json');
      expect(redacted['user-agent']).toBe('Mozilla/5.0');
    });

    it('should handle empty headers', () => {
      const redacted = redactHeaders({});
      expect(redacted).toEqual({});
    });
  });
});
