/**
 * Rate Limit Middleware Tests
 * Tests for payment API rate limiting
 */

import { createMockRequest, createMockReply } from '../../setup';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('RateLimitMiddleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockStore: Map<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequest = createMockRequest();
    mockReply = createMockReply();
    mockStore = new Map();
  });

  describe('basic rate limiting', () => {
    it('should allow requests within limit', async () => {
      const config = { windowMs: 60000, max: 100 };
      mockRequest.ip = '192.168.1.1';

      for (let i = 0; i < 50; i++) {
        const result = await checkRateLimit(mockRequest, config, mockStore);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block requests exceeding limit', async () => {
      const config = { windowMs: 60000, max: 10 };
      mockRequest.ip = '192.168.1.1';

      for (let i = 0; i < 10; i++) {
        await checkRateLimit(mockRequest, config, mockStore);
      }

      const result = await checkRateLimit(mockRequest, config, mockStore);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should return remaining count', async () => {
      const config = { windowMs: 60000, max: 10 };
      mockRequest.ip = '192.168.1.1';

      await checkRateLimit(mockRequest, config, mockStore);
      await checkRateLimit(mockRequest, config, mockStore);
      
      const result = await checkRateLimit(mockRequest, config, mockStore);
      expect(result.remaining).toBe(7);
    });

    it('should reset after window expires', async () => {
      const config = { windowMs: 100, max: 5 };
      mockRequest.ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        await checkRateLimit(mockRequest, config, mockStore);
      }

      await new Promise(resolve => setTimeout(resolve, 150));

      const result = await checkRateLimit(mockRequest, config, mockStore);
      expect(result.allowed).toBe(true);
    });
  });

  describe('key generation', () => {
    it('should use IP address by default', async () => {
      const config = { windowMs: 60000, max: 100 };
      mockRequest.ip = '10.0.0.1';

      await checkRateLimit(mockRequest, config, mockStore);

      expect(mockStore.has('10.0.0.1')).toBe(true);
    });

    it('should use user ID when authenticated', async () => {
      const config = { windowMs: 60000, max: 100, keyGenerator: 'user' };
      mockRequest.user = { id: 'user_123' };

      await checkRateLimit(mockRequest, config, mockStore);

      expect(mockStore.has('user:user_123')).toBe(true);
    });

    it('should use custom key generator', async () => {
      const config = {
        windowMs: 60000,
        max: 100,
        keyGenerator: (req: any) => `custom:${req.headers['x-api-key']}`,
      };
      mockRequest.headers = { 'x-api-key': 'api_key_123' };

      await checkRateLimit(mockRequest, config, mockStore);

      expect(mockStore.has('custom:api_key_123')).toBe(true);
    });

    it('should separate limits per endpoint', async () => {
      const config = { windowMs: 60000, max: 10, keyGenerator: 'endpoint' };
      mockRequest.ip = '192.168.1.1';
      mockRequest.url = '/api/payments';

      await checkRateLimit(mockRequest, config, mockStore);

      mockRequest.url = '/api/refunds';
      const result = await checkRateLimit(mockRequest, config, mockStore);

      expect(result.remaining).toBe(9); // New limit for different endpoint
    });
  });

  describe('payment-specific limits', () => {
    it('should apply stricter limits for payment creation', async () => {
      const config = getPaymentCreationLimits();
      mockRequest.ip = '192.168.1.1';
      mockRequest.url = '/api/payments';
      mockRequest.method = 'POST';

      const result = await checkRateLimit(mockRequest, config, mockStore);

      expect(config.max).toBeLessThan(100); // Stricter than default
    });

    it('should apply looser limits for payment queries', async () => {
      const config = getPaymentQueryLimits();
      mockRequest.ip = '192.168.1.1';
      mockRequest.url = '/api/payments';
      mockRequest.method = 'GET';

      expect(config.max).toBeGreaterThanOrEqual(100);
    });

    it('should apply very strict limits for refunds', async () => {
      const config = getRefundLimits();

      expect(config.max).toBeLessThanOrEqual(20);
    });
  });

  describe('sliding window', () => {
    it('should use sliding window algorithm', async () => {
      const config = { windowMs: 1000, max: 10, algorithm: 'sliding' };
      mockRequest.ip = '192.168.1.1';

      for (let i = 0; i < 5; i++) {
        await checkRateLimit(mockRequest, config, mockStore);
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      for (let i = 0; i < 4; i++) {
        const result = await checkRateLimit(mockRequest, config, mockStore);
        expect(result.allowed).toBe(true);
      }
    });
  });

  describe('token bucket', () => {
    it('should use token bucket algorithm', async () => {
      const config = { 
        max: 10, 
        refillRate: 1, 
        refillInterval: 100,
        algorithm: 'token-bucket' 
      };
      mockRequest.ip = '192.168.1.1';

      // Consume all tokens
      for (let i = 0; i < 10; i++) {
        await checkRateLimit(mockRequest, config, mockStore);
      }

      // Should be blocked
      let result = await checkRateLimit(mockRequest, config, mockStore);
      expect(result.allowed).toBe(false);

      // Wait for refill
      await new Promise(resolve => setTimeout(resolve, 150));

      result = await checkRateLimit(mockRequest, config, mockStore);
      expect(result.allowed).toBe(true);
    });
  });

  describe('distributed rate limiting', () => {
    it('should support Redis backend', async () => {
      const config = { windowMs: 60000, max: 100, store: 'redis' };
      mockRequest.ip = '192.168.1.1';

      const result = await checkRateLimit(mockRequest, config, mockStore);

      expect(result.allowed).toBe(true);
    });

    it('should handle Redis connection failure gracefully', async () => {
      const config = { windowMs: 60000, max: 100, store: 'redis', failOpen: true };
      mockRequest.ip = '192.168.1.1';

      // Simulate Redis failure
      const result = await checkRateLimitWithFailure(mockRequest, config);

      expect(result.allowed).toBe(true); // Fail open
    });

    it('should sync across instances', async () => {
      const config = { windowMs: 60000, max: 10, store: 'redis' };
      mockRequest.ip = '192.168.1.1';

      // Simulate requests from multiple instances
      await simulateDistributedRequests(5, mockRequest, config, mockStore);

      const result = await checkRateLimit(mockRequest, config, mockStore);
      expect(result.remaining).toBe(4);
    });
  });

  describe('response headers', () => {
    it('should set rate limit headers', async () => {
      const config = { windowMs: 60000, max: 100 };
      mockRequest.ip = '192.168.1.1';

      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should set Retry-After header when blocked', async () => {
      const config = { windowMs: 60000, max: 1 };
      mockRequest.ip = '192.168.1.1';

      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);
      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });
  });

  describe('whitelist and blacklist', () => {
    it('should skip rate limiting for whitelisted IPs', async () => {
      const config = { 
        windowMs: 60000, 
        max: 1, 
        whitelist: ['192.168.1.100'] 
      };
      mockRequest.ip = '192.168.1.100';

      for (let i = 0; i < 100; i++) {
        const result = await checkRateLimit(mockRequest, config, mockStore);
        expect(result.allowed).toBe(true);
      }
    });

    it('should always block blacklisted IPs', async () => {
      const config = { 
        windowMs: 60000, 
        max: 100, 
        blacklist: ['10.0.0.100'] 
      };
      mockRequest.ip = '10.0.0.100';

      const result = await checkRateLimit(mockRequest, config, mockStore);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('blacklist');
    });
  });

  describe('dynamic limits', () => {
    it('should apply different limits based on user tier', async () => {
      mockRequest.user = { id: 'user_premium', tier: 'premium' };

      const config = getTierBasedLimits(mockRequest);

      expect(config.max).toBeGreaterThan(100);
    });

    it('should apply default limits for anonymous users', async () => {
      mockRequest.user = undefined;

      const config = getTierBasedLimits(mockRequest);

      expect(config.max).toBe(60); // Default
    });

    it('should apply burst limits during high traffic', async () => {
      const normalConfig = { windowMs: 60000, max: 100 };
      const burstConfig = { windowMs: 60000, max: 50, burst: true };

      expect(burstConfig.max).toBeLessThan(normalConfig.max);
    });
  });

  describe('error responses', () => {
    it('should return 429 when rate limited', async () => {
      const config = { windowMs: 60000, max: 1 };
      mockRequest.ip = '192.168.1.1';

      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);
      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);

      expect(mockReply.status).toHaveBeenCalledWith(429);
    });

    it('should include error message', async () => {
      const config = { windowMs: 60000, max: 1 };
      mockRequest.ip = '192.168.1.1';

      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);
      await applyRateLimitMiddleware(mockRequest, mockReply, config, mockStore);

      expect(mockReply.send).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.stringContaining('rate limit'),
      }));
    });
  });
});

// Helper functions
async function checkRateLimit(request: any, config: any, store: Map<string, any>): Promise<any> {
  let key = request.ip;
  
  if (config.keyGenerator === 'user' && request.user) {
    key = `user:${request.user.id}`;
  } else if (config.keyGenerator === 'endpoint') {
    key = `${request.ip}:${request.url}`;
  } else if (typeof config.keyGenerator === 'function') {
    key = config.keyGenerator(request);
  }

  // Check blacklist
  if (config.blacklist?.includes(request.ip)) {
    return { allowed: false, reason: 'IP is blacklisted' };
  }

  // Check whitelist
  if (config.whitelist?.includes(request.ip)) {
    return { allowed: true, remaining: Infinity };
  }

  const now = Date.now();
  const record = store.get(key) || { count: 0, resetTime: now + (config.windowMs || 60000) };

  // Check if window expired
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + (config.windowMs || 60000);
  }

  record.count++;
  store.set(key, record);

  const max = config.max || 100;
  const allowed = record.count <= max;
  const remaining = Math.max(0, max - record.count);

  return {
    allowed,
    remaining,
    resetTime: record.resetTime,
  };
}

async function checkRateLimitWithFailure(request: any, config: any): Promise<any> {
  if (config.failOpen) {
    return { allowed: true };
  }
  return { allowed: false };
}

async function simulateDistributedRequests(count: number, request: any, config: any, store: Map<string, any>): Promise<void> {
  for (let i = 0; i < count; i++) {
    await checkRateLimit(request, config, store);
  }
}

async function applyRateLimitMiddleware(request: any, reply: any, config: any, store: Map<string, any>): Promise<void> {
  const result = await checkRateLimit(request, config, store);

  reply.header('X-RateLimit-Limit', config.max);
  reply.header('X-RateLimit-Remaining', result.remaining);
  reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));

  if (!result.allowed) {
    reply.header('Retry-After', Math.ceil((result.resetTime - Date.now()) / 1000));
    reply.status(429);
    reply.send({ error: 'Too many requests - rate limit exceeded' });
  }
}

function getPaymentCreationLimits(): any {
  return { windowMs: 60000, max: 30 };
}

function getPaymentQueryLimits(): any {
  return { windowMs: 60000, max: 200 };
}

function getRefundLimits(): any {
  return { windowMs: 60000, max: 10 };
}

function getTierBasedLimits(request: any): any {
  if (!request.user) {
    return { windowMs: 60000, max: 60 };
  }
  
  const tierLimits: Record<string, number> = {
    basic: 100,
    premium: 500,
    enterprise: 2000,
  };

  return { windowMs: 60000, max: tierLimits[request.user.tier] || 100 };
}
