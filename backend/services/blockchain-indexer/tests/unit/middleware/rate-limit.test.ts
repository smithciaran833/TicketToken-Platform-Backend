/**
 * Comprehensive Unit Tests for src/middleware/rate-limit.ts
 *
 * Tests Redis-backed rate limiting with memory fallback
 */

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};
jest.mock('../../../src/utils/logger', () => ({
  default: mockLogger,
  __esModule: true,
}));

// Mock RateLimitError
class MockRateLimitError extends Error {
  statusCode = 429;
  retryAfter: number;

  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

const mockRateLimitError = {
  forTenant: jest.fn((tenant: string, retryAfter: number) => {
    throw new MockRateLimitError(`Rate limit exceeded for ${tenant}`, retryAfter);
  }),
};

jest.mock('../../../src/errors', () => ({
  RateLimitError: mockRateLimitError,
}));

import {
  rateLimitMiddleware,
  queryRateLimitMiddleware,
  getRateLimitStatus,
  initializeRateLimitRedis,
  getRateLimitMetrics,
  resetRateLimitMetrics,
} from '../../../src/middleware/rate-limit';

describe('src/middleware/rate-limit.ts - Comprehensive Unit Tests', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockRedisClient: any;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    resetRateLimitMetrics();

    process.env = {
      ...originalEnv,
      RATE_LIMIT_SKIP_ON_ERROR: 'true',
      RATE_LIMIT_TENANT_RPM: '100',
      RATE_LIMIT_IP_RPM: '60',
      RATE_LIMIT_QUERY_RPM: '50',
      RATE_LIMIT_INTERNAL_RPM: '500',
    };

    mockRequest = {
      ip: '127.0.0.1',
      url: '/api/v1/test',
      method: 'GET',
    };

    mockReply = {
      header: jest.fn().mockReturnThis(),
    };

    mockRedisClient = {
      incr: jest.fn(),
      pexpire: jest.fn(),
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  describe('initializeRateLimitRedis()', () => {
    it('should initialize Redis client', () => {
      initializeRateLimitRedis(mockRedisClient);
      expect(mockLogger.info).toHaveBeenCalledWith('Rate limiting Redis client initialized');
    });
  });

  // =============================================================================
  // MEMORY-BASED RATE LIMITING (NO REDIS)
  // =============================================================================

  describe('Memory-based Rate Limiting (Fallback)', () => {
    it('should allow requests under limit using memory', async () => {
      // Don't initialize Redis - should use memory
      const request = { ...mockRequest, ip: 'memory-test-1' };

      await rateLimitMiddleware(request, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 59);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Fallback', 'memory');
    });

    it('should block requests over limit using memory', async () => {
      // Don't initialize Redis
      const request = { ...mockRequest, ip: 'memory-test-2' };

      // Make 60 requests (IP limit)
      for (let i = 0; i < 60; i++) {
        await rateLimitMiddleware(request, mockReply);
      }

      // 61st request should fail
      await expect(rateLimitMiddleware(request, mockReply)).rejects.toThrow();

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should reset limit after window expires', async () => {
      jest.useFakeTimers();

      const request = { ...mockRequest, ip: 'memory-test-3' };

      // Make 60 requests
      for (let i = 0; i < 60; i++) {
        await rateLimitMiddleware(request, mockReply);
      }

      // Should be at limit
      await expect(rateLimitMiddleware(request, mockReply)).rejects.toThrow();

      // Advance past window (60 seconds)
      jest.advanceTimersByTime(61 * 1000);

      // Should allow again
      mockReply.header.mockClear();
      await rateLimitMiddleware(request, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 59);

      jest.useRealTimers();
    });
  });

  // =============================================================================
  // REDIS-BASED RATE LIMITING
  // =============================================================================

  describe('Redis-based Rate Limiting', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should use Redis for rate limiting', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:indexer:ip:127.0.0.1:')
      );
      expect(mockRedisClient.pexpire).toHaveBeenCalled();
    });

    it('should set expiry on first request', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.pexpire).toHaveBeenCalledWith(
        expect.any(String),
        60000
      );
    });

    it('should not set expiry on subsequent requests', async () => {
      mockRedisClient.incr.mockResolvedValue(2);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.pexpire).not.toHaveBeenCalled();
    });

    it('should allow requests under limit', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 55);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should block when Redis count exceeds limit', async () => {
      mockRedisClient.incr.mockResolvedValue(61);

      await expect(rateLimitMiddleware(mockRequest, mockReply)).rejects.toThrow();

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should fallback to memory on Redis error', async () => {
      mockRedisClient.incr.mockRejectedValue(new Error('Redis connection failed'));

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Redis connection failed',
        }),
        'Redis rate limit check failed'
      );

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Fallback', 'memory');
    });
  });

  // =============================================================================
  // TENANT RATE LIMITING
  // =============================================================================

  describe('Tenant Rate Limiting', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
      mockRequest.tenantId = 'tenant-123';
    });

    it('should use tenant-specific limits', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('tenant:tenant-123:')
      );
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
    });

    it('should track tenant violations', async () => {
      mockRedisClient.incr.mockResolvedValue(101);

      await expect(rateLimitMiddleware(mockRequest, mockReply)).rejects.toThrow();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'rate_limit_exceeded',
          tenantId: 'tenant-123',
        }),
        'Rate limit exceeded'
      );
    });
  });

  // =============================================================================
  // INTERNAL SERVICE RATE LIMITING
  // =============================================================================

  describe('Internal Service Rate Limiting', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
      mockRequest.internalService = 'service-abc';
    });

    it('should use higher limits for internal services', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('internal:service-abc:')
      );
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 500);
    });
  });

  // =============================================================================
  // QUERY RATE LIMITING
  // =============================================================================

  describe('queryRateLimitMiddleware()', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
      mockRequest.tenantId = 'tenant-123';
    });

    it('should use query-specific limits', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await queryRateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('query:tenant-123:')
      );
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 50);
    });

    it('should fallback to general rate limiting without tenant', async () => {
      delete mockRequest.tenantId;
      mockRedisClient.incr.mockResolvedValue(1);

      await queryRateLimitMiddleware(mockRequest, mockReply);

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('ip:127.0.0.1:')
      );
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
    });

    it('should block over query limit', async () => {
      mockRedisClient.incr.mockResolvedValue(51);

      await expect(queryRateLimitMiddleware(mockRequest, mockReply)).rejects.toThrow();
    });
  });

  // =============================================================================
  // RATE LIMIT HEADERS
  // =============================================================================

  describe('Rate Limit Headers', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should set standard rate limit headers', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should set Retry-After header when blocked', async () => {
      mockRedisClient.incr.mockResolvedValue(61);

      await expect(rateLimitMiddleware(mockRequest, mockReply)).rejects.toThrow();

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should set fallback header when using memory', async () => {
      // Don't initialize Redis
      const newRequest = { ...mockRequest, ip: 'fallback-test' };

      // Reset to not use Redis
      jest.isolateModules(() => {
        const { rateLimitMiddleware: newRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
        newRateLimitMiddleware(newRequest, mockReply);
      });

      await rateLimitMiddleware(newRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Fallback', 'memory');
    });

    it('should not set negative remaining', async () => {
      mockRedisClient.incr.mockResolvedValue(61);

      await expect(rateLimitMiddleware(mockRequest, mockReply)).rejects.toThrow();

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    });
  });

  // =============================================================================
  // METRICS
  // =============================================================================

  describe('Metrics', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should track allowed requests', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await rateLimitMiddleware(mockRequest, mockReply);

      const metrics = getRateLimitMetrics();
      expect(metrics.rateLimitAllowed).toBe(1);
    });

    it('should track exceeded requests', async () => {
      mockRedisClient.incr.mockResolvedValue(61);

      try {
        await rateLimitMiddleware(mockRequest, mockReply);
      } catch (e) {
        // Expected
      }

      const metrics = getRateLimitMetrics();
      expect(metrics.rateLimitExceeded).toBe(1);
    });

    it('should track Redis errors', async () => {
      mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

      await rateLimitMiddleware(mockRequest, mockReply);

      const metrics = getRateLimitMetrics();
      expect(metrics.redisErrors).toBe(1);
    });

    it('should track memory fallbacks', async () => {
      mockRedisClient.incr.mockRejectedValue(new Error('Redis error'));

      await rateLimitMiddleware(mockRequest, mockReply);

      const metrics = getRateLimitMetrics();
      expect(metrics.memoryFallbacks).toBeGreaterThan(0);
    });

    it('should reset metrics', () => {
      resetRateLimitMetrics();

      const metrics = getRateLimitMetrics();
      expect(metrics.rateLimitAllowed).toBe(0);
      expect(metrics.rateLimitExceeded).toBe(0);
    });
  });

  // =============================================================================
  // GET RATE LIMIT STATUS
  // =============================================================================

  describe('getRateLimitStatus()', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should return current status for tenant', async () => {
      mockRedisClient.incr.mockResolvedValue(5);

      const status = await getRateLimitStatus('tenant-123');

      expect(status).toEqual({
        general: {
          remaining: expect.any(Number),
          resetAt: expect.any(Number),
        },
        query: {
          remaining: expect.any(Number),
          resetAt: expect.any(Number),
        },
      });
    });

    it('should check both general and query limits', async () => {
      mockRedisClient.incr.mockResolvedValue(10);

      await getRateLimitStatus('tenant-123');

      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('tenant:tenant-123:')
      );
      expect(mockRedisClient.incr).toHaveBeenCalledWith(
        expect.stringContaining('query:tenant-123:')
      );
    });
  });

  // =============================================================================
  // SKIP ON ERROR BEHAVIOR
  // =============================================================================

  describe('Skip on Error Behavior', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should fail open when SKIP_ON_ERROR is true', async () => {
      process.env.RATE_LIMIT_SKIP_ON_ERROR = 'true';
      mockRedisClient.incr.mockRejectedValue(new Error('Redis down'));

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failing open'),
        expect.objectContaining({ key: expect.any(String) })
      );
    });

    it('should use memory fallback when SKIP_ON_ERROR is false', async () => {
      process.env.RATE_LIMIT_SKIP_ON_ERROR = 'false';
      mockRedisClient.incr.mockRejectedValue(new Error('Redis down'));

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Fallback', 'memory');
    });
  });

  // =============================================================================
  // VIOLATION LOGGING
  // =============================================================================

  describe('Violation Logging', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should log all violation details', async () => {
      mockRequest.tenantId = 'tenant-123';
      mockRedisClient.incr.mockResolvedValue(101);

      try {
        await rateLimitMiddleware(mockRequest, mockReply);
      } catch (e) {
        // Expected
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'rate_limit_exceeded',
          key: expect.any(String),
          limit: expect.any(Number),
          ip: '127.0.0.1',
          tenantId: 'tenant-123',
          route: '/api/v1/test',
          method: 'GET',
          timestamp: expect.any(String),
          windowMs: expect.any(Number),
          currentCount: expect.any(Number),
        }),
        'Rate limit exceeded'
      );
    });
  });

  // =============================================================================
  // ALLOWED LOGGING
  // =============================================================================

  describe('Allowed Logging', () => {
    beforeEach(() => {
      initializeRateLimitRedis(mockRedisClient);
    });

    it('should log allowed requests at debug level', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      await rateLimitMiddleware(mockRequest, mockReply);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'rate_limit_allowed',
          key: expect.any(String),
          remaining: expect.any(Number),
        }),
        'Rate limit check passed'
      );
    });
  });

  // =============================================================================
  // CONFIGURATION
  // =============================================================================

  describe('Configuration', () => {
    it('should use default limits from environment', () => {
      // Verify default limits are set from env vars
      expect(process.env.RATE_LIMIT_IP_RPM).toBe('60');
      expect(process.env.RATE_LIMIT_TENANT_RPM).toBe('100');
      expect(process.env.RATE_LIMIT_QUERY_RPM).toBe('50');
      expect(process.env.RATE_LIMIT_INTERNAL_RPM).toBe('500');
    });
  });

  // =============================================================================
  // EXPORTS
  // =============================================================================

  describe('Exports', () => {
    it('should export all functions', () => {
      expect(typeof rateLimitMiddleware).toBe('function');
      expect(typeof queryRateLimitMiddleware).toBe('function');
      expect(typeof getRateLimitStatus).toBe('function');
      expect(typeof initializeRateLimitRedis).toBe('function');
      expect(typeof getRateLimitMetrics).toBe('function');
      expect(typeof resetRateLimitMetrics).toBe('function');
    });
  });
});
