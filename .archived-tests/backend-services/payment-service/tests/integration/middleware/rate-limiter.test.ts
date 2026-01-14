/**
 * Rate Limiter Middleware Integration Tests
 * Comprehensive tests for both rate-limiter.ts and rate-limit.middleware.ts
 */

import Fastify, { FastifyInstance } from 'fastify';
import { createRateLimiter, rateLimiter } from '../../../src/middleware/rate-limiter';
import {
  feeCalculatorRateLimit,
  paymentRateLimit,
  apiRateLimit,
  createUserRateLimit,
} from '../../../src/middleware/rate-limit.middleware';
import { RedisService } from '../../../src/services/redisService';

describe('Rate Limiter (rate-limiter.ts)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await RedisService.initialize();

    app = Fastify();

    // Basic rate limiter - 3 requests per minute
    const basicLimiter = createRateLimiter({
      windowMs: 60000,
      max: 3,
      message: 'Basic rate limit exceeded',
    });

    app.get('/basic', { preHandler: [basicLimiter] }, async () => ({ success: true }));

    // Rate limiter with custom key generator
    const apiKeyLimiter = createRateLimiter({
      windowMs: 60000,
      max: 5,
      message: 'API key rate limit exceeded',
      keyGenerator: (request) => request.headers['x-api-key'] as string || 'anonymous',
    });

    app.get('/api-key', { preHandler: [apiKeyLimiter] }, async () => ({ success: true }));

    // Rate limiter with skip function
    const skippableLimiter = createRateLimiter({
      windowMs: 60000,
      max: 2,
      message: 'Skippable rate limit exceeded',
      skip: (request) => request.headers['x-bypass-limit'] === 'true',
    });

    app.get('/skippable', { preHandler: [skippableLimiter] }, async () => ({ success: true }));

    // Rate limiter with very short window for testing expiry
    const shortWindowLimiter = createRateLimiter({
      windowMs: 2000, // 2 seconds
      max: 2,
      message: 'Short window limit exceeded',
    });

    app.get('/short-window', { preHandler: [shortWindowLimiter] }, async () => ({ success: true }));

    // Rate limiter with custom message
    const customMessageLimiter = createRateLimiter({
      windowMs: 60000,
      max: 1,
      message: 'Custom: You are sending too many requests!',
    });

    app.get('/custom-message', { preHandler: [customMessageLimiter] }, async () => ({ success: true }));

    // Rate limiter using legacy rateLimiter function
    const legacyLimiter = rateLimiter('legacy-test', 3, 60);

    app.get('/legacy', { preHandler: [legacyLimiter] }, async () => ({ success: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear rate limit keys before each test
    const redis = RedisService.getClient();
    const keys = await redis.keys('rate-limit:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  describe('createRateLimiter', () => {
    describe('basic functionality', () => {
      it('should allow requests within limit', async () => {
        const uniqueIp = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        const response = await app.inject({
          method: 'GET',
          url: '/basic',
          headers: { 'x-forwarded-for': uniqueIp },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });

      it('should allow exactly max requests', async () => {
        const uniqueIp = `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        for (let i = 0; i < 3; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/basic',
            headers: { 'x-forwarded-for': uniqueIp },
          });
          expect(response.statusCode).toBe(200);
        }
      });

      it('should block request exceeding limit', async () => {
        const uniqueIp = `172.16.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Make 3 allowed requests
        for (let i = 0; i < 3; i++) {
          await app.inject({
            method: 'GET',
            url: '/basic',
            headers: { 'x-forwarded-for': uniqueIp },
          });
        }

        // 4th request should be blocked
        const response = await app.inject({
          method: 'GET',
          url: '/basic',
          headers: { 'x-forwarded-for': uniqueIp },
        });

        expect(response.statusCode).toBe(429);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Basic rate limit exceeded');
      });

      it('should track different IPs separately', async () => {
        const ip1 = `192.168.1.${Math.floor(Math.random() * 255)}`;
        const ip2 = `192.168.2.${Math.floor(Math.random() * 255)}`;

        // Exhaust limit for IP1
        for (let i = 0; i < 3; i++) {
          await app.inject({
            method: 'GET',
            url: '/basic',
            headers: { 'x-forwarded-for': ip1 },
          });
        }

        // IP1 should be blocked
        const blockedResponse = await app.inject({
          method: 'GET',
          url: '/basic',
          headers: { 'x-forwarded-for': ip1 },
        });
        expect(blockedResponse.statusCode).toBe(429);

        // IP2 should still work
        const allowedResponse = await app.inject({
          method: 'GET',
          url: '/basic',
          headers: { 'x-forwarded-for': ip2 },
        });
        expect(allowedResponse.statusCode).toBe(200);
      });

      it('should handle x-forwarded-for with multiple IPs', async () => {
        const primaryIp = `10.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
        const forwardedFor = `${primaryIp}, 192.168.1.1, 10.0.0.1`;

        const response = await app.inject({
          method: 'GET',
          url: '/basic',
          headers: { 'x-forwarded-for': forwardedFor },
        });

        expect(response.statusCode).toBe(200);
      });
    });

    describe('custom key generator', () => {
      it('should use API key for rate limiting', async () => {
        const apiKey = `key-${Math.random().toString(36).slice(2)}`;

        for (let i = 0; i < 5; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/api-key',
            headers: { 'x-api-key': apiKey },
          });
          expect(response.statusCode).toBe(200);
        }

        // 6th request should be blocked
        const blockedResponse = await app.inject({
          method: 'GET',
          url: '/api-key',
          headers: { 'x-api-key': apiKey },
        });
        expect(blockedResponse.statusCode).toBe(429);
      });

      it('should track different API keys separately', async () => {
        const apiKey1 = `key1-${Math.random().toString(36).slice(2)}`;
        const apiKey2 = `key2-${Math.random().toString(36).slice(2)}`;

        // Use all requests for key1
        for (let i = 0; i < 5; i++) {
          await app.inject({
            method: 'GET',
            url: '/api-key',
            headers: { 'x-api-key': apiKey1 },
          });
        }

        // Key1 blocked
        const blocked = await app.inject({
          method: 'GET',
          url: '/api-key',
          headers: { 'x-api-key': apiKey1 },
        });
        expect(blocked.statusCode).toBe(429);

        // Key2 still allowed
        const allowed = await app.inject({
          method: 'GET',
          url: '/api-key',
          headers: { 'x-api-key': apiKey2 },
        });
        expect(allowed.statusCode).toBe(200);
      });

      it('should use anonymous key when API key not provided', async () => {
        // Without API key, uses 'anonymous'
        for (let i = 0; i < 5; i++) {
          await app.inject({
            method: 'GET',
            url: '/api-key',
          });
        }

        const blocked = await app.inject({
          method: 'GET',
          url: '/api-key',
        });
        expect(blocked.statusCode).toBe(429);
      });
    });

    describe('skip function', () => {
      it('should skip rate limiting when skip returns true', async () => {
        const uniqueIp = `10.10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Make many requests with bypass header
        for (let i = 0; i < 10; i++) {
          const response = await app.inject({
            method: 'GET',
            url: '/skippable',
            headers: {
              'x-forwarded-for': uniqueIp,
              'x-bypass-limit': 'true',
            },
          });
          expect(response.statusCode).toBe(200);
        }
      });

      it('should apply rate limiting when skip returns false', async () => {
        const uniqueIp = `10.11.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Make 2 allowed requests without bypass
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: 'GET',
            url: '/skippable',
            headers: { 'x-forwarded-for': uniqueIp },
          });
        }

        // 3rd should be blocked
        const blocked = await app.inject({
          method: 'GET',
          url: '/skippable',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(blocked.statusCode).toBe(429);
      });

      it('should allow bypass after being rate limited', async () => {
        const uniqueIp = `10.12.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Exhaust limit
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: 'GET',
            url: '/skippable',
            headers: { 'x-forwarded-for': uniqueIp },
          });
        }

        // Blocked without bypass
        const blocked = await app.inject({
          method: 'GET',
          url: '/skippable',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(blocked.statusCode).toBe(429);

        // Allowed with bypass
        const allowed = await app.inject({
          method: 'GET',
          url: '/skippable',
          headers: {
            'x-forwarded-for': uniqueIp,
            'x-bypass-limit': 'true',
          },
        });
        expect(allowed.statusCode).toBe(200);
      });
    });

    describe('window expiry', () => {
      it('should reset count after window expires', async () => {
        const uniqueIp = `10.20.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Exhaust limit
        for (let i = 0; i < 2; i++) {
          await app.inject({
            method: 'GET',
            url: '/short-window',
            headers: { 'x-forwarded-for': uniqueIp },
          });
        }

        // Should be blocked
        const blocked = await app.inject({
          method: 'GET',
          url: '/short-window',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(blocked.statusCode).toBe(429);

        // Wait for window to expire (2 seconds + buffer)
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Should be allowed again
        const allowed = await app.inject({
          method: 'GET',
          url: '/short-window',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(allowed.statusCode).toBe(200);
      });
    });

    describe('custom message', () => {
      it('should return custom error message', async () => {
        const uniqueIp = `10.30.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        // Use the one allowed request
        await app.inject({
          method: 'GET',
          url: '/custom-message',
          headers: { 'x-forwarded-for': uniqueIp },
        });

        // Get blocked with custom message
        const response = await app.inject({
          method: 'GET',
          url: '/custom-message',
          headers: { 'x-forwarded-for': uniqueIp },
        });

        expect(response.statusCode).toBe(429);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Custom: You are sending too many requests!');
      });
    });

    describe('default values', () => {
      it('should use default message when not provided', async () => {
        const defaultLimiter = createRateLimiter({
          windowMs: 60000,
          max: 1,
        });

        const testApp = Fastify();
        testApp.get('/default', { preHandler: [defaultLimiter] }, async () => ({ success: true }));
        await testApp.ready();

        const uniqueIp = `10.40.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

        await testApp.inject({
          method: 'GET',
          url: '/default',
          headers: { 'x-forwarded-for': uniqueIp },
        });

        const response = await testApp.inject({
          method: 'GET',
          url: '/default',
          headers: { 'x-forwarded-for': uniqueIp },
        });

        expect(response.statusCode).toBe(429);
        const body = JSON.parse(response.body);
        expect(body.error).toBe('Too many requests');

        await testApp.close();
      });
    });
  });

  describe('legacy rateLimiter function', () => {
    it('should create functional rate limiter', async () => {
      const uniqueIp = `10.50.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/legacy',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await app.inject({
        method: 'GET',
        url: '/legacy',
        headers: { 'x-forwarded-for': uniqueIp },
      });
      expect(blocked.statusCode).toBe(429);
      const body = JSON.parse(blocked.body);
      expect(body.error).toContain('legacy-test');
    });
  });
});

describe('Rate Limit Middleware (rate-limit.middleware.ts)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();

    // Add mock user for user-based rate limiting
    app.addHook('preHandler', async (request) => {
      const userId = request.headers['x-user-id'] as string;
      if (userId) {
        (request as any).user = { id: userId };
      }
    });

    app.get('/fee', { preHandler: [feeCalculatorRateLimit] }, async () => ({ fees: 100 }));
    app.post('/payment', { preHandler: [paymentRateLimit] }, async () => ({ success: true }));
    app.get('/api', { preHandler: [apiRateLimit] }, async () => ({ data: 'test' }));
    app.get('/health', { preHandler: [apiRateLimit] }, async () => ({ status: 'ok' }));
    app.get('/ready', { preHandler: [apiRateLimit] }, async () => ({ ready: true }));

    // User rate limit - 3 per 1 minute
    const userLimiter = createUserRateLimit(1, 3);
    app.get('/user-limited', { preHandler: [userLimiter] }, async () => ({ success: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('feeCalculatorRateLimit', () => {
    it('should allow 10 requests per minute', async () => {
      const uniqueIp = `192.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 10; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/fee',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(response.statusCode).toBe(200);
      }
    });

    it('should block after 10 requests', async () => {
      const uniqueIp = `192.1.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 10; i++) {
        await app.inject({
          method: 'GET',
          url: '/fee',
          headers: { 'x-forwarded-for': uniqueIp },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/fee',
        headers: { 'x-forwarded-for': uniqueIp },
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('fee calculation');
    });

    it('should include rate limit headers', async () => {
      const uniqueIp = `192.2.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      const response = await app.inject({
        method: 'GET',
        url: '/fee',
        headers: { 'x-forwarded-for': uniqueIp },
      });

      expect(response.headers['ratelimit-limit']).toBeDefined();
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
    });

    it('should include retryAfter in error response', async () => {
      const uniqueIp = `192.3.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 10; i++) {
        await app.inject({
          method: 'GET',
          url: '/fee',
          headers: { 'x-forwarded-for': uniqueIp },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/fee',
        headers: { 'x-forwarded-for': uniqueIp },
      });

      const body = JSON.parse(response.body);
      expect(body.retryAfter).toBe(60);
    });
  });

  describe('paymentRateLimit', () => {
    it('should allow 5 payment attempts per minute', async () => {
      const uniqueIp = `192.10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 5; i++) {
        const response = await app.inject({
          method: 'POST',
          url: '/payment',
          headers: { 'x-forwarded-for': uniqueIp },
          payload: {},
        });
        expect(response.statusCode).toBe(200);
      }
    });

    it('should block after 5 payment attempts', async () => {
      const uniqueIp = `192.11.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/payment',
          headers: { 'x-forwarded-for': uniqueIp },
          payload: {},
        });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/payment',
        headers: { 'x-forwarded-for': uniqueIp },
        payload: {},
      });

      expect(response.statusCode).toBe(429);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('payment');
    });

    it('should be more restrictive than fee calculator', async () => {
      // Payment: 5 per minute, Fee: 10 per minute
      const uniqueIp = `192.12.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      // After 5 requests, payment should be blocked
      for (let i = 0; i < 5; i++) {
        await app.inject({
          method: 'POST',
          url: '/payment',
          headers: { 'x-forwarded-for': uniqueIp },
          payload: {},
        });
      }

      const paymentResponse = await app.inject({
        method: 'POST',
        url: '/payment',
        headers: { 'x-forwarded-for': uniqueIp },
        payload: {},
      });
      expect(paymentResponse.statusCode).toBe(429);
    });
  });

  describe('apiRateLimit', () => {
    it('should skip /health path', async () => {
      const uniqueIp = `192.20.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      // Make many requests to health endpoint
      for (let i = 0; i < 150; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/health',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(response.statusCode).toBe(200);
      }
    });

    it('should skip /ready path', async () => {
      const uniqueIp = `192.21.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      for (let i = 0; i < 150; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/ready',
          headers: { 'x-forwarded-for': uniqueIp },
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('createUserRateLimit', () => {
    it('should rate limit by user ID', async () => {
      const userId = `user-${Math.random().toString(36).slice(2)}`;

      for (let i = 0; i < 3; i++) {
        const response = await app.inject({
          method: 'GET',
          url: '/user-limited',
          headers: { 'x-user-id': userId },
        });
        expect(response.statusCode).toBe(200);
      }

      const blocked = await app.inject({
        method: 'GET',
        url: '/user-limited',
        headers: { 'x-user-id': userId },
      });
      expect(blocked.statusCode).toBe(429);
    });

    it('should track different users separately', async () => {
      const user1 = `user1-${Math.random().toString(36).slice(2)}`;
      const user2 = `user2-${Math.random().toString(36).slice(2)}`;

      // Exhaust user1's limit
      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/user-limited',
          headers: { 'x-user-id': user1 },
        });
      }

      // User1 blocked
      const blocked = await app.inject({
        method: 'GET',
        url: '/user-limited',
        headers: { 'x-user-id': user1 },
      });
      expect(blocked.statusCode).toBe(429);

      // User2 still allowed
      const allowed = await app.inject({
        method: 'GET',
        url: '/user-limited',
        headers: { 'x-user-id': user2 },
      });
      expect(allowed.statusCode).toBe(200);
    });

    it('should include custom message with limits', async () => {
      const userId = `user-msg-${Math.random().toString(36).slice(2)}`;

      for (let i = 0; i < 3; i++) {
        await app.inject({
          method: 'GET',
          url: '/user-limited',
          headers: { 'x-user-id': userId },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/user-limited',
        headers: { 'x-user-id': userId },
      });

      const body = JSON.parse(response.body);
      expect(body.message).toContain('3');
      expect(body.message).toContain('1 minutes');
    });
  });
});
