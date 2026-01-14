/**
 * Unit Tests for Rate Limit Middleware
 * Tests per-user, per-IP, and per-endpoint rate limiting
 */

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    })),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Mock Redis
const mockPipeline = {
  zremrangebyscore: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  pexpire: jest.fn().mockReturnThis(),
  exec: jest.fn()
};

const mockRedis = {
  multi: jest.fn(() => mockPipeline),
  keys: jest.fn(),
  del: jest.fn()
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedis
}));

// Helper to create mock request
const createMockRequest = (options: {
  method?: string;
  url?: string;
  routeOptions?: any;
  headers?: Record<string, string>;
  ip?: string;
  user?: any;
}) => ({
  method: options.method || 'GET',
  url: options.url || '/api/v1/listings',
  routeOptions: options.routeOptions || { url: options.url || '/api/v1/listings' },
  headers: options.headers || {},
  ip: options.ip || '127.0.0.1',
  user: options.user
});

// Helper to create mock reply
const createMockReply = () => {
  const reply: any = {
    statusCode: 200,
    body: null,
    _headers: {} as Record<string, string>
  };
  reply.status = jest.fn((code: number) => {
    reply.statusCode = code;
    return reply;
  });
  reply.send = jest.fn((body: any) => {
    reply.body = body;
    return reply;
  });
  reply.header = jest.fn((name: string, value: string) => {
    reply._headers[name] = value;
    return reply;
  });
  return reply;
};

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: allow requests (count under limit)
    mockPipeline.exec.mockResolvedValue([
      [null, 1], // zremrangebyscore
      [null, 1], // zadd
      [null, 5], // zcard (count)
      [null, 1]  // pexpire
    ]);
  });

  describe('userRateLimitMiddleware', () => {
    it('should skip if no user ID', async () => {
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({});
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(mockRedis.multi).not.toHaveBeenCalled();
    });

    it('should check rate limit for authenticated user', async () => {
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'user-123' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      expect(mockRedis.multi).toHaveBeenCalled();
      expect(done).toHaveBeenCalled();
    });

    it('should set rate limit headers', async () => {
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'user-123' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
      expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
      expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should reject when rate limit exceeded', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 200], // Count exceeds limit
        [null, 1]
      ]);
      
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'user-123' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(429);
      expect(reply.body.error).toBe('Too Many Requests');
      expect(done).not.toHaveBeenCalled();
    });

    it('should apply user tier multiplier', async () => {
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'user-123', tier: 'premium' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      // Premium users get 5x multiplier
      expect(done).toHaveBeenCalled();
    });

    it('should apply admin tier multiplier', async () => {
      // With admin tier (50x multiplier), even 200 requests should be allowed
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 200],
        [null, 1]
      ]);
      
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'admin-123', tier: 'admin' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      // Admin tier: 100 * 50 = 5000 max requests
      expect(done).toHaveBeenCalled();
    });
  });

  describe('ipRateLimitMiddleware', () => {
    it('should check rate limit by IP', async () => {
      const { ipRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        ip: '192.168.1.1'
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await ipRateLimitMiddleware(request, reply, done);
      
      expect(mockRedis.multi).toHaveBeenCalled();
      expect(done).toHaveBeenCalled();
    });

    it('should use x-forwarded-for header', async () => {
      const { ipRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        headers: { 'x-forwarded-for': '10.0.0.1, 192.168.1.1' },
        ip: '127.0.0.1'
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await ipRateLimitMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });

    it('should use x-real-ip header', async () => {
      const { ipRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        headers: { 'x-real-ip': '10.0.0.2' },
        ip: '127.0.0.1'
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await ipRateLimitMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });

    it('should reject when IP rate limit exceeded', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 500], // Exceeds IP limit
        [null, 1]
      ]);
      
      const { ipRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        ip: '192.168.1.1'
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await ipRateLimitMiddleware(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(429);
      expect(reply.body.message).toContain('IP address');
    });
  });

  describe('createRateLimiter', () => {
    it('should create rate limiter with defaults', () => {
      const { createRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const limiter = createRateLimiter();
      
      expect(typeof limiter).toBe('function');
    });

    it('should create rate limiter with custom config', () => {
      const { createRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const limiter = createRateLimiter({
        windowMs: 30000,
        max: 50
      });
      
      expect(typeof limiter).toBe('function');
    });

    it('should skip when skip function returns true', async () => {
      const { createRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const limiter = createRateLimiter({
        skip: () => true
      });
      
      const request = createMockRequest({});
      const reply = createMockReply();
      const done = jest.fn();
      
      await limiter(request, reply, done);
      
      expect(done).toHaveBeenCalled();
      expect(mockRedis.multi).not.toHaveBeenCalled();
    });

    it('should use custom key generator', async () => {
      const { createRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const customKeyGen = jest.fn().mockReturnValue('custom-key');
      const limiter = createRateLimiter({
        keyGenerator: customKeyGen
      });
      
      const request = createMockRequest({});
      const reply = createMockReply();
      const done = jest.fn();
      
      await limiter(request, reply, done);
      
      expect(customKeyGen).toHaveBeenCalledWith(request);
    });

    it('should use custom handler when rate limited', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 1000], // Exceeds limit
        [null, 1]
      ]);
      
      const { createRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const customHandler = jest.fn();
      const limiter = createRateLimiter({
        max: 10,
        handler: customHandler
      });
      
      const request = createMockRequest({});
      const reply = createMockReply();
      const done = jest.fn();
      
      await limiter(request, reply, done);
      
      expect(customHandler).toHaveBeenCalledWith(request, reply);
    });
  });

  describe('strictRateLimiter', () => {
    it('should be created with strict limits', () => {
      const { strictRateLimiter } = require('../../../src/middleware/rate-limit');
      
      expect(typeof strictRateLimiter).toBe('function');
    });

    it('should reject quickly under strict limits', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 10], // Exceeds strict limit of 5
        [null, 1]
      ]);
      
      const { strictRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({});
      const reply = createMockReply();
      const done = jest.fn();
      
      await strictRateLimiter(request, reply, done);
      
      expect(reply.status).toHaveBeenCalledWith(429);
    });
  });

  describe('relaxedRateLimiter', () => {
    it('should be created with relaxed limits', () => {
      const { relaxedRateLimiter } = require('../../../src/middleware/rate-limit');
      
      expect(typeof relaxedRateLimiter).toBe('function');
    });

    it('should allow many requests', async () => {
      mockPipeline.exec.mockResolvedValue([
        [null, 1],
        [null, 1],
        [null, 400], // Under relaxed limit of 500
        [null, 1]
      ]);
      
      const { relaxedRateLimiter } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({});
      const reply = createMockReply();
      const done = jest.fn();
      
      await relaxedRateLimiter(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });
  });

  describe('resetUserRateLimit', () => {
    it('should delete user rate limit keys', async () => {
      mockRedis.keys.mockResolvedValue(['ratelimit:user:user-123:GET /api', 'ratelimit:user:user-123:POST /api']);
      mockRedis.del.mockResolvedValue(2);
      
      const { resetUserRateLimit } = require('../../../src/middleware/rate-limit');
      
      await resetUserRateLimit('user-123');
      
      expect(mockRedis.keys).toHaveBeenCalledWith('ratelimit:user:user-123:*');
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should handle empty keys', async () => {
      mockRedis.keys.mockResolvedValue([]);
      
      const { resetUserRateLimit } = require('../../../src/middleware/rate-limit');
      
      await resetUserRateLimit('user-123');
      
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));
      
      const { resetUserRateLimit } = require('../../../src/middleware/rate-limit');
      
      // Should not throw
      await resetUserRateLimit('user-123');
    });
  });

  describe('rateLimitConfig', () => {
    it('should export configuration', () => {
      const { rateLimitConfig } = require('../../../src/middleware/rate-limit');
      
      expect(rateLimitConfig.DEFAULT_WINDOW_MS).toBeDefined();
      expect(rateLimitConfig.DEFAULT_MAX_REQUESTS).toBeDefined();
      expect(rateLimitConfig.ENDPOINT_LIMITS).toBeDefined();
      expect(rateLimitConfig.USER_TIER_MULTIPLIERS).toBeDefined();
    });

    it('should have purchase endpoint limits', () => {
      const { rateLimitConfig } = require('../../../src/middleware/rate-limit');
      
      expect(rateLimitConfig.ENDPOINT_LIMITS['POST /api/v1/purchases']).toBeDefined();
      expect(rateLimitConfig.ENDPOINT_LIMITS['POST /api/v1/purchases'].max).toBe(10);
    });

    it('should have user tier multipliers', () => {
      const { rateLimitConfig } = require('../../../src/middleware/rate-limit');
      
      expect(rateLimitConfig.USER_TIER_MULTIPLIERS.free).toBe(1);
      expect(rateLimitConfig.USER_TIER_MULTIPLIERS.premium).toBe(5);
      expect(rateLimitConfig.USER_TIER_MULTIPLIERS.admin).toBe(50);
    });
  });

  describe('graceful degradation', () => {
    it('should allow requests when Redis fails', async () => {
      mockPipeline.exec.mockResolvedValue(null);
      
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'user-123' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });

    it('should allow requests on Redis error', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('Connection refused'));
      
      const { userRateLimitMiddleware } = require('../../../src/middleware/rate-limit');
      
      const request = createMockRequest({
        user: { id: 'user-123' }
      });
      const reply = createMockReply();
      const done = jest.fn();
      
      await userRateLimitMiddleware(request, reply, done);
      
      expect(done).toHaveBeenCalled();
    });
  });
});
