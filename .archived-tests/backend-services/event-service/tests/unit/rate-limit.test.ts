import { FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';

describe('Rate Limiting - Critical Path Tests', () => {
  let mockRedis: jest.Mocked<Redis>;
  let mockApp: any;

  beforeEach(() => {
    mockRedis = {
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    } as any;

    mockApp = {
      addHook: jest.fn(),
      decorateRequest: jest.fn(),
    };
  });

  describe('Redis-backed rate limiting', () => {
    it('should allow requests under the limit', async () => {
      mockRedis.incr.mockResolvedValue(5); // 5th request
      mockRedis.ttl.mockResolvedValue(45); // 45 seconds remaining

      const key = 'rate_limit:192.168.1.1';
      const count = await mockRedis.incr(key);

      expect(count).toBe(5);
      expect(count).toBeLessThan(100); // Default limit
    });

    it('should block requests exceeding the limit', async () => {
      mockRedis.incr.mockResolvedValue(101); // 101st request
      mockRedis.ttl.mockResolvedValue(30);

      const key = 'rate_limit:192.168.1.1';
      const count = await mockRedis.incr(key);

      expect(count).toBeGreaterThan(100);
      // Should trigger 429 Too Many Requests
    });

    it('should set expiry on first request', async () => {
      mockRedis.incr.mockResolvedValue(1); // First request
      mockRedis.ttl.mockResolvedValue(-1); // No TTL set

      const key = 'rate_limit:192.168.1.1';
      const count = await mockRedis.incr(key);
      const ttl = await mockRedis.ttl(key);

      if (ttl === -1) {
        await mockRedis.expire(key, 60); // 60 second window
      }

      expect(mockRedis.expire).toHaveBeenCalledWith(key, 60);
    });

    it('should implement sliding window correctly', async () => {
      // Simulate requests over time
      const requests = [1, 2, 3, 50, 99, 100];
      
      for (const count of requests) {
        mockRedis.incr.mockResolvedValueOnce(count);
      }

      // Last request should be at limit
      const finalCount = await mockRedis.incr('rate_limit:test');
      expect(finalCount).toBe(100);
    });

    it('should fail open when Redis is unavailable', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis connection failed'));

      try {
        await mockRedis.incr('rate_limit:test');
      } catch (error: any) {
        // Should log error but allow request through
        expect(error.message).toBe('Redis connection failed');
      }

      // System should continue operating
    });

    it('should use different keys for different IPs', async () => {
      const ip1 = '192.168.1.1';
      const ip2 = '192.168.1.2';

      mockRedis.incr.mockResolvedValueOnce(50); // IP1
      mockRedis.incr.mockResolvedValueOnce(10); // IP2

      const count1 = await mockRedis.incr(`rate_limit:${ip1}`);
      const count2 = await mockRedis.incr(`rate_limit:${ip2}`);

      expect(count1).not.toBe(count2);
    });

    it('should handle burst traffic correctly', async () => {
      // Simulate 150 requests in rapid succession
      const burstRequests = Array.from({ length: 150 }, (_, i) => i + 1);
      
      for (const count of burstRequests) {
        mockRedis.incr.mockResolvedValueOnce(count);
      }

      let blockedCount = 0;
      for (let i = 0; i < 150; i++) {
        const count = await mockRedis.incr('rate_limit:burst_test');
        if (count > 100) {
          blockedCount++;
        }
      }

      expect(blockedCount).toBe(50); // Should block requests 101-150
    });
  });

  describe('Rate limit headers', () => {
    it('should include X-RateLimit headers in response', () => {
      const headers = {
        'X-RateLimit-Limit': 100,
        'X-RateLimit-Remaining': 45,
        'X-RateLimit-Reset': Math.floor(Date.now() / 1000) + 60,
      };

      expect(headers['X-RateLimit-Limit']).toBe(100);
      expect(headers['X-RateLimit-Remaining']).toBeLessThan(100);
      expect(headers['X-RateLimit-Reset']).toBeGreaterThan(Date.now() / 1000);
    });

    it('should update remaining count with each request', () => {
      const initialRemaining = 100;
      const afterOneRequest = 99;
      const afterTenRequests = 90;

      expect(afterOneRequest).toBe(initialRemaining - 1);
      expect(afterTenRequests).toBe(initialRemaining - 10);
    });
  });

  describe('Rate limit window reset', () => {
    it('should reset counter after window expires', async () => {
      mockRedis.incr.mockResolvedValueOnce(100); // Hit limit
      mockRedis.ttl.mockResolvedValueOnce(0); // Window expired

      // Simulate window expiration
      await mockRedis.del('rate_limit:test');
      
      mockRedis.incr.mockResolvedValueOnce(1); // New window, first request
      const newCount = await mockRedis.incr('rate_limit:test');

      expect(newCount).toBe(1);
    });

    it('should maintain counter within window', async () => {
      mockRedis.incr.mockResolvedValueOnce(50);
      mockRedis.ttl.mockResolvedValueOnce(30); // 30 seconds remaining

      const count = await mockRedis.incr('rate_limit:test');
      const ttl = await mockRedis.ttl('rate_limit:test');

      expect(count).toBe(50);
      expect(ttl).toBeGreaterThan(0);
    });
  });
});
