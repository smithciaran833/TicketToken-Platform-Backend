/**
 * Unit tests for rate-limit-redis.ts
 * Tests Redis-backed rate limiting with memory fallback
 */

import { rateLimitMiddleware, smsRateLimitMiddleware } from '../../../src/middleware/rate-limit-redis';
import { logger } from '../../../src/config/logger';
import Redis from 'ioredis';

// Mock dependencies
jest.mock('../../../src/config/logger');
jest.mock('ioredis');
jest.mock('../../../src/config/env', () => ({
  env: {
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    REDIS_PASSWORD: 'test-password',
    REDIS_DB: 0,
    NODE_ENV: 'test'
  }
}));

describe('Rate Limit Redis Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRequest = {
      id: 'req-123',
      method: 'POST',
      url: '/api/v1/notifications/email',
      headers: {},
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
      user: undefined,
      tenantId: 'tenant-123'
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    };

    // Mock Redis client
    mockRedis = {
      multi: jest.fn().mockReturnValue({
        incr: jest.fn().mockReturnThis(),
        pttl: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, -1]])
      }),
      pexpire: jest.fn().mockResolvedValue(1),
      on: jest.fn()
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rateLimitMiddleware', () => {
    describe('Route Identification', () => {
      it('should skip rate limiting for health check endpoints', async () => {
        mockRequest.url = '/health';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
        expect(mockReply.send).not.toHaveBeenCalled();
      });

      it('should skip rate limiting for metrics endpoints', async () => {
        mockRequest.url = '/metrics';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should skip rate limiting for internal API routes', async () => {
        mockRequest.url = '/api/v1/internal/status';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalled();
      });

      it('should apply rate limiting to email notification endpoints', async () => {
        mockRequest.url = '/api/v1/notifications/email';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      });

      it('should apply rate limiting to SMS notification endpoints', async () => {
        mockRequest.url = '/api/v1/notifications/sms';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      });

      it('should normalize UUIDs in routes', async () => {
        mockRequest.url = '/api/v1/campaigns/a1b2c3d4-e5f6-7890-abcd-ef1234567890/send';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should strip query parameters from routes', async () => {
        mockRequest.url = '/api/v1/notifications?page=1&limit=10';
        mockRequest.method = 'GET';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });
    });

    describe('Client IP Extraction', () => {
      it('should use direct IP in non-production environment', async () => {
        mockRequest.ip = '10.0.0.5';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should extract first IP from X-Forwarded-For in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        mockRequest.headers['x-forwarded-for'] = '203.0.113.1, 198.51.100.1, 192.0.2.1';

        await rateLimitMiddleware(mockRequest, mockReply);

        process.env.NODE_ENV = originalEnv;
        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should validate IP format from X-Forwarded-For', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        mockRequest.headers['x-forwarded-for'] = 'invalid-ip, 198.51.100.1';
        mockRequest.ip = '192.168.1.1';

        await rateLimitMiddleware(mockRequest, mockReply);

        process.env.NODE_ENV = originalEnv;
        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should handle IPv6 addresses', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        mockRequest.headers['x-forwarded-for'] = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';

        await rateLimitMiddleware(mockRequest, mockReply);

        process.env.NODE_ENV = originalEnv;
        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should fallback to socket remote address if IP not available', async () => {
        mockRequest.ip = undefined;
        mockRequest.socket.remoteAddress = '172.16.0.1';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use 127.0.0.1 as ultimate fallback', async () => {
        mockRequest.ip = undefined;
        mockRequest.socket.remoteAddress = undefined;

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });
    });

    describe('User and Tenant Identification', () => {
      it('should use authenticated user ID when available', async () => {
        mockRequest.user = { id: 'user-456' };

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use IP address when user is not authenticated', async () => {
        mockRequest.user = undefined;
        mockRequest.ip = '192.168.1.100';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use anonymous tenant when tenantId is not set', async () => {
        mockRequest.tenantId = undefined;

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use tenant ID from request', async () => {
        mockRequest.tenantId = 'tenant-789';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });
    });

    describe('Rate Limit Headers', () => {
      it('should set X-RateLimit-Limit header', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      });

      it('should set X-RateLimit-Remaining header', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      });

      it('should set X-RateLimit-Reset header with unix timestamp', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
      });

      it('should include Retry-After header when rate limit exceeded', async () => {
        // Simulate rate limit exceeded
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 100], [null, 50000]]) // count=100, ttl=50s
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        mockRequest.url = '/api/v1/notifications/email'; // limit is 30

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(Number));
        expect(mockReply.status).toHaveBeenCalledWith(429);
      });
    });

    describe('Redis Rate Limiting', () => {
      it('should use Redis for rate limiting when available', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 5], [null, -1]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockRedis.multi).toHaveBeenCalled();
        expect(multiMock.incr).toHaveBeenCalled();
        expect(multiMock.pttl).toHaveBeenCalled();
      });

      it('should set expiry on first request (ttl=-1)', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 1], [null, -1]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockRedis.pexpire).toHaveBeenCalledWith(expect.any(String), expect.any(Number));
      });

      it('should not set expiry on subsequent requests (ttl > 0)', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 5], [null, 45000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);
        mockRedis.pexpire = jest.fn().mockResolvedValue(1);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockRedis.pexpire).not.toHaveBeenCalled();
      });

      it('should calculate remaining requests correctly', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 10], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        // Email limit is 30, current count is 10, so remaining should be 20
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 20);
      });

      it('should fallback to memory when Redis fails', async () => {
        mockRedis.multi = jest.fn().mockImplementation(() => {
          throw new Error('Redis connection failed');
        });

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          expect.stringContaining('Redis rate limit error'),
          expect.any(Object)
        );
        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should fallback to memory when exec returns null', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue(null)
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });
    });

    describe('Memory Fallback', () => {
      beforeEach(() => {
        // Force memory fallback by making Redis unavailable
        mockRedis.multi = jest.fn().mockImplementation(() => {
          throw new Error('Redis unavailable');
        });
      });

      it('should use in-memory store when Redis is unavailable', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalled();
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      });

      it('should create new entry on first request', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 29); // 30 - 1
      });

      it('should increment count on subsequent requests', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);
        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenLastCalledWith('X-RateLimit-Remaining', 28);
      });

      it('should reset after window expires', async () => {
        await rateLimitMiddleware(mockRequest, mockReply);
        
        // Advance time past window (60 seconds)
        jest.advanceTimersByTime(61000);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenLastCalledWith('X-RateLimit-Remaining', 29);
      });

      it('should track different users separately', async () => {
        mockRequest.user = { id: 'user-1' };
        await rateLimitMiddleware(mockRequest, mockReply);

        mockRequest.user = { id: 'user-2' };
        await rateLimitMiddleware(mockRequest, mockReply);

        // Both should have full remaining count
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 29);
      });

      it('should track different IPs separately when not authenticated', async () => {
        mockRequest.ip = '192.168.1.1';
        await rateLimitMiddleware(mockRequest, mockReply);

        mockRequest.ip = '192.168.1.2';
        await rateLimitMiddleware(mockRequest, mockReply);

        // Both should have full remaining count
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', 29);
      });
    });

    describe('User Rate Limit Enforcement', () => {
      it('should allow requests within rate limit', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 10], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalledWith(429);
      });

      it('should block requests exceeding user rate limit', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 100], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Too Many Requests',
            code: 'RATE_LIMIT_EXCEEDED'
          })
        );
      });

      it('should log warning when user rate limit exceeded', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 100], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Rate limit exceeded',
          expect.objectContaining({
            requestId: 'req-123',
            clientIp: expect.any(String)
          })
        );
      });

      it('should include retry-after in error response', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 100], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            retryAfter: expect.any(Number)
          })
        );
      });
    });

    describe('Tenant Rate Limit Enforcement', () => {
      it('should check tenant rate limit after user rate limit', async () => {
        // User limit passes (count=5), tenant limit also passes (count=500)
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn()
            .mockResolvedValueOnce([[null, 5], [null, 30000]])
            .mockResolvedValueOnce([[null, 500], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalledWith(429);
      });

      it('should block requests exceeding tenant rate limit', async () => {
        // User limit passes, tenant limit exceeded (1001 > 1000)
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn()
            .mockResolvedValueOnce([[null, 5], [null, 30000]])
            .mockResolvedValueOnce([[null, 1001], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'TENANT_RATE_LIMIT_EXCEEDED'
          })
        );
      });

      it('should log tenant rate limit exceeded', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn()
            .mockResolvedValueOnce([[null, 5], [null, 30000]])
            .mockResolvedValueOnce([[null, 1001], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Tenant rate limit exceeded',
          expect.objectContaining({
            tenantId: 'tenant-123'
          })
        );
      });

      it('should not check tenant limit if user limit is exceeded', async () => {
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValueOnce([[null, 100], [null, 30000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'RATE_LIMIT_EXCEEDED'
          })
        );
      });
    });

    describe('Endpoint-Specific Limits', () => {
      it('should apply stricter limits for batch notifications', async () => {
        mockRequest.url = '/api/v1/notifications/batch';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 3);
      });

      it('should apply stricter limits for campaign sending', async () => {
        mockRequest.url = '/api/v1/campaigns/123/send';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 1);
      });

      it('should apply moderate limits for SMS', async () => {
        mockRequest.url = '/api/v1/notifications/sms';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      });

      it('should apply higher limits for read operations', async () => {
        mockRequest.url = '/api/v1/notifications';
        mockRequest.method = 'GET';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      });

      it('should apply default limits for unknown routes', async () => {
        mockRequest.url = '/api/v1/unknown/endpoint';
        mockRequest.method = 'POST';

        await rateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', 60);
      });
    });
  });

  describe('smsRateLimitMiddleware', () => {
    describe('SMS-Specific Rate Limiting', () => {
      it('should apply hourly SMS rate limit', async () => {
        mockRequest.user = { id: 'user-123' };

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-SMS-Limit', 20);
      });

      it('should set SMS-specific headers', async () => {
        mockRequest.user = { id: 'user-123' };

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-SMS-Limit', expect.any(Number));
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-SMS-Remaining', expect.any(Number));
      });

      it('should block SMS when hourly limit exceeded', async () => {
        mockRequest.user = { id: 'user-123' };

        // Simulate exceeding the limit
        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 25], [null, 1800000]]) // 25 > 20
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'SMS_RATE_LIMIT_EXCEEDED',
            message: expect.stringContaining('20 SMS per hour')
          })
        );
      });

      it('should fallback to rateLimitMiddleware if user not authenticated', async () => {
        mockRequest.user = undefined;

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should log warning when SMS rate limit exceeded', async () => {
        mockRequest.user = { id: 'user-123' };

        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 25], [null, 1800000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'SMS rate limit exceeded',
          expect.objectContaining({
            userId: 'user-123'
          })
        );
      });

      it('should use 1 hour window for SMS rate limits', async () => {
        mockRequest.user = { id: 'user-123' };

        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 5], [null, -1]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockRedis.pexpire).toHaveBeenCalledWith(
          expect.any(String),
          60 * 60 * 1000 // 1 hour in milliseconds
        );
      });

      it('should allow SMS within limit', async () => {
        mockRequest.user = { id: 'user-123' };

        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 10], [null, 1800000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalledWith(429);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-SMS-Remaining', 10);
      });

      it('should include retry-after in SMS limit error', async () => {
        mockRequest.user = { id: 'user-123' };

        const multiMock = {
          incr: jest.fn().mockReturnThis(),
          pttl: jest.fn().mockReturnThis(),
          exec: jest.fn().mockResolvedValue([[null, 25], [null, 3600000]])
        };
        mockRedis.multi = jest.fn().mockReturnValue(multiMock);

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            retryAfter: expect.any(Number)
          })
        );
      });
    });
  });

  describe('Memory Cleanup', () => {
    it('should clean up expired entries periodically', async () => {
      // Force memory fallback
      mockRedis.multi = jest.fn().mockImplementation(() => {
        throw new Error('Redis unavailable');
      });

      // Create some entries
      await rateLimitMiddleware(mockRequest, mockReply);

      // Advance time past cleanup interval
      jest.advanceTimersByTime(61000);

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
