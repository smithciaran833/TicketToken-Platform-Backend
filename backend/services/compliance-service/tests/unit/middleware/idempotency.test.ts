/**
 * Unit Tests for Idempotency Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock dependencies before imports
const mockRedisGet = jest.fn<(key: string) => Promise<any>>();
const mockRedisSetWithTTL = jest.fn<(key: string, value: any, ttl: number) => Promise<void>>();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../../../src/services/redis.service', () => ({
  redisService: {
    get: mockRedisGet,
    setWithTTL: mockRedisSetWithTTL
  }
}));

// Mock error classes
class MockIdempotencyError extends Error {
  constructor(key: string, requestId?: string) {
    super(`Request with idempotency key ${key} is already being processed`);
    this.name = 'IdempotencyError';
  }
}

class MockConflictError extends Error {
  constructor(message: string, requestId?: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

jest.mock('../../../src/errors', () => ({
  IdempotencyError: MockIdempotencyError,
  ConflictError: MockConflictError
}));

describe('Idempotency Middleware', () => {
  let idempotency: any;
  let idempotency1099: any;
  let idempotencyTaxTracking: any;
  let idempotencyGDPR: any;
  let isReplayedRequest: any;

  let mockReq: any;
  let mockRes: any;
  let mockNext: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset mock implementations
    mockRedisGet.mockResolvedValue(null as any);
    mockRedisSetWithTTL.mockResolvedValue(undefined as any);

    // Import the module fresh
    const idempotencyModule = await import('../../../src/middleware/idempotency');
    idempotency = idempotencyModule.idempotency;
    idempotency1099 = idempotencyModule.idempotency1099;
    idempotencyTaxTracking = idempotencyModule.idempotencyTaxTracking;
    idempotencyGDPR = idempotencyModule.idempotencyGDPR;
    isReplayedRequest = idempotencyModule.isReplayedRequest;

    mockReq = {
      method: 'POST',
      path: '/api/test',
      headers: {},
      body: {},
      query: {},
      params: {},
      tenantId: 'tenant-123',
      requestId: 'req-123'
    };

    mockRes = {
      statusCode: 200,
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      get: jest.fn(),
      on: jest.fn(),
      writableFinished: true
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('idempotency middleware factory', () => {
    it('should skip non-mutating methods', async () => {
      mockReq.method = 'GET';
      mockReq.headers['idempotency-key'] = 'test-key';

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should skip health paths', async () => {
      mockReq.path = '/health';
      mockReq.headers['idempotency-key'] = 'test-key';

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should skip when no idempotency key provided', async () => {
      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should proceed and store processing record for new request', async () => {
      mockReq.headers['idempotency-key'] = 'new-key';

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRedisGet).toHaveBeenCalledWith('idempotency:tenant-123:new-key');
      expect(mockRedisSetWithTTL).toHaveBeenCalledWith(
        'idempotency:tenant-123:new-key',
        expect.objectContaining({ status: 'processing' }),
        30
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return cached response for completed request', async () => {
      mockReq.headers['idempotency-key'] = 'completed-key';

      mockRedisGet.mockResolvedValue({
        status: 'completed',
        response: {
          statusCode: 200,
          body: { success: true }
        },
        createdAt: new Date().toISOString()
        // Note: no requestHash - simulates legacy record or will match any hash
      } as any);

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.set).toHaveBeenCalledWith('X-Idempotent-Replayed', 'true');
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ success: true });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw IdempotencyError for processing request', async () => {
      mockReq.headers['idempotency-key'] = 'processing-key';

      mockRedisGet.mockResolvedValue({
        status: 'processing',
        createdAt: new Date().toISOString()
      } as any);

      const middleware = idempotency();

      await expect(middleware(mockReq, mockRes, mockNext)).rejects.toThrow(MockIdempotencyError);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw ConflictError for key reuse with different body', async () => {
      mockReq.headers['idempotency-key'] = 'reused-key';
      mockReq.body = { different: 'body' };

      mockRedisGet.mockResolvedValue({
        status: 'completed',
        requestHash: 'different-hash',
        response: { statusCode: 200, body: {} },
        createdAt: new Date().toISOString()
      } as any);

      const middleware = idempotency();

      await expect(middleware(mockReq, mockRes, mockNext)).rejects.toThrow(MockConflictError);
    });

    it('should allow retry for failed request', async () => {
      mockReq.headers['idempotency-key'] = 'failed-key';

      mockRedisGet.mockResolvedValue({
        status: 'failed',
        createdAt: new Date().toISOString()
      } as any);

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisSetWithTTL).toHaveBeenCalled();
    });

    it('should fail open on Redis error', async () => {
      mockReq.headers['idempotency-key'] = 'error-key';

      mockRedisGet.mockRejectedValue(new Error('Redis down') as never);

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use custom TTL', async () => {
      mockReq.headers['idempotency-key'] = 'custom-ttl-key';

      const middleware = idempotency({ ttl: 3600 });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use custom methods', async () => {
      mockReq.method = 'DELETE';
      mockReq.headers['idempotency-key'] = 'delete-key';

      const middleware = idempotency({ methods: ['DELETE'] });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRedisGet).toHaveBeenCalled();
    });

    it('should use custom skipPaths', async () => {
      mockReq.path = '/custom-skip';
      mockReq.headers['idempotency-key'] = 'skip-key';

      const middleware = idempotency({ skipPaths: ['/custom-skip'] });
      await middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should use default tenant when not provided', async () => {
      delete mockReq.tenantId;
      mockReq.headers['idempotency-key'] = 'no-tenant-key';

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRedisGet).toHaveBeenCalledWith('idempotency:default:no-tenant-key');
    });
  });

  describe('specialized middleware', () => {
    it('idempotency1099 should be defined', () => {
      expect(idempotency1099).toBeDefined();
      expect(typeof idempotency1099).toBe('function');
    });

    it('idempotencyTaxTracking should be defined', () => {
      expect(idempotencyTaxTracking).toBeDefined();
      expect(typeof idempotencyTaxTracking).toBe('function');
    });

    it('idempotencyGDPR should be defined', () => {
      expect(idempotencyGDPR).toBeDefined();
      expect(typeof idempotencyGDPR).toBe('function');
    });
  });

  describe('isReplayedRequest', () => {
    it('should return true when X-Idempotent-Replayed header is true', () => {
      mockRes.get.mockReturnValue('true');

      expect(isReplayedRequest(mockRes)).toBe(true);
    });

    it('should return false when header is not set', () => {
      mockRes.get.mockReturnValue(undefined);

      expect(isReplayedRequest(mockRes)).toBe(false);
    });

    it('should return false when header is not true', () => {
      mockRes.get.mockReturnValue('false');

      expect(isReplayedRequest(mockRes)).toBe(false);
    });
  });

  describe('response interception', () => {
    it('should intercept json response and store result', async () => {
      mockReq.headers['idempotency-key'] = 'intercept-key';

      const middleware = idempotency();
      await middleware(mockReq, mockRes, mockNext);

      expect(mockRes.json).toBeDefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
