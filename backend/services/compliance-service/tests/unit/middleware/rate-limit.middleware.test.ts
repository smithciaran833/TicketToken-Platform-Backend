/**
 * Unit Tests for Rate Limit Middleware
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

// Mock ioredis
const mockRedisInstance = {
  get: jest.fn<(key: string) => Promise<string | null>>(),
  set: jest.fn<(key: string, value: string) => Promise<void>>(),
  del: jest.fn<(key: string) => Promise<void>>(),
  quit: jest.fn<() => Promise<void>>()
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedisInstance);
});

// Mock @fastify/rate-limit
const mockRateLimitPlugin = jest.fn();
jest.mock('@fastify/rate-limit', () => ({
  __esModule: true,
  default: mockRateLimitPlugin
}));

describe('Rate Limit Middleware', () => {
  let rateLimitConfig: any;
  let setupRateLimiting: any;
  let applyCustomRateLimit: any;
  let bypassRateLimit: any;
  let addRateLimitHeaders: any;
  let getRateLimitStatus: any;

  let mockFastify: any;

  const originalEnv = process.env;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset environment
    process.env = { ...originalEnv };

    // Mock Fastify instance
    mockFastify = {
      register: jest.fn<(plugin: any, opts?: any) => Promise<void>>().mockResolvedValue(undefined),
      log: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
      }
    };

    // Import the module
    const rateLimitModule = await import('../../../src/middleware/rate-limit.middleware');
    rateLimitConfig = rateLimitModule.rateLimitConfig;
    setupRateLimiting = rateLimitModule.setupRateLimiting;
    applyCustomRateLimit = rateLimitModule.applyCustomRateLimit;
    bypassRateLimit = rateLimitModule.bypassRateLimit;
    addRateLimitHeaders = rateLimitModule.addRateLimitHeaders;
    getRateLimitStatus = rateLimitModule.getRateLimitStatus;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('rateLimitConfig', () => {
    it('should have standard config', () => {
      expect(rateLimitConfig.standard).toBeDefined();
      expect(rateLimitConfig.standard.max).toBe(100);
      expect(rateLimitConfig.standard.timeWindow).toBe('1 minute');
    });

    it('should have auth config with stricter limits', () => {
      expect(rateLimitConfig.auth).toBeDefined();
      expect(rateLimitConfig.auth.max).toBe(20);
      expect(rateLimitConfig.auth.skipOnError).toBe(false);
    });

    it('should have ofac config', () => {
      expect(rateLimitConfig.ofac).toBeDefined();
      expect(rateLimitConfig.ofac.max).toBe(50);
    });

    it('should have upload config with strict limits', () => {
      expect(rateLimitConfig.upload).toBeDefined();
      expect(rateLimitConfig.upload.max).toBe(10);
    });

    it('should have batch config with very strict limits', () => {
      expect(rateLimitConfig.batch).toBeDefined();
      expect(rateLimitConfig.batch.max).toBe(5);
    });

    it('should have webhook config with generous limits', () => {
      expect(rateLimitConfig.webhook).toBeDefined();
      expect(rateLimitConfig.webhook.max).toBe(1000);
    });

    it('should have health config with generous limits', () => {
      expect(rateLimitConfig.health).toBeDefined();
      expect(rateLimitConfig.health.max).toBe(1000);
    });

    it('should have all required properties in each config', () => {
      const requiredProps = ['max', 'timeWindow', 'cache', 'skipOnError'];
      
      Object.keys(rateLimitConfig).forEach(key => {
        requiredProps.forEach(prop => {
          expect(rateLimitConfig[key]).toHaveProperty(prop);
        });
      });
    });
  });

  describe('setupRateLimiting', () => {
    it('should register rate limit plugin with Fastify', async () => {
      await setupRateLimiting(mockFastify);

      expect(mockFastify.register).toHaveBeenCalledWith(
        mockRateLimitPlugin,
        expect.objectContaining({
          global: true,
          max: rateLimitConfig.standard.max,
          timeWindow: rateLimitConfig.standard.timeWindow
        })
      );
    });

    it('should log initialization message', async () => {
      await setupRateLimiting(mockFastify);

      expect(mockFastify.log.info).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiting initialized')
      );
    });

    it('should use Redis store when REDIS_URL is provided', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      // Re-import to pick up new env
      jest.resetModules();
      const freshModule = await import('../../../src/middleware/rate-limit.middleware');
      
      await freshModule.setupRateLimiting(mockFastify);

      expect(mockFastify.register).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          redis: expect.anything()
        })
      );
    });

    it('should use in-memory store when REDIS_URL is not provided', async () => {
      delete process.env.REDIS_URL;

      await setupRateLimiting(mockFastify);

      expect(mockFastify.log.info).toHaveBeenCalledWith(
        expect.stringContaining('in-memory store')
      );
    });

    it('should configure custom error response builder', async () => {
      await setupRateLimiting(mockFastify);

      const registerCall = mockFastify.register.mock.calls[0];
      const options = registerCall[1];

      expect(options.errorResponseBuilder).toBeDefined();
      
      const mockRequest = {};
      const mockContext = { ttl: 30000 };
      const errorResponse = options.errorResponseBuilder(mockRequest, mockContext);

      expect(errorResponse.statusCode).toBe(429);
      expect(errorResponse.error).toBe('Too Many Requests');
      expect(errorResponse.retryAfter).toBe(30000);
    });

    it('should configure key generator to use user ID or IP', async () => {
      await setupRateLimiting(mockFastify);

      const registerCall = mockFastify.register.mock.calls[0];
      const options = registerCall[1];

      expect(options.keyGenerator).toBeDefined();

      // Test with authenticated user
      const authRequest = { user: { id: 'user-123' }, ip: '192.168.1.1' };
      expect(options.keyGenerator(authRequest)).toBe('user-123');

      // Test without authenticated user
      const anonRequest = { ip: '192.168.1.1' };
      expect(options.keyGenerator(anonRequest)).toBe('192.168.1.1');
    });

    it('should configure onExceeding callback', async () => {
      await setupRateLimiting(mockFastify);

      const registerCall = mockFastify.register.mock.calls[0];
      const options = registerCall[1];

      expect(options.onExceeding).toBeDefined();
      
      options.onExceeding({}, 'test-key');
      expect(mockFastify.log.warn).toHaveBeenCalledWith(
        expect.stringContaining('test-key')
      );
    });

    it('should configure onExceeded callback', async () => {
      await setupRateLimiting(mockFastify);

      const registerCall = mockFastify.register.mock.calls[0];
      const options = registerCall[1];

      expect(options.onExceeded).toBeDefined();
      
      options.onExceeded({}, 'test-key');
      expect(mockFastify.log.error).toHaveBeenCalledWith(
        expect.stringContaining('test-key')
      );
    });
  });

  describe('applyCustomRateLimit', () => {
    it('should merge rate limit config into route options', () => {
      const routeOptions = {
        method: 'POST',
        url: '/api/auth/login',
        config: {
          someOtherConfig: true
        }
      };

      const result = applyCustomRateLimit(routeOptions, rateLimitConfig.auth);

      expect(result.method).toBe('POST');
      expect(result.url).toBe('/api/auth/login');
      expect(result.config.someOtherConfig).toBe(true);
      expect(result.config.rateLimit).toEqual(rateLimitConfig.auth);
    });

    it('should work with empty route config', () => {
      const routeOptions = {
        method: 'GET',
        url: '/api/health'
      };

      const result = applyCustomRateLimit(routeOptions, rateLimitConfig.health);

      expect(result.config.rateLimit).toEqual(rateLimitConfig.health);
    });

    it('should preserve existing route options', () => {
      const routeOptions = {
        method: 'POST',
        url: '/api/documents/upload',
        schema: { body: {} },
        preHandler: jest.fn()
      };

      const result = applyCustomRateLimit(routeOptions, rateLimitConfig.upload);

      expect(result.schema).toEqual({ body: {} });
      expect(result.preHandler).toBeDefined();
    });
  });

  describe('bypassRateLimit', () => {
    it('should bypass for internal service with valid secret', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'valid-secret';

      const request = {
        headers: { 'x-internal-service': 'valid-secret' },
        ip: '192.168.1.1'
      };

      expect(bypassRateLimit(request)).toBe(true);
    });

    it('should not bypass for internal service with invalid secret', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'valid-secret';

      const request = {
        headers: { 'x-internal-service': 'invalid-secret' },
        ip: '192.168.1.1'
      };

      expect(bypassRateLimit(request)).toBe(false);
    });

    it('should bypass for whitelisted IPs', () => {
      process.env.RATE_LIMIT_BYPASS_IPS = '10.0.0.1,10.0.0.2,10.0.0.3';

      const request = {
        headers: {},
        ip: '10.0.0.2'
      };

      expect(bypassRateLimit(request)).toBe(true);
    });

    it('should not bypass for non-whitelisted IPs', () => {
      process.env.RATE_LIMIT_BYPASS_IPS = '10.0.0.1,10.0.0.2';

      const request = {
        headers: {},
        ip: '192.168.1.100'
      };

      expect(bypassRateLimit(request)).toBe(false);
    });

    it('should handle empty bypass IPs list', () => {
      delete process.env.RATE_LIMIT_BYPASS_IPS;

      const request = {
        headers: {},
        ip: '192.168.1.1'
      };

      expect(bypassRateLimit(request)).toBe(false);
    });

    it('should not bypass for regular requests', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      delete process.env.RATE_LIMIT_BYPASS_IPS;

      const request = {
        headers: {},
        ip: '192.168.1.1'
      };

      expect(bypassRateLimit(request)).toBe(false);
    });
  });

  describe('addRateLimitHeaders', () => {
    it('should add all rate limit headers', () => {
      const mockReply = {
        header: jest.fn<(name: string, value: any) => void>()
      };

      addRateLimitHeaders(mockReply, 100, 95, 1704067200000);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 95);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', 1704067200000);
    });

    it('should handle zero remaining requests', () => {
      const mockReply = {
        header: jest.fn<(name: string, value: any) => void>()
      };

      addRateLimitHeaders(mockReply, 100, 0, Date.now() + 60000);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 0);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return rate limit status for a key', async () => {
      const status = await getRateLimitStatus('user-123');

      expect(status).toHaveProperty('limit');
      expect(status).toHaveProperty('remaining');
      expect(status).toHaveProperty('reset');
    });

    it('should return default values', async () => {
      const status = await getRateLimitStatus('any-key');

      expect(status.limit).toBe(100);
      expect(status.remaining).toBe(95);
      expect(typeof status.reset).toBe('number');
    });
  });
});
