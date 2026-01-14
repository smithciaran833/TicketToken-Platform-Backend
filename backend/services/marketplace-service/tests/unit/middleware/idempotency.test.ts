/**
 * Unit Tests for Idempotency Middleware
 * Tests request deduplication and cached response replay
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock cache
const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn()
};

jest.mock('../../../src/config/redis', () => ({
  cache: mockCache
}));

// Helper to create mock request
const createMockIdempotencyRequest = (options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  id?: string;
  tenantId?: string;
}) => ({
  method: options.method || 'POST',
  url: options.url || '/api/v1/listings',
  headers: options.headers || {},
  id: options.id || 'request-123',
  tenantId: options.tenantId
});

// Helper to create mock reply
const createMockIdempotencyReply = () => {
  const reply: any = {
    statusCode: 200,
    body: null,
    _headers: {} as Record<string, string>
  };
  reply.status = jest.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.code = jest.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = jest.fn((body: any) => {
    reply.body = body;
    return reply;
  });
  reply.header = jest.fn((name: string, value: string) => {
    reply._headers[name] = value;
    return reply;
  });
  return reply;
};

describe('Idempotency Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK');
    mockCache.del.mockResolvedValue(1);
  });

  describe('idempotencyMiddleware', () => {
    it('should skip GET requests', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'GET',
        headers: { 'idempotency-key': 'test-key-12345678' }
      });
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should skip DELETE requests', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'DELETE',
        headers: { 'idempotency-key': 'test-key-12345678' }
      });
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should skip if no idempotency key provided', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST'
      });
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should reject invalid idempotency key (too short)', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'short' }
      });
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(400);
      expect(reply.body.code).toBe('INVALID_IDEMPOTENCY_KEY');
    });

    it('should check cache for existing entry', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' },
        tenantId: 'tenant-123'
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.get).toHaveBeenCalled();
    });

    it('should return 409 if request is still processing', async () => {
      mockCache.get.mockResolvedValue(JSON.stringify({
        requestId: 'other-request',
        status: 'processing',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000
      }));
      
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      });
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(reply.status).toHaveBeenCalledWith(409);
      expect(reply.body.code).toBe('IDEMPOTENCY_CONFLICT');
      expect(reply.header).toHaveBeenCalledWith('X-Idempotent-Status', 'processing');
    });

    it('should return cached response for completed request', async () => {
      const cachedResponse = {
        statusCode: 201,
        body: { id: 'listing-456', success: true }
      };
      
      mockCache.get.mockResolvedValue(JSON.stringify({
        requestId: 'original-request',
        status: 'completed',
        response: cachedResponse,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000
      }));
      
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      });
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(reply.code).toHaveBeenCalledWith(201);
      expect(reply.body).toEqual(cachedResponse.body);
      expect(reply.header).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
    });

    it('should allow retry for failed request', async () => {
      mockCache.get.mockResolvedValue(JSON.stringify({
        requestId: 'failed-request',
        status: 'failed',
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
        expiresAt: Date.now() + 86400000
      }));
      
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      // Should delete old entry and allow retry
      expect(mockCache.del).toHaveBeenCalled();
      expect(request.idempotencyCacheKey).toBeDefined();
    });

    it('should mark new request as processing', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"status":"processing"'),
        expect.any(Number)
      );
      expect(request.idempotencyCacheKey).toBeDefined();
      expect(request.idempotencyKey).toBe('test-key-1234567890');
    });

    it('should apply to PUT requests', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'PUT',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should apply to PATCH requests', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'PATCH',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.set).toHaveBeenCalled();
    });
  });

  describe('captureIdempotencyResponse', () => {
    it('should skip if no cache key', async () => {
      const { captureIdempotencyResponse } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({});
      
      await captureIdempotencyResponse(request, 200, { success: true });
      
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should cache response with completed status', async () => {
      const { captureIdempotencyResponse } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({}) as any;
      request.idempotencyCacheKey = 'test-cache-key';
      request.idempotencyKey = 'test-key';
      request.idempotencyEntry = { createdAt: Date.now() - 100 };
      
      await captureIdempotencyResponse(request, 201, { id: 'new-listing' });
      
      expect(mockCache.set).toHaveBeenCalledWith(
        'test-cache-key',
        expect.stringContaining('"status":"completed"'),
        expect.any(Number)
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"statusCode":201'),
        expect.any(Number)
      );
    });
  });

  describe('markIdempotencyFailed', () => {
    it('should skip if no cache key', async () => {
      const { markIdempotencyFailed } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({});
      
      await markIdempotencyFailed(request, 'Test error');
      
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('should mark entry as failed', async () => {
      const { markIdempotencyFailed } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({}) as any;
      request.idempotencyCacheKey = 'test-cache-key';
      request.idempotencyKey = 'test-key';
      
      await markIdempotencyFailed(request, 'Database error');
      
      expect(mockCache.set).toHaveBeenCalledWith(
        'test-cache-key',
        expect.stringContaining('"status":"failed"'),
        expect.any(Number)
      );
    });
  });

  describe('clearIdempotencyEntry', () => {
    it('should skip if no cache key', async () => {
      const { clearIdempotencyEntry } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({});
      
      await clearIdempotencyEntry(request);
      
      expect(mockCache.del).not.toHaveBeenCalled();
    });

    it('should delete cache entry', async () => {
      const { clearIdempotencyEntry } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({}) as any;
      request.idempotencyCacheKey = 'test-cache-key';
      request.idempotencyKey = 'test-key';
      
      await clearIdempotencyEntry(request);
      
      expect(mockCache.del).toHaveBeenCalledWith('test-cache-key');
    });
  });

  describe('getIdempotencyMetrics', () => {
    it('should return metrics', () => {
      const { getIdempotencyMetrics } = require('../../../src/middleware/idempotency');
      
      const metrics = getIdempotencyMetrics();
      
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('replays');
      expect(metrics).toHaveProperty('processing');
      expect(metrics).toHaveProperty('completed');
      expect(metrics).toHaveProperty('failed');
    });
  });

  describe('error handling', () => {
    it('should use memory cache on Redis get error', async () => {
      mockCache.get.mockRejectedValue(new Error('Redis unavailable'));
      
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      // Should not throw
      await idempotencyMiddleware(request, reply);
      
      expect(request.idempotencyCacheKey).toBeDefined();
    });

    it('should use memory cache on Redis set error', async () => {
      mockCache.set.mockRejectedValue(new Error('Redis unavailable'));
      
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      // Should not throw
      await idempotencyMiddleware(request, reply);
      
      expect(request.idempotencyCacheKey).toBeDefined();
    });
  });

  describe('tenant isolation', () => {
    it('should include tenant ID in cache key', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' },
        tenantId: 'tenant-abc'
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('tenant-abc'),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should use anonymous for requests without tenant', async () => {
      const { idempotencyMiddleware } = require('../../../src/middleware/idempotency');
      
      const request = createMockIdempotencyRequest({
        method: 'POST',
        headers: { 'idempotency-key': 'test-key-1234567890' }
      }) as any;
      const reply = createMockIdempotencyReply();
      
      await idempotencyMiddleware(request, reply);
      
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining('anonymous'),
        expect.any(String),
        expect.any(Number)
      );
    });
  });
});
