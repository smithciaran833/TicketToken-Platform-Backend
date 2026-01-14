/**
 * Rate Limiter Middleware Unit Tests
 * 
 * Tests for:
 * - Rate limiting based on IP
 * - Custom key generators
 * - Skip conditions
 * - Request allowance when under limit
 * - 429 responses when over limit
 * - Error handling (graceful degradation)
 */

import { createRateLimiter, rateLimiter } from '../../../src/middleware/rate-limiter';
import { RedisService } from '../../../src/services/redisService';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/services/redisService');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('Rate Limiter Middleware', () => {
  let mockRedisClient: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedisClient = {
      incr: jest.fn(),
      expire: jest.fn(),
    };

    (RedisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);

    mockRequest = {
      ip: '192.168.1.1',
      url: '/api/payments',
      headers: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  // ===========================================================================
  // createRateLimiter
  // ===========================================================================

  describe('createRateLimiter', () => {
    describe('request allowance', () => {
      it('should allow request when under limit', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.incr).toHaveBeenCalledWith('rate-limit:192.168.1.1');
        expect(mockRedisClient.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 60);
        expect(mockReply.code).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('should allow request at limit boundary', async () => {
        mockRedisClient.incr.mockResolvedValue(100);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should set expire only on first request in window', async () => {
        mockRedisClient.incr.mockResolvedValue(5); // Not the first request

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.incr).toHaveBeenCalled();
        expect(mockRedisClient.expire).not.toHaveBeenCalled();
      });
    });

    describe('rate limit enforcement', () => {
      it('should return 429 when over limit', async () => {
        mockRedisClient.incr.mockResolvedValue(101);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.code).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Too many requests' });
      });

      it('should use custom error message', async () => {
        mockRedisClient.incr.mockResolvedValue(11);

        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 10,
          message: 'Rate limit exceeded. Please try again later.',
        });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Rate limit exceeded. Please try again later.',
        });
      });

      it('should return 429 for significantly over limit', async () => {
        mockRedisClient.incr.mockResolvedValue(1000);

        const limiter = createRateLimiter({ windowMs: 60000, max: 10 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.code).toHaveBeenCalledWith(429);
      });
    });

    describe('custom key generator', () => {
      it('should use custom key generator', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const customKeyGenerator = jest.fn((req: FastifyRequest) => `user:${(req as any).userId}`);
        (mockRequest as any).userId = 'user-123';

        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 100,
          keyGenerator: customKeyGenerator,
        });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(customKeyGenerator).toHaveBeenCalledWith(mockRequest);
        expect(mockRedisClient.incr).toHaveBeenCalledWith('rate-limit:user:user-123');
      });

      it('should support API key based rate limiting', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const apiKeyGenerator = (req: FastifyRequest) => {
          const apiKey = req.headers['x-api-key'] as string;
          return apiKey || req.ip;
        };

        mockRequest.headers = { 'x-api-key': 'api-key-abc123' };

        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 1000,
          keyGenerator: apiKeyGenerator,
        });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.incr).toHaveBeenCalledWith('rate-limit:api-key-abc123');
      });
    });

    describe('skip functionality', () => {
      it('should skip rate limiting when skip returns true', async () => {
        const skipFn = jest.fn(() => true);

        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 100,
          skip: skipFn,
        });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(skipFn).toHaveBeenCalledWith(mockRequest);
        expect(mockRedisClient.incr).not.toHaveBeenCalled();
        expect(mockReply.code).not.toHaveBeenCalled();
      });

      it('should not skip when skip returns false', async () => {
        mockRedisClient.incr.mockResolvedValue(1);
        const skipFn = jest.fn(() => false);

        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 100,
          skip: skipFn,
        });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(skipFn).toHaveBeenCalled();
        expect(mockRedisClient.incr).toHaveBeenCalled();
      });

      it('should skip internal health check requests', async () => {
        const skipFn = (req: FastifyRequest) => req.url.startsWith('/health');
        mockRequest.url = '/health/live';

        const limiter = createRateLimiter({
          windowMs: 60000,
          max: 100,
          skip: skipFn,
        });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.incr).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should allow request when Redis fails (graceful degradation)', async () => {
        mockRedisClient.incr.mockRejectedValue(new Error('Redis connection failed'));

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        // Should not block the request
        expect(mockReply.code).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('should allow request when Redis times out', async () => {
        mockRedisClient.incr.mockRejectedValue(new Error('Connection timed out'));

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.code).not.toHaveBeenCalled();
      });
    });

    describe('window configuration', () => {
      it('should calculate expire time correctly for 60 second window', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 60);
      });

      it('should calculate expire time correctly for 5 minute window', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ windowMs: 300000, max: 500 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 300);
      });

      it('should handle sub-second windows (round up)', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ windowMs: 500, max: 5 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 1);
      });
    });

    describe('default values', () => {
      it('should use default windowMs of 60000ms', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ max: 100 } as any);
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 60);
      });

      it('should use default max of 100', async () => {
        mockRedisClient.incr.mockResolvedValue(101);

        const limiter = createRateLimiter({ windowMs: 60000 } as any);
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.code).toHaveBeenCalledWith(429);
      });

      it('should use default message', async () => {
        mockRedisClient.incr.mockResolvedValue(101);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockReply.send).toHaveBeenCalledWith({ error: 'Too many requests' });
      });

      it('should use IP as default key', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.incr).toHaveBeenCalledWith('rate-limit:192.168.1.1');
      });

      it('should not skip by default', async () => {
        mockRedisClient.incr.mockResolvedValue(1);

        const limiter = createRateLimiter({ windowMs: 60000, max: 100 });
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

        expect(mockRedisClient.incr).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // rateLimiter (backwards compatibility)
  // ===========================================================================

  describe('rateLimiter (backwards compatibility)', () => {
    it('should create limiter with name, max, and window seconds', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      const limiter = rateLimiter('payment-create', 50, 120);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.incr).toHaveBeenCalled();
    });

    it('should use custom message with name', async () => {
      mockRedisClient.incr.mockResolvedValue(51);

      const limiter = rateLimiter('payment-create', 50, 120);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Too many payment-create requests',
      });
    });

    it('should convert seconds to milliseconds', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      const limiter = rateLimiter('refund', 10, 60);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // 60 seconds = 60000ms, expire should be 60
      expect(mockRedisClient.expire).toHaveBeenCalledWith('rate-limit:192.168.1.1', 60);
    });
  });

  // ===========================================================================
  // RATE LIMITING SCENARIOS
  // ===========================================================================

  describe('rate limiting scenarios', () => {
    it('should handle burst traffic', async () => {
      const limiter = createRateLimiter({ windowMs: 60000, max: 10 });

      // Simulate burst of requests
      for (let i = 1; i <= 15; i++) {
        mockRedisClient.incr.mockResolvedValueOnce(i);
      }

      // First 10 should pass
      for (let i = 0; i < 10; i++) {
        await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      }
      expect(mockReply.code).not.toHaveBeenCalled();

      // 11th should be blocked
      jest.clearAllMocks();
      mockRedisClient.incr.mockResolvedValue(11);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.code).toHaveBeenCalledWith(429);
    });

    it('should rate limit different IPs independently', async () => {
      mockRedisClient.incr.mockResolvedValue(1);

      const limiter = createRateLimiter({ windowMs: 60000, max: 100 });

      // Request from IP 1
      mockRequest.ip = '192.168.1.1';
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate-limit:192.168.1.1');

      // Request from IP 2
      mockRequest.ip = '192.168.1.2';
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockRedisClient.incr).toHaveBeenCalledWith('rate-limit:192.168.1.2');
    });

    it('should handle concurrent requests', async () => {
      mockRedisClient.incr.mockResolvedValue(50);

      const limiter = createRateLimiter({ windowMs: 60000, max: 100 });

      // Simulate concurrent requests
      const promises = Array(10).fill(null).map(() =>
        limiter(mockRequest as FastifyRequest, mockReply as FastifyReply)
      );

      await Promise.all(promises);

      expect(mockRedisClient.incr).toHaveBeenCalledTimes(10);
    });
  });
});
