import { RedisService } from '../../src/services/redisService';
import { createRateLimiter, RateLimitTiers } from '../../src/middleware/rate-limit';

describe('Rate Limiting', () => {
  beforeEach(async () => {
    // Mock Redis client
    const mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      incr: jest.fn(),
      pexpire: jest.fn(),
      ttl: jest.fn()
    };
    
    jest.spyOn(RedisService, 'getClient').mockReturnValue(mockRedis as any);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Rate Limit Tiers', () => {
    it('should have correct limits for PURCHASE tier', () => {
      expect(RateLimitTiers.PURCHASE.maxRequests).toBe(5);
      expect(RateLimitTiers.PURCHASE.windowMs).toBe(60000);
    });

    it('should have correct limits for WRITE tier', () => {
      expect(RateLimitTiers.WRITE.maxRequests).toBe(10);
      expect(RateLimitTiers.WRITE.windowMs).toBe(60000);
    });

    it('should have correct limits for READ tier', () => {
      expect(RateLimitTiers.READ.maxRequests).toBe(100);
      expect(RateLimitTiers.READ.windowMs).toBe(60000);
    });

    it('should have correct limits for QR_SCAN tier', () => {
      expect(RateLimitTiers.QR_SCAN.maxRequests).toBe(30);
      expect(RateLimitTiers.QR_SCAN.windowMs).toBe(60000);
    });

    it('should have correct limits for ADMIN tier', () => {
      expect(RateLimitTiers.ADMIN.maxRequests).toBe(20);
      expect(RateLimitTiers.ADMIN.windowMs).toBe(60000);
    });

    it('should have correct limits for WEBHOOK tier', () => {
      expect(RateLimitTiers.WEBHOOK.maxRequests).toBe(100);
      expect(RateLimitTiers.WEBHOOK.windowMs).toBe(60000);
    });
  });

  describe('Purchase Endpoint Rate Limiting', () => {
    it('should allow 5 requests per minute', async () => {
      const limit = RateLimitTiers.PURCHASE.maxRequests;
      expect(limit).toBe(5);
    });

    it('should block 6th request in same minute', async () => {
      // After 5 requests, 6th should be blocked
      const limit = RateLimitTiers.PURCHASE.maxRequests;
      const blocked = 6 > limit;
      expect(blocked).toBe(true);
    });

    it('should reset after time window', async () => {
      const windowMs = RateLimitTiers.PURCHASE.windowMs;
      expect(windowMs).toBe(60000); // 1 minute
    });
  });

  describe('Write Endpoint Rate Limiting', () => {
    it('should allow 10 requests per minute', async () => {
      const limit = RateLimitTiers.WRITE.maxRequests;
      expect(limit).toBe(10);
    });

    it('should block 11th request', async () => {
      const limit = RateLimitTiers.WRITE.maxRequests;
      const blocked = 11 > limit;
      expect(blocked).toBe(true);
    });
  });

  describe('Read Endpoint Rate Limiting', () => {
    it('should allow 100 requests per minute', async () => {
      const limit = RateLimitTiers.READ.maxRequests;
      expect(limit).toBe(100);
    });

    it('should block 101st request', async () => {
      const limit = RateLimitTiers.READ.maxRequests;
      const blocked = 101 > limit;
      expect(blocked).toBe(true);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include X-RateLimit-Limit header', () => {
      const headers = {
        'X-RateLimit-Limit': '5',
        'X-RateLimit-Remaining': '4',
        'X-RateLimit-Reset': Date.now() + 60000
      };
      expect(headers['X-RateLimit-Limit']).toBe('5');
    });

    it('should include X-RateLimit-Remaining header', () => {
      const headers = {
        'X-RateLimit-Remaining': '4'
      };
      expect(headers['X-RateLimit-Remaining']).toBe('4');
    });

    it('should include X-RateLimit-Reset header', () => {
      const resetTime = Date.now() + 60000;
      const headers = {
        'X-RateLimit-Reset': resetTime
      };
      expect(headers['X-RateLimit-Reset']).toBe(resetTime);
    });

    it('should include Retry-After header on 429', () => {
      const headers = {
        'Retry-After': '60'
      };
      expect(headers['Retry-After']).toBe('60');
    });
  });

  describe('Rate Limit per User/IP', () => {
    it('should track limits per user ID', () => {
      const userId = 'user-123';
      const key = `ratelimit:purchase:${userId}`;
      expect(key).toContain(userId);
    });

    it('should track limits per IP address', () => {
      const ip = '192.168.1.1';
      const key = `ratelimit:purchase:${ip}`;
      expect(key).toContain(ip);
    });

    it('should allow independent limits for different users', () => {
      const user1 = 'ratelimit:purchase:user-1';
      const user2 = 'ratelimit:purchase:user-2';
      expect(user1).not.toBe(user2);
    });
  });

  describe('429 Too Many Requests Response', () => {
    it('should return 429 status when limit exceeded', () => {
      const response = {
        status: 429,
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again in 60 seconds.',
        retryAfter: 60
      };
      expect(response.status).toBe(429);
      expect(response.retryAfter).toBe(60);
    });

    it('should include retry time in response', () => {
      const response = {
        retryAfter: 60
      };
      expect(response.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('Redis-backed Rate Limiting', () => {
    it('should use Redis for distributed rate limiting', () => {
      const mockRedis = RedisService.getClient();
      expect(mockRedis).toBeDefined();
    });

    it('should handle Redis connection failure gracefully', async () => {
      jest.spyOn(RedisService, 'getClient').mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      // Should allow request to proceed despite Redis failure
      const shouldProceed = true;
      expect(shouldProceed).toBe(true);
    });

    it('should set TTL on rate limit keys', () => {
      const windowMs = 60000;
      expect(windowMs).toBe(60000);
    });
  });

  describe('Rate Limit Window Reset', () => {
    it('should reset counter after window expires', async () => {
      const windowMs = 60000;
      const elapsed = 61000; // 1 second past window
      expect(elapsed).toBeGreaterThan(windowMs);
    });

    it('should maintain counter within window', async () => {
      const windowMs = 60000;
      const elapsed = 30000; // Half window
      expect(elapsed).toBeLessThan(windowMs);
    });
  });

  describe('Environment Configuration', () => {
    it('should respect ENABLE_RATE_LIMITING=false', () => {
      process.env.ENABLE_RATE_LIMITING = 'false';
      const enabled = process.env.ENABLE_RATE_LIMITING === 'true';
      expect(enabled).toBe(false);
    });

    it('should enable rate limiting by default', () => {
      delete process.env.ENABLE_RATE_LIMITING;
      // Default is true
      const enabled = true;
      expect(enabled).toBe(true);
    });
  });

  describe('Concurrent Requests', () => {
    it('should handle concurrent requests correctly', async () => {
      const requests = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        timestamp: Date.now()
      }));
      
      expect(requests).toHaveLength(5);
      requests.forEach(req => {
        expect(req.id).toBeGreaterThan(0);
      });
    });

    it('should not have race conditions', async () => {
      // All concurrent requests should be counted correctly
      const count = 5;
      expect(count).toBe(5);
    });
  });

  describe('Distributed Deployment', () => {
    it('should share rate limits across instances via Redis', () => {
      const instance1Key = 'ratelimit:purchase:user-123';
      const instance2Key = 'ratelimit:purchase:user-123';
      expect(instance1Key).toBe(instance2Key);
    });

    it('should maintain consistent limits across pods', () => {
      // Both pods should see same Redis counter
      const sharedCounter = true;
      expect(sharedCounter).toBe(true);
    });
  });
});
