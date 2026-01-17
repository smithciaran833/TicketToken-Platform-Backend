/**
 * Rate Limit Middleware Unit Tests
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockRedisIncr = jest.fn();
const mockRedisExpire = jest.fn();
const mockRedisTtl = jest.fn();

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => ({
    incr: mockRedisIncr,
    expire: mockRedisExpire,
    ttl: mockRedisTtl,
  }),
}));

import {
  rateLimitMiddleware,
  createRateLimiter,
  RateLimitExceededError,
} from '../../../src/middleware/rate-limit.middleware';
import { logger } from '../../../src/utils/logger';

describe('Rate Limit Middleware', () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      path: '/api/analytics',
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
    };

    mockRes = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    mockRedisIncr.mockResolvedValue(1);
    mockRedisExpire.mockResolvedValue(1);
    mockRedisTtl.mockResolvedValue(60);
  });

  describe('RateLimitExceededError', () => {
    it('should create with 429 status code', () => {
      const error = new RateLimitExceededError('Too many requests', 30);

      expect(error.statusCode).toBe(429);
      expect(error.message).toBe('Too many requests');
      expect(error.retryAfter).toBe(30);
      expect(error.name).toBe('RateLimitExceededError');
    });
  });

  describe('rateLimitMiddleware', () => {
    it('should skip rate limiting for /health path', async () => {
      mockReq.path = '/health';

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for /ws-health path', async () => {
      mockReq.path = '/ws-health';

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });

    it('should increment counter and allow request under limit', async () => {
      mockRedisIncr.mockResolvedValue(50);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRedisIncr).toHaveBeenCalledWith('rate_limit:192.168.1.1:/api/analytics');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set expire on first request', async () => {
      mockRedisIncr.mockResolvedValue(1);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRedisExpire).toHaveBeenCalledWith(
        'rate_limit:192.168.1.1:/api/analytics',
        60
      );
    });

    it('should not set expire on subsequent requests', async () => {
      mockRedisIncr.mockResolvedValue(5);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRedisExpire).not.toHaveBeenCalled();
    });

    it('should set rate limit headers', async () => {
      mockRedisIncr.mockResolvedValue(50);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '50');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String)
      );
    });

    it('should return 429 when rate limit exceeded', async () => {
      mockRedisIncr.mockResolvedValue(101);
      mockRedisTtl.mockResolvedValue(45);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
      expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', '45');
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'https://httpstatuses.io/429',
          title: 'Too Many Requests',
          status: 429,
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should set remaining to 0 when limit exceeded', async () => {
      mockRedisIncr.mockResolvedValue(150);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
    });

    it('should use socket.remoteAddress as fallback for IP', async () => {
      mockReq.ip = undefined;

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRedisIncr).toHaveBeenCalledWith('rate_limit:192.168.1.1:/api/analytics');
    });

    it('should use "unknown" when no IP available', async () => {
      mockReq.ip = undefined;
      mockReq.socket.remoteAddress = undefined;

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRedisIncr).toHaveBeenCalledWith('rate_limit:unknown:/api/analytics');
    });

    it('should continue on Redis error', async () => {
      mockRedisIncr.mockRejectedValue(new Error('Redis connection failed'));

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Rate limit error:', expect.any(Error));
    });

    it('should use window default for TTL when TTL is 0 or negative', async () => {
      mockRedisIncr.mockResolvedValue(101);
      mockRedisTtl.mockResolvedValue(-1);

      await rateLimitMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', '60');
    });
  });

  describe('createRateLimiter', () => {
    it('should create limiter with default options', async () => {
      const limiter = createRateLimiter({});

      await limiter(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use custom max limit', async () => {
      const limiter = createRateLimiter({ max: 10 });
      mockRedisIncr.mockResolvedValue(11);

      await limiter(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(429);
    });

    it('should use custom key prefix', async () => {
      const limiter = createRateLimiter({ keyPrefix: 'custom:' });

      await limiter(mockReq, mockRes, mockNext);

      expect(mockRedisIncr).toHaveBeenCalledWith('custom:192.168.1.1:/api/analytics');
    });

    it('should use custom key generator', async () => {
      const limiter = createRateLimiter({
        keyGenerator: (req) => `user-${req.path}`,
      });

      await limiter(mockReq, mockRes, mockNext);

      expect(mockRedisIncr).toHaveBeenCalledWith('rate_limit:user-/api/analytics:/api/analytics');
    });

    it('should use custom window in milliseconds', async () => {
      const limiter = createRateLimiter({ windowMs: 30000 }); // 30 seconds
      mockRedisIncr.mockResolvedValue(1);

      await limiter(mockReq, mockRes, mockNext);

      expect(mockRedisExpire).toHaveBeenCalledWith(
        expect.any(String),
        30
      );
    });

    it('should skip health check paths', async () => {
      mockReq.path = '/health';
      const limiter = createRateLimiter({ max: 1 });

      await limiter(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRedisIncr).not.toHaveBeenCalled();
    });
  });
});
