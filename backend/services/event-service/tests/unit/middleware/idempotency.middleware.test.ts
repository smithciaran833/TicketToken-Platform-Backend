/**
 * Unit tests for idempotency middleware
 * 
 * Tests:
 * - Idempotency key validation
 * - Cached response replay
 * - Lock mechanism for concurrent requests
 * - Non-mutating methods skip
 * - Redis integration
 */

import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

jest.mock('pino', () => ({
  pino: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

import {
  initializeIdempotency,
  idempotencyMiddleware,
  idempotencyPreHandler,
  cleanupExpiredKeys,
} from '../../../src/middleware/idempotency.middleware';

describe('Idempotency Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.get.mockReset();
    mockRedis.set.mockReset();
    mockRedis.setex.mockReset();
    mockRedis.del.mockReset();
    // Initialize with mock Redis
    initializeIdempotency(mockRedis as any);
  });

  describe('initializeIdempotency', () => {
    it('should initialize with a Redis client', () => {
      // Already initialized in beforeEach
      expect(() => initializeIdempotency(mockRedis as any)).not.toThrow();
    });
  });

  describe('idempotencyMiddleware', () => {
    describe('method filtering', () => {
      it('should skip GET requests', async () => {
        const request = createMockRequest({ method: 'GET' });
        const reply = createMockReply();

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).not.toHaveBeenCalled();
        expect(reply.code).not.toHaveBeenCalled();
      });

      it('should skip DELETE requests without idempotency key', async () => {
        const request = createMockRequest({ method: 'DELETE' });
        const reply = createMockReply();

        await idempotencyMiddleware(request as any, reply as any);

        // Without idempotency key, it should skip
        expect(mockRedis.get).not.toHaveBeenCalled();
      });

      it('should process POST requests with idempotency key', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key-123' },
        });
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).toHaveBeenCalled();
      });

      it('should process PUT requests with idempotency key', async () => {
        const request = createMockRequest({
          method: 'PUT',
          headers: { 'idempotency-key': 'test-key-456' },
        });
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).toHaveBeenCalled();
      });

      it('should process PATCH requests with idempotency key', async () => {
        const request = createMockRequest({
          method: 'PATCH',
          headers: { 'idempotency-key': 'test-key-789' },
        });
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).toHaveBeenCalled();
      });
    });

    describe('idempotency key validation', () => {
      it('should reject keys longer than 256 characters', async () => {
        const longKey = 'a'.repeat(257);
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': longKey },
        });
        const reply = createMockReply();

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.code).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Invalid Idempotency-Key',
            code: 'INVALID_IDEMPOTENCY_KEY',
          })
        );
      });

      it('should reject keys with invalid characters', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'key with spaces!' },
        });
        const reply = createMockReply();

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.code).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'INVALID_IDEMPOTENCY_KEY',
          })
        );
      });

      it('should accept valid alphanumeric keys', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'valid-key_123' },
        });
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.code).not.toHaveBeenCalledWith(400);
      });

      it('should accept UUIDs as idempotency keys', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': '550e8400-e29b-41d4-a716-446655440000' },
        });
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.code).not.toHaveBeenCalledWith(400);
      });
    });

    describe('cached response replay', () => {
      it('should return cached response for duplicate request', async () => {
        const cachedResponse = {
          statusCode: 201,
          body: { id: 'event-123', name: 'Test Event' },
          createdAt: new Date().toISOString(),
        };
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'duplicate-key' },
        });
        (request as any).tenantId = 'tenant-123';
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
        expect(reply.code).toHaveBeenCalledWith(201);
        expect(reply.send).toHaveBeenCalledWith(cachedResponse.body);
      });

      it('should set X-Idempotency-Key header on replayed response', async () => {
        const cachedResponse = {
          statusCode: 200,
          body: { success: true },
          createdAt: new Date().toISOString(),
        };
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key' },
        });
        (request as any).tenantId = 'tenant-123';
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedResponse));

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.header).toHaveBeenCalledWith('X-Idempotency-Key', 'test-key');
      });
    });

    describe('lock mechanism', () => {
      it('should acquire lock for new request', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'new-key' },
        });
        (request as any).tenantId = 'tenant-123';
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.set).toHaveBeenCalledWith(
          expect.stringContaining(':lock'),
          '1',
          'EX',
          30,
          'NX'
        );
      });

      it('should return 409 if lock cannot be acquired', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'locked-key' },
        });
        (request as any).tenantId = 'tenant-123';
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue(null); // Lock not acquired

        await idempotencyMiddleware(request as any, reply as any);

        expect(reply.code).toHaveBeenCalledWith(409);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Concurrent request in progress',
            code: 'IDEMPOTENCY_CONFLICT',
          })
        );
      });
    });

    describe('tenant isolation', () => {
      it('should include tenant ID in Redis key', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key' },
        });
        (request as any).tenantId = 'tenant-abc';
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).toHaveBeenCalledWith(
          expect.stringContaining('tenant-abc')
        );
      });

      it('should use public namespace when no tenant', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key' },
        });
        (request as any).tenantId = null;
        const reply = createMockReply();
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).toHaveBeenCalledWith(
          expect.stringContaining('public')
        );
      });
    });

    describe('error handling', () => {
      it('should continue without blocking on Redis errors', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key' },
        });
        const reply = createMockReply();
        mockRedis.get.mockRejectedValue(new Error('Redis connection error'));

        await idempotencyMiddleware(request as any, reply as any);

        // Should not throw or send error response
        expect(reply.code).not.toHaveBeenCalledWith(500);
      });
    });

    describe('no idempotency key', () => {
      it('should skip when no idempotency key provided', async () => {
        const request = createMockRequest({
          method: 'POST',
          headers: {},
        });
        const reply = createMockReply();

        await idempotencyMiddleware(request as any, reply as any);

        expect(mockRedis.get).not.toHaveBeenCalled();
        expect(reply.code).not.toHaveBeenCalled();
      });
    });
  });

  describe('idempotencyPreHandler', () => {
    it('should be the same as idempotencyMiddleware', () => {
      expect(idempotencyPreHandler).toBe(idempotencyMiddleware);
    });
  });

  describe('cleanupExpiredKeys', () => {
    it('should return 0 (Redis handles TTL automatically)', async () => {
      const result = await cleanupExpiredKeys();
      expect(result).toBe(0);
    });
  });
});
