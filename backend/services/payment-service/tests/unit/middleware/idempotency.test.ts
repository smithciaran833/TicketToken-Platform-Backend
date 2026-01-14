/**
 * Unit Tests for Idempotency Middleware
 */

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

import { idempotencyMiddleware, idempotencyCacheHook } from '../../../src/middleware/idempotency';
import { RedisService } from '../../../src/services/redisService';

describe('idempotencyMiddleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let middleware: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      url: '/api/payment/process',
      userId: 'user-123',
      user: {
        sub: 'user-123',
        tenantId: 'tenant-456',
      },
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      statusCode: 200,
    };

    middleware = idempotencyMiddleware({ ttlMs: 1800000 });
  });

  describe('Key Validation', () => {
    it('should reject request without idempotency key', async () => {
      mockRequest.headers = {};

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_KEY_MISSING',
        })
      );
    });

    it('should reject invalid UUID format', async () => {
      mockRequest.headers['idempotency-key'] = 'not-a-uuid';

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_KEY_INVALID',
        })
      );
    });

    it('should accept valid UUID', async () => {
      mockRequest.headers['idempotency-key'] = '123e4567-e89b-12d3-a456-426614174000';
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest, mockReply);

      // Should not reject
      expect(mockReply.status).not.toHaveBeenCalledWith(400);
    });
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      mockRequest.headers['idempotency-key'] = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.userId = undefined;
      mockRequest.user = undefined;

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AUTH_REQUIRED',
        })
      );
    });

    it('should accept user from userId field', async () => {
      mockRequest.headers['idempotency-key'] = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.userId = 'user-123';
      mockRequest.user = undefined;
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalledWith(401);
    });
  });

  describe('Duplicate Detection', () => {
    const validKey = '123e4567-e89b-12d3-a456-426614174000';

    it('should return cached response for duplicate request', async () => {
      mockRequest.headers['idempotency-key'] = validKey;
      
      const cachedResponse = {
        statusCode: 200,
        body: { success: true, transactionId: 'tx-123' },
      };
      (RedisService.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResponse));

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(cachedResponse.body);
    });

    it('should reject concurrent duplicate with 409', async () => {
      mockRequest.headers['idempotency-key'] = validKey;
      
      const inProgressResponse = {
        statusCode: 102, // Processing
        body: { processing: true },
      };
      (RedisService.get as jest.Mock).mockResolvedValue(JSON.stringify(inProgressResponse));

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DUPLICATE_IN_PROGRESS',
        })
      );
    });

    it('should mark new request as in-progress', async () => {
      mockRequest.headers['idempotency-key'] = validKey;
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest, mockReply);

      expect(RedisService.set).toHaveBeenCalledWith(
        expect.stringContaining('idempotency:'),
        expect.stringContaining('"statusCode":102'),
        expect.any(Number)
      );
    });

    it('should set idempotency info on request', async () => {
      mockRequest.headers['idempotency-key'] = validKey;
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest, mockReply);

      expect(mockRequest.idempotencyKey).toBe(validKey);
      expect(mockRequest.idempotencyRedisKey).toContain('idempotency:');
    });
  });

  describe('Redis Error Handling', () => {
    it('should continue on Redis error (degraded mode)', async () => {
      mockRequest.headers['idempotency-key'] = '123e4567-e89b-12d3-a456-426614174000';
      (RedisService.get as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await middleware(mockRequest, mockReply);

      // Should not error out, just continue
      expect(mockReply.status).not.toHaveBeenCalledWith(500);
    });
  });

  describe('Key Scoping', () => {
    it('should scope key by tenant and user', async () => {
      mockRequest.headers['idempotency-key'] = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.user = { tenantId: 'tenant-abc', id: 'user-xyz' };
      mockRequest.userId = 'user-xyz';
      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue('OK');

      await middleware(mockRequest, mockReply);

      expect(RedisService.get).toHaveBeenCalledWith(
        expect.stringContaining('tenant-abc:user-xyz')
      );
    });
  });
});

describe('idempotencyCacheHook', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      idempotencyRedisKey: 'idempotency:tenant:user:key',
    };

    mockReply = {
      statusCode: 200,
    };
  });

  it('should skip caching if no idempotency key', async () => {
    mockRequest.idempotencyRedisKey = undefined;
    const payload = { result: 'data' };

    const result = await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(RedisService.set).not.toHaveBeenCalled();
    expect(result).toEqual(payload);
  });

  it('should cache successful responses (2xx)', async () => {
    mockReply.statusCode = 200;
    const payload = JSON.stringify({ success: true });
    (RedisService.set as jest.Mock).mockResolvedValue('OK');

    await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(RedisService.set).toHaveBeenCalledWith(
      mockRequest.idempotencyRedisKey,
      expect.stringContaining('"statusCode":200'),
      86400 // 24 hours
    );
  });

  it('should cache 201 responses', async () => {
    mockReply.statusCode = 201;
    const payload = JSON.stringify({ created: true });
    (RedisService.set as jest.Mock).mockResolvedValue('OK');

    await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(RedisService.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"statusCode":201'),
      86400
    );
  });

  it('should delete key on server errors (5xx)', async () => {
    mockReply.statusCode = 500;
    const payload = JSON.stringify({ error: 'Server error' });
    (RedisService.del as jest.Mock).mockResolvedValue(1);

    await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(RedisService.del).toHaveBeenCalledWith(mockRequest.idempotencyRedisKey);
  });

  it('should cache client errors (4xx) for 1 hour', async () => {
    mockReply.statusCode = 400;
    const payload = JSON.stringify({ error: 'Bad request' });
    (RedisService.set as jest.Mock).mockResolvedValue('OK');

    await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(RedisService.set).toHaveBeenCalledWith(
      mockRequest.idempotencyRedisKey,
      expect.stringContaining('"statusCode":400'),
      3600 // 1 hour
    );
  });

  it('should return payload unchanged', async () => {
    const payload = { original: 'data' };
    (RedisService.set as jest.Mock).mockResolvedValue('OK');

    const result = await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(result).toEqual(payload);
  });

  it('should handle JSON string payload', async () => {
    mockReply.statusCode = 200;
    const payload = '{"success":true}';
    (RedisService.set as jest.Mock).mockResolvedValue('OK');

    const result = await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(result).toBe(payload);
    expect(RedisService.set).toHaveBeenCalled();
  });

  it('should handle Redis errors gracefully', async () => {
    mockReply.statusCode = 200;
    const payload = { success: true };
    (RedisService.set as jest.Mock).mockRejectedValue(new Error('Redis error'));

    // Should not throw
    const result = await idempotencyCacheHook(mockRequest, mockReply, payload);
    expect(result).toEqual(payload);
  });
});
