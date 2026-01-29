/**
 * COMPONENT TEST: RateLimiter
 *
 * Tests RateLimiter with MOCKED Redis
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Redis data store
const mockRedisData: Map<string, number> = new Map();
let mockRedisError: Error | null = null;
let expireCalls: Array<{ key: string; seconds: number }> = [];

// Mock RedisService
jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    getClient: () => ({
      incr: jest.fn(async (key: string) => {
        if (mockRedisError) {
          throw mockRedisError;
        }
        const current = mockRedisData.get(key) || 0;
        const newValue = current + 1;
        mockRedisData.set(key, newValue);
        return newValue;
      }),
      expire: jest.fn(async (key: string, seconds: number) => {
        if (mockRedisError) {
          throw mockRedisError;
        }
        expireCalls.push({ key, seconds });
        return 1;
      }),
      get: jest.fn(async (key: string) => {
        if (mockRedisError) {
          throw mockRedisError;
        }
        return mockRedisData.get(key)?.toString() || null;
      }),
    }),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { createRateLimiter, rateLimiter } from '../../../src/middleware/rate-limiter';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    ip: '192.168.1.100',
    url: '/api/v1/payments',
    method: 'POST',
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): { reply: FastifyReply; getSentStatus: () => number; getSentResponse: () => any } {
  let sentStatus = 200;
  let sentResponse: any = null;

  const reply = {
    code: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((response: any) => {
      sentResponse = response;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
  };
}

describe('RateLimiter Component Tests', () => {
  beforeEach(() => {
    // Clear mock Redis data and error state
    mockRedisData.clear();
    mockRedisError = null;
    expireCalls = [];
  });

  afterEach(() => {
    mockRedisData.clear();
    mockRedisError = null;
    expireCalls = [];
    jest.clearAllMocks();
  });

  // ===========================================================================
  // createRateLimiter
  // ===========================================================================
  describe('createRateLimiter()', () => {
    it('should allow request under limit', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
      });

      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await limiter(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should track multiple requests', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 5,
      });

      const mockRequest = createMockRequest();

      // Make 4 requests - all should pass
      for (let i = 0; i < 4; i++) {
        const { reply } = createMockReply();
        await limiter(mockRequest, reply);
        expect(reply.code).not.toHaveBeenCalled();
      }

      // 5th request should pass (at the limit)
      const { reply: reply5 } = createMockReply();
      await limiter(mockRequest, reply5);
      expect(reply5.code).not.toHaveBeenCalled();

      // 6th request should be blocked
      const { reply: reply6, getSentResponse } = createMockReply();
      await limiter(mockRequest, reply6);
      expect(reply6.code).toHaveBeenCalledWith(429);
      expect(getSentResponse()).toEqual({ error: 'Too many requests' });
    });

    it('should use custom message', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        message: 'Custom rate limit message',
      });

      const mockRequest = createMockRequest();

      // First request passes
      const { reply: reply1 } = createMockReply();
      await limiter(mockRequest, reply1);

      // Second request blocked with custom message
      const { reply: reply2, getSentResponse } = createMockReply();
      await limiter(mockRequest, reply2);
      expect(reply2.code).toHaveBeenCalledWith(429);
      expect(getSentResponse()).toEqual({ error: 'Custom rate limit message' });
    });

    it('should use custom key generator', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 2,
        keyGenerator: (req) => (req as any).user?.id || req.ip,
      });

      const userId = uuidv4();
      const mockRequest = createMockRequest({
        user: { id: userId },
      });

      // Make 2 requests with user ID
      for (let i = 0; i < 2; i++) {
        const { reply } = createMockReply();
        await limiter(mockRequest, reply);
        expect(reply.code).not.toHaveBeenCalled();
      }

      // 3rd request with same user should be blocked
      const { reply: reply3 } = createMockReply();
      await limiter(mockRequest, reply3);
      expect(reply3.code).toHaveBeenCalledWith(429);

      // Different user should not be blocked
      const differentUserRequest = createMockRequest({
        user: { id: uuidv4() },
      });
      const { reply: reply4 } = createMockReply();
      await limiter(differentUserRequest, reply4);
      expect(reply4.code).not.toHaveBeenCalled();
    });

    it('should use IP as default key', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 2,
      });

      const mockRequest1 = createMockRequest({ ip: '1.1.1.1' });
      const mockRequest2 = createMockRequest({ ip: '2.2.2.2' });

      // Max out IP 1
      for (let i = 0; i < 2; i++) {
        const { reply } = createMockReply();
        await limiter(mockRequest1, reply);
      }

      // IP 1 should be blocked
      const { reply: blockedReply } = createMockReply();
      await limiter(mockRequest1, blockedReply);
      expect(blockedReply.code).toHaveBeenCalledWith(429);

      // IP 2 should still be allowed
      const { reply: allowedReply } = createMockReply();
      await limiter(mockRequest2, allowedReply);
      expect(allowedReply.code).not.toHaveBeenCalled();
    });

    it('should skip when skip function returns true', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
        skip: (req) => req.url === '/health',
      });

      // Health endpoint should be skipped
      const healthRequest = createMockRequest({ url: '/health' });
      
      // Make multiple requests - all should pass because skipped
      for (let i = 0; i < 5; i++) {
        const { reply } = createMockReply();
        await limiter(healthRequest, reply);
        expect(reply.code).not.toHaveBeenCalled();
      }

      // Regular endpoint should still be rate limited
      const regularRequest = createMockRequest({ url: '/api/v1/payments' });
      const { reply: reply1 } = createMockReply();
      await limiter(regularRequest, reply1);
      expect(reply1.code).not.toHaveBeenCalled();

      const { reply: reply2 } = createMockReply();
      await limiter(regularRequest, reply2);
      expect(reply2.code).toHaveBeenCalledWith(429);
    });

    it('should use default values when not provided', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 100,
      });

      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await limiter(mockRequest, reply);

      // Should work with defaults
      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // rateLimiter (backwards compatibility)
  // ===========================================================================
  describe('rateLimiter()', () => {
    it('should create rate limiter with name-based message', async () => {
      const limiter = rateLimiter('payment', 2, 60);

      const mockRequest = createMockRequest();

      // First 2 requests pass
      for (let i = 0; i < 2; i++) {
        const { reply } = createMockReply();
        await limiter(mockRequest, reply);
        expect(reply.code).not.toHaveBeenCalled();
      }

      // 3rd request blocked with name-based message
      const { reply, getSentResponse } = createMockReply();
      await limiter(mockRequest, reply);
      expect(reply.code).toHaveBeenCalledWith(429);
      expect(getSentResponse()).toEqual({ error: 'Too many payment requests' });
    });

    it('should convert windowSeconds to windowMs', async () => {
      // 1 second window, 1 request max
      const limiter = rateLimiter('test', 1, 1);

      const mockRequest = createMockRequest();

      // First request passes
      const { reply: reply1 } = createMockReply();
      await limiter(mockRequest, reply1);
      expect(reply1.code).not.toHaveBeenCalled();

      // Second request blocked
      const { reply: reply2 } = createMockReply();
      await limiter(mockRequest, reply2);
      expect(reply2.code).toHaveBeenCalledWith(429);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should fail open when Redis throws error', async () => {
      mockRedisError = new Error('Redis connection failed');

      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
      });

      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await limiter(mockRequest, reply);

      // Should allow request through (fail open)
      expect(reply.code).not.toHaveBeenCalled();
      expect(reply.send).not.toHaveBeenCalled();
    });

    it('should continue to fail open on subsequent requests', async () => {
      mockRedisError = new Error('Redis connection failed');

      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 1,
      });

      const mockRequest = createMockRequest();

      // Multiple requests should all pass when Redis is down
      for (let i = 0; i < 5; i++) {
        const { reply } = createMockReply();
        await limiter(mockRequest, reply);
        expect(reply.code).not.toHaveBeenCalled();
      }
    });
  });

  // ===========================================================================
  // WINDOW EXPIRY
  // ===========================================================================
  describe('window expiry', () => {
    it('should set expire on first request', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
      });

      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await limiter(mockRequest, reply);

      // expire should be called with 60 seconds (60000ms / 1000)
      expect(expireCalls).toHaveLength(1);
      expect(expireCalls[0].key).toContain('rate-limit:');
      expect(expireCalls[0].seconds).toBe(60);
    });

    it('should not set expire on subsequent requests', async () => {
      const limiter = createRateLimiter({
        windowMs: 60000,
        max: 10,
      });

      const mockRequest = createMockRequest();

      // First request
      const { reply: reply1 } = createMockReply();
      await limiter(mockRequest, reply1);

      // Clear expire calls to check subsequent behavior
      expireCalls = [];

      // Second request
      const { reply: reply2 } = createMockReply();
      await limiter(mockRequest, reply2);

      // expire should not be called again (current > 1)
      expect(expireCalls).toHaveLength(0);
    });
  });
});
