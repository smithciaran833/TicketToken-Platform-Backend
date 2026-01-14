/**
 * Unit tests for src/middleware/idempotency.middleware.ts
 * Tests idempotency for state-changing operations
 * Security: SC1-SC5 (Idempotency key handling)
 */

import { idempotency, storeIdempotencyResponse, IDEMPOTENCY_TTL_SECONDS } from '../../../src/middleware/idempotency.middleware';
import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';
import { createRedisMock } from '../../__mocks__/redis.mock';

// Mock the logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn(() => ({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Mock crypto for fingerprint generation
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn().mockReturnValue('mock_fingerprint'),
  })),
}));

describe('middleware/idempotency.middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockRedis: any;
  const { logger } = require('../../../src/utils/logger');

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = createRedisMock();
    mockReply = createMockReply();
  });

  describe('idempotency() factory', () => {
    describe('method filtering', () => {
      it('should skip GET requests', async () => {
        mockRequest = createMockRequest({
          method: 'GET',
          headers: { 'idempotency-key': 'test-key' },
        });

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRedis.get).not.toHaveBeenCalled();
      });

      it('should skip DELETE requests', async () => {
        mockRequest = createMockRequest({
          method: 'DELETE',
          headers: { 'idempotency-key': 'test-key' },
        });

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRedis.get).not.toHaveBeenCalled();
      });

      it('should process POST requests', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');
        mockRedis.setex.mockResolvedValue('OK');
        
        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRedis.get).toHaveBeenCalled();
      });

      it('should process PUT requests', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');
        mockRedis.setex.mockResolvedValue('OK');
        
        mockRequest = createMockRequest({
          method: 'PUT',
          url: '/venues/123',
          body: { name: 'Updated Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRedis.get).toHaveBeenCalled();
      });

      it('should process PATCH requests', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');
        mockRedis.setex.mockResolvedValue('OK');
        
        mockRequest = createMockRequest({
          method: 'PATCH',
          url: '/venues/123',
          body: { status: 'active' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRedis.get).toHaveBeenCalled();
      });
    });

    describe('idempotency key requirement', () => {
      it('should return 400 when key required but missing', async () => {
        mockRequest = createMockRequest({
          method: 'POST',
          headers: {},
        });

        const middleware = idempotency('venue', { required: true });
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(400);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Idempotency-Key header is required for this operation',
            code: 'IDEMPOTENCY_KEY_REQUIRED',
          })
        );
      });

      it('should skip when key not required and missing', async () => {
        mockRequest = createMockRequest({
          method: 'POST',
          headers: {},
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue', { required: false });
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
        expect(mockRedis.get).not.toHaveBeenCalled();
      });

      it('should skip when key not provided and no options set', async () => {
        mockRequest = createMockRequest({
          method: 'POST',
          headers: {},
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRedis.get).not.toHaveBeenCalled();
      });
    });

    describe('Redis availability', () => {
      it('should skip when Redis not available', async () => {
        mockRequest = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = null;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        // Should not fail - just logs warning and continues
        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should continue if Redis is undefined', async () => {
        mockRequest = createMockRequest({
          method: 'POST',
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container = { cradle: {} };

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });
    });

    describe('cached response handling', () => {
      it('should return cached completed response', async () => {
        const cachedRecord = {
          status: 'completed',
          statusCode: 201,
          response: { id: 'venue-123', name: 'Test Venue' },
          requestFingerprint: 'mock_fingerprint',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-Idempotency-Replayed', 'true');
        expect(mockReply.status).toHaveBeenCalledWith(201);
        expect(mockReply.send).toHaveBeenCalledWith({ id: 'venue-123', name: 'Test Venue' });
      });

      it('should use default 200 status when statusCode not stored', async () => {
        const cachedRecord = {
          status: 'completed',
          response: { success: true },
          requestFingerprint: 'mock_fingerprint',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(200);
      });
    });

    describe('payload mismatch (SC1)', () => {
      it('should return 422 for payload mismatch', async () => {
        const cachedRecord = {
          status: 'completed',
          requestFingerprint: 'different_fingerprint',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Different Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(422);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Idempotency-Key has already been used with a different request',
            code: 'IDEMPOTENCY_KEY_CONFLICT',
          })
        );
      });

    });

    describe('processing status handling', () => {
      it('should return 409 when request still processing', async () => {
        const cachedRecord = {
          status: 'processing',
          requestFingerprint: 'mock_fingerprint',
        };
        mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(409);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Request with this Idempotency-Key is still being processed',
            code: 'IDEMPOTENCY_PROCESSING',
          })
        );
      });

      it('should return 409 when lock cannot be acquired', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue(null); // Lock not acquired

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test Venue' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(409);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'IDEMPOTENCY_PROCESSING',
          })
        );
      });
    });

    describe('new request processing', () => {
      it('should acquire lock and store processing record', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');
        mockRedis.setex.mockResolvedValue('OK');

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'New Venue' },
          headers: { 'idempotency-key': 'new-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        // Should acquire lock with NX and EX options
        expect(mockRedis.set).toHaveBeenCalledWith(
          expect.stringContaining(':lock'),
          '1',
          'NX',
          'EX',
          30
        );

        // Should store processing record
        expect(mockRedis.setex).toHaveBeenCalledWith(
          expect.stringContaining('idempotency:venue:new-key'),
          IDEMPOTENCY_TTL_SECONDS,
          expect.stringContaining('"status":"processing"')
        );
      });

      it('should store idempotency metadata on request', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.set.mockResolvedValue('OK');
        mockRedis.setex.mockResolvedValue('OK');

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        expect(mockRequest.idempotencyKey).toBe('test-key');
        expect(mockRequest.idempotencyRedisKey).toContain('idempotency:venue:test-key');
        expect(mockRequest.idempotencyLockKey).toContain(':lock');
        expect(mockRequest.idempotencyFingerprint).toBeDefined();
      });
    });

    describe('error handling', () => {
      it('should not block request on Redis errors', async () => {
        mockRedis.get.mockRejectedValue(new Error('Redis connection failed'));

        mockRequest = createMockRequest({
          method: 'POST',
          url: '/venues',
          body: { name: 'Test' },
          headers: { 'idempotency-key': 'test-key' },
        });
        mockRequest.server.container.cradle.redis = mockRedis;

        const middleware = idempotency('venue');
        await middleware(mockRequest, mockReply);

        // Should not set error status
        expect(mockReply.status).not.toHaveBeenCalled();
        // Logger error called internally - request continues without blocking
      });
    });
  });

  describe('storeIdempotencyResponse()', () => {
    it('should store completed response', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.idempotencyKey = 'test-key';
      mockRequest.idempotencyRedisKey = 'idempotency:venue:test-key';
      mockRequest.idempotencyLockKey = 'idempotency:venue:test-key:lock';
      mockRequest.idempotencyFingerprint = 'fingerprint';
      mockRequest.server.container.cradle.redis = mockRedis;

      mockReply.statusCode = 201;
      (mockReply as any).payload = JSON.stringify({ id: 'venue-123' });

      await storeIdempotencyResponse(mockRequest, mockReply);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotency:venue:test-key',
        IDEMPOTENCY_TTL_SECONDS,
        expect.stringContaining('"status":"completed"')
      );
    });

    it('should store failed response when statusCode >= 400', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.idempotencyKey = 'test-key';
      mockRequest.idempotencyRedisKey = 'idempotency:venue:test-key';
      mockRequest.idempotencyLockKey = 'idempotency:venue:test-key:lock';
      mockRequest.idempotencyFingerprint = 'fingerprint';
      mockRequest.server.container.cradle.redis = mockRedis;

      mockReply.statusCode = 400;
      (mockReply as any).payload = JSON.stringify({ error: 'Bad request' });

      await storeIdempotencyResponse(mockRequest, mockReply);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotency:venue:test-key',
        IDEMPOTENCY_TTL_SECONDS,
        expect.stringContaining('"status":"failed"')
      );
    });

    it('should release lock after storing response', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.idempotencyKey = 'test-key';
      mockRequest.idempotencyRedisKey = 'idempotency:venue:test-key';
      mockRequest.idempotencyLockKey = 'idempotency:venue:test-key:lock';
      mockRequest.idempotencyFingerprint = 'fingerprint';
      mockRequest.server.container.cradle.redis = mockRedis;

      mockReply.statusCode = 200;
      (mockReply as any).payload = JSON.stringify({ success: true });

      await storeIdempotencyResponse(mockRequest, mockReply);

      expect(mockRedis.del).toHaveBeenCalledWith('idempotency:venue:test-key:lock');
    });

    it('should skip when no idempotency key on request', async () => {
      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.server.container.cradle.redis = mockRedis;

      await storeIdempotencyResponse(mockRequest, mockReply);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should skip when Redis not available', async () => {
      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.idempotencyKey = 'test-key';
      mockRequest.idempotencyRedisKey = 'idempotency:venue:test-key';
      mockRequest.server.container.cradle.redis = null;

      await storeIdempotencyResponse(mockRequest, mockReply);

      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it('should handle errors during storage', async () => {
      mockRedis.setex.mockRejectedValue(new Error('Redis error'));
      mockRedis.del.mockResolvedValue(1);

      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.idempotencyKey = 'test-key';
      mockRequest.idempotencyRedisKey = 'idempotency:venue:test-key';
      mockRequest.idempotencyLockKey = 'idempotency:venue:test-key:lock';
      mockRequest.idempotencyFingerprint = 'fingerprint';
      mockRequest.server.container.cradle.redis = mockRedis;

      mockReply.statusCode = 200;
      (mockReply as any).payload = JSON.stringify({ success: true });

      // Should not throw
      await storeIdempotencyResponse(mockRequest, mockReply);

      // Should try to release lock even on error
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle null payload', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      mockRequest = createMockRequest({ method: 'POST' });
      mockRequest.idempotencyKey = 'test-key';
      mockRequest.idempotencyRedisKey = 'idempotency:venue:test-key';
      mockRequest.idempotencyLockKey = 'idempotency:venue:test-key:lock';
      mockRequest.idempotencyFingerprint = 'fingerprint';
      mockRequest.server.container.cradle.redis = mockRedis;

      mockReply.statusCode = 204;
      (mockReply as any).payload = null;

      await storeIdempotencyResponse(mockRequest, mockReply);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'idempotency:venue:test-key',
        IDEMPOTENCY_TTL_SECONDS,
        expect.stringContaining('"response":null')
      );
    });
  });

  describe('IDEMPOTENCY_TTL_SECONDS constant', () => {
    it('should be 86400 seconds (24 hours)', () => {
      expect(IDEMPOTENCY_TTL_SECONDS).toBe(86400);
    });
  });

  describe('security tests (SC1-SC5)', () => {
    it('should use resource-specific keys to prevent cross-resource conflicts (SC2)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.setex.mockResolvedValue('OK');

      mockRequest = createMockRequest({
        method: 'POST',
        url: '/venues',
        body: { name: 'Test' },
        headers: { 'idempotency-key': 'same-key' },
      });
      mockRequest.server.container.cradle.redis = mockRedis;

      // First request to 'venue' resource
      const venueMiddleware = idempotency('venue');
      await venueMiddleware(mockRequest, mockReply);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.stringContaining('idempotency:venue:'),
        expect.any(Number),
        expect.any(String)
      );
    });

    it('should validate fingerprint to prevent replay attacks (SC3)', async () => {
      const cachedRecord = {
        status: 'completed',
        response: { id: '123' },
        requestFingerprint: 'original_fingerprint',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(cachedRecord));

      mockRequest = createMockRequest({
        method: 'POST',
        url: '/different-url',
        body: { differentBody: true },
        headers: { 'idempotency-key': 'test-key' },
      });
      mockRequest.server.container.cradle.redis = mockRedis;

      const middleware = idempotency('venue');
      await middleware(mockRequest, mockReply);

      // Should detect the fingerprint mismatch
      expect(mockReply.status).toHaveBeenCalledWith(422);
    });

    it('should use atomic lock to prevent race conditions (SC4)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.setex.mockResolvedValue('OK');

      mockRequest = createMockRequest({
        method: 'POST',
        url: '/venues',
        body: { name: 'Test' },
        headers: { 'idempotency-key': 'test-key' },
      });
      mockRequest.server.container.cradle.redis = mockRedis;

      const middleware = idempotency('venue');
      await middleware(mockRequest, mockReply);

      // Should use NX (only set if not exists) for atomic locking
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        'NX',
        'EX',
        30
      );
    });

    it('should expire records to prevent storage exhaustion (SC5)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.setex.mockResolvedValue('OK');

      mockRequest = createMockRequest({
        method: 'POST',
        url: '/venues',
        body: { name: 'Test' },
        headers: { 'idempotency-key': 'test-key' },
      });
      mockRequest.server.container.cradle.redis = mockRedis;

      const middleware = idempotency('venue');
      await middleware(mockRequest, mockReply);

      // Should use TTL for expiration
      expect(mockRedis.setex).toHaveBeenCalledWith(
        expect.any(String),
        IDEMPOTENCY_TTL_SECONDS,
        expect.any(String)
      );
    });
  });
});
