/**
 * Idempotency Middleware Integration Tests
 * Comprehensive tests for all idempotency handling paths
 */

import Fastify, { FastifyInstance } from 'fastify';
import { idempotencyMiddleware, idempotencyCacheHook } from '../../../src/middleware/idempotency';
import { RedisService } from '../../../src/services/redisService';
import { v4 as uuidv4 } from 'uuid';

describe('Idempotency Middleware', () => {
  let app: FastifyInstance;
  const testUserId = uuidv4();
  const testTenantId = uuidv4();

  beforeAll(async () => {
    await RedisService.initialize();

    app = Fastify();

    const idempotency = idempotencyMiddleware({ ttlMs: 30000 });

    // Add mock authentication
    app.addHook('preHandler', async (request) => {
      // Allow override via headers for testing
      const mockUserId = request.headers['x-test-user-id'] as string;
      const mockTenantId = request.headers['x-test-tenant-id'] as string;

      if (mockUserId !== 'none') {
        (request as any).userId = mockUserId || testUserId;
        (request as any).user = {
          id: mockUserId || testUserId,
          sub: mockUserId || testUserId,
          tenantId: mockTenantId || testTenantId,
        };
      }
    });

    // Test route that returns success
    app.post('/idempotent', {
      preHandler: [idempotency],
    }, async (request, reply) => {
      const data = request.body as any;
      return {
        success: true,
        data: data?.value || 'processed',
        timestamp: Date.now(),
      };
    });

    // Test route that returns 201
    app.post('/idempotent-201', {
      preHandler: [idempotency],
    }, async (request, reply) => {
      reply.status(201);
      return { created: true, id: uuidv4() };
    });

    // Test route that returns client error (400)
    app.post('/idempotent-400', {
      preHandler: [idempotency],
    }, async (request, reply) => {
      reply.status(400);
      return { error: 'Bad request', code: 'BAD_REQUEST' };
    });

    // Test route that returns server error (500)
    app.post('/idempotent-500', {
      preHandler: [idempotency],
    }, async (request, reply) => {
      reply.status(500);
      return { error: 'Internal error', code: 'SERVER_ERROR' };
    });

    // Test route that throws error
    app.post('/idempotent-throws', {
      preHandler: [idempotency],
    }, async () => {
      throw new Error('Unexpected error');
    });

    // Test route with slow response
    app.post('/idempotent-slow', {
      preHandler: [idempotency],
    }, async () => {
      await new Promise(resolve => setTimeout(resolve, 200));
      return { success: true, slow: true };
    });

    // Register cache hook
    app.addHook('onSend', idempotencyCacheHook);

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up Redis keys before each test
    const redis = RedisService.getClient();
    const keys = await redis.keys('idempotency:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('Idempotency Key Validation', () => {
    describe('missing key', () => {
      it('should return 400 when idempotency key is missing', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          payload: { value: 'test' },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('IDEMPOTENCY_KEY_MISSING');
        expect(body.error).toBe('Idempotency-Key header required');
        expect(body.details).toContain('UUID');
      });

      it('should return proper error structure for missing key', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          payload: {},
        });

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('code');
        expect(body).toHaveProperty('details');
      });
    });

    describe('invalid key format', () => {
      it('should reject empty string', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '' },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('IDEMPOTENCY_KEY_MISSING');
      });

      it('should reject non-UUID string', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': 'not-a-uuid' },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('IDEMPOTENCY_KEY_INVALID');
        expect(body.error).toBe('Idempotency-Key must be a valid UUID');
      });

      it('should reject partial UUID', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '123e4567-e89b-12d3' },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('IDEMPOTENCY_KEY_INVALID');
      });

      it('should reject UUID with wrong format', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '123e4567e89b12d3a456426614174000' }, // no dashes
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('IDEMPOTENCY_KEY_INVALID');
      });

      it('should reject numeric value', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '12345678' },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('should reject special characters', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': 'key-with-$pecial-chars!' },
          payload: {},
        });

        expect(response.statusCode).toBe(400);
      });

      it('should provide helpful error message for invalid format', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': 'invalid' },
          payload: {},
        });

        const body = JSON.parse(response.body);
        expect(body.details).toContain('UUID v4');
      });
    });

    describe('valid key format', () => {
      it('should accept valid UUID v4', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': uuidv4() },
          payload: { value: 'test' },
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept lowercase UUID', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '123e4567-e89b-12d3-a456-426614174000' },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept uppercase UUID', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '123E4567-E89B-12D3-A456-426614174000' },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });

      it('should accept mixed case UUID', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/idempotent',
          headers: { 'idempotency-key': '123e4567-E89B-12d3-A456-426614174000' },
          payload: {},
        });

        expect(response.statusCode).toBe(200);
      });
    });
  });

  describe('Authentication Requirement', () => {
    it('should return 401 when user is not authenticated', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': uuidv4(),
          'x-test-user-id': 'none',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('AUTH_REQUIRED');
    });

    it('should accept request with userId from request.userId', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': uuidv4(),
          'x-test-user-id': 'user-from-userid',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
    });

    it('should scope by user - different users can use same key', async () => {
      const idempotencyKey = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': 'user-1',
          'x-test-tenant-id': 'tenant-1',
        },
        payload: { value: 'user1' },
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': 'user-2',
          'x-test-tenant-id': 'tenant-1',
        },
        payload: { value: 'user2' },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);

      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);
      expect(body1.data).toBe('user1');
      expect(body2.data).toBe('user2');
    });

    it('should scope by tenant - different tenants can use same key', async () => {
      const idempotencyKey = uuidv4();
      const userId = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
          'x-test-tenant-id': 'tenant-1',
        },
        payload: { value: 'tenant1' },
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
          'x-test-tenant-id': 'tenant-2',
        },
        payload: { value: 'tenant2' },
      });

      expect(response1.statusCode).toBe(200);
      expect(response2.statusCode).toBe(200);
    });
  });

  describe('Response Caching', () => {
    it('should return cached response for duplicate request', async () => {
      const idempotencyKey = uuidv4();
      const userId = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: { value: 'first' },
      });

      expect(response1.statusCode).toBe(200);
      const body1 = JSON.parse(response1.body);

      // Wait for cache to be set
      await new Promise(resolve => setTimeout(resolve, 100));

      const response2 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: { value: 'second' }, // Different payload
      });

      expect(response2.statusCode).toBe(200);
      const body2 = JSON.parse(response2.body);

      // Should return cached response (first value, not second)
      expect(body2.data).toBe('first');
      expect(body2.success).toBe(body1.success);
    });

    it('should return cached status code', async () => {
      const idempotencyKey = uuidv4();
      const userId = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent-201',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      expect(response1.statusCode).toBe(201);

      await new Promise(resolve => setTimeout(resolve, 100));

      const response2 = await app.inject({
        method: 'POST',
        url: '/idempotent-201',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      expect(response2.statusCode).toBe(201);
    });

    it('should cache 4xx errors to prevent retry', async () => {
      const idempotencyKey = uuidv4();
      const userId = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent-400',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      expect(response1.statusCode).toBe(400);

      await new Promise(resolve => setTimeout(resolve, 100));

      const response2 = await app.inject({
        method: 'POST',
        url: '/idempotent-400',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      expect(response2.statusCode).toBe(400);
      const body = JSON.parse(response2.body);
      expect(body.code).toBe('BAD_REQUEST');
    });

    it('should process different idempotency keys separately', async () => {
      const userId = uuidv4();

      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': uuidv4(),
          'x-test-user-id': userId,
        },
        payload: { value: 'request1' },
      });

      const response2 = await app.inject({
        method: 'POST',
        url: '/idempotent',
        headers: {
          'idempotency-key': uuidv4(),
          'x-test-user-id': userId,
        },
        payload: { value: 'request2' },
      });

      const body1 = JSON.parse(response1.body);
      const body2 = JSON.parse(response2.body);

      expect(body1.data).toBe('request1');
      expect(body2.data).toBe('request2');
      expect(body1.timestamp).not.toBe(body2.timestamp);
    });
  });

  describe('Concurrent Request Detection', () => {
    it('should return 409 for concurrent duplicate request', async () => {
      const idempotencyKey = uuidv4();
      const userId = uuidv4();

      // Start slow request (doesn't complete immediately)
      const slowRequestPromise = app.inject({
        method: 'POST',
        url: '/idempotent-slow',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      // Wait a bit for the first request to set in-progress marker
      await new Promise(resolve => setTimeout(resolve, 50));

      // Send concurrent request with same key
      const concurrentResponse = await app.inject({
        method: 'POST',
        url: '/idempotent-slow',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      expect(concurrentResponse.statusCode).toBe(409);
      const body = JSON.parse(concurrentResponse.body);
      expect(body.code).toBe('DUPLICATE_IN_PROGRESS');
      expect(body.error).toBe('Request already processing');

      // Wait for original request to complete
      await slowRequestPromise;
    });
  });

  describe('5xx Error Handling (Allow Retry)', () => {
    it('should delete key after 5xx error to allow retry', async () => {
      const idempotencyKey = uuidv4();
      const userId = uuidv4();

      // Manually set up a test route that sometimes returns 500
      let callCount = 0;
      
      // First call should fail with 500
      const response1 = await app.inject({
        method: 'POST',
        url: '/idempotent-500',
        headers: {
          'idempotency-key': idempotencyKey,
          'x-test-user-id': userId,
        },
        payload: {},
      });

      expect(response1.statusCode).toBe(500);

      // Wait for cache hook to delete the key
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify key was deleted by checking Redis directly
      const redis = RedisService.getClient();
      const key = `idempotency:${userId}:${userId}:${idempotencyKey}`;
      const cached = await redis.get(key);
      
      // Key should be deleted after 5xx
      expect(cached).toBeNull();
    });
  });

  describe('Request Object Modification', () => {
    it('should attach idempotencyKey to request', async () => {
      let capturedKey: string | undefined;

      const testApp = Fastify();
      const idempotency = idempotencyMiddleware({ ttlMs: 30000 });

      testApp.addHook('preHandler', async (request) => {
        (request as any).userId = 'test-user';
        (request as any).user = { tenantId: 'test-tenant' };
      });

      testApp.post('/capture', {
        preHandler: [idempotency],
      }, async (request) => {
        capturedKey = (request as any).idempotencyKey;
        return { captured: true };
      });

      await testApp.ready();

      const key = uuidv4();
      await testApp.inject({
        method: 'POST',
        url: '/capture',
        headers: { 'idempotency-key': key },
        payload: {},
      });

      expect(capturedKey).toBe(key);

      await testApp.close();
    });

    it('should attach idempotencyRedisKey to request', async () => {
      let capturedRedisKey: string | undefined;

      const testApp = Fastify();
      const idempotency = idempotencyMiddleware({ ttlMs: 30000 });

      testApp.addHook('preHandler', async (request) => {
        (request as any).userId = 'test-user';
        (request as any).user = { tenantId: 'test-tenant' };
      });

      testApp.post('/capture-redis-key', {
        preHandler: [idempotency],
      }, async (request) => {
        capturedRedisKey = (request as any).idempotencyRedisKey;
        return { captured: true };
      });

      await testApp.ready();

      const key = uuidv4();
      await testApp.inject({
        method: 'POST',
        url: '/capture-redis-key',
        headers: { 'idempotency-key': key },
        payload: {},
      });

      expect(capturedRedisKey).toBeDefined();
      expect(capturedRedisKey).toContain('idempotency:');
      expect(capturedRedisKey).toContain(key);

      await testApp.close();
    });
  });
});

describe('idempotencyCacheHook', () => {
  let app: FastifyInstance;
  const testUserId = uuidv4();

  beforeAll(async () => {
    await RedisService.initialize();

    app = Fastify();

    app.addHook('preHandler', async (request) => {
      (request as any).userId = testUserId;
      (request as any).user = { tenantId: testUserId };
    });

    // Route that manually sets idempotency redis key
    app.post('/manual-key', async (request, reply) => {
      (request as any).idempotencyRedisKey = `idempotency:${testUserId}:${testUserId}:manual-key`;
      return { success: true };
    });

    // Route without idempotency key
    app.post('/no-key', async () => {
      return { success: true };
    });

    // Route that returns string payload
    app.post('/string-payload', async (request, reply) => {
      (request as any).idempotencyRedisKey = `idempotency:${testUserId}:${testUserId}:string-key`;
      reply.type('text/plain');
      return 'plain text response';
    });

    app.addHook('onSend', idempotencyCacheHook);

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should skip caching when no idempotency key present', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/no-key',
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    // No error should occur
  });

  it('should return payload unchanged', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/manual-key',
      payload: {},
    });

    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });

  it('should handle string payload', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/string-payload',
      payload: {},
    });

    // Should not throw error
    expect(response.statusCode).toBe(200);
  });
});
