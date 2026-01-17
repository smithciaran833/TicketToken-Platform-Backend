/**
 * Unit Tests for Idempotency Middleware
 *
 * Tests the idempotency middleware including:
 * - Request deduplication via idempotency keys
 * - Redis and memory cache fallback
 * - Response caching and replay
 * - Processing state management
 * - Transfer-specific idempotency
 * - Metrics tracking
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import logger from '../../../src/utils/logger';

// Mock logger before importing idempotency
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock CacheService before importing
jest.mock('../../../src/services/cache.service');

import {
  idempotencyMiddleware,
  captureIdempotencyResponse,
  markIdempotencyFailed,
  clearIdempotencyEntry,
  getIdempotencyMetrics,
  generateTransferIdempotencyKey,
  checkTransferIdempotency
} from '../../../src/middleware/idempotency';
import { CacheService } from '../../../src/services/cache.service';

describe('Idempotency Middleware', () => {
  let mockLogger: jest.Mocked<typeof logger>;
  let mockCache: jest.Mocked<CacheService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let headerMock: jest.Mock;
  let codeMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = logger as jest.Mocked<typeof logger>;

    // Mock CacheService with proper implementations
    mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined)
    } as any;

    // Mock reply methods
    sendMock = jest.fn();
    headerMock = jest.fn().mockReturnThis();
    codeMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();

    // Update mockReply to return itself for chaining
    mockReply = {
      status: statusMock,
      code: codeMock,
      header: headerMock,
      send: sendMock
    };

    // Make status and code return mockReply for chaining
    statusMock.mockReturnValue(mockReply);
    codeMock.mockReturnValue(mockReply);

    mockRequest = {
      id: 'req-123',
      method: 'POST',
      url: '/api/v1/transfers',
      headers: {},
      tenantId: 'tenant-1',
      server: {
        cache: mockCache
      } as any
    };
  });

  // ===========================================================================
  // IDEMPOTENCY MIDDLEWARE TESTS
  // ===========================================================================

  describe('idempotencyMiddleware()', () => {
    it('should skip non-mutating requests (GET)', async () => {
      mockRequest.method = 'GET';
      mockRequest.headers = { 'idempotency-key': 'key-123' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should skip non-mutating requests (DELETE)', async () => {
      mockRequest.method = 'DELETE';
      mockRequest.headers = { 'idempotency-key': 'key-123' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow POST requests without idempotency key', async () => {
      mockRequest.method = 'POST';
      mockRequest.headers = {};

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).not.toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should allow PUT requests without idempotency key', async () => {
      mockRequest.method = 'PUT';
      mockRequest.headers = {};

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should allow PATCH requests without idempotency key', async () => {
      mockRequest.method = 'PATCH';
      mockRequest.headers = {};

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should reject idempotency key that is too short', async () => {
      mockRequest.headers = { 'idempotency-key': 'short' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Invalid Idempotency-Key header. Must be 16-128 characters.',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
    });

    it('should reject idempotency key that is too long', async () => {
      mockRequest.headers = { 'idempotency-key': 'a'.repeat(129) };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Invalid Idempotency-Key header. Must be 16-128 characters.',
        code: 'INVALID_IDEMPOTENCY_KEY'
      });
    });

    it('should accept valid idempotency key (16 chars)', async () => {
      mockRequest.headers = { 'idempotency-key': 'a'.repeat(16) };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should accept valid idempotency key (128 chars)', async () => {
      mockRequest.headers = { 'idempotency-key': 'a'.repeat(128) };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should create processing entry for new idempotency key', async () => {
      const idempotencyKey = 'key-123-unique';
      mockRequest.headers = { 'idempotency-key': idempotencyKey };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.get).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.objectContaining({
          status: 'processing',
          requestId: 'req-123',
          tenantId: 'tenant-1',
          endpoint: '/api/v1/transfers',
          method: 'POST'
        }),
        expect.any(Number)
      );
      expect(mockRequest.idempotencyKey).toBe(idempotencyKey);
      expect(mockRequest.idempotencyCacheKey).toContain(idempotencyKey);
    });

    it('should return 409 if request is still processing', async () => {
      const idempotencyKey = 'key-processing';
      mockRequest.headers = { 'idempotency-key': idempotencyKey };

      mockCache.get.mockResolvedValue({
        requestId: 'req-original',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST'
      });

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-Idempotent-Status', 'processing');
      expect(statusMock).toHaveBeenCalledWith(409);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Request with this Idempotency-Key is still being processed',
        code: 'IDEMPOTENCY_CONFLICT',
        retryAfter: 5
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Duplicate request while still processing',
        expect.any(Object)
      );
    });

    it('should return cached response for completed request', async () => {
      const idempotencyKey = 'key-completed';
      const cachedResponse = {
        statusCode: 201,
        body: { id: 'transfer-123', status: 'completed' }
      };

      mockRequest.headers = { 'idempotency-key': idempotencyKey };

      const createdAt = Date.now() - 5000;
      mockCache.get.mockResolvedValue({
        requestId: 'req-original',
        status: 'completed',
        response: cachedResponse,
        createdAt,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST',
        transferId: 'transfer-123'
      });

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
      expect(headerMock).toHaveBeenCalledWith(
        'X-Idempotent-Original-Timestamp',
        new Date(createdAt).toISOString()
      );
      expect(headerMock).toHaveBeenCalledWith('X-Idempotent-Original-Request-Id', 'req-original');
      expect(headerMock).toHaveBeenCalledWith('X-Transfer-Id', 'transfer-123');
      expect(codeMock).toHaveBeenCalledWith(201);
      expect(sendMock).toHaveBeenCalledWith(cachedResponse.body);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Returning cached response for idempotent request',
        expect.any(Object)
      );
    });

    it('should not include X-Transfer-Id header if transferId is not present', async () => {
      const idempotencyKey = 'key-no-transfer-id';
      const cachedResponse = {
        statusCode: 200,
        body: { success: true }
      };

      mockRequest.headers = { 'idempotency-key': idempotencyKey };

      mockCache.get.mockResolvedValue({
        requestId: 'req-original',
        status: 'completed',
        response: cachedResponse,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST'
      });

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
      expect(headerMock).not.toHaveBeenCalledWith('X-Transfer-Id', expect.anything());
    });

    it('should allow retry for failed request', async () => {
      const idempotencyKey = 'key-failed';
      mockRequest.headers = { 'idempotency-key': idempotencyKey };

      mockCache.get.mockResolvedValue({
        requestId: 'req-failed',
        status: 'failed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST'
      });

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Previous idempotent request failed, allowing retry',
        expect.any(Object)
      );
      expect(mockCache.delete).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          status: 'processing'
        }),
        expect.any(Number)
      );
    });

    it('should use anonymous tenant if tenantId not provided', async () => {
      mockRequest.tenantId = undefined;
      mockRequest.headers = { 'idempotency-key': 'key-anonymous' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('anonymous'),
        expect.objectContaining({
          tenantId: 'anonymous'
        }),
        expect.any(Number)
      );
    });

    it('should fallback to memory cache when Redis fails on get', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-redis-fail' };
      mockCache.get.mockRejectedValue(new Error('Redis connection failed'));

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis idempotency get error, using memory',
        expect.any(Object)
      );
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should fallback to memory cache when Redis fails on set', async () => {
      mockRequest.headers = { 'idempotency-key': 'key-redis-set-fail' };
      mockCache.set.mockRejectedValue(new Error('Redis set failed'));

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis idempotency set error, using memory',
        expect.any(Object)
      );
      // Should not throw error
    });

    it('should handle requests without cache service', async () => {
      mockRequest.server = {} as any; // No cache
      mockRequest.headers = { 'idempotency-key': 'key-no-cache' };

      await idempotencyMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should use memory cache only
      expect(mockCache.get).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // CAPTURE RESPONSE TESTS
  // ===========================================================================

  describe('captureIdempotencyResponse()', () => {
    it('should capture successful response', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-123';
      mockRequest.idempotencyKey = 'key-123';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST'
      };

      const statusCode = 201;
      const body = { id: 'transfer-456', status: 'completed' };
      const transferId = 'transfer-456';

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        statusCode,
        body,
        transferId
      );

      expect(mockCache.set).toHaveBeenCalledWith(
        'cache-key-123',
        expect.objectContaining({
          status: 'completed',
          response: { statusCode, body },
          transferId: 'transfer-456'
        }),
        expect.any(Number)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cached idempotent response',
        expect.objectContaining({
          idempotencyKey: 'key-123',
          statusCode,
          transferId
        })
      );
    });

    it('should not capture response if no cache key', async () => {
      mockRequest.idempotencyCacheKey = undefined;

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        200,
        { success: true }
      );

      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should capture response without transferId', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-456';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/test',
        method: 'POST'
      };

      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        200,
        { data: 'test' }
      );

      expect(mockCache.set).toHaveBeenCalledWith(
        'cache-key-456',
        expect.objectContaining({
          status: 'completed',
          transferId: undefined
        }),
        expect.any(Number)
      );
    });

    it('should use current timestamp if createdAt not in entry', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-789';
      mockRequest.idempotencyEntry = undefined;

      const beforeTime = Date.now();
      await captureIdempotencyResponse(
        mockRequest as FastifyRequest,
        200,
        { success: true }
      );
      const afterTime = Date.now();

      const callArgs = mockCache.set.mock.calls[0];
      const entry = callArgs[1] as any;
      expect(entry.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(entry.createdAt).toBeLessThanOrEqual(afterTime);
    });
  });

  // ===========================================================================
  // MARK FAILED TESTS
  // ===========================================================================

  describe('markIdempotencyFailed()', () => {
    it('should mark request as failed', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-fail';
      mockRequest.idempotencyKey = 'key-fail';
      mockRequest.idempotencyEntry = {
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST'
      };

      const error = 'Validation error';

      await markIdempotencyFailed(
        mockRequest as FastifyRequest,
        error
      );

      expect(mockCache.set).toHaveBeenCalledWith(
        'cache-key-fail',
        expect.objectContaining({
          status: 'failed',
          response: {
            statusCode: 500,
            body: { error }
          }
        }),
        expect.any(Number)
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Marked idempotent request as failed',
        expect.objectContaining({
          idempotencyKey: 'key-fail',
          error
        })
      );
    });

    it('should not mark as failed if no cache key', async () => {
      mockRequest.idempotencyCacheKey = undefined;

      await markIdempotencyFailed(
        mockRequest as FastifyRequest,
        'Some error'
      );

      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // CLEAR ENTRY TESTS
  // ===========================================================================

  describe('clearIdempotencyEntry()', () => {
    it('should clear idempotency entry', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-clear';
      mockRequest.idempotencyKey = 'key-clear';

      await clearIdempotencyEntry(mockRequest as FastifyRequest);

      expect(mockCache.delete).toHaveBeenCalledWith('cache-key-clear');
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cleared idempotency entry',
        expect.objectContaining({
          idempotencyKey: 'key-clear'
        })
      );
    });

    it('should not clear if no cache key', async () => {
      mockRequest.idempotencyCacheKey = undefined;

      await clearIdempotencyEntry(mockRequest as FastifyRequest);

      expect(mockCache.delete).not.toHaveBeenCalled();
    });

    it('should handle Redis delete failure gracefully', async () => {
      mockRequest.idempotencyCacheKey = 'cache-key-delete-fail';
      mockCache.delete.mockRejectedValue(new Error('Redis delete failed'));

      await clearIdempotencyEntry(mockRequest as FastifyRequest);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis idempotency delete error',
        expect.any(Object)
      );
    });
  });

  // ===========================================================================
  // METRICS TESTS
  // ===========================================================================

  describe('getIdempotencyMetrics()', () => {
    it('should return metrics object', () => {
      const metrics = getIdempotencyMetrics();

      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('replays');
      expect(metrics).toHaveProperty('processing');
      expect(metrics).toHaveProperty('completed');
      expect(metrics).toHaveProperty('failed');
    });

    it('should return copy of metrics, not reference', () => {
      const metrics1 = getIdempotencyMetrics();
      const metrics2 = getIdempotencyMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1).toEqual(metrics2);
    });
  });

  // ===========================================================================
  // TRANSFER-SPECIFIC HELPERS
  // ===========================================================================

  describe('generateTransferIdempotencyKey()', () => {
    it('should generate idempotency key for transfer', () => {
      const ticketId = 'ticket-123';
      const fromUserId = 'user-456';
      const toUserId = 'user-789';

      const key = generateTransferIdempotencyKey(ticketId, fromUserId, toUserId);

      expect(key).toContain('transfer:');
      expect(key).toContain(ticketId);
      expect(key).toContain(fromUserId);
      expect(key).toContain(toUserId);
      expect(key.length).toBeGreaterThan(16);
    });

    it('should generate unique keys for same transfer at different times', async () => {
      const ticketId = 'ticket-123';
      const fromUserId = 'user-456';
      const toUserId = 'user-789';

      const key1 = generateTransferIdempotencyKey(ticketId, fromUserId, toUserId);
      // Wait to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 2));
      const key2 = generateTransferIdempotencyKey(ticketId, fromUserId, toUserId);

      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different transfers', () => {
      const key1 = generateTransferIdempotencyKey('ticket-1', 'user-a', 'user-b');
      const key2 = generateTransferIdempotencyKey('ticket-2', 'user-a', 'user-b');

      expect(key1).not.toBe(key2);
    });
  });

  describe('checkTransferIdempotency()', () => {
    it('should return not in progress if no entry exists', async () => {
      const result = await checkTransferIdempotency('ticket-123', 'tenant-1', mockCache);

      expect(result).toEqual({ inProgress: false });
    });

    it('should return in progress if transfer is processing', async () => {
      mockCache.get.mockResolvedValue({
        requestId: 'req-123',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST',
        transferId: 'transfer-456'
      });

      const result = await checkTransferIdempotency('ticket-123', 'tenant-1', mockCache);

      expect(result).toEqual({
        inProgress: true,
        transferId: 'transfer-456'
      });
    });

    it('should return not in progress if transfer is completed', async () => {
      mockCache.get.mockResolvedValue({
        requestId: 'req-123',
        status: 'completed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST',
        transferId: 'transfer-456'
      });

      const result = await checkTransferIdempotency('ticket-123', 'tenant-1', mockCache);

      expect(result).toEqual({
        inProgress: false,
        transferId: 'transfer-456'
      });
    });

    it('should return not in progress if transfer is failed', async () => {
      mockCache.get.mockResolvedValue({
        requestId: 'req-123',
        status: 'failed',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 1000000,
        tenantId: 'tenant-1',
        endpoint: '/api/v1/transfers',
        method: 'POST'
      });

      const result = await checkTransferIdempotency('ticket-123', 'tenant-1', mockCache);

      expect(result).toEqual({ inProgress: false });
    });

    it('should work without cache service', async () => {
      const result = await checkTransferIdempotency('ticket-123', 'tenant-1');

      expect(result).toEqual({ inProgress: false });
    });
  });
});
