import { FastifyRequest, FastifyReply } from 'fastify';
import {
  idempotencyMiddleware,
  idempotencyCacheHook,
} from '../../../src/middleware/idempotency.middleware';
import { RedisService } from '../../../src/services/redis.service';
import { logger } from '../../../src/utils/logger';
import * as uuid from 'uuid';

jest.mock('../../../src/services/redis.service');
jest.mock('../../../src/utils/logger');
jest.mock('uuid');

describe('Idempotency Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let middleware: (
    request: FastifyRequest,
    reply: FastifyReply
  ) => Promise<void | any>;

  beforeEach(() => {
    jest.clearAllMocks();

    sendMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock,
      send: sendMock,
      statusCode: 200,
    } as Partial<FastifyReply>;

    mockRequest = {
      headers: {},
      url: '/api/orders',
      user: {
        id: 'user-123',
        role: 'customer',
      },
    } as Partial<FastifyRequest>;

    // Create middleware with 5 minute TTL
    middleware = idempotencyMiddleware({ ttlMs: 300000 });

    (uuid.validate as jest.Mock).mockImplementation((value) => {
      // Simple UUID validation
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        value
      );
    });
  });

  describe('Missing Idempotency Key', () => {
    it('should reject request without idempotency-key header', async () => {
      mockRequest.headers = {};

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Idempotency-Key header required',
        code: 'IDEMPOTENCY_KEY_MISSING',
        details:
          'All order operations require an Idempotency-Key header with a UUID value',
      });
    });

    it('should reject request with undefined idempotency-key', async () => {
      mockRequest.headers = {
        'idempotency-key': undefined,
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should reject request with empty string idempotency-key', async () => {
      mockRequest.headers = {
        'idempotency-key': '',
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('Invalid Idempotency Key Format', () => {
    it('should reject non-UUID idempotency key', async () => {
      mockRequest.headers = {
        'idempotency-key': 'not-a-uuid',
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Idempotency-Key must be a valid UUID',
        code: 'IDEMPOTENCY_KEY_INVALID',
        details:
          'Use a UUID v4 format like: 123e4567-e89b-12d3-a456-426614174000',
      });
    });

    it('should reject numeric idempotency key', async () => {
      mockRequest.headers = {
        'idempotency-key': '12345',
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should reject malformed UUID', async () => {
      mockRequest.headers = {
        'idempotency-key': '123e4567-e89b-12d3-a456',
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('should reject UUID with wrong format', async () => {
      mockRequest.headers = {
        'idempotency-key': '123e4567e89b12d3a456426614174000',
      };

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
    });
  });

  describe('Missing User Context', () => {
    it('should reject request without user', async () => {
      mockRequest.headers = {
        'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
      };
      mockRequest.user = undefined;

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    });

    it('should reject request with user missing ID', async () => {
      mockRequest.headers = {
        'idempotency-key': '550e8400-e29b-41d4-a716-446655440000',
      };
      mockRequest.user = { role: 'customer' } as any;

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(401);
    });
  });

  describe('First Request (No Cache)', () => {
    it('should allow new request and mark as in-progress', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(RedisService.get).toHaveBeenCalledWith(
        `idempotency:order:user-123:${idempotencyKey}`
      );
      expect(RedisService.set).toHaveBeenCalledWith(
        `idempotency:order:user-123:${idempotencyKey}`,
        expect.stringContaining('"statusCode":102'),
        300 // ttlMs / 1000
      );
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should set idempotency context on request', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.idempotencyKey).toBe(idempotencyKey);
      expect(mockRequest.idempotencyRedisKey).toBe(
        `idempotency:order:user-123:${idempotencyKey}`
      );
    });

    it('should handle different TTL values', async () => {
      const shortTtlMiddleware = idempotencyMiddleware({ ttlMs: 60000 }); // 1 minute
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await shortTtlMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        60 // 60000ms / 1000
      );
    });
  });

  describe('Concurrent Request Detection', () => {
    it('should reject concurrent request with same idempotency key', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      const inProgressResponse = {
        statusCode: 102,
        body: { processing: true },
        startedAt: new Date().toISOString(),
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify(inProgressResponse)
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Request already processing',
        code: 'DUPLICATE_IN_PROGRESS',
        details:
          'A request with this idempotency key is currently being processed',
      });
    });

    it('should log warning for concurrent duplicates', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify({ statusCode: 102 })
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.warn).toHaveBeenCalledWith(
        'Concurrent duplicate request detected',
        {
          idempotencyKey,
          userId: 'user-123',
          path: '/api/orders',
        }
      );
    });
  });

  describe('Cached Successful Response', () => {
    it('should return cached 2xx response', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      const cachedResponse = {
        statusCode: 201,
        body: { order: { id: 'order-123', status: 'confirmed' } },
        completedAt: new Date().toISOString(),
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify(cachedResponse)
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(sendMock).toHaveBeenCalledWith(cachedResponse.body);
    });

    it('should log cached response return', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      const cachedResponse = {
        statusCode: 200,
        body: { success: true },
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify(cachedResponse)
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalledWith(
        'Returning cached idempotent response',
        {
          idempotencyKey,
          userId: 'user-123',
          originalStatus: 200,
        }
      );
    });

    it('should return cached 200 response', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify({ statusCode: 200, body: { data: 'test' } })
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(200);
    });
  });

  describe('Cached Error Response', () => {
    it('should return cached 4xx response', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      const cachedError = {
        statusCode: 400,
        body: { error: 'Invalid ticket quantity' },
        completedAt: new Date().toISOString(),
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify(cachedError)
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith(cachedError.body);
    });

    it('should return cached 404 response', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(
        JSON.stringify({ statusCode: 404, body: { error: 'Not found' } })
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).toHaveBeenCalledWith(404);
    });
  });

  describe('User Scoping', () => {
    it('should scope idempotency key by user ID', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };
      mockRequest.user = { id: 'user-456', role: 'customer' };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(RedisService.get).toHaveBeenCalledWith(
        `idempotency:order:user-456:${idempotencyKey}`
      );
    });

    it('should allow same key for different users', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

      // First user
      mockRequest.headers = { 'idempotency-key': idempotencyKey };
      mockRequest.user = { id: 'user-1', role: 'customer' };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(RedisService.get).toHaveBeenCalledWith(
        `idempotency:order:user-1:${idempotencyKey}`
      );

      // Second user with same key
      mockRequest.user = { id: 'user-2', role: 'customer' };
      (RedisService.get as jest.Mock).mockClear();

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(RedisService.get).toHaveBeenCalledWith(
        `idempotency:order:user-2:${idempotencyKey}`
      );
    });
  });

  describe('Redis Failures', () => {
    it('should continue on Redis get failure (degraded mode)', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockRejectedValue(
        new Error('Redis connection failed')
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.error).toHaveBeenCalledWith(
        'Idempotency middleware error',
        expect.objectContaining({
          idempotencyKey,
        })
      );
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should continue on Redis set failure', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockRejectedValue(
        new Error('Redis write failed')
      );

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(logger.error).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle malformed cached response', async () => {
      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': idempotencyKey,
      };

      (RedisService.get as jest.Mock).mockResolvedValue('invalid json');

      // Should throw and be caught
      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow();
    });

    it('should handle valid UUID v4', async () => {
      const uuidV4 = '550e8400-e29b-41d4-a716-446655440000';
      mockRequest.headers = {
        'idempotency-key': uuidV4,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should handle uppercase UUID', async () => {
      const uppercaseUuid = '550E8400-E29B-41D4-A716-446655440000';
      mockRequest.headers = {
        'idempotency-key': uppercaseUuid,
      };

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.idempotencyKey).toBe(uppercaseUuid);
    });
  });
});

describe('Idempotency Cache Hook', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReply = {
      statusCode: 200,
    } as Partial<FastifyReply>;

    mockRequest = {
      idempotencyKey: '550e8400-e29b-41d4-a716-446655440000',
      idempotencyRedisKey: 'idempotency:order:user-123:550e8400-e29b-41d4-a716-446655440000',
    } as Partial<FastifyRequest>;

    (RedisService.set as jest.Mock).mockResolvedValue('OK');
    (RedisService.del as jest.Mock).mockResolvedValue(1);
  });

  describe('Successful Responses (2xx)', () => {
    it('should cache 200 response for 24 hours', async () => {
      mockReply.statusCode = 200;
      const payload = { order: { id: 'order-123' } };

      const result = await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        mockRequest.idempotencyRedisKey,
        expect.stringContaining('"statusCode":200'),
        86400
      );
      expect(result).toBe(payload);
    });

    it('should cache 201 response', async () => {
      mockReply.statusCode = 201;
      const payload = { created: true };

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"statusCode":201'),
        86400
      );
    });

    it('should cache 204 response', async () => {
      mockReply.statusCode = 204;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        null
      );

      expect(RedisService.set).toHaveBeenCalled();
    });

    it('should include completedAt timestamp', async () => {
      mockReply.statusCode = 200;
      const beforeTime = new Date().toISOString();

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      const cachedData = (RedisService.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(cachedData);
      expect(parsed.completedAt).toBeDefined();
      expect(new Date(parsed.completedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(beforeTime).getTime()
      );
    });

    it('should handle JSON string payload', async () => {
      mockReply.statusCode = 200;
      const payload = JSON.stringify({ data: 'test' });

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      const cachedData = (RedisService.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(cachedData);
      expect(parsed.body).toEqual({ data: 'test' });
    });

    it('should handle object payload', async () => {
      mockReply.statusCode = 200;
      const payload = { order: { id: 'order-123', subtotal: 100 } };

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      const cachedData = (RedisService.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(cachedData);
      expect(parsed.body).toEqual(payload);
    });
  });

  describe('Client Error Responses (4xx)', () => {
    it('should cache 400 response for 1 hour', async () => {
      mockReply.statusCode = 400;
      const payload = { error: 'Invalid input' };

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        mockRequest.idempotencyRedisKey,
        expect.stringContaining('"statusCode":400'),
        3600
      );
    });

    it('should cache 404 response', async () => {
      mockReply.statusCode = 404;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        { error: 'Not found' }
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"statusCode":404'),
        3600
      );
    });

    it('should cache 422 response', async () => {
      mockReply.statusCode = 422;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        { error: 'Validation failed' }
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"statusCode":422'),
        3600
      );
    });
  });

  describe('Server Error Responses (5xx)', () => {
    it('should delete key on 500 error to allow retry', async () => {
      mockReply.statusCode = 500;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        { error: 'Internal server error' }
      );

      expect(RedisService.del).toHaveBeenCalledWith(
        mockRequest.idempotencyRedisKey
      );
      expect(RedisService.set).not.toHaveBeenCalled();
    });

    it('should delete key on 502 error', async () => {
      mockReply.statusCode = 502;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.del).toHaveBeenCalled();
    });

    it('should delete key on 503 error', async () => {
      mockReply.statusCode = 503;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.del).toHaveBeenCalled();
    });
  });

  describe('No Idempotency Key', () => {
    it('should skip caching when no redis key present', async () => {
      mockRequest.idempotencyRedisKey = undefined;
      mockReply.statusCode = 200;
      const payload = { data: 'test' };

      const result = await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(RedisService.set).not.toHaveBeenCalled();
      expect(RedisService.del).not.toHaveBeenCalled();
      expect(result).toBe(payload);
    });
  });

  describe('Redis Failures in Hook', () => {
    it('should handle Redis set failure gracefully', async () => {
      mockReply.statusCode = 200;
      (RedisService.set as jest.Mock).mockRejectedValue(
        new Error('Redis failed')
      );

      const payload = { data: 'test' };

      const result = await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cache successful response',
        expect.objectContaining({ err: expect.any(Error) })
      );
      expect(result).toBe(payload);
    });

    it('should handle Redis del failure gracefully', async () => {
      mockReply.statusCode = 500;
      (RedisService.del as jest.Mock).mockRejectedValue(
        new Error('Redis delete failed')
      );

      const payload = { error: 'Server error' };

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to delete key after server error',
        expect.objectContaining({ err: expect.any(Error) })
      );
    });

    it('should handle cache error response failure', async () => {
      mockReply.statusCode = 400;
      (RedisService.set as jest.Mock).mockRejectedValue(
        new Error('Cache failed')
      );

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        { error: 'Bad request' }
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to cache error response',
        expect.any(Object)
      );
    });
  });

  describe('Payload Handling', () => {
    it('should handle unparseable JSON string', async () => {
      mockReply.statusCode = 200;
      const payload = '{invalid json}';

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      const cachedData = (RedisService.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(cachedData);
      expect(parsed.body).toBe(payload);
    });

    it('should handle null payload', async () => {
      mockReply.statusCode = 204;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        null
      );

      const cachedData = (RedisService.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(cachedData);
      expect(parsed.body).toBeNull();
    });

    it('should handle complex nested objects', async () => {
      mockReply.statusCode = 200;
      const payload = {
        order: {
          id: 'order-123',
          items: [
            { ticketId: 'ticket-1', quantity: 2 },
            { ticketId: 'ticket-2', quantity: 1 },
          ],
          pricing: {
            subtotal: 100,
            tax: 8.5,
            total: 108.5,
          },
        },
      };

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        payload
      );

      const cachedData = (RedisService.set as jest.Mock).mock.calls[0][1];
      const parsed = JSON.parse(cachedData);
      expect(parsed.body).toEqual(payload);
    });
  });

  describe('Status Code Boundaries', () => {
    it('should cache 299 response (last 2xx)', async () => {
      mockReply.statusCode = 299;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        86400
      );
    });

    it('should not cache 300 response (3xx)', async () => {
      mockReply.statusCode = 300;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.set).not.toHaveBeenCalled();
      expect(RedisService.del).not.toHaveBeenCalled();
    });

    it('should cache 399 response as 3xx (no action)', async () => {
      mockReply.statusCode = 399;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.set).not.toHaveBeenCalled();
      expect(RedisService.del).not.toHaveBeenCalled();
    });

    it('should cache 499 response (last 4xx)', async () => {
      mockReply.statusCode = 499;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        3600
      );
    });

    it('should delete key on 599 response (last 5xx)', async () => {
      mockReply.statusCode = 599;

      await idempotencyCacheHook(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
        {}
      );

      expect(RedisService.del).toHaveBeenCalled();
    });
  });
});
