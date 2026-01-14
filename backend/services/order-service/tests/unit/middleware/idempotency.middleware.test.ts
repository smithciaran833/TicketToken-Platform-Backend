/**
 * Unit Tests: Idempotency Middleware
 * Tests idempotency key handling and caching
 */

jest.mock('../../../src/config/redis', () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
}));

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({
    query: jest.fn(),
  })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock('uuid', () => ({
  validate: jest.fn((val) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val)),
}));

import { idempotencyMiddleware, idempotencyCacheHook } from '../../../src/middleware/idempotency.middleware';
import { get, set, del } from '../../../src/config/redis';
import { getDatabase } from '../../../src/config/database';

describe('idempotencyMiddleware', () => {
  let middleware: any;
  let mockRequest: any;
  let mockReply: any;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();
    middleware = idempotencyMiddleware({ ttlMs: 86400000 });
    
    mockRequest = {
      headers: {},
      user: { id: 'user-123' },
      url: '/api/v1/orders',
    };
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockDb = { query: jest.fn() };
    (getDatabase as jest.Mock).mockReturnValue(mockDb);
  });

  describe('Key validation', () => {
    it('should require idempotency key header', async () => {
      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_MISSING',
      }));
    });

    it('should require valid UUID format', async () => {
      mockRequest.headers['idempotency-key'] = 'not-a-uuid';

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'IDEMPOTENCY_KEY_INVALID',
      }));
    });

    it('should require authentication', async () => {
      mockRequest.headers['idempotency-key'] = '123e4567-e89b-12d3-a456-426614174000';
      mockRequest.user = null;

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'AUTH_REQUIRED',
      }));
    });
  });

  describe('Cache handling', () => {
    const validKey = '123e4567-e89b-12d3-a456-426614174000';

    beforeEach(() => {
      mockRequest.headers['idempotency-key'] = validKey;
    });

    it('should return cached response on hit', async () => {
      const cachedResponse = { statusCode: 201, body: { id: 'order-123' } };
      (get as jest.Mock).mockResolvedValue(JSON.stringify(cachedResponse));

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({ id: 'order-123' });
    });

    it('should return 409 for concurrent duplicate request', async () => {
      const inProgress = { statusCode: 102, body: { processing: true } };
      (get as jest.Mock).mockResolvedValue(JSON.stringify(inProgress));

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(409);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        code: 'DUPLICATE_IN_PROGRESS',
      }));
    });

    it('should check database on cache miss', async () => {
      (get as jest.Mock).mockResolvedValue(null);
      mockDb.query.mockResolvedValue({ rows: [] });

      await middleware(mockRequest, mockReply);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['user-123', validKey]
      );
    });

    it('should return database result if found', async () => {
      (get as jest.Mock).mockResolvedValue(null);
      mockDb.query.mockResolvedValue({
        rows: [{
          id: 'order-123',
          order_number: 'ORD-001',
          status: 'CONFIRMED',
          total_cents: 5000,
          currency: 'USD',
          created_at: new Date(),
        }],
      });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        id: 'order-123',
        _idempotent: true,
        _source: 'database',
      }));
    });

    it('should mark request as in-progress on new request', async () => {
      (get as jest.Mock).mockResolvedValue(null);
      mockDb.query.mockResolvedValue({ rows: [] });

      await middleware(mockRequest, mockReply);

      expect(set).toHaveBeenCalledWith(
        expect.stringContaining('idempotency:order:user-123:'),
        expect.stringContaining('"statusCode":102'),
        expect.any(Number)
      );
      expect(mockRequest.idempotencyKey).toBe(validKey);
    });
  });

  describe('Error handling', () => {
    const validKey = '123e4567-e89b-12d3-a456-426614174000';

    beforeEach(() => {
      mockRequest.headers['idempotency-key'] = validKey;
    });

    it('should fallback to database on Redis error', async () => {
      (get as jest.Mock).mockRejectedValue(new Error('Redis down'));
      mockDb.query.mockResolvedValue({ rows: [] });

      await middleware(mockRequest, mockReply);

      expect(mockDb.query).toHaveBeenCalled();
    });

    it('should proceed in degraded mode on total failure', async () => {
      (get as jest.Mock).mockRejectedValue(new Error('Redis down'));
      mockDb.query.mockRejectedValue(new Error('DB down'));

      await middleware(mockRequest, mockReply);

      // Should not send error response, just proceed
      expect(mockReply.status).not.toHaveBeenCalled();
    });
  });
});

describe('idempotencyCacheHook', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = {
      idempotencyKey: '123e4567-e89b-12d3-a456-426614174000',
      idempotencyRedisKey: 'idempotency:order:user-123:123e4567-e89b-12d3-a456-426614174000',
      user: { id: 'user-123' },
    };
    mockReply = {
      statusCode: 201,
    };
  });

  it('should cache successful responses', async () => {
    const payload = JSON.stringify({ id: 'order-123' });

    await idempotencyCacheHook(mockRequest, mockReply, payload);

    expect(set).toHaveBeenCalledWith(
      mockRequest.idempotencyRedisKey,
      expect.stringContaining('"statusCode":201'),
      86400
    );
  });

  it('should delete key on server errors', async () => {
    mockReply.statusCode = 500;

    await idempotencyCacheHook(mockRequest, mockReply, '{"error":"Server error"}');

    expect(del).toHaveBeenCalledWith(mockRequest.idempotencyRedisKey);
  });

  it('should cache client errors with shorter TTL', async () => {
    mockReply.statusCode = 400;

    await idempotencyCacheHook(mockRequest, mockReply, '{"error":"Bad request"}');

    expect(set).toHaveBeenCalledWith(
      mockRequest.idempotencyRedisKey,
      expect.any(String),
      3600
    );
  });

  it('should skip caching when no idempotency key', async () => {
    mockRequest.idempotencyRedisKey = undefined;

    const result = await idempotencyCacheHook(mockRequest, mockReply, '{}');

    expect(set).not.toHaveBeenCalled();
    expect(result).toBe('{}');
  });
});
