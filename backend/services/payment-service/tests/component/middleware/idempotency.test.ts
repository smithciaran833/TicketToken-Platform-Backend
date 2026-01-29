/**
 * COMPONENT TEST: Idempotency (Simple Factory)
 *
 * Tests idempotency middleware with MOCKED Redis
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Redis data store
const mockRedisData: Map<string, string> = new Map();
let mockRedisError: Error | null = null;

// Mock RedisService
jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    get: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      return mockRedisData.get(key) || null;
    }),
    set: jest.fn(async (key: string, value: string, ttl?: number) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.delete(key);
      return 1;
    }),
    getClient: jest.fn(() => ({
      get: async (key: string) => {
        if (mockRedisError) throw mockRedisError;
        return mockRedisData.get(key) || null;
      },
      set: async (key: string, value: string) => {
        if (mockRedisError) throw mockRedisError;
        mockRedisData.set(key, value);
        return 'OK';
      },
    })),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { idempotencyMiddleware, idempotencyCacheHook } from '../../../src/middleware/idempotency';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  const defaultHeaders: Record<string, string> = {};
  return {
    url: '/api/v1/payments',
    method: 'POST',
    headers: defaultHeaders,
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): {
  reply: FastifyReply;
  getSentStatus: () => number;
  getSentResponse: () => any;
} {
  let sentStatus = 200;
  let sentResponse: any = null;

  const reply = {
    status: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    code: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((response: any) => {
      sentResponse = response;
      return reply;
    }),
    statusCode: 200,
  } as unknown as FastifyReply;

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
  };
}

describe('Idempotency Middleware Component Tests', () => {
  let tenantId: string;
  let userId: string;

  beforeEach(() => {
    tenantId = uuidv4();
    userId = uuidv4();
    mockRedisData.clear();
    mockRedisError = null;
  });

  afterEach(() => {
    mockRedisData.clear();
    mockRedisError = null;
    jest.clearAllMocks();
  });

  // ===========================================================================
  // IDEMPOTENCY KEY VALIDATION
  // ===========================================================================
  describe('idempotency key validation', () => {
    it('should reject request without idempotency key', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });

      const mockRequest = createMockRequest({
        headers: {},
        userId,
        user: { id: userId, tenantId },
      });
      const { reply, getSentResponse } = createMockReply();

      await middleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(getSentResponse().code).toBe('IDEMPOTENCY_KEY_MISSING');
    });

    it('should reject invalid idempotency key format', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': 'not-a-uuid' },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply, getSentResponse } = createMockReply();

      await middleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(400);
      expect(getSentResponse().code).toBe('IDEMPOTENCY_KEY_INVALID');
    });

    it('should accept valid UUID idempotency key', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      // Should not return error - continues to handler
      expect(reply.status).not.toHaveBeenCalledWith(400);
    });
  });

  // ===========================================================================
  // AUTHENTICATION REQUIRED
  // ===========================================================================
  describe('authentication required', () => {
    it('should reject request without user context', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        // No userId or user
      });
      const { reply, getSentResponse } = createMockReply();

      await middleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(401);
      expect(getSentResponse().code).toBe('AUTH_REQUIRED');
    });
  });

  // ===========================================================================
  // CACHED RESPONSE
  // ===========================================================================
  describe('cached response', () => {
    it('should return cached response for duplicate request', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();
      const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

      // Pre-populate cache with completed response
      const cachedResponse = {
        statusCode: 200,
        body: { id: 'payment_123', status: 'completed' },
        completedAt: new Date().toISOString(),
      };
      mockRedisData.set(redisKey, JSON.stringify(cachedResponse));

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply, getSentResponse } = createMockReply();

      await middleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(200);
      expect(getSentResponse()).toEqual(cachedResponse.body);
    });

    it('should return 409 for request already processing', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();
      const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

      // Pre-populate cache with processing status (102)
      const processingResponse = {
        statusCode: 102,
        body: { processing: true },
        startedAt: new Date().toISOString(),
      };
      mockRedisData.set(redisKey, JSON.stringify(processingResponse));

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply, getSentResponse } = createMockReply();

      await middleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(409);
      expect(getSentResponse().code).toBe('DUPLICATE_IN_PROGRESS');
    });
  });

  // ===========================================================================
  // MARKING IN PROGRESS
  // ===========================================================================
  describe('marking in progress', () => {
    it('should mark request as in-progress', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      // Check Redis was set with processing status
      const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;
      const stored = mockRedisData.get(redisKey);
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed.statusCode).toBe(102);
      expect(parsed.body.processing).toBe(true);
    });

    it('should store idempotency key on request', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBe(idempotencyKey);
      expect((mockRequest as any).idempotencyRedisKey).toBeDefined();
    });
  });

  // ===========================================================================
  // CACHE HOOK
  // ===========================================================================
  describe('idempotencyCacheHook()', () => {
    it('should cache successful response', async () => {
      const idempotencyKey = uuidv4();
      const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

      const mockRequest = createMockRequest({
        idempotencyRedisKey: redisKey,
      });

      const mockReply = {
        statusCode: 200,
      } as unknown as FastifyReply;

      const payload = JSON.stringify({ id: 'payment_123', status: 'completed' });

      const result = await idempotencyCacheHook(mockRequest, mockReply, payload);

      // Should return payload unchanged
      expect(result).toBe(payload);

      // Should cache the response
      const cached = mockRedisData.get(redisKey);
      expect(cached).toBeDefined();

      const parsed = JSON.parse(cached!);
      expect(parsed.statusCode).toBe(200);
    });

    it('should delete key on server error (5xx)', async () => {
      const idempotencyKey = uuidv4();
      const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

      // Pre-set the key
      mockRedisData.set(redisKey, JSON.stringify({ statusCode: 102 }));

      const mockRequest = createMockRequest({
        idempotencyRedisKey: redisKey,
      });

      const mockReply = {
        statusCode: 500,
      } as unknown as FastifyReply;

      await idempotencyCacheHook(mockRequest, mockReply, '{"error":"Internal Server Error"}');

      // Key should be deleted to allow retry
      expect(mockRedisData.has(redisKey)).toBe(false);
    });

    it('should cache client errors (4xx) with shorter TTL', async () => {
      const idempotencyKey = uuidv4();
      const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

      const mockRequest = createMockRequest({
        idempotencyRedisKey: redisKey,
      });

      const mockReply = {
        statusCode: 400,
      } as unknown as FastifyReply;

      await idempotencyCacheHook(mockRequest, mockReply, '{"error":"Bad Request"}');

      // Should cache the error response
      const cached = mockRedisData.get(redisKey);
      expect(cached).toBeDefined();

      const parsed = JSON.parse(cached!);
      expect(parsed.statusCode).toBe(400);
    });

    it('should skip caching when no redis key on request', async () => {
      const mockRequest = createMockRequest({
        // No idempotencyRedisKey
      });

      const mockReply = {
        statusCode: 200,
      } as unknown as FastifyReply;

      const payload = '{"success":true}';
      const result = await idempotencyCacheHook(mockRequest, mockReply, payload);

      expect(result).toBe(payload);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should fail open when Redis throws error', async () => {
      mockRedisError = new Error('Redis connection failed');

      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      // Should proceed without idempotency (degraded mode)
      expect(reply.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ===========================================================================
  // TENANT ISOLATION
  // ===========================================================================
  describe('tenant isolation', () => {
    it('should scope idempotency key by tenant and user', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      // Key should include both tenant and user
      const expectedKeyPattern = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;
      expect(mockRedisData.has(expectedKeyPattern)).toBe(true);
    });

    it('should not return cached response from different tenant', async () => {
      const middleware = idempotencyMiddleware({ ttlMs: 86400000 });
      const idempotencyKey = uuidv4();
      const otherTenantId = uuidv4();

      // Cache response for different tenant
      const otherTenantKey = `idempotency:${otherTenantId}:${userId}:${idempotencyKey}`;
      mockRedisData.set(otherTenantKey, JSON.stringify({
        statusCode: 200,
        body: { id: 'other_payment' },
      }));

      const mockRequest = createMockRequest({
        headers: { 'idempotency-key': idempotencyKey },
        userId,
        user: { id: userId, tenantId },
      });
      const { reply } = createMockReply();

      await middleware(mockRequest, reply);

      // Should not return the cached response from other tenant
      // Instead should mark as processing
      expect(reply.status).not.toHaveBeenCalledWith(200);
    });
  });
});
