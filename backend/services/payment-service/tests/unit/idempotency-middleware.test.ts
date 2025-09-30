import { Request, Response, NextFunction } from 'express';
import { idempotencyMiddleware } from '../../src/middleware/idempotency';
import { RedisService } from '../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

// Mock RedisService
jest.mock('../../src/services/redisService');

describe('Idempotency Middleware - Unit Tests', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn((body) => res as Response);
    statusMock = jest.fn((code) => {
      (res as any).statusCode = code;
      return res as Response;
    });

    req = {
      headers: {},
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'test@example.com',
        role: 'admin'
      },
      path: '/test',
      method: 'POST'
    } as Partial<Request>;

    res = {
      status: statusMock,
      json: jsonMock,
      statusCode: 200
    } as Partial<Response>;

    next = jest.fn();
  });

  describe('Key Validation', () => {
    it('should reject request without idempotency key', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_KEY_MISSING'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject invalid UUID format', async () => {
      req.headers!['idempotency-key'] = 'not-a-uuid';
      
      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'IDEMPOTENCY_KEY_INVALID'
        })
      );
    });

    it('should accept valid UUID', async () => {
      const validUuid = uuidv4();
      req.headers!['idempotency-key'] = validUuid;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('Authentication Requirements', () => {
    it('should reject unauthenticated requests', async () => {
      req.headers!['idempotency-key'] = uuidv4();
      req.user = undefined;

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'AUTH_REQUIRED'
        })
      );
    });
  });

  describe('Duplicate Detection', () => {
    it('should return cached response for duplicate request', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      const cachedResponse = {
        statusCode: 200,
        body: { success: true, data: 'cached' },
        completedAt: new Date().toISOString()
      };

      (RedisService.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResponse));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(cachedResponse.body);
      expect(next).not.toHaveBeenCalled();
    });

    it('should detect concurrent duplicate requests', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      const inProgressResponse = {
        statusCode: 102,
        body: { processing: true }
      };

      (RedisService.get as jest.Mock).mockResolvedValue(JSON.stringify(inProgressResponse));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(statusMock).toHaveBeenCalledWith(409);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'DUPLICATE_IN_PROGRESS'
        })
      );
    });
  });

  describe('Response Caching', () => {
    it('should cache successful responses (2xx)', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();

      // Middleware wraps res.json - call the wrapped version
      (res as any).statusCode = 200;
      const wrappedJson = res.json!;
      await wrappedJson({ success: true });

      // Verify Redis.set was called with 24-hour TTL
      expect(RedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.stringContaining('"statusCode":200'),
        86400
      );
    });

    it('should cache client errors (4xx) with shorter TTL', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();

      // Call with 400 status
      (res as any).statusCode = 400;
      const wrappedJson = res.json!;
      await wrappedJson({ error: 'Validation failed' });

      // Check 1 hour TTL for client errors
      expect(RedisService.set).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.stringContaining('"statusCode":400'),
        3600
      );
    });

    it('should delete key on server errors (5xx) to allow retry', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);
      (RedisService.del as jest.Mock).mockResolvedValue(1);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();

      // Call with 500 status
      (res as any).statusCode = 500;
      const wrappedJson = res.json!;
      await wrappedJson({ error: 'Internal error' });

      // Verify key was deleted
      expect(RedisService.del).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey)
      );
    });
  });

  describe('Tenant Isolation', () => {
    it('should scope keys by user ID', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;
      const userId = '11111111-1111-1111-1111-111111111111';

      (RedisService.get as jest.Mock).mockResolvedValue(null);
      (RedisService.set as jest.Mock).mockResolvedValue(undefined);

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      // Verify Redis key includes userId
      expect(RedisService.get).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`${userId}.*${idempotencyKey}`))
      );
    });
  });

  describe('Graceful Degradation', () => {
    it('should proceed without idempotency if Redis fails', async () => {
      const idempotencyKey = uuidv4();
      req.headers!['idempotency-key'] = idempotencyKey;

      (RedisService.get as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      const middleware = idempotencyMiddleware({ ttlMs: 30000 });
      await middleware(req as Request, res as Response, next);

      // Should still call next (degraded mode)
      expect(next).toHaveBeenCalled();
    });
  });
});
