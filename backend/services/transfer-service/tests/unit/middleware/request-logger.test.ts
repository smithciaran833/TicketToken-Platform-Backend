/**
 * Unit Tests for Request Logger Middleware
 *
 * Tests the request logging middleware including:
 * - Header filtering and redaction
 * - Body redaction (recursive)
 * - Query parameter redaction
 * - Request/response logging hooks
 * - Slow request detection
 * - Error logging
 * - Skip/minimal logging routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fastify from 'fastify';
import {
  requestLogger,
  filterHeaders,
  redactBody,
  redactQuery,
  createRequestLogger,
  REQUEST_LOGGER_CONFIG
} from '../../../src/middleware/request-logger';
import logger from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Request Logger Middleware', () => {
  let mockLogger: jest.Mocked<typeof logger>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = logger as jest.Mocked<typeof logger>;
  });

  // ===========================================================================
  // CONFIGURATION TESTS
  // ===========================================================================

  describe('REQUEST_LOGGER_CONFIG', () => {
    it('should have skip routes defined', () => {
      expect(REQUEST_LOGGER_CONFIG.skipRoutes).toContain('/health');
      expect(REQUEST_LOGGER_CONFIG.skipRoutes).toContain('/health/live');
      expect(REQUEST_LOGGER_CONFIG.skipRoutes).toContain('/metrics');
    });

    it('should have minimal log routes defined', () => {
      expect(REQUEST_LOGGER_CONFIG.minimalLogRoutes).toContain('/api/v1/transfers/status');
    });

    it('should have sensitive headers to exclude', () => {
      expect(REQUEST_LOGGER_CONFIG.excludeHeaders).toContain('authorization');
      expect(REQUEST_LOGGER_CONFIG.excludeHeaders).toContain('cookie');
      expect(REQUEST_LOGGER_CONFIG.excludeHeaders).toContain('x-api-key');
    });

    it('should have body fields to redact', () => {
      expect(REQUEST_LOGGER_CONFIG.redactBodyFields).toContain('password');
      expect(REQUEST_LOGGER_CONFIG.redactBodyFields).toContain('token');
      expect(REQUEST_LOGGER_CONFIG.redactBodyFields).toContain('privateKey');
    });

    it('should have query params to redact', () => {
      expect(REQUEST_LOGGER_CONFIG.redactQueryParams).toContain('token');
      expect(REQUEST_LOGGER_CONFIG.redactQueryParams).toContain('secret');
    });

    it('should have slow request threshold defined', () => {
      expect(REQUEST_LOGGER_CONFIG.slowRequestThreshold).toBe(3000);
    });
  });

  // ===========================================================================
  // FILTER HEADERS TESTS
  // ===========================================================================

  describe('filterHeaders()', () => {
    it('should redact authorization header', () => {
      const headers = {
        authorization: 'Bearer token123',
        'content-type': 'application/json'
      };

      const filtered = filterHeaders(headers);

      expect(filtered.authorization).toBe('[REDACTED]');
      expect(filtered['content-type']).toBe('application/json');
    });

    it('should redact cookie header', () => {
      const headers = {
        cookie: 'session=abc123',
        accept: 'application/json'
      };

      const filtered = filterHeaders(headers);

      expect(filtered.cookie).toBe('[REDACTED]');
      expect(filtered.accept).toBe('application/json');
    });

    it('should redact x-api-key header', () => {
      const headers = {
        'x-api-key': 'secret-key-123',
        'user-agent': 'Mozilla/5.0'
      };

      const filtered = filterHeaders(headers);

      expect(filtered['x-api-key']).toBe('[REDACTED]');
      expect(filtered['user-agent']).toBe('Mozilla/5.0');
    });

    it('should handle case-insensitive header names', () => {
      const headers = {
        Authorization: 'Bearer token',
        COOKIE: 'session=xyz',
        'X-API-KEY': 'key123'
      };

      const filtered = filterHeaders(headers);

      expect(filtered.Authorization).toBe('[REDACTED]');
      expect(filtered.COOKIE).toBe('[REDACTED]');
      expect(filtered['X-API-KEY']).toBe('[REDACTED]');
    });

    it('should pass through non-sensitive headers', () => {
      const headers = {
        'content-type': 'application/json',
        'user-agent': 'test-agent',
        'x-request-id': 'req-123'
      };

      const filtered = filterHeaders(headers);

      expect(filtered['content-type']).toBe('application/json');
      expect(filtered['user-agent']).toBe('test-agent');
      expect(filtered['x-request-id']).toBe('req-123');
    });

    it('should handle empty headers object', () => {
      const filtered = filterHeaders({});
      expect(filtered).toEqual({});
    });

    it('should redact x-access-token and x-internal-secret', () => {
      const headers = {
        'x-access-token': 'token123',
        'x-internal-secret': 'secret123'
      };

      const filtered = filterHeaders(headers);

      expect(filtered['x-access-token']).toBe('[REDACTED]');
      expect(filtered['x-internal-secret']).toBe('[REDACTED]');
    });
  });

  // ===========================================================================
  // REDACT BODY TESTS
  // ===========================================================================

  describe('redactBody()', () => {
    it('should redact password field', () => {
      const body = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com'
      };

      const redacted = redactBody(body) as Record<string, unknown>;

      expect(redacted.username).toBe('john');
      expect(redacted.password).toBe('[REDACTED]');
      expect(redacted.email).toBe('john@example.com');
    });

    it('should redact token field', () => {
      const body = {
        userId: '123',
        token: 'jwt-token-here',
        data: 'some data'
      };

      const redacted = redactBody(body) as Record<string, unknown>;

      expect(redacted.userId).toBe('123');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.data).toBe('some data');
    });

    it('should redact accessToken and refreshToken', () => {
      const body = {
        accessToken: 'access-123',
        refreshToken: 'refresh-456',
        userId: '789'
      };

      const redacted = redactBody(body) as Record<string, unknown>;

      expect(redacted.accessToken).toBe('[REDACTED]');
      expect(redacted.refreshToken).toBe('[REDACTED]');
      expect(redacted.userId).toBe('789');
    });

    it('should redact acceptanceCode, privateKey, and apiKey', () => {
      const body = {
        acceptanceCode: 'code123',
        privateKey: 'pk-secret',
        apiKey: 'api-secret',
        publicData: 'visible'
      };

      const redacted = redactBody(body) as Record<string, unknown>;

      expect(redacted.acceptanceCode).toBe('[REDACTED]');
      expect(redacted.privateKey).toBe('[REDACTED]');
      expect(redacted.apiKey).toBe('[REDACTED]');
      expect(redacted.publicData).toBe('visible');
    });

    it('should recursively redact nested objects', () => {
      const body = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret',
            token: 'token123'
          }
        },
        data: 'visible'
      };

      const redacted = redactBody(body) as Record<string, unknown>;
      const user = redacted.user as Record<string, unknown>;
      const credentials = user.credentials as Record<string, unknown>;

      expect(user.name).toBe('John');
      expect(credentials.password).toBe('[REDACTED]');
      expect(credentials.token).toBe('[REDACTED]');
      expect(redacted.data).toBe('visible');
    });

    it('should handle arrays and redact elements', () => {
      const body = [
        { id: 1, password: 'secret1' },
        { id: 2, password: 'secret2' },
        { id: 3, name: 'test' }
      ];

      const redacted = redactBody(body) as Array<Record<string, unknown>>;

      expect(redacted[0].id).toBe(1);
      expect(redacted[0].password).toBe('[REDACTED]');
      expect(redacted[1].id).toBe(2);
      expect(redacted[1].password).toBe('[REDACTED]');
      expect(redacted[2].id).toBe(3);
      expect(redacted[2].name).toBe('test');
    });

    it('should handle null values', () => {
      const result = redactBody(null);
      expect(result).toBeNull();
    });

    it('should handle undefined values', () => {
      const result = redactBody(undefined);
      expect(result).toBeUndefined();
    });

    it('should handle primitive values', () => {
      expect(redactBody('string')).toBe('string');
      expect(redactBody(123)).toBe(123);
      expect(redactBody(true)).toBe(true);
    });

    it('should handle deeply nested structures', () => {
      const body = {
        level1: {
          level2: {
            level3: {
              password: 'deep-secret',
              data: 'visible'
            }
          }
        }
      };

      const redacted = redactBody(body) as Record<string, unknown>;
      const level1 = redacted.level1 as Record<string, unknown>;
      const level2 = level1.level2 as Record<string, unknown>;
      const level3 = level2.level3 as Record<string, unknown>;

      expect(level3.password).toBe('[REDACTED]');
      expect(level3.data).toBe('visible');
    });

    it('should handle mixed arrays and objects', () => {
      const body = {
        users: [
          { name: 'Alice', password: 'secret1' },
          { name: 'Bob', token: 'token123' }
        ],
        config: {
          apiKey: 'key123',
          public: true
        }
      };

      const redacted = redactBody(body) as Record<string, unknown>;
      const users = redacted.users as Array<Record<string, unknown>>;
      const config = redacted.config as Record<string, unknown>;

      expect(users[0].name).toBe('Alice');
      expect(users[0].password).toBe('[REDACTED]');
      expect(users[1].name).toBe('Bob');
      expect(users[1].token).toBe('[REDACTED]');
      expect(config.apiKey).toBe('[REDACTED]');
      expect(config.public).toBe(true);
    });

    it('should handle null in nested objects', () => {
      const body = {
        user: null,
        data: 'visible'
      };

      const redacted = redactBody(body) as Record<string, unknown>;

      expect(redacted.user).toBeNull();
      expect(redacted.data).toBe('visible');
    });
  });

  // ===========================================================================
  // REDACT QUERY TESTS
  // ===========================================================================

  describe('redactQuery()', () => {
    it('should redact token query param', () => {
      const query = {
        page: '1',
        token: 'secret-token',
        limit: '10'
      };

      const redacted = redactQuery(query);

      expect(redacted.page).toBe('1');
      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.limit).toBe('10');
    });

    it('should redact secret query param', () => {
      const query = {
        id: '123',
        secret: 'my-secret',
        type: 'transfer'
      };

      const redacted = redactQuery(query);

      expect(redacted.id).toBe('123');
      expect(redacted.secret).toBe('[REDACTED]');
      expect(redacted.type).toBe('transfer');
    });

    it('should redact code query param', () => {
      const query = {
        userId: '456',
        code: 'auth-code-123',
        action: 'verify'
      };

      const redacted = redactQuery(query);

      expect(redacted.userId).toBe('456');
      expect(redacted.code).toBe('[REDACTED]');
      expect(redacted.action).toBe('verify');
    });

    it('should pass through non-sensitive query params', () => {
      const query = {
        page: '1',
        limit: '50',
        sort: 'desc',
        filter: 'active'
      };

      const redacted = redactQuery(query);

      expect(redacted).toEqual(query);
    });

    it('should handle empty query object', () => {
      const redacted = redactQuery({});
      expect(redacted).toEqual({});
    });

    it('should redact multiple sensitive params', () => {
      const query = {
        token: 'token123',
        secret: 'secret456',
        code: 'code789',
        data: 'visible'
      };

      const redacted = redactQuery(query);

      expect(redacted.token).toBe('[REDACTED]');
      expect(redacted.secret).toBe('[REDACTED]');
      expect(redacted.code).toBe('[REDACTED]');
      expect(redacted.data).toBe('visible');
    });
  });

  // ===========================================================================
  // REQUEST LOGGER PLUGIN TESTS
  // ===========================================================================

  describe('requestLogger Plugin', () => {
    let app: FastifyInstance;

    beforeEach(async () => {
      app = fastify();
      await app.register(requestLogger);
    });

    afterEach(async () => {
      await app.close();
    });

    it('should register plugin successfully', async () => {
      expect(app.hasPlugin('request-logger')).toBe(true);
    });

    it('should log request and response for normal routes', async () => {
      app.get('/test', async () => ({ success: true }));

      await app.inject({
        method: 'GET',
        url: '/test'
      });

      // Should log request
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/test'
        }),
        'Request received'
      );

      // Should log response
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/test',
          statusCode: 200,
          durationMs: expect.any(Number)
        }),
        'Request completed'
      );
    });

    it('should skip logging for health check routes', async () => {
      app.get('/health', async () => ({ status: 'ok' }));

      await app.inject({
        method: 'GET',
        url: '/health'
      });

      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    it('should skip logging for /health/live', async () => {
      app.get('/health/live', async () => ({ status: 'ok' }));

      await app.inject({
        method: 'GET',
        url: '/health/live'
      });

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should skip logging for /metrics', async () => {
      app.get('/metrics', async () => 'metrics');

      await app.inject({
        method: 'GET',
        url: '/metrics'
      });

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should use minimal logging for status routes', async () => {
      app.get('/api/v1/transfers/status', async () => ({ status: 'active' }));

      await app.inject({
        method: 'GET',
        url: '/api/v1/transfers/status'
      });

      // Should use debug level for minimal logging
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/v1/transfers/status'
        }),
        'Request received'
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 200
        }),
        'Request completed'
      );

      // Should not use info level
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should log slow requests with warning', async () => {
      app.get('/slow', async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { success: true };
      });

      // Mock hrtime to simulate slow request
      const originalHrtime = process.hrtime.bigint;
      let callCount = 0;
      process.hrtime.bigint = jest.fn(() => {
        callCount++;
        if (callCount === 1) return BigInt(0);
        // Simulate 4000ms (4 seconds) - above threshold
        return BigInt(4_000_000_000);
      });

      await app.inject({
        method: 'GET',
        url: '/slow'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: 4000,
          slowRequest: true
        }),
        expect.stringContaining('Slow request completed')
      );

      process.hrtime.bigint = originalHrtime;
    });

    it('should use warn level for 4xx status codes', async () => {
      app.get('/notfound', async (_req, reply) => {
        return reply.code(404).send({ error: 'Not Found' });
      });

      await app.inject({
        method: 'GET',
        url: '/notfound'
      });

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404
        }),
        'Request completed'
      );
    });

    it('should use error level for 5xx status codes', async () => {
      app.get('/error', async (_req, reply) => {
        return reply.code(500).send({ error: 'Internal Error' });
      });

      await app.inject({
        method: 'GET',
        url: '/error'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500
        }),
        'Request completed'
      );
    });

    it('should redact request body sensitive fields', async () => {
      app.post('/login', async () => ({ success: true }));

      await app.inject({
        method: 'POST',
        url: '/login',
        payload: {
          username: 'john',
          password: 'secret123'
        }
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            username: 'john',
            password: '[REDACTED]'
          }
        }),
        'Request received'
      );
    });

    it('should redact sensitive headers', async () => {
      app.get('/protected', async () => ({ data: 'secret' }));

      await app.inject({
        method: 'GET',
        url: '/protected',
        headers: {
          authorization: 'Bearer token123',
          'x-api-key': 'secret-key'
        }
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            authorization: '[REDACTED]',
            'x-api-key': '[REDACTED]'
          })
        }),
        'Request received'
      );
    });

    it('should redact sensitive query params', async () => {
      app.get('/verify', async () => ({ verified: true }));

      await app.inject({
        method: 'GET',
        url: '/verify?userId=123&token=secret-token&action=verify'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          query: {
            userId: '123',
            token: '[REDACTED]',
            action: 'verify'
          }
        }),
        'Request received'
      );
    });

    it('should log errors from onError hook', async () => {
      app.get('/throw', async () => {
        throw new Error('Test error');
      });

      await app.inject({
        method: 'GET',
        url: '/throw'
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/throw',
          error: expect.objectContaining({
            name: 'Error',
            message: 'Test error'
          })
        }),
        'Request error'
      );
    });

    it('should include requestId in logs', async () => {
      app.get('/test', async () => ({ success: true }));

      const response = await app.inject({
        method: 'GET',
        url: '/test'
      });

      const requestId = response.headers['x-request-id'] as string;

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: expect.any(String)
        }),
        expect.any(String)
      );
    });

    it('should track request duration accurately', async () => {
      app.get('/timed', async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { success: true };
      });

      await app.inject({
        method: 'GET',
        url: '/timed'
      });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          durationMs: expect.any(Number)
        }),
        'Request completed'
      );

      // Get the actual duration logged
      const logCall = mockLogger.info.mock.calls.find(
        call => call[1] === 'Request completed'
      );
      const durationMs = logCall?.[0]?.durationMs as number;

      expect(durationMs).toBeGreaterThan(0);
      expect(durationMs).toBeLessThan(5000); // Sanity check
    });
  });

  // ===========================================================================
  // CREATE REQUEST LOGGER TESTS
  // ===========================================================================

  describe('createRequestLogger()', () => {
    it('should create middleware function', () => {
      const middleware = createRequestLogger();
      expect(typeof middleware).toBe('function');
    });

    it('should log request with default options', async () => {
      const middleware = createRequestLogger();

      const mockRequest = {
        id: 'req-123',
        method: 'POST',
        url: '/api/test',
        body: { data: 'test' },
        headers: {}
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          method: 'POST',
          url: '/api/test',
          body: { data: 'test' }
        }),
        'Route accessed'
      );
    });

    it('should not log body when logBody is false', async () => {
      const middleware = createRequestLogger({ logBody: false });

      const mockRequest = {
        id: 'req-123',
        method: 'POST',
        url: '/api/test',
        body: { data: 'test' },
        headers: {}
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123',
          method: 'POST',
          url: '/api/test'
        }),
        'Route accessed'
      );

      const logCall = mockLogger.info.mock.calls[0];
      expect(logCall[0]).not.toHaveProperty('body');
    });

    it('should log headers when logHeaders is true', async () => {
      const middleware = createRequestLogger({ logHeaders: true });

      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/test',
        headers: {
          'user-agent': 'test-agent',
          authorization: 'Bearer token'
        }
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: {
            'user-agent': 'test-agent',
            authorization: '[REDACTED]'
          }
        }),
        'Route accessed'
      );
    });

    it('should skip paths in skipPaths option', async () => {
      const middleware = createRequestLogger({
        skipPaths: ['/health', '/metrics']
      });

      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/health',
        headers: {}
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should skip paths that start with skipPaths prefix', async () => {
      const middleware = createRequestLogger({
        skipPaths: ['/admin']
      });

      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/admin/users',
        headers: {}
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should redact sensitive data in body', async () => {
      const middleware = createRequestLogger({ logBody: true });

      const mockRequest = {
        id: 'req-123',
        method: 'POST',
        url: '/api/login',
        body: {
          username: 'john',
          password: 'secret123',
          token: 'jwt-token'
        },
        headers: {}
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            username: 'john',
            password: '[REDACTED]',
            token: '[REDACTED]'
          }
        }),
        'Route accessed'
      );
    });

    it('should handle requests without body', async () => {
      const middleware = createRequestLogger();

      const mockRequest = {
        id: 'req-123',
        method: 'GET',
        url: '/api/test',
        body: undefined,
        headers: {}
      } as unknown as FastifyRequest;

      const mockReply = {} as FastifyReply;

      await middleware(mockRequest, mockReply);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'req-123'
        }),
        'Route accessed'
      );
    });
  });
});
