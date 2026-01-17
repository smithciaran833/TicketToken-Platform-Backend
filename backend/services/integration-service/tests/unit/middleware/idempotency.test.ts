// Mock dependencies BEFORE imports
const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockRedisDel = jest.fn();
const mockRedisOn = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: mockRedisGet,
    set: mockRedisSet,
    del: mockRedisDel,
    on: mockRedisOn,
  }));
});

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/index', () => ({
  getRedisConfig: jest.fn(() => ({
    host: 'localhost',
    port: 6379,
    password: undefined,
    db: 0,
    tls: undefined,
  })),
}));

jest.mock('../../../src/errors/index', () => ({
  IdempotencyConflictError: class IdempotencyConflictError extends Error {
    constructor(key: string, retryAfter: number, requestId: string) {
      super(`Idempotency conflict for key: ${key}`);
      this.name = 'IdempotencyConflictError';
    }
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  idempotencyMiddleware,
  captureIdempotencyResponse,
  markIdempotencyFailed,
} from '../../../src/middleware/idempotency';
import { IdempotencyConflictError } from '../../../src/errors/index';
import { logger } from '../../../src/utils/logger';

describe('idempotency middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;
  let mockCode: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });
    mockHeader = jest.fn().mockReturnThis();
    mockCode = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus,
      header: mockHeader,
      code: mockCode,
    };

    mockRequest = {
      id: 'req-123',
      method: 'POST',
      url: '/api/test',
      headers: {},
      tenantId: 'tenant-123',
    };

    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
  });

  describe('idempotencyMiddleware', () => {
    it('should skip GET requests', async () => {
      mockRequest.method = 'GET';

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should skip DELETE requests', async () => {
      mockRequest.method = 'DELETE';

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should skip requests without idempotency key', async () => {
      mockRequest.method = 'POST';

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should reject idempotency key that is too short', async () => {
      mockRequest.headers = { 'idempotency-key': 'short' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 400,
          detail: 'Idempotency-Key header must be 16-128 characters',
        })
      );
    });

    it('should reject idempotency key that is too long', async () => {
      mockRequest.headers = { 'idempotency-key': 'a'.repeat(129) };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockStatus).toHaveBeenCalledWith(400);
    });

    it('should accept valid idempotency key', async () => {
      mockRequest.headers = { 'idempotency-key': 'valid-key-1234567890' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).toHaveBeenCalled();
      expect(mockRedisSet).toHaveBeenCalled();
    });

    it('should throw conflict error when request is processing', async () => {
      const processingEntry = {
        requestId: 'original-req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      mockRequest.headers = { 'idempotency-key': 'duplicate-key-123456' };
      mockRedisGet.mockResolvedValue(JSON.stringify(processingEntry));

      await expect(
        idempotencyMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(IdempotencyConflictError);

      expect(logger.warn).toHaveBeenCalledWith(
        'Duplicate request while processing',
        expect.objectContaining({
          idempotencyKey: 'duplicate-key-123456',
          originalRequestId: 'original-req-123',
        })
      );
    });

    it('should return cached response when request completed', async () => {
      const completedEntry = {
        requestId: 'original-req-123',
        status: 'completed',
        response: {
          statusCode: 201,
          body: { id: 'resource-123' },
        },
        createdAt: Date.now() - 60000,
        updatedAt: Date.now() - 60000,
        expiresAt: Date.now() + 86340000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      mockRequest.headers = { 'idempotency-key': 'completed-key-123456' };
      mockRedisGet.mockResolvedValue(JSON.stringify(completedEntry));

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockHeader).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
      expect(mockHeader).toHaveBeenCalledWith(
        'X-Idempotent-Original-Request-Id',
        'original-req-123'
      );
      expect(mockCode).toHaveBeenCalledWith(201);
      expect(mockSend).toHaveBeenCalledWith({ id: 'resource-123' });
    });

    it('should allow retry when request failed', async () => {
      const failedEntry = {
        requestId: 'original-req-123',
        status: 'failed',
        createdAt: Date.now() - 60000,
        updatedAt: Date.now() - 60000,
        expiresAt: Date.now() + 86340000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      mockRequest.headers = { 'idempotency-key': 'failed-key-123456' };
      mockRedisGet.mockResolvedValue(JSON.stringify(failedEntry));

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisDel).toHaveBeenCalled();
      expect(mockRedisSet).toHaveBeenCalled();
    });

    it('should create processing entry for new request', async () => {
      mockRequest.headers = { 'idempotency-key': 'new-key-1234567890' };
      mockRedisGet.mockResolvedValue(null);

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisSet).toHaveBeenCalled();
      const setCall = mockRedisSet.mock.calls[0];
      const entry = JSON.parse(setCall[1]);
      expect(entry.status).toBe('processing');
      expect(entry.requestId).toBe('req-123');
    });

    it('should set cache key on request', async () => {
      mockRequest.headers = { 'idempotency-key': 'test-key-1234567890' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRequest.idempotencyCacheKey).toBeDefined();
      expect(mockRequest.idempotencyKey).toBe('test-key-1234567890');
    });

    it('should use tenant ID in cache key', async () => {
      mockRequest.headers = { 'idempotency-key': 'tenant-key-123456789' };
      mockRequest.tenantId = 'tenant-456';

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).toHaveBeenCalled();
      const cacheKey = mockRedisGet.mock.calls[0][0];
      expect(cacheKey).toContain('tenant-456');
    });

    it('should use global tenant when tenant ID missing', async () => {
      mockRequest.headers = { 'idempotency-key': 'global-key-123456789' };
      mockRequest.tenantId = undefined;

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      const cacheKey = mockRedisGet.mock.calls[0][0];
      expect(cacheKey).toContain('global');
    });

    it('should handle PUT requests', async () => {
      mockRequest.method = 'PUT';
      mockRequest.headers = { 'idempotency-key': 'put-key-1234567890' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).toHaveBeenCalled();
    });

    it('should handle PATCH requests', async () => {
      mockRequest.method = 'PATCH';
      mockRequest.headers = { 'idempotency-key': 'patch-key-123456789' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedisGet).toHaveBeenCalled();
    });
  });

  describe('captureIdempotencyResponse', () => {
    it('should skip when no cache key', async () => {
      mockRequest.idempotencyCacheKey = undefined;

      await captureIdempotencyResponse(mockRequest as FastifyRequest, 200, { success: true });

      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should store successful response', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-123';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        201,
        { id: 'resource-123' }
      );

      expect(mockRedisSet).toHaveBeenCalled();
      const entry = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(entry.status).toBe('completed');
      expect(entry.response.statusCode).toBe(201);
      expect(entry.response.body).toEqual({ id: 'resource-123' });
    });

    it('should preserve original created timestamp', async () => {
      const originalCreatedAt = Date.now() - 5000;
      mockRequest.idempotencyCacheKey = 'cache-key-456';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: originalCreatedAt,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      await captureIdempotencyResponse(mockRequest as FastifyRequest, 200, { success: true });

      const entry = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(entry.createdAt).toBe(originalCreatedAt);
    });

    it('should set TTL for cached response', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-789';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      await captureIdempotencyResponse(mockRequest as FastifyRequest, 200, { success: true });

      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'PX',
        expect.any(Number)
      );
    });
  });

  describe('markIdempotencyFailed', () => {
    it('should skip when no cache key', async () => {
      mockRequest.idempotencyCacheKey = undefined;

      await markIdempotencyFailed(mockRequest as FastifyRequest);

      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should mark request as failed', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-failed';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      await markIdempotencyFailed(mockRequest as FastifyRequest);

      expect(mockRedisSet).toHaveBeenCalled();
      const entry = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(entry.status).toBe('failed');
    });

    it('should preserve original created timestamp when marking failed', async () => {
      const originalCreatedAt = Date.now() - 3000;
      mockRequest.idempotencyCacheKey = 'cache-key-failed-time';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: originalCreatedAt,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000,
        tenantId: 'tenant-123',
        endpoint: '/api/test',
        method: 'POST',
      };

      await markIdempotencyFailed(mockRequest as FastifyRequest);

      const entry = JSON.parse(mockRedisSet.mock.calls[0][1]);
      expect(entry.createdAt).toBe(originalCreatedAt);
    });
  });

  describe('error handling', () => {
    it('should fall back to memory when Redis fails on get', async () => {
      mockRequest.headers = { 'idempotency-key': 'redis-fail-key-123456' };
      mockRedisGet.mockRejectedValue(new Error('Redis connection failed'));

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Redis idempotency get error',
        expect.any(Object)
      );
      expect(mockRedisSet).toHaveBeenCalled(); // Should continue
    });

    it('should continue when Redis set fails', async () => {
      mockRequest.headers = { 'idempotency-key': 'redis-set-fail-12345' };
      mockRedisSet.mockRejectedValue(new Error('Redis set failed'));

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Redis idempotency set error',
        expect.any(Object)
      );
    });
  });
});
