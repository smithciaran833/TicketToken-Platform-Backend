// Mock dependencies BEFORE imports
const mockRedisZremrangebyscore = jest.fn();
const mockRedisZadd = jest.fn();
const mockRedisZcard = jest.fn();
const mockRedisPexpire = jest.fn();
const mockRedisMulti = jest.fn();
const mockRedisExec = jest.fn();
const mockRedisOn = jest.fn();

let mockRedisInstance: any = null;

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    mockRedisInstance = {
      multi: mockRedisMulti,
      on: mockRedisOn,
    };
    return mockRedisInstance;
  });
});

const mockLoggerWarn = jest.fn();
const mockLoggerError = jest.fn();

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    warn: mockLoggerWarn,
    error: mockLoggerError,
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockGetRedisConfig = jest.fn();
const mockGetRateLimitConfig = jest.fn();

jest.mock('../../../src/config/index', () => ({
  getRedisConfig: mockGetRedisConfig,
  getRateLimitConfig: mockGetRateLimitConfig,
  isProduction: jest.fn(() => false),
}));

jest.mock('../../../src/errors/index', () => ({
  RateLimitError: class RateLimitError extends Error {
    constructor(options: any) {
      super('Rate limit exceeded');
      this.name = 'RateLimitError';
    }
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';

describe('rate-limit-redis middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockHeader: jest.Mock;

  // Store the module reference
  let rateLimitModule: any;

  beforeAll(() => {
    // Set up default config mocks
    mockGetRedisConfig.mockReturnValue({
      host: 'localhost',
      port: 6379,
      password: undefined,
      db: 0,
      tls: undefined,
    });

    mockGetRateLimitConfig.mockReturnValue({
      enabled: true,
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockHeader = jest.fn().mockReturnThis();

    mockReply = {
      header: mockHeader,
    };

    mockRequest = {
      id: 'req-123',
      ip: '192.168.1.1',
      tenantId: 'tenant-123',
      user: { id: 'user-456' },
      params: {},
    };

    // Setup Redis multi mock
    const multiInstance = {
      zremrangebyscore: mockRedisZremrangebyscore.mockReturnThis(),
      zadd: mockRedisZadd.mockReturnThis(),
      zcard: mockRedisZcard.mockReturnThis(),
      pexpire: mockRedisPexpire.mockReturnThis(),
      exec: mockRedisExec,
    };
    mockRedisMulti.mockReturnValue(multiInstance);

    // Default: allow request (count = 1)
    mockRedisExec.mockResolvedValue([
      [null, 0], // zremrangebyscore
      [null, 1], // zadd
      [null, 1], // zcard
      [null, 1], // pexpire
    ]);

    // Clear the module cache and reimport to reset Redis client
    jest.resetModules();
    rateLimitModule = require('../../../src/middleware/rate-limit-redis');
  });

  describe('createRateLimiter', () => {
    it('should allow request within limit', async () => {
      const limiter = rateLimitModule.createRateLimiter({
        keyPrefix: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 5], // 5 requests in window
        [null, 1],
      ]);

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 5);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should throw RateLimitError when limit exceeded', async () => {
      const { RateLimitError } = require('../../../src/errors/index');
      
      const limiter = rateLimitModule.createRateLimiter({
        keyPrefix: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 11], // 11 requests (over limit of 10)
        [null, 1],
      ]);

      await expect(
        limiter(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(RateLimitError);

      expect(mockHeader).toHaveBeenCalledWith('Retry-After', expect.any(Number));
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.any(Object)
      );
    });

    it('should use custom key generator', async () => {
      const customKeyGen = jest.fn(() => 'custom-key-123');
      const limiter = rateLimitModule.createRateLimiter({
        keyPrefix: 'test',
        maxRequests: 10,
        windowMs: 60000,
        keyGenerator: customKeyGen,
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(customKeyGen).toHaveBeenCalledWith(mockRequest);
    });

    it('should skip when rate limiting disabled', async () => {
      mockGetRateLimitConfig.mockReturnValue({ enabled: false });
      
      // Reimport after config change
      jest.resetModules();
      rateLimitModule = require('../../../src/middleware/rate-limit-redis');

      const limiter = rateLimitModule.createRateLimiter({
        keyPrefix: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisMulti).not.toHaveBeenCalled();
      
      // Reset for other tests
      mockGetRateLimitConfig.mockReturnValue({ enabled: true });
    });

    it('should handle Redis exec returning null', async () => {
      // When exec returns null, it should fall back to memory store
      mockRedisExec.mockResolvedValue(null);

      const limiter = rateLimitModule.createRateLimiter({
        keyPrefix: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should fall back to memory and allow first request
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should fall back to memory when Redis fails', async () => {
      mockRedisExec.mockRejectedValue(new Error('Redis connection failed'));

      const limiter = rateLimitModule.createRateLimiter({
        keyPrefix: 'test',
        maxRequests: 10,
        windowMs: 60000,
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'Redis rate limit error, falling back to memory',
        expect.any(Object)
      );
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 9);
    });
  });

  describe('checkProviderRateLimit', () => {
    it('should check stripe rate limit', async () => {
      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 50],
        [null, 1],
      ]);

      const result = await rateLimitModule.checkProviderRateLimit('stripe', 'tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(50);
    });

    it('should check square rate limit', async () => {
      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 30],
        [null, 1],
      ]);

      const result = await rateLimitModule.checkProviderRateLimit('square', 'tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60);
      expect(result.remaining).toBe(30);
    });

    it('should check mailchimp rate limit', async () => {
      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 5],
        [null, 1],
      ]);

      const result = await rateLimitModule.checkProviderRateLimit('mailchimp', 'tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(10);
    });

    it('should check quickbooks rate limit', async () => {
      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 250],
        [null, 1],
      ]);

      const result = await rateLimitModule.checkProviderRateLimit('quickbooks', 'tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(500);
    });

    it('should use default limits for unknown provider', async () => {
      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 30],
        [null, 1],
      ]);

      const result = await rateLimitModule.checkProviderRateLimit('unknown', 'tenant-123');

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(60); // Default
    });

    it('should deny when provider limit exceeded', async () => {
      mockRedisExec.mockResolvedValue([
        [null, 0],
        [null, 1],
        [null, 101], // Over stripe limit of 100
        [null, 1],
      ]);

      const result = await rateLimitModule.checkProviderRateLimit('stripe', 'tenant-123');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });
  });
});
