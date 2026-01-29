/**
 * COMPONENT TEST: RateLimitMiddleware
 *
 * Tests rate limiting middleware with MOCKED Redis
 * Covers IP extraction, ban mechanism, and system overload protection
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock Redis data store
const mockRedisData: Map<string, string> = new Map();
let mockRedisError: Error | null = null;
let mockRedisLatency: number = 0;

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  getRedis: () => ({
    get: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      return mockRedisData.get(key) || null;
    }),
    set: jest.fn(async (key: string, value: string) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.set(key, value);
      return 'OK';
    }),
    setex: jest.fn(async (key: string, seconds: number, value: string) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.set(key, value);
      return 'OK';
    }),
    incr: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      const current = parseInt(mockRedisData.get(key) || '0', 10);
      const newValue = current + 1;
      mockRedisData.set(key, newValue.toString());
      return newValue;
    }),
    expire: jest.fn(async () => {
      if (mockRedisError) throw mockRedisError;
      return 1;
    }),
    ttl: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      return 60; // Default TTL
    }),
    del: jest.fn(async (key: string) => {
      if (mockRedisError) throw mockRedisError;
      mockRedisData.delete(key);
      return 1;
    }),
    ping: jest.fn(async () => {
      if (mockRedisError) throw mockRedisError;
      // Simulate latency
      if (mockRedisLatency > 0) {
        await new Promise(resolve => setTimeout(resolve, mockRedisLatency));
      }
      return 'PONG';
    }),
    eval: jest.fn(async (script: string, numKeys: number, key: string, max: string, window: string) => {
      if (mockRedisError) throw mockRedisError;
      const current = parseInt(mockRedisData.get(key) || '0', 10);
      const newValue = current + 1;
      mockRedisData.set(key, newValue.toString());
      return [newValue, parseInt(window, 10)];
    }),
  }),
}));

// Mock logger
jest.mock('../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Mock config
jest.mock('../../../src/config', () => ({
  config: {
    redis: {
      url: 'redis://localhost:6379',
    },
  },
}));

import {
  feeCalculatorRateLimit,
  paymentRateLimit,
  apiRateLimit,
  createUserRateLimit,
  systemOverloadProtection,
  advancedRateLimit,
  setSystemOverloaded,
  unbanClient,
  isClientBanned,
} from '../../../src/middleware/rate-limit.middleware';

// Helper to create mock request
function createMockRequest(overrides: Record<string, any> = {}): FastifyRequest {
  return {
    ip: '192.168.1.100',
    url: '/api/v1/payments',
    method: 'POST',
    headers: {},
    ...overrides,
  } as unknown as FastifyRequest;
}

// Helper to create mock reply
function createMockReply(): {
  reply: FastifyReply;
  getSentStatus: () => number;
  getSentResponse: () => any;
  getHeaders: () => Record<string, string>;
} {
  let sentStatus = 200;
  let sentResponse: any = null;
  const headers: Record<string, string> = {};

  const reply = {
    code: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    status: jest.fn().mockImplementation((code: number) => {
      sentStatus = code;
      return reply;
    }),
    send: jest.fn().mockImplementation((response: any) => {
      sentResponse = response;
      return reply;
    }),
    header: jest.fn().mockImplementation((name: string, value: string) => {
      headers[name] = value;
      return reply;
    }),
  } as unknown as FastifyReply;

  return {
    reply,
    getSentStatus: () => sentStatus,
    getSentResponse: () => sentResponse,
    getHeaders: () => headers,
  };
}

describe('RateLimitMiddleware Component Tests', () => {
  beforeEach(() => {
    mockRedisData.clear();
    mockRedisError = null;
    mockRedisLatency = 0;
    setSystemOverloaded(false);
  });

  afterEach(() => {
    mockRedisData.clear();
    mockRedisError = null;
    mockRedisLatency = 0;
    jest.clearAllMocks();
  });

  // ===========================================================================
  // FEE CALCULATOR RATE LIMIT
  // ===========================================================================
  describe('feeCalculatorRateLimit()', () => {
    it('should allow request under limit', async () => {
      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await feeCalculatorRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should block after 10 requests per minute', async () => {
      const mockRequest = createMockRequest();

      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        const { reply } = createMockReply();
        await feeCalculatorRateLimit(mockRequest, reply);
      }

      // 11th should be blocked
      const { reply, getSentResponse } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(reply.code).toHaveBeenCalledWith(429);
      expect(getSentResponse().error).toBe('Too many requests');
    });

    it('should skip /health endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/health' });
      
      // Set count above limit
      mockRedisData.set('rl:fee:192.168.1.100', '100');

      const { reply } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // PAYMENT RATE LIMIT
  // ===========================================================================
  describe('paymentRateLimit()', () => {
    it('should allow request under limit', async () => {
      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await paymentRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should block after 5 payment attempts per minute', async () => {
      const mockRequest = createMockRequest();

      // Make 5 requests
      for (let i = 0; i < 5; i++) {
        const { reply } = createMockReply();
        await paymentRateLimit(mockRequest, reply);
      }

      // 6th should be blocked
      const { reply, getSentResponse } = createMockReply();
      await paymentRateLimit(mockRequest, reply);

      expect(reply.code).toHaveBeenCalledWith(429);
      expect(getSentResponse().message).toContain('payment');
    });
  });

  // ===========================================================================
  // API RATE LIMIT
  // ===========================================================================
  describe('apiRateLimit()', () => {
    it('should allow request under limit', async () => {
      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await apiRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should block after 100 requests per 15 minutes', async () => {
      const mockRequest = createMockRequest();

      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const { reply } = createMockReply();
        await apiRateLimit(mockRequest, reply);
      }

      // 101st should be blocked
      const { reply } = createMockReply();
      await apiRateLimit(mockRequest, reply);

      expect(reply.code).toHaveBeenCalledWith(429);
    });
  });

  // ===========================================================================
  // USER RATE LIMIT
  // ===========================================================================
  describe('createUserRateLimit()', () => {
    it('should create rate limiter with custom window and max', async () => {
      const limiter = createUserRateLimit(1, 3); // 1 minute, 3 requests

      const mockRequest = createMockRequest({
        user: { id: uuidv4() },
      });

      // Make 3 requests
      for (let i = 0; i < 3; i++) {
        const { reply } = createMockReply();
        await limiter(mockRequest, reply);
        expect(reply.code).not.toHaveBeenCalled();
      }

      // 4th should be blocked
      const { reply } = createMockReply();
      await limiter(mockRequest, reply);

      expect(reply.code).toHaveBeenCalledWith(429);
    });
  });

  // ===========================================================================
  // IP EXTRACTION
  // ===========================================================================
  describe('IP extraction', () => {
    it('should use rightmost IP from X-Forwarded-For', async () => {
      const mockRequest = createMockRequest({
        headers: {
          'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3',
        },
        ip: '127.0.0.1',
      });

      const { reply } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      // Should use 3.3.3.3 (rightmost) as the key
      expect(mockRedisData.has('rl:fee:3.3.3.3')).toBe(true);
    });

    it('should fall back to request.ip when no X-Forwarded-For', async () => {
      const mockRequest = createMockRequest({
        headers: {},
        ip: '10.0.0.1',
      });

      const { reply } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(mockRedisData.has('rl:fee:10.0.0.1')).toBe(true);
    });

    it('should handle single IP in X-Forwarded-For', async () => {
      const mockRequest = createMockRequest({
        headers: {
          'x-forwarded-for': '5.5.5.5',
        },
      });

      const { reply } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(mockRedisData.has('rl:fee:5.5.5.5')).toBe(true);
    });
  });

  // ===========================================================================
  // RATE LIMIT HEADERS
  // ===========================================================================
  describe('rate limit headers', () => {
    it('should set rate limit headers on response', async () => {
      const mockRequest = createMockRequest();
      const { reply, getHeaders } = createMockReply();

      await feeCalculatorRateLimit(mockRequest, reply);

      const headers = getHeaders();
      expect(headers['RateLimit-Limit']).toBeDefined();
      expect(headers['RateLimit-Remaining']).toBeDefined();
      expect(headers['RateLimit-Reset']).toBeDefined();
    });

    it('should set Retry-After header when rate limited', async () => {
      const mockRequest = createMockRequest();

      // Exceed limit
      for (let i = 0; i < 10; i++) {
        const { reply } = createMockReply();
        await feeCalculatorRateLimit(mockRequest, reply);
      }

      const { reply, getHeaders } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(getHeaders()['Retry-After']).toBeDefined();
    });
  });

  // ===========================================================================
  // SYSTEM OVERLOAD PROTECTION
  // ===========================================================================
  describe('systemOverloadProtection()', () => {
    it('should allow request when system is not overloaded', async () => {
      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await systemOverloadProtection(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should block request when system is manually set to overloaded', async () => {
      setSystemOverloaded(true);

      const mockRequest = createMockRequest();
      const { reply, getSentResponse } = createMockReply();

      await systemOverloadProtection(mockRequest, reply);

      expect(reply.code).toHaveBeenCalledWith(503);
      expect(getSentResponse().error).toBe('Service temporarily unavailable');
    });

    it('should skip health checks during overload', async () => {
      setSystemOverloaded(true);

      const mockRequest = createMockRequest({ url: '/health' });
      const { reply } = createMockReply();

      await systemOverloadProtection(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // ADVANCED RATE LIMIT (with ban mechanism)
  // ===========================================================================
  describe('advancedRateLimit()', () => {
    it('should allow request under limit', async () => {
      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await advancedRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should skip health endpoints', async () => {
      const mockRequest = createMockRequest({ url: '/health' });
      const { reply } = createMockReply();

      // Even with high count, should skip
      mockRedisData.set('rl:adv:192.168.1.100', '1000');

      await advancedRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });

    it('should skip metrics endpoint', async () => {
      const mockRequest = createMockRequest({ url: '/metrics' });
      const { reply } = createMockReply();

      await advancedRateLimit(mockRequest, reply);

      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // BAN MECHANISM
  // ===========================================================================
  describe('ban mechanism', () => {
    it('should check if client is banned', async () => {
      const identifier = '192.168.1.100';
      
      // Not banned initially
      const result1 = await isClientBanned(identifier);
      expect(result1.banned).toBe(false);

      // Set ban
      mockRedisData.set('rl:adv:ban:192.168.1.100', 'banned');

      const result2 = await isClientBanned(identifier);
      expect(result2.banned).toBe(true);
    });

    it('should unban client', async () => {
      const identifier = '192.168.1.100';

      // Set ban and violations
      mockRedisData.set('rl:adv:ban:192.168.1.100', 'banned');
      mockRedisData.set('rl:adv:violations:192.168.1.100', '5');

      const result = await unbanClient(identifier);

      expect(result).toBe(true);
      expect(mockRedisData.has('rl:adv:ban:192.168.1.100')).toBe(false);
      expect(mockRedisData.has('rl:adv:violations:192.168.1.100')).toBe(false);
    });

    it('should block banned clients', async () => {
      const mockRequest = createMockRequest({ ip: '192.168.1.100' });

      // Set ban
      mockRedisData.set('rl:adv:ban:192.168.1.100', 'banned');

      const { reply, getSentResponse } = createMockReply();
      await advancedRateLimit(mockRequest, reply);

      expect(reply.code).toHaveBeenCalledWith(403);
      expect(getSentResponse().error).toBe('Access denied');
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should fail open when Redis throws error', async () => {
      mockRedisError = new Error('Redis connection failed');

      const mockRequest = createMockRequest();
      const { reply } = createMockReply();

      await feeCalculatorRateLimit(mockRequest, reply);

      // Should allow request through
      expect(reply.code).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // USER ID VS IP KEYING
  // ===========================================================================
  describe('user ID vs IP keying', () => {
    it('should use user ID when available', async () => {
      const userId = uuidv4();
      const mockRequest = createMockRequest({
        user: { id: userId },
      });

      const { reply } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(mockRedisData.has(`rl:fee:${userId}`)).toBe(true);
    });

    it('should fall back to IP when no user ID', async () => {
      const mockRequest = createMockRequest({
        ip: '10.0.0.50',
      });

      const { reply } = createMockReply();
      await feeCalculatorRateLimit(mockRequest, reply);

      expect(mockRedisData.has('rl:fee:10.0.0.50')).toBe(true);
    });
  });
});
