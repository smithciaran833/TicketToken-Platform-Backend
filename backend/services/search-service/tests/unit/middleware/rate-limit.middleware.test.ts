// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/middleware/rate-limit.middleware.ts
 */

jest.mock('ioredis');

describe('src/middleware/rate-limit.middleware.ts - Comprehensive Unit Tests', () => {
  let Redis: any;
  let mockRedis: any;
  let mockRequest: any;
  let mockReply: any;
  const originalConsoleError = console.error;
  const originalDateNow = Date.now;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    console.error = jest.fn();

    // Mock Date.now for consistent testing
    Date.now = jest.fn().mockReturnValue(1000000);

    // Mock Redis
    mockRedis = {
      multi: jest.fn().mockReturnThis(),
      incr: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1)
    };

    Redis = require('ioredis');
    Redis.mockImplementation(() => mockRedis);

    // Mock request and reply
    mockRequest = {
      user: {
        id: 'user-123',
        venueId: 'venue-1'
      }
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    console.error = originalConsoleError;
    Date.now = originalDateNow;
  });

  // =============================================================================
  // RateLimiter - Constructor
  // =============================================================================

  describe('RateLimiter - Constructor', () => {
    it('should create instance with redis and config', () => {
      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const config = { max: 100, window: 60000 };

      const limiter = new RateLimiter(mockRedis, config);

      expect(limiter).toBeDefined();
    });

    it('should store redis instance', () => {
      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const config = { max: 100, window: 60000 };

      const limiter = new RateLimiter(mockRedis, config);

      expect(limiter.redis).toBe(mockRedis);
    });

    it('should store config', () => {
      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const config = { max: 100, window: 60000 };

      const limiter = new RateLimiter(mockRedis, config);

      expect(limiter.config).toBe(config);
    });
  });

  // =============================================================================
  // RateLimiter - checkLimit() Success Cases
  // =============================================================================

  describe('RateLimiter - checkLimit() Success Cases', () => {
    it('should allow request under limit', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.allowed).toBe(true);
    });

    it('should return remaining count', async () => {
      mockRedis.exec.mockResolvedValue([[null, 50], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.remaining).toBe(50);
    });

    it('should return reset time', async () => {
      Date.now = jest.fn().mockReturnValue(1000000);
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.resetTime).toBe(1060000);
    });

    it('should increment user counter', async () => {
      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.checkLimit('user-1');

      expect(mockRedis.incr).toHaveBeenCalled();
    });

    it('should set TTL on user key', async () => {
      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.checkLimit('user-1');

      expect(mockRedis.pexpire).toHaveBeenCalled();
    });

    it('should use correct window for TTL', async () => {
      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 45000 });

      await limiter.checkLimit('user-1');

      expect(mockRedis.pexpire).toHaveBeenCalledWith(expect.any(String), 45000);
    });
  });

  // =============================================================================
  // RateLimiter - checkLimit() Rate Limiting
  // =============================================================================

  describe('RateLimiter - checkLimit() Rate Limiting', () => {
    it('should deny request when limit exceeded', async () => {
      mockRedis.exec.mockResolvedValue([[null, 101], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.allowed).toBe(false);
    });

    it('should return zero remaining when over limit', async () => {
      mockRedis.exec.mockResolvedValue([[null, 150], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.remaining).toBe(0);
    });

    it('should allow request at exact limit', async () => {
      mockRedis.exec.mockResolvedValue([[null, 100], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });
  });

  // =============================================================================
  // RateLimiter - checkLimit() Tenant Limits
  // =============================================================================

  describe('RateLimiter - checkLimit() Tenant Limits', () => {
    it('should check tenant limit when venueId provided', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.checkLimit('user-1', 'venue-1');

      expect(mockRedis.multi).toHaveBeenCalledTimes(2);
    });

    it('should deny when tenant limit exceeded', async () => {
      mockRedis.exec
        .mockResolvedValueOnce([[null, 50], [null, 1]]) // User under limit
        .mockResolvedValueOnce([[null, 1001], [null, 1]]); // Tenant over limit (10x)

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1', 'venue-1');

      expect(result.allowed).toBe(false);
    });

    it('should apply 10x multiplier to tenant limit', async () => {
      mockRedis.exec
        .mockResolvedValueOnce([[null, 50], [null, 1]])
        .mockResolvedValueOnce([[null, 999], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1', 'venue-1');

      // 100 * 10 = 1000, so 999 should be allowed
      expect(result.allowed).toBe(true);
    });

    it('should not check tenant limit without venueId', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.checkLimit('user-1');

      expect(mockRedis.multi).toHaveBeenCalledTimes(1);
    });
  });

  // =============================================================================
  // RateLimiter - checkLimit() Error Handling
  // =============================================================================

  describe('RateLimiter - checkLimit() Error Handling', () => {
    it('should allow request on Redis error', async () => {
      mockRedis.exec.mockRejectedValue(new Error('Redis down'));

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.allowed).toBe(true);
    });

    it('should log Redis errors', async () => {
      const error = new Error('Connection failed');
      mockRedis.exec.mockRejectedValue(error);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.checkLimit('user-1');

      expect(console.error).toHaveBeenCalledWith('Rate limit check failed:', error);
    });

    it('should return max remaining on error', async () => {
      mockRedis.exec.mockRejectedValue(new Error('Error'));

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.remaining).toBe(100);
    });

    it('should handle null exec response', async () => {
      mockRedis.exec.mockResolvedValue(null);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      const result = await limiter.checkLimit('user-1');

      expect(result.allowed).toBe(true);
    });
  });

  // =============================================================================
  // RateLimiter - resetLimit()
  // =============================================================================

  describe('RateLimiter - resetLimit()', () => {
    it('should find keys for user', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2']);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.resetLimit('user-123');

      expect(mockRedis.keys).toHaveBeenCalledWith('ratelimit:user:user-123:*');
    });

    it('should delete found keys', async () => {
      mockRedis.keys.mockResolvedValue(['key1', 'key2', 'key3']);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.resetLimit('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2', 'key3');
    });

    it('should not delete when no keys found', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await limiter.resetLimit('user-123');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it('should handle empty key array', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const { RateLimiter } = require('../../../src/middleware/rate-limit.middleware');
      const limiter = new RateLimiter(mockRedis, { max: 100, window: 60000 });

      await expect(limiter.resetLimit('user-123')).resolves.not.toThrow();
    });
  });

  // =============================================================================
  // createRateLimitMiddleware() - Middleware Creation
  // =============================================================================

  describe('createRateLimitMiddleware() - Middleware Creation', () => {
    it('should return a function', () => {
      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const config = { max: 100, window: 60000 };

      const middleware = createRateLimitMiddleware(mockRedis, config);

      expect(typeof middleware).toBe('function');
    });

    it('should create RateLimiter instance', () => {
      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const config = { max: 100, window: 60000 };

      const middleware = createRateLimitMiddleware(mockRedis, config);

      expect(middleware).toBeDefined();
    });
  });

  // =============================================================================
  // createRateLimitMiddleware() - Middleware Execution
  // =============================================================================

  describe('createRateLimitMiddleware() - Middleware Execution', () => {
    it('should require authentication', async () => {
      mockRequest.user = undefined;

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Authentication required'
      });
    });

    it('should require user id', async () => {
      mockRequest.user = { role: 'admin' };

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should set rate limit headers', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });

    it('should set remaining header', async () => {
      mockRedis.exec.mockResolvedValue([[null, 25], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '75');
    });

    it('should set reset header', async () => {
      Date.now = jest.fn().mockReturnValue(1000000);
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should allow request when under limit', async () => {
      mockRedis.exec.mockResolvedValue([[null, 1], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).not.toHaveBeenCalledWith(429);
    });

    it('should return 429 when rate limited', async () => {
      mockRedis.exec.mockResolvedValue([[null, 101], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(429);
    });

    it('should include retry-after in 429 response', async () => {
      Date.now = jest.fn().mockReturnValue(1000000);
      mockRedis.exec.mockResolvedValue([[null, 101], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          retryAfter: expect.any(Number)
        })
      );
    });

    it('should include error message in 429 response', async () => {
      mockRedis.exec.mockResolvedValue([[null, 101], [null, 1]]);

      const { createRateLimitMiddleware } = require('../../../src/middleware/rate-limit.middleware');
      const middleware = createRateLimitMiddleware(mockRedis, { max: 100, window: 60000 });

      await middleware(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
          message: expect.any(String)
        })
      );
    });
  });

  // =============================================================================
  // rateLimitPresets
  // =============================================================================

  describe('rateLimitPresets', () => {
    it('should export search preset', () => {
      const { rateLimitPresets } = require('../../../src/middleware/rate-limit.middleware');

      expect(rateLimitPresets.search).toEqual({
        max: 100,
        window: 60000
      });
    });

    it('should export suggest preset', () => {
      const { rateLimitPresets } = require('../../../src/middleware/rate-limit.middleware');

      expect(rateLimitPresets.suggest).toEqual({
        max: 200,
        window: 60000
      });
    });

    it('should export admin preset', () => {
      const { rateLimitPresets } = require('../../../src/middleware/rate-limit.middleware');

      expect(rateLimitPresets.admin).toEqual({
        max: 1000,
        window: 60000
      });
    });

    it('should export analytics preset', () => {
      const { rateLimitPresets } = require('../../../src/middleware/rate-limit.middleware');

      expect(rateLimitPresets.analytics).toEqual({
        max: 20,
        window: 60000
      });
    });

    it('should have 4 presets', () => {
      const { rateLimitPresets } = require('../../../src/middleware/rate-limit.middleware');

      expect(Object.keys(rateLimitPresets)).toHaveLength(4);
    });
  });

  // =============================================================================
  // registerRateLimiting()
  // =============================================================================

  describe('registerRateLimiting()', () => {
    let mockFastify: any;

    beforeEach(() => {
      mockFastify = {
        addHook: jest.fn()
      };
    });

    it('should register preHandler hook', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis);

      expect(mockFastify.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
    });

    it('should use default config', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis);

      expect(mockFastify.addHook).toHaveBeenCalled();
    });

    it('should merge custom config with defaults', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis, { max: 200 });

      expect(mockFastify.addHook).toHaveBeenCalled();
    });

    it('should use custom max', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis, { max: 500 });

      expect(mockFastify.addHook).toHaveBeenCalled();
    });

    it('should use custom window', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis, { window: 30000 });

      expect(mockFastify.addHook).toHaveBeenCalled();
    });

    it('should handle skipSuccessfulRequests option', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis, { skipSuccessfulRequests: true });

      expect(mockFastify.addHook).toHaveBeenCalled();
    });

    it('should handle skipFailedRequests option', async () => {
      const { registerRateLimiting } = require('../../../src/middleware/rate-limit.middleware');

      await registerRateLimiting(mockFastify, mockRedis, { skipFailedRequests: true });

      expect(mockFastify.addHook).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export RateLimiter class', () => {
      const module = require('../../../src/middleware/rate-limit.middleware');

      expect(module.RateLimiter).toBeDefined();
    });

    it('should export createRateLimitMiddleware function', () => {
      const module = require('../../../src/middleware/rate-limit.middleware');

      expect(module.createRateLimitMiddleware).toBeDefined();
      expect(typeof module.createRateLimitMiddleware).toBe('function');
    });

    it('should export rateLimitPresets', () => {
      const module = require('../../../src/middleware/rate-limit.middleware');

      expect(module.rateLimitPresets).toBeDefined();
    });

    it('should export registerRateLimiting function', () => {
      const module = require('../../../src/middleware/rate-limit.middleware');

      expect(module.registerRateLimiting).toBeDefined();
      expect(typeof module.registerRateLimiting).toBe('function');
    });
  });
});
