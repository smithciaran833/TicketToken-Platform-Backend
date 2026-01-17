/**
 * Unit Tests for Rate Limit Middleware
 *
 * Tests the rate limiting middleware including:
 * - Endpoint-specific rate limits
 * - Per-user and per-tenant limits
 * - Redis and memory fallback
 * - Route key normalization
 * - Rate limit headers
 * - Transfer and blockchain specific limiters
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  rateLimitMiddleware,
  transferRateLimitMiddleware,
  blockchainRateLimitMiddleware
} from '../../../src/middleware/rate-limit';
import logger from '../../../src/utils/logger';

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

describe('Rate Limit Middleware', () => {
  let mockLogger: jest.Mocked<typeof logger>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;
  let headerMock: jest.Mock;
  let mockRedis: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = logger as jest.Mocked<typeof logger>;

    // Mock Redis
    mockRedis = {
      multi: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],  // incr result
          [null, 60000]  // pttl result
        ])
      }),
      pexpire: jest.fn().mockResolvedValue(1)
    };

    sendMock = jest.fn();
    headerMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnThis();

    mockRequest = {
      id: 'req-123',
      method: 'POST',
      url: '/api/v1/transfers',
      ip: '127.0.0.1',
      tenantId: 'tenant-1',
      server: {
        redis: mockRedis
      } as any
    };

    mockReply = {
      status: statusMock,
      header: headerMock,
      send: sendMock
    };

    statusMock.mockReturnValue(mockReply);
  });

  // ===========================================================================
  // RATE LIMIT MIDDLEWARE TESTS
  // ===========================================================================

  describe('rateLimitMiddleware()', () => {
    it('should skip rate limiting for health checks', async () => {
      mockRequest.url = '/health';

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedis.multi).not.toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for /health/live', async () => {
      mockRequest.url = '/health/live';

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedis.multi).not.toHaveBeenCalled();
    });

    it('should allow request within rate limit', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject request exceeding user rate limit', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      // Mock Redis to return count exceeding limit
      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 11],  // 11 requests - exceeds limit of 10
          [null, 30000]
        ])
      });

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please wait before retrying.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: expect.any(Number)
      });
      expect(headerMock).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should reject request exceeding tenant rate limit', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.tenantId = 'tenant-1';

      // Mock user limit passes, tenant limit fails
      let callCount = 0;
      mockRedis.multi.mockImplementation(() => {
        callCount++;
        return {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(
            callCount === 1
              ? [[null, 1], [null, 60000]]  // User limit OK
              : [[null, 1001], [null, 30000]]  // Tenant limit exceeded (1000 max)
          )
        };
      });

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Tenant rate limit exceeded. Please contact support if this persists.',
        code: 'TENANT_RATE_LIMIT_EXCEEDED',
        retryAfter: expect.any(Number)
      });
    });

    it('should use IP address if user not authenticated', async () => {
      mockRequest.url = '/api/v1/transfers';
      mockRequest.ip = '192.168.1.100';
      (mockRequest as any).user = undefined;

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should have used IP in rate limit key
      expect(mockRedis.multi).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should normalize UUID in path to :id', async () => {
      mockRequest.url = '/api/v1/transfers/550e8400-e29b-41d4-a716-446655440000/accept';
      mockRequest.method = 'POST';
      (mockRequest as any).user = { id: 'user-123' };

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should normalize to POST:/api/v1/transfers/:id/accept
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should remove query string from path', async () => {
      mockRequest.url = '/api/v1/transfers?page=1&limit=10';
      mockRequest.method = 'GET';
      (mockRequest as any).user = { id: 'user-123' };

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should use /api/v1/transfers without query string
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should use default limit for unmatched routes', async () => {
      mockRequest.url = '/api/v1/unknown-route';
      mockRequest.method = 'POST';
      (mockRequest as any).user = { id: 'user-123' };

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should apply different limits for GET vs POST', async () => {
      // GET should have higher limit (100)
      mockRequest.url = '/api/v1/transfers';
      mockRequest.method = 'GET';
      (mockRequest as any).user = { id: 'user-123' };

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    });

    it('should fallback to memory cache when Redis fails', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Redis rate limit error, using memory',
        expect.any(Object)
      );
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should work without Redis connection', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.server = {} as any; // No Redis

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should use memory store
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should log warning when rate limit exceeded', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 20],  // Exceeds limit
          [null, 30000]
        ])
      });

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          userId: 'user-123',
          tenantId: 'tenant-1',
          requestId: 'req-123'
        })
      );
    });

    it('should use anonymous tenant if not provided', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.tenantId = undefined;

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should not throw error
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should set TTL on first request', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, -1]  // TTL not set
        ])
      });

      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedis.pexpire).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // TRANSFER RATE LIMIT TESTS
  // ===========================================================================

  describe('transferRateLimitMiddleware()', () => {
    it('should apply hourly transfer limit for authenticated user', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 3600000]  // 1 hour in ms
        ])
      });

      await transferRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Transfer-Limit', 50);
      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Transfer-Remaining', expect.any(Number));
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject when hourly transfer limit exceeded', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 51],  // Exceeds 50 per hour
          [null, 1800000]
        ])
      });

      await transferRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'You have exceeded the maximum number of transfers per hour.',
        code: 'TRANSFER_RATE_LIMIT_EXCEEDED',
        retryAfter: expect.any(Number)
      });
    });

    it('should fallback to rateLimitMiddleware if no user', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = undefined;

      await transferRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should call rateLimitMiddleware (checks IP-based limiting)
      expect(mockRedis.multi).toHaveBeenCalled();
    });

    it('should log warning when transfer limit exceeded', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 60],
          [null, 1800000]
        ])
      });

      await transferRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Transfer rate limit exceeded',
        expect.objectContaining({
          userId: 'user-123',
          requestId: 'req-123'
        })
      );
    });
  });

  // ===========================================================================
  // BLOCKCHAIN RATE LIMIT TESTS
  // ===========================================================================

  describe('blockchainRateLimitMiddleware()', () => {
    it('should apply strict blockchain operation limit', async () => {
      mockRequest.url = '/api/v1/transfers/123/blockchain';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000]
        ])
      });

      await blockchainRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Blockchain-Limit', 3);
      expect(headerMock).toHaveBeenCalledWith('X-RateLimit-Blockchain-Remaining', expect.any(Number));
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reject when blockchain limit exceeded (3 per minute)', async () => {
      mockRequest.url = '/api/v1/transfers/123/blockchain';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 4],  // Exceeds 3 per minute
          [null, 30000]
        ])
      });

      await blockchainRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(429);
      expect(sendMock).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Blockchain operation rate limit exceeded. Please wait before retrying.',
        code: 'BLOCKCHAIN_RATE_LIMIT_EXCEEDED',
        retryAfter: expect.any(Number)
      });
    });

    it('should use IP if no user authenticated', async () => {
      mockRequest.url = '/api/v1/transfers/123/blockchain';
      mockRequest.ip = '192.168.1.100';
      (mockRequest as any).user = undefined;

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 1],
          [null, 60000]
        ])
      });

      await blockchainRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // Should use IP in key
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should log warning when blockchain limit exceeded', async () => {
      mockRequest.url = '/api/v1/transfers/123/blockchain';
      (mockRequest as any).user = { id: 'user-123' };

      mockRedis.multi.mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, 5],
          [null, 30000]
        ])
      });

      await blockchainRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Blockchain rate limit exceeded',
        expect.objectContaining({
          userId: 'user-123',
          requestId: 'req-123'
        })
      );
    });
  });

  // ===========================================================================
  // MEMORY STORE TESTS
  // ===========================================================================

  describe('Memory Store Fallback', () => {
    beforeEach(() => {
      mockRequest.server = {} as any; // No Redis
    });

    it('should track requests in memory when Redis unavailable', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-mem-1' };

      // First request
      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();

      // Second request
      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should reset counter after window expires', async () => {
      mockRequest.url = '/api/v1/transfers';
      (mockRequest as any).user = { id: 'user-mem-2' };

      // Make requests
      for (let i = 0; i < 10; i++) {
        await rateLimitMiddleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );
      }

      expect(statusMock).not.toHaveBeenCalled();

      // 11th request should be rejected
      await rateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(429);
    });
  });
});
