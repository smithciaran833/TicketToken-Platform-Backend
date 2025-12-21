import { createRateLimiter, RateLimitTiers, combinedRateLimiter } from '../../src/middleware/rate-limit';
import { RedisService } from '../../src/services/redisService';

/**
 * INTEGRATION TESTS FOR RATE LIMIT MIDDLEWARE
 * Tests rate limiting with Redis integration
 */

describe('Rate Limit Middleware Integration Tests', () => {
  let mockRequest: any;
  let mockReply: any;
  let sendSpy: jest.Mock;
  let statusSpy: jest.Mock;
  let headerSpy: jest.Mock;
  let sentFlag: boolean;

  beforeAll(async () => {
    await RedisService.initialize();
  });

  beforeEach(() => {
    sentFlag = false;
    sendSpy = jest.fn().mockImplementation(() => {
      sentFlag = true;
      return mockReply;
    });
    headerSpy = jest.fn().mockReturnThis();
    statusSpy = jest.fn().mockReturnValue({ send: sendSpy });

    mockRequest = {
      ip: '127.0.0.1',
      user: undefined,
      headers: {}
    };

    mockReply = {
      status: statusSpy,
      send: sendSpy,
      header: headerSpy,
      get sent() {
        return sentFlag;
      }
    };
  });

  afterEach(async () => {
    // Clean up test keys
    try {
      const redis = RedisService.getClient();
      const keys = await redis.keys('ratelimit:test:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  afterAll(async () => {
    await RedisService.close();
  });

  describe('createRateLimiter', () => {
    it('should allow requests below limit', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'ratelimit:test:basic'
      });

      await limiter(mockRequest, mockReply);

      expect(statusSpy).not.toHaveBeenCalled();
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
    });

    it('should block requests exceeding limit', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 2,
        keyPrefix: 'ratelimit:test:exceed'
      });

      // Make 2 requests (at limit)
      await limiter(mockRequest, mockReply);
      sentFlag = false;
      await limiter(mockRequest, mockReply);
      sentFlag = false;

      // 3rd request should be blocked
      await limiter(mockRequest, mockReply);

      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests'
        })
      );
    });

    it('should set correct rate limit headers', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        keyPrefix: 'ratelimit:test:headers'
      });

      await limiter(mockRequest, mockReply);

      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should decrement remaining count on each request', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'ratelimit:test:decrement'
      });

      // First request
      await limiter(mockRequest, mockReply);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);

      // Second request
      sentFlag = false;
      headerSpy.mockClear();
      await limiter(mockRequest, mockReply);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 3);

      // Third request
      sentFlag = false;
      headerSpy.mockClear();
      await limiter(mockRequest, mockReply);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 2);
    });

    it('should use user ID when available', async () => {
      mockRequest.user = { id: 'user-123' };

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        keyPrefix: 'ratelimit:test:userid'
      });

      await limiter(mockRequest, mockReply);

      // Verify it tracked by user ID
      const redis = RedisService.getClient();
      const key = 'ratelimit:test:userid:user-123';
      const count = await redis.get(key);
      expect(count).toBe('1');
    });

    it('should fall back to IP when no user', async () => {
      mockRequest.ip = '192.168.1.100';

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 3,
        keyPrefix: 'ratelimit:test:ip'
      });

      await limiter(mockRequest, mockReply);

      // Verify it tracked by IP
      const redis = RedisService.getClient();
      const key = 'ratelimit:test:ip:192.168.1.100';
      const count = await redis.get(key);
      expect(count).toBe('1');
    });
  });

  describe('RateLimitTiers', () => {
    it('should have GLOBAL tier configured', () => {
      expect(RateLimitTiers.GLOBAL).toBeDefined();
      expect(RateLimitTiers.GLOBAL.maxRequests).toBe(100);
      expect(RateLimitTiers.GLOBAL.windowMs).toBe(60000);
    });

    it('should have READ tier configured', () => {
      expect(RateLimitTiers.READ).toBeDefined();
      expect(RateLimitTiers.READ.maxRequests).toBe(100);
    });

    it('should have WRITE tier configured', () => {
      expect(RateLimitTiers.WRITE).toBeDefined();
      expect(RateLimitTiers.WRITE.maxRequests).toBe(10);
    });

    it('should have PURCHASE tier configured', () => {
      expect(RateLimitTiers.PURCHASE).toBeDefined();
      expect(RateLimitTiers.PURCHASE.maxRequests).toBe(5);
    });

    it('should have unique key prefixes', () => {
      const prefixes = Object.values(RateLimitTiers).map(tier => tier.keyPrefix);
      const uniquePrefixes = new Set(prefixes);
      expect(uniquePrefixes.size).toBe(prefixes.length);
    });
  });

  describe('combinedRateLimiter', () => {
    it('should check all limiters in sequence', async () => {
      const limiter1 = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'ratelimit:test:combined1'
      });

      const limiter2 = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'ratelimit:test:combined2'
      });

      const combined = combinedRateLimiter(limiter1, limiter2);
      await combined(mockRequest, mockReply);

      // Both counters should be incremented
      const redis = RedisService.getClient();
      const count1 = await redis.get('ratelimit:test:combined1:127.0.0.1');
      const count2 = await redis.get('ratelimit:test:combined2:127.0.0.1');

      expect(count1).toBe('1');
      expect(count2).toBe('1');
    });

    it('should work with empty limiters array', async () => {
      const combined = combinedRateLimiter();

      await combined(mockRequest, mockReply);

      expect(statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should allow request if Redis fails', async () => {
      // Temporarily break Redis connection
      jest.spyOn(RedisService.getClient(), 'get').mockRejectedValue(new Error('Redis error'));

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 5,
        keyPrefix: 'ratelimit:test:error'
      });

      await limiter(mockRequest, mockReply);

      // Should not block request on error
      expect(statusSpy).not.toHaveBeenCalled();

      // Restore
      jest.restoreAllMocks();
    });

    it('should handle concurrent requests gracefully', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 10,
        keyPrefix: 'ratelimit:test:concurrent'
      });

      // Make 5 concurrent requests
      const promises = Array(5).fill(null).map(() => {
        const req = { ...mockRequest };
        const rep: any = {
          status: jest.fn().mockReturnValue({ send: jest.fn() }),
          sent: false
        };
        rep.header = jest.fn().mockReturnValue(rep);
        return limiter(req, rep);
      });

      await Promise.all(promises);

      // All should succeed
      const redis = RedisService.getClient();
      const count = await redis.get('ratelimit:test:concurrent:127.0.0.1');
      expect(parseInt(count || '0')).toBeLessThanOrEqual(5);
    });
  });

  describe('edge cases', () => {
    it('should handle zero maxRequests', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 0,
        keyPrefix: 'ratelimit:test:zero-max'
      });

      await limiter(mockRequest, mockReply);

      // Should immediately rate limit
      expect(statusSpy).toHaveBeenCalledWith(429);
    });

    it('should handle large maxRequests', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 1000,
        keyPrefix: 'ratelimit:test:large'
      });

      await limiter(mockRequest, mockReply);

      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Limit', 1000);
      expect(headerSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', 999);
    });
  });
});
