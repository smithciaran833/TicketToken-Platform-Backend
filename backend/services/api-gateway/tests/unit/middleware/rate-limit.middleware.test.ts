// Remove the duplicate pino mock - it's already mocked in setup.ts

jest.mock('../../../src/config', () => ({
  config: {
    logging: {
      level: 'info',
      pretty: false,
    },
    rateLimit: {
      enabled: true,
      global: {
        max: 100,
        timeWindow: 60000,
      },
      ticketPurchase: {
        max: 5,
        timeWindow: 60000,
        blockDuration: 300000,
      },
    },
  },
}));

// Create mock instances outside the mock factory
const mockSlidingWindow = jest.fn();
const mockRateLimiter = {
  slidingWindow: mockSlidingWindow,
};

const mockKeyBuilder = {
  rateLimit: jest.fn((type: string, id: string) => `ratelimit:${type}:${id}`),
  apiKey: jest.fn((key: string) => `apikey:${key}`),
};

jest.mock('@tickettoken/shared', () => ({
  getRateLimiter: jest.fn(() => mockRateLimiter),
  getKeyBuilder: jest.fn(() => mockKeyBuilder),
}));

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  setupRateLimitMiddleware,
  adjustRateLimits,
  checkApiKeyRateLimit,
} from '../../../src/middleware/rate-limit.middleware';
import { createRequestLogger, logSecurityEvent } from '../../../src/utils/logger';
import { RateLimitError } from '../../../src/types';

jest.mock('../../../src/utils/logger');
jest.mock('@fastify/rate-limit', () => jest.fn());

describe('rate-limit.middleware', () => {
  let mockServer: any;
  let mockRequest: any;
  let mockReply: any;
  let mockLogger: any;
  let preHandlerHooks: Function[];
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    preHandlerHooks = [];

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    (createRequestLogger as jest.Mock).mockReturnValue(mockLogger);
    (logSecurityEvent as jest.Mock).mockReturnValue(undefined);

    mockServer = {
      register: jest.fn().mockResolvedValue(undefined),
      addHook: jest.fn((event: string, handler: Function) => {
        if (event === 'preHandler') {
          preHandlerHooks.push(handler);
        }
      }),
      redis: {
        get: jest.fn(),
        set: jest.fn(),
        del: jest.fn(),
        incr: jest.fn(),
        expire: jest.fn(),
      },
      log: {
        warn: jest.fn(),
        error: jest.fn(),
      },
    };

    mockRequest = {
      id: 'test-request-id',
      method: 'GET',
      url: '/api/test',
      ip: '127.0.0.1',
      headers: {},
      user: undefined,
      body: {},
    };

    mockReply = {
      header: jest.fn().mockReturnThis(),
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    jest.useFakeTimers();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  describe('setupRateLimitMiddleware', () => {
    it('registers fastify-rate-limit plugin', async () => {
      await setupRateLimitMiddleware(mockServer);

      expect(mockServer.register).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          global: true,
          redis: mockServer.redis,
          skipOnError: true,
        })
      );
    });

    it('skips setup when rate limiting is disabled', async () => {
      const config = require('../../../src/config').config;
      const originalEnabled = config.rateLimit.enabled;
      config.rateLimit.enabled = false;

      await setupRateLimitMiddleware(mockServer);

      expect(mockServer.log.warn).toHaveBeenCalledWith('Rate limiting is disabled');
      expect(mockServer.register).not.toHaveBeenCalled();

      config.rateLimit.enabled = originalEnabled;
    });

    it('registers preHandler hooks', async () => {
      await setupRateLimitMiddleware(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith('preHandler', expect.any(Function));
      expect(preHandlerHooks.length).toBeGreaterThan(0);
    });
  });

  describe('keyGenerator', () => {
    let keyGenerator: Function;

    beforeEach(async () => {
      await setupRateLimitMiddleware(mockServer);
      const registerCall = mockServer.register.mock.calls[0];
      keyGenerator = registerCall[1].keyGenerator;
    });

    it('uses user ID when authenticated', () => {
      mockRequest.user = { id: 'user-123' };

      const key = keyGenerator(mockRequest);

      expect(key).toBe('ratelimit:user:user-123');
    });

    it('uses API key when present', () => {
      mockRequest.headers['x-api-key'] = 'api-key-456';

      const key = keyGenerator(mockRequest);

      expect(key).toBe('ratelimit:api:api-key-456');
    });

    it('uses IP address as fallback', () => {
      mockRequest.ip = '192.168.1.1';

      const key = keyGenerator(mockRequest);

      expect(key).toBe('ratelimit:ip:192.168.1.1');
    });

    it('prioritizes user ID over API key', () => {
      mockRequest.user = { id: 'user-123' };
      mockRequest.headers['x-api-key'] = 'api-key-456';

      const key = keyGenerator(mockRequest);

      expect(key).toBe('ratelimit:user:user-123');
    });
  });

  describe('errorResponseBuilder', () => {
    let errorResponseBuilder: Function;

    beforeEach(async () => {
      await setupRateLimitMiddleware(mockServer);
      const registerCall = mockServer.register.mock.calls[0];
      errorResponseBuilder = registerCall[1].errorResponseBuilder;
    });

    it('returns 429 status code', () => {
      const context = { max: 100, remaining: 0, ttl: 60000 };
      const response = errorResponseBuilder(mockRequest, context);

      expect(response.statusCode).toBe(429);
    });

    it('includes retry message with seconds', () => {
      const context = { max: 100, remaining: 0, ttl: 60000 };
      const response = errorResponseBuilder(mockRequest, context);

      expect(response.message).toContain('Try again in 60 seconds');
    });

    it('includes rate limit details', () => {
      const context = { max: 100, remaining: 0, ttl: 30000 };
      const response = errorResponseBuilder(mockRequest, context);

      expect(response.rateLimit).toEqual({
        limit: 100,
        remaining: 0,
        reset: expect.any(String),
      });
    });
  });

  describe('onExceeding callback', () => {
    let onExceeding: Function;

    beforeEach(async () => {
      await setupRateLimitMiddleware(mockServer);
      const registerCall = mockServer.register.mock.calls[0];
      onExceeding = registerCall[1].onExceeding;
    });

    it('logs warning when rate limit approaching', () => {
      onExceeding(mockRequest, 'ratelimit:user:123');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        {
          key: 'ratelimit:user:123',
          path: '/api/test',
          method: 'GET',
        },
        'Rate limit approaching'
      );
    });
  });

  describe('onExceeded callback', () => {
    let onExceeded: Function;

    beforeEach(async () => {
      await setupRateLimitMiddleware(mockServer);
      const registerCall = mockServer.register.mock.calls[0];
      onExceeded = registerCall[1].onExceeded;
    });

    it('logs error when rate limit exceeded', () => {
      mockRequest.headers['user-agent'] = 'Mozilla/5.0';
      onExceeded(mockRequest, 'ratelimit:user:123');

      expect(mockLogger.error).toHaveBeenCalledWith(
        {
          key: 'ratelimit:user:123',
          path: '/api/test',
          method: 'GET',
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
        },
        'Rate limit exceeded'
      );
    });

    it('logs security event', () => {
      mockRequest.user = { id: 'user-456' };
      onExceeded(mockRequest, 'ratelimit:user:456');

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'rate_limit_exceeded',
        {
          key: 'ratelimit:user:456',
          path: '/api/test',
          ip: '127.0.0.1',
          userId: 'user-456',
        },
        'medium'
      );
    });
  });

  describe('ticket purchase rate limiting', () => {
    beforeEach(async () => {
      await setupRateLimitMiddleware(mockServer);
    });

    it('skips check for non-ticket-purchase routes', async () => {
      mockRequest.url = '/api/users';

      await preHandlerHooks[0](mockRequest, mockReply);

      expect(mockSlidingWindow).not.toHaveBeenCalled();
    });

    it('skips check when eventId missing from body', async () => {
      mockRequest.url = '/api/tickets/purchase';
      mockRequest.body = {};

      await preHandlerHooks[0](mockRequest, mockReply);

      expect(mockSlidingWindow).not.toHaveBeenCalled();
    });

    it('allows ticket purchase when under limit', async () => {
      mockRequest.url = '/api/tickets/purchase';
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { eventId: 'event-456' };

      mockSlidingWindow.mockResolvedValue({
        allowed: true,
        remaining: 3,
        current: 2,
      });

      await preHandlerHooks[0](mockRequest, mockReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '3');
    });

    it('throws RateLimitError when limit exceeded', async () => {
      mockRequest.url = '/api/tickets/purchase';
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { eventId: 'event-456' };

      mockSlidingWindow.mockResolvedValue({
        allowed: false,
        remaining: 0,
        current: 10,
        retryAfter: 120,
      });

      await expect(preHandlerHooks[0](mockRequest, mockReply)).rejects.toThrow(RateLimitError);
    });

    it('sets Retry-After header when limit exceeded', async () => {
      mockRequest.url = '/api/tickets/purchase';
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { eventId: 'event-456' };

      mockSlidingWindow.mockResolvedValue({
        allowed: false,
        remaining: 0,
        current: 5,
        retryAfter: 90,
      });

      try {
        await preHandlerHooks[0](mockRequest, mockReply);
      } catch (error) {
        // Expected error
      }

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', '90');
    });

    it('logs security event for potential bot activity', async () => {
      mockRequest.url = '/api/tickets/purchase';
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { eventId: 'event-456' };
      mockRequest.headers['user-agent'] = 'Bot/1.0';

      mockSlidingWindow.mockResolvedValue({
        allowed: false,
        remaining: 0,
        current: 15,
        retryAfter: 60,
      });

      try {
        await preHandlerHooks[0](mockRequest, mockReply);
      } catch (error) {
        // Expected error
      }

      expect(logSecurityEvent).toHaveBeenCalledWith(
        'potential_ticket_bot',
        expect.objectContaining({
          userId: 'user-123',
          eventId: 'event-456',
          attemptCount: 15,
        }),
        'high'
      );
    });

    it('fails open on Redis errors', async () => {
      mockRequest.url = '/api/tickets/purchase';
      mockRequest.user = { id: 'user-123' };
      mockRequest.body = { eventId: 'event-456' };

      mockSlidingWindow.mockRejectedValue(new Error('Redis connection failed'));

      await expect(preHandlerHooks[0](mockRequest, mockReply)).resolves.not.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Redis connection failed',
        }),
        'Ticket purchase rate limit check failed - allowing request'
      );
    });
  });

  describe('venue tier-based rate limiting', () => {
    beforeEach(async () => {
      await setupRateLimitMiddleware(mockServer);
    });

    it('adjusts limit for premium tier', async () => {
      mockRequest.headers['x-venue-tier'] = 'premium';

      await preHandlerHooks[1](mockRequest, mockReply);

      expect(mockRequest.rateLimitMax).toBeDefined();
    });

    it('adjusts limit for standard tier', async () => {
      mockRequest.headers['x-venue-tier'] = 'standard';

      await preHandlerHooks[1](mockRequest, mockReply);

      expect(mockRequest.rateLimitMax).toBeDefined();
    });

    it('adjusts limit for free tier', async () => {
      mockRequest.headers['x-venue-tier'] = 'free';

      await preHandlerHooks[1](mockRequest, mockReply);

      expect(mockRequest.rateLimitMax).toBeDefined();
    });

    it('skips adjustment when tier header missing', async () => {
      await preHandlerHooks[1](mockRequest, mockReply);

      expect(mockRequest.rateLimitMax).toBeUndefined();
    });
  });

  describe('adjustRateLimits', () => {
    it('reduces rate limits under high memory load', async () => {
      const originalMemoryUsage = process.memoryUsage;
      (process as any).memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 850 * 1024 * 1024,
        heapTotal: 1000 * 1024 * 1024,
        rss: 1000 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      adjustRateLimits(mockServer);
      jest.advanceTimersByTime(30000);

      await Promise.resolve();

      expect(mockServer.redis.set).toHaveBeenCalledWith(
        'ratelimit:adjustment:global',
        '0.5',
        'EX',
        60
      );

      expect(mockServer.log.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          adjustment: 0.5,
        }),
        'Rate limits reduced due to high load'
      );

      process.memoryUsage = originalMemoryUsage;
    });

    it('removes adjustment under low memory load', async () => {
      const originalMemoryUsage = process.memoryUsage;
      (process as any).memoryUsage = jest.fn().mockReturnValue({
        heapUsed: 400 * 1024 * 1024,
        heapTotal: 1000 * 1024 * 1024,
        rss: 1000 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      });

      adjustRateLimits(mockServer);
      jest.advanceTimersByTime(30000);

      await Promise.resolve();

      expect(mockServer.redis.del).toHaveBeenCalledWith('ratelimit:adjustment:global');

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('checkApiKeyRateLimit', () => {
    it('returns false when API key not found', async () => {
      mockServer.redis.get.mockResolvedValue(null);

      const result = await checkApiKeyRateLimit(mockServer, 'invalid-key', mockRequest);

      expect(result).toBe(false);
    });

    it('returns true when under rate limit', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ rateLimit: 100 })
      );
      mockServer.redis.incr.mockResolvedValue(50);

      const result = await checkApiKeyRateLimit(mockServer, 'valid-key', mockRequest);

      expect(result).toBe(true);
    });

    it('returns false when rate limit exceeded', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ rateLimit: 100 })
      );
      mockServer.redis.incr.mockResolvedValue(101);

      const result = await checkApiKeyRateLimit(mockServer, 'valid-key', mockRequest);

      expect(result).toBe(false);
    });

    it('sets expiry on first request', async () => {
      mockServer.redis.get.mockResolvedValue(
        JSON.stringify({ rateLimit: 100 })
      );
      mockServer.redis.incr.mockResolvedValue(1);

      await checkApiKeyRateLimit(mockServer, 'valid-key', mockRequest);

      expect(mockServer.redis.expire).toHaveBeenCalledWith('ratelimit:apikey:valid-key', 60);
    });
  });
});
