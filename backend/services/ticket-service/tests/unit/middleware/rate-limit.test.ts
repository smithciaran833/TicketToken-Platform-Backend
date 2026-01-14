import { FastifyRequest, FastifyReply } from 'fastify';

// Mock Redis
const mockRedisClient = {
  get: jest.fn(),
  incr: jest.fn(),
  pexpire: jest.fn(),
  ttl: jest.fn(),
};

jest.mock('../../../src/services/redisService', () => ({
  RedisService: {
    getClient: jest.fn(() => mockRedisClient),
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

import {
  createRateLimiter,
  RateLimitTiers,
  rateLimiters,
  combinedRateLimiter,
  createConcurrentLimiter,
  createBanCheckMiddleware,
  checkBan,
  recordViolation,
  createLoadSheddingMiddleware,
  getCurrentLoad,
} from '../../../src/middleware/rate-limit';

describe('Rate Limit Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSend = jest.fn().mockReturnThis();
    mockHeader = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({
      send: mockSend,
      header: mockHeader,
    });

    mockReply = {
      status: mockStatus,
      send: mockSend,
      header: mockHeader,
      sent: false,
      raw: {
        on: jest.fn(),
      },
    } as any;

    mockRequest = {
      url: '/api/test',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {},
    } as any;

    // Reset Redis mocks
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.incr.mockResolvedValue(1);
    mockRedisClient.pexpire.mockResolvedValue(1);
    mockRedisClient.ttl.mockResolvedValue(60);
  });

  describe('createRateLimiter', () => {
    it('should skip rate limiting when ENABLE_RATE_LIMITING is false', async () => {
      const originalEnv = process.env.ENABLE_RATE_LIMITING;
      process.env.ENABLE_RATE_LIMITING = 'false';

      const limiter = createRateLimiter(RateLimitTiers.GLOBAL);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.get).not.toHaveBeenCalled();

      process.env.ENABLE_RATE_LIMITING = originalEnv;
    });

    it('should skip rate limiting for health check paths', async () => {
      mockRequest.url = '/health';

      const limiter = createRateLimiter(RateLimitTiers.GLOBAL);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for /health/live', async () => {
      mockRequest.url = '/health/live';

      const limiter = createRateLimiter(RateLimitTiers.GLOBAL);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should skip rate limiting for /metrics', async () => {
      mockRequest.url = '/metrics';

      const limiter = createRateLimiter(RateLimitTiers.GLOBAL);
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.get).not.toHaveBeenCalled();
    });

    it('should allow request under limit', async () => {
      mockRedisClient.get.mockResolvedValue('5');
      mockRedisClient.incr.mockResolvedValue(6);

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalledWith(429);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 94);
    });

    it('should return 429 when limit exceeded', async () => {
      mockRedisClient.get.mockResolvedValue('100');
      mockRedisClient.ttl.mockResolvedValue(30);

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(429);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
          code: 'RATE_LIMIT_EXCEEDED',
        })
      );
      expect(mockHeader).toHaveBeenCalledWith('Retry-After', 30);
    });

    it('should include tenant in rate limit key when tenantId present', async () => {
      (mockRequest as any).tenantId = 'tenant-123';

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining('tenant:tenant-123')
      );
    });

    it('should apply tenant tier multiplier for premium tier', async () => {
      (mockRequest as any).tenantId = 'tenant-123';
      (mockRequest as any).user = { tier: 'premium' };

      mockRedisClient.get.mockResolvedValue('200');

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Premium tier has 5x multiplier, so 500 max requests
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 500);
    });

    it('should apply gradual throttling when approaching limit', async () => {
      mockRedisClient.get.mockResolvedValue('80');

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
        enableGradualThrottling: true,
        throttleThreshold: 0.75,
        maxThrottleDelayMs: 100,
      });

      const startTime = Date.now();
      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      const elapsed = Date.now() - startTime;

      // Should have some delay due to throttling
      expect(mockHeader).toHaveBeenCalledWith('X-RateLimit-Throttled', 'true');
    });

    it('should set expiry on first request', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockRedisClient.incr.mockResolvedValue(1);

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.pexpire).toHaveBeenCalledWith(
        expect.any(String),
        60000
      );
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should not throw, request should proceed
      expect(mockStatus).not.toHaveBeenCalledWith(429);
    });

    it('should use userId over IP for rate limit key', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      const limiter = createRateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedisClient.get).toHaveBeenCalledWith(
        expect.stringContaining('user-123')
      );
    });
  });

  describe('RateLimitTiers', () => {
    it('should have GLOBAL tier', () => {
      expect(RateLimitTiers.GLOBAL).toEqual({
        windowMs: 60000,
        maxRequests: 100,
        keyPrefix: 'ratelimit:global',
      });
    });

    it('should have PURCHASE tier with lower limit', () => {
      expect(RateLimitTiers.PURCHASE.maxRequests).toBe(5);
    });

    it('should have all required tiers', () => {
      expect(RateLimitTiers.GLOBAL).toBeDefined();
      expect(RateLimitTiers.READ).toBeDefined();
      expect(RateLimitTiers.WRITE).toBeDefined();
      expect(RateLimitTiers.PURCHASE).toBeDefined();
      expect(RateLimitTiers.TRANSFER).toBeDefined();
      expect(RateLimitTiers.ADMIN).toBeDefined();
      expect(RateLimitTiers.WEBHOOK).toBeDefined();
      expect(RateLimitTiers.QR_SCAN).toBeDefined();
    });
  });

  describe('rateLimiters', () => {
    it('should export pre-configured limiters', () => {
      expect(typeof rateLimiters.global).toBe('function');
      expect(typeof rateLimiters.read).toBe('function');
      expect(typeof rateLimiters.write).toBe('function');
      expect(typeof rateLimiters.purchase).toBe('function');
      expect(typeof rateLimiters.transfer).toBe('function');
      expect(typeof rateLimiters.admin).toBe('function');
      expect(typeof rateLimiters.webhook).toBe('function');
      expect(typeof rateLimiters.qrScan).toBe('function');
    });
  });

  describe('combinedRateLimiter', () => {
    it('should run all limiters', async () => {
      const limiter1 = jest.fn();
      const limiter2 = jest.fn();

      const combined = combinedRateLimiter(limiter1, limiter2);
      await combined(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(limiter1).toHaveBeenCalled();
      expect(limiter2).toHaveBeenCalled();
    });

    it('should stop if response already sent', async () => {
      const limiter1 = jest.fn().mockImplementation((req, reply) => {
        reply.sent = true;
      });
      const limiter2 = jest.fn();

      const combined = combinedRateLimiter(limiter1, limiter2);
      await combined(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(limiter1).toHaveBeenCalled();
      expect(limiter2).not.toHaveBeenCalled();
    });
  });

  describe('createConcurrentLimiter', () => {
    it('should allow request under concurrent limit', async () => {
      const limiter = createConcurrentLimiter({
        maxConcurrent: 5,
        keyPrefix: 'concurrent:test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).not.toHaveBeenCalledWith(429);
    });

    it('should register finish handler to decrement count', async () => {
      const limiter = createConcurrentLimiter({
        maxConcurrent: 5,
        keyPrefix: 'concurrent:test',
      });

      await limiter(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect((mockReply as any).raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
    });
  });

  describe('Ban Mechanism', () => {
    it('should return not banned for unknown identifier', () => {
      const result = checkBan('unknown-user');
      expect(result.banned).toBe(false);
    });

    it('should record violations', () => {
      const config = {
        violationsThreshold: 3,
        banDurationMs: 60000,
        violationWindowMs: 60000,
      };

      const banned1 = recordViolation('violator', config);
      expect(banned1).toBe(false);

      const banned2 = recordViolation('violator', config);
      expect(banned2).toBe(false);

      const banned3 = recordViolation('violator', config);
      expect(banned3).toBe(true);
    });

    it('should create ban check middleware', () => {
      const middleware = createBanCheckMiddleware();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('Load Shedding', () => {
    it('should create load shedding middleware', () => {
      const middleware = createLoadSheddingMiddleware({ threshold: 80, sheddingProbability: 0.5 });
      expect(typeof middleware).toBe('function');
    });

    it('should return current load', () => {
      const load = getCurrentLoad();
      expect(typeof load).toBe('number');
      expect(load).toBeGreaterThanOrEqual(0);
    });
  });
});
