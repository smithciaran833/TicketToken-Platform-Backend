/**
 * COMPONENT TEST: IdempotencyMiddleware (Advanced)
 *
 * Tests advanced idempotency middleware with fingerprinting and path awareness
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Redis data store
const mockRedisData: Map<string, string> = new Map();
let mockRedisError: Error | null = null;

// Mock ioredis - this is what the middleware uses directly
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      return mockRedisData.get(key) || null;
    }),
    set: jest.fn(async (key: string, value: string, ex?: string, ttl?: number) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.set(key, value);
      return 'OK';
    }),
    del: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.delete(key);
      return 1;
    }),
  }));
});

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
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

// Mock errors - need to match actual error classes
const ConflictError = class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
};

const BadRequestError = class BadRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'BadRequestError';
    this.code = code;
  }
};

jest.mock('../../../src/utils/errors', () => ({
  ConflictError,
  BadRequestError,
}));

// Mock crypto util
jest.mock('../../../src/utils/crypto.util', () => ({
  generateIdempotencyKey: () => uuidv4(),
}));

import {
  idempotencyMiddleware,
  onResponseIdempotencyHook,
  checkIdempotencyStatus,
  generateNewIdempotencyKey,
  deleteIdempotencyRecord,
} from '../../../src/middleware/idempotency.middleware';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    url: '/api/v1/payments',
    method: 'POST',
    headers: {},
    body: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): {
  reply: FastifyReply;
  getSentStatus: () => number;
  getSentResponse: () => any;
  getHeaders: () => Record<string, string>;
} {
  let sentStatus = 200;
  let sentResponse: any = null;
  const headers: Record<string, string> = {};
  let sent = false;

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
      sent = true;
      return reply;
    }),
    header: jest.fn().mockImplementation((name: string, value: string) => {
      headers[name] = value;
      return reply;
    }),
    sent: false,
    statusCode: 200,
  } as unknown as FastifyReply;

  Object.defineProperty(reply, 'sent', {
    get: () => sent,
  });

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
    getHeaders: () => headers,
  };
}

// Helper to build cache key matching the middleware's format
function buildCacheKey(idempotencyKey: string, tenantId: string, path: string): string {
  return `idem:payment:${tenantId}:${path}:${idempotencyKey}`;
}

// Helper to build request fingerprint matching the middleware's format
function buildFingerprint(method: string, path: string, body: any): string {
  const { createHash } = require('crypto');
  const parts = [method, path, JSON.stringify(body || {})];
  return createHash('sha256').update(parts.join(':')).digest('hex');
}

describe('IdempotencyMiddleware (Advanced) Component Tests', () => {
  let tenantId: string;

  beforeEach(() => {
    tenantId = uuidv4();
    mockRedisData.clear();
    mockRedisError = null;
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockRedisData.clear();
    mockRedisError = null;
    jest.clearAllMocks();
  });

  // ===========================================================================
  // METHOD FILTERING
  // ===========================================================================
  describe('method filtering', () => {
    it('should skip GET requests', async () => {
      const mockRequest = createMockRequest({
        method: 'GET',
        url: '/api/v1/payments',
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should skip DELETE requests', async () => {
      const mockRequest = createMockRequest({
        method: 'DELETE',
        url: '/api/v1/payments/123',
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });

    it('should process POST requests to idempotent endpoints', async () => {
      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId,
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBe(idempotencyKey);
    });

    // Note: The middleware checks method AND path prefix - PUT/PATCH to payments/123 
    // don't match "POST /api/v1/payments" prefix
    it('should skip PUT requests (not in idempotent endpoints list)', async () => {
      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'PUT',
        url: '/api/v1/payments/123',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId,
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBeUndefined();
    });

    it('should skip PATCH requests (not in idempotent endpoints list)', async () => {
      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'PATCH',
        url: '/api/v1/payments/123',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId,
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBeUndefined();
    });
  });

  // ===========================================================================
  // ENDPOINT FILTERING
  // ===========================================================================
  describe('endpoint filtering', () => {
    it('should require idempotency key for POST /api/v1/payments', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: {},
        tenantId,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow();
    });

    it('should require idempotency key for POST /api/v1/refunds', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/refunds',
        headers: {},
        tenantId,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow();
    });

    it('should require idempotency key for POST /api/v1/transfers', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/transfers',
        headers: {},
        tenantId,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow();
    });

    it('should require idempotency key for POST /api/v1/escrow', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/escrow',
        headers: {},
        tenantId,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow();
    });

    it('should skip non-idempotent endpoints', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/webhooks',
        headers: {},
        tenantId,
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBeUndefined();
    });
  });

  // ===========================================================================
  // IDEMPOTENCY KEY VALIDATION
  // ===========================================================================
  describe('idempotency key validation', () => {
    it('should accept valid UUID format', async () => {
      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId,
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBe(idempotencyKey);
    });

    it('should accept valid alphanumeric format with hyphens', async () => {
      const idempotencyKey = 'payment-request-12345678';
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId,
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect((mockRequest as any).idempotencyKey).toBe(idempotencyKey);
    });

    it('should reject key that is too short', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': 'short' },
        tenantId,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow();
    });

    it('should reject key with invalid characters', async () => {
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': 'invalid key with spaces!' },
        tenantId,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // CACHED RESPONSE
  // ===========================================================================
  describe('cached response', () => {
    it('should return cached response for completed request', async () => {
      const idempotencyKey = uuidv4();
      const path = '/api/v1/payments';
      const body = { amount: 1000 };
      const fingerprint = buildFingerprint('POST', path, body);
      const cacheKey = buildCacheKey(idempotencyKey, 'default', path);

      // Pre-populate cache with completed response
      const cachedRecord = {
        key: idempotencyKey,
        status: 'completed',
        statusCode: 201,
        responseBody: { id: 'payment_123', status: 'succeeded' },
        requestFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedisData.set(cacheKey, JSON.stringify(cachedRecord));

      const mockRequest = createMockRequest({
        method: 'POST',
        url: path,
        headers: { 'idempotency-key': idempotencyKey },
        tenantId: 'default',
        body,
      });
      const { reply, getSentResponse, getHeaders } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      expect(reply.status).toHaveBeenCalledWith(201);
      expect(getSentResponse()).toEqual(cachedRecord.responseBody);
      expect(getHeaders()['X-Idempotent-Replay']).toBe('true');
    });

    it('should throw ConflictError for request already processing', async () => {
      const idempotencyKey = uuidv4();
      const path = '/api/v1/payments';
      const body = { amount: 1000 };
      const fingerprint = buildFingerprint('POST', path, body);
      const cacheKey = buildCacheKey(idempotencyKey, 'default', path);

      // Pre-populate cache with processing status
      const processingRecord = {
        key: idempotencyKey,
        status: 'processing',
        requestFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedisData.set(cacheKey, JSON.stringify(processingRecord));

      const mockRequest = createMockRequest({
        method: 'POST',
        url: path,
        headers: { 'idempotency-key': idempotencyKey },
        tenantId: 'default',
        body,
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow('already being processed');
    });
  });

  // ===========================================================================
  // REQUEST FINGERPRINTING
  // ===========================================================================
  describe('request fingerprinting', () => {
    it('should throw ConflictError when key reused with different request', async () => {
      const idempotencyKey = uuidv4();
      const path = '/api/v1/payments';
      const originalBody = { amount: 1000 };
      const originalFingerprint = buildFingerprint('POST', path, originalBody);
      const cacheKey = buildCacheKey(idempotencyKey, 'default', path);

      // Pre-populate cache with original request fingerprint
      const cachedRecord = {
        key: idempotencyKey,
        status: 'completed',
        statusCode: 201,
        responseBody: { id: 'payment_123' },
        requestFingerprint: originalFingerprint,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedisData.set(cacheKey, JSON.stringify(cachedRecord));

      // Make request with DIFFERENT body
      const mockRequest = createMockRequest({
        method: 'POST',
        url: path,
        headers: { 'idempotency-key': idempotencyKey },
        tenantId: 'default',
        body: { amount: 9999, different: 'body' },
      });
      const { reply } = createMockReply();

      await expect(idempotencyMiddleware(mockRequest, reply)).rejects.toThrow('different request');
    });
  });

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================
  describe('utility functions', () => {
    it('generateNewIdempotencyKey should return valid key', () => {
      const key = generateNewIdempotencyKey();

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThanOrEqual(8);
    });

    it('checkIdempotencyStatus should return null for non-existent key', async () => {
      const result = await checkIdempotencyStatus(
        'non-existent-key',
        tenantId,
        '/api/v1/payments'
      );

      expect(result).toBeNull();
    });

    it('checkIdempotencyStatus should return record for existing key', async () => {
      const idempotencyKey = uuidv4();
      const path = '/api/v1/payments';
      const cacheKey = buildCacheKey(idempotencyKey, tenantId, path);

      const record = {
        key: idempotencyKey,
        status: 'completed',
        statusCode: 200,
        responseBody: { success: true },
        requestFingerprint: 'test',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedisData.set(cacheKey, JSON.stringify(record));

      const result = await checkIdempotencyStatus(
        idempotencyKey,
        tenantId,
        path
      );

      expect(result).toBeDefined();
      expect(result?.status).toBe('completed');
    });

    it('deleteIdempotencyRecord should remove record', async () => {
      const cacheKey = 'idem:payment:test:key';
      mockRedisData.set(cacheKey, JSON.stringify({ test: true }));

      await deleteIdempotencyRecord(cacheKey);

      expect(mockRedisData.has(cacheKey)).toBe(false);
    });
  });

  // ===========================================================================
  // ON RESPONSE HOOK
  // ===========================================================================
  describe('onResponseIdempotencyHook()', () => {
    it('should store completed response after handler succeeds', async () => {
      const idempotencyKey = uuidv4();
      const path = '/api/v1/payments';
      const cacheKey = buildCacheKey(idempotencyKey, tenantId, path);
      const fingerprint = 'test-fingerprint';

      // Pre-populate with processing record (simulating middleware ran first)
      const processingRecord = {
        key: idempotencyKey,
        status: 'processing',
        requestFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };
      mockRedisData.set(cacheKey, JSON.stringify(processingRecord));

      // Simulate request that went through middleware
      const mockRequest = createMockRequest({
        idempotencyKey,
        idempotencyCacheKey: cacheKey,
        requestFingerprint: fingerprint,
        responsePayload: { id: 'payment_123' },
      });

      const mockReply = {
        statusCode: 201,
      } as unknown as FastifyReply;

      await onResponseIdempotencyHook(mockRequest, mockReply);

      const stored = mockRedisData.get(cacheKey);
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed.status).toBe('completed');
      expect(parsed.statusCode).toBe(201);
    });

    it('should skip when no idempotency key on request', async () => {
      const mockRequest = createMockRequest({});
      const mockReply = {
        statusCode: 200,
      } as unknown as FastifyReply;

      // Should not throw
      await onResponseIdempotencyHook(mockRequest, mockReply);
    });

    it('should mark as failed for 5xx responses', async () => {
      const idempotencyKey = uuidv4();
      const cacheKey = `idem:payment:${tenantId}:/api/v1/payments:${idempotencyKey}`;
      const fingerprint = 'test-fingerprint';

      // Pre-populate with processing record
      mockRedisData.set(cacheKey, JSON.stringify({
        key: idempotencyKey,
        status: 'processing',
        requestFingerprint: fingerprint,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }));

      const mockRequest = createMockRequest({
        idempotencyKey,
        idempotencyCacheKey: cacheKey,
        requestFingerprint: fingerprint,
      });

      const mockReply = {
        statusCode: 500,
      } as unknown as FastifyReply;

      await onResponseIdempotencyHook(mockRequest, mockReply);

      const stored = mockRedisData.get(cacheKey);
      expect(stored).toBeDefined();

      const parsed = JSON.parse(stored!);
      expect(parsed.status).toBe('failed');
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should fail open when Redis throws error on read', async () => {
      mockRedisError = new Error('Redis connection failed');

      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId,
      });
      const { reply } = createMockReply();

      // Should not throw - fails open
      await idempotencyMiddleware(mockRequest, reply);

      // Middleware should continue without blocking
      expect(reply.status).not.toHaveBeenCalledWith(500);
    });
  });

  // ===========================================================================
  // TENANT SCOPING
  // ===========================================================================
  describe('tenant scoping', () => {
    it('should include tenant in cache key when provided', async () => {
      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': idempotencyKey },
        tenantId: 'my-tenant',
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      // Check that key includes tenant
      const keys = Array.from(mockRedisData.keys());
      const matchingKey = keys.find(k => k.includes('my-tenant'));
      expect(matchingKey).toBeDefined();
    });

    it('should use default tenant when not provided', async () => {
      const idempotencyKey = uuidv4();
      const mockRequest = createMockRequest({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { 'idempotency-key': idempotencyKey },
        // No tenantId - should default
      });
      const { reply } = createMockReply();

      await idempotencyMiddleware(mockRequest, reply);

      const keys = Array.from(mockRedisData.keys());
      const matchingKey = keys.find(k => k.includes('default'));
      expect(matchingKey).toBeDefined();
    });
  });
});
