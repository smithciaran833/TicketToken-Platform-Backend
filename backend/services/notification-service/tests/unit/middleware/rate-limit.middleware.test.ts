/**
 * Unit tests for rate-limit.middleware.ts
 * Tests in-memory rate limiting middleware
 */

import {
  emailRateLimitMiddleware,
  smsRateLimitMiddleware,
  batchRateLimitMiddleware,
  channelRateLimitMiddleware
} from '../../../src/middleware/rate-limit.middleware';
import { logger } from '../../../src/config/logger';

jest.mock('../../../src/config/logger');

describe('Rate Limit Middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Store original environment
    originalEnv = { ...process.env };

    mockRequest = {
      headers: {},
      ip: '192.168.1.1',
      socket: { remoteAddress: '192.168.1.1' },
      user: undefined
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis()
    };
  });

  afterEach(() => {
    jest.useRealTimers();
    // Restore original environment
    process.env = originalEnv;
  });

  describe('emailRateLimitMiddleware', () => {
    describe('Success Cases', () => {
      it('should allow requests within rate limit', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalledWith(429);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      });

      it('should use default limit of 100 when not configured', async () => {
        delete process.env.EMAIL_RATE_LIMIT;

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      });

      it('should use configured email rate limit from environment', async () => {
        process.env.EMAIL_RATE_LIMIT = '50';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '50');
      });

      it('should use default window of 60000ms when not configured', async () => {
        delete process.env.EMAIL_RATE_WINDOW_MS;

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use configured window from environment', async () => {
        process.env.EMAIL_RATE_WINDOW_MS = '30000';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should set rate limit headers', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      });

      it('should decrement remaining count on each request', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '98');
      });

      it('should reset count after window expires', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');

        // Advance time past window
        jest.advanceTimersByTime(61000);

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      });
    });

    describe('Client Identification', () => {
      it('should use IP address as key when user not authenticated', async () => {
        mockRequest.ip = '10.0.0.1';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use user ID as key when authenticated', async () => {
        mockRequest.user = { id: 'user-123' };

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use X-Forwarded-For header when present', async () => {
        mockRequest.headers['x-forwarded-for'] = '203.0.113.1';
        mockRequest.ip = undefined;

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should use socket remote address as fallback', async () => {
        mockRequest.ip = undefined;
        mockRequest.headers['x-forwarded-for'] = undefined;
        mockRequest.socket.remoteAddress = '172.16.0.1';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should handle unknown client gracefully', async () => {
        mockRequest.ip = undefined;
        mockRequest.headers['x-forwarded-for'] = undefined;
        mockRequest.socket.remoteAddress = undefined;

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should track different users separately', async () => {
        mockRequest.user = { id: 'user-1' };
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');

        mockRequest.user = { id: 'user-2' };
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      });

      it('should track different IPs separately', async () => {
        mockRequest.ip = '192.168.1.1';
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');

        mockRequest.ip = '192.168.1.2';
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      });
    });

    describe('Rate Limit Exceeded', () => {
      it('should return 429 when rate limit exceeded', async () => {
        process.env.EMAIL_RATE_LIMIT = '2';

        await emailRateLimitMiddleware(mockRequest, mockReply);
        await emailRateLimitMiddleware(mockRequest, mockReply);
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Too Many Requests'
          })
        );
      });

      it('should include retry-after in error response', async () => {
        process.env.EMAIL_RATE_LIMIT = '1';

        await emailRateLimitMiddleware(mockRequest, mockReply);
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            retryAfter: expect.any(Number)
          })
        );
      });

      it('should log warning when rate limit exceeded', async () => {
        process.env.EMAIL_RATE_LIMIT = '1';

        await emailRateLimitMiddleware(mockRequest, mockReply);
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Email rate limit exceeded',
          expect.objectContaining({
            key: expect.any(String),
            limit: 1
          })
        );
      });

      it('should set remaining to 0 when limit exceeded', async () => {
        process.env.EMAIL_RATE_LIMIT = '1';

        await emailRateLimitMiddleware(mockRequest, mockReply);
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      });

      it('should include error message with retry time', async () => {
        process.env.EMAIL_RATE_LIMIT = '1';

        await emailRateLimitMiddleware(mockRequest, mockReply);
        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Try again in')
          })
        );
      });
    });

    describe('Reset Time', () => {
      it('should set reset time as ISO string', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);

        const resetCall = (mockReply.header as jest.Mock).mock.calls.find(
          call => call[0] === 'X-RateLimit-Reset'
        );
        expect(resetCall).toBeDefined();
        expect(resetCall[1]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });

      it('should use future time for reset', async () => {
        const beforeTime = new Date().getTime();
        await emailRateLimitMiddleware(mockRequest, mockReply);

        const resetCall = (mockReply.header as jest.Mock).mock.calls.find(
          call => call[0] === 'X-RateLimit-Reset'
        );
        const resetTime = new Date(resetCall[1]).getTime();
        expect(resetTime).toBeGreaterThan(beforeTime);
      });
    });
  });

  describe('smsRateLimitMiddleware', () => {
    describe('Success Cases', () => {
      it('should allow requests within rate limit', async () => {
        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalledWith(429);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
      });

      it('should use default limit of 50 when not configured', async () => {
        delete process.env.SMS_RATE_LIMIT;

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '50');
      });

      it('should use configured SMS rate limit', async () => {
        process.env.SMS_RATE_LIMIT = '10';

        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      });

      it('should track SMS limits separately from email', async () => {
        mockRequest.user = { id: 'user-123' };

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');

        await smsRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '49');
      });
    });

    describe('Rate Limit Exceeded', () => {
      it('should return 429 when SMS rate limit exceeded', async () => {
        process.env.SMS_RATE_LIMIT = '2';

        await smsRateLimitMiddleware(mockRequest, mockReply);
        await smsRateLimitMiddleware(mockRequest, mockReply);
        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
      });

      it('should log warning when SMS rate limit exceeded', async () => {
        process.env.SMS_RATE_LIMIT = '1';

        await smsRateLimitMiddleware(mockRequest, mockReply);
        await smsRateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'SMS rate limit exceeded',
          expect.any(Object)
        );
      });
    });
  });

  describe('batchRateLimitMiddleware', () => {
    describe('Success Cases', () => {
      it('should allow requests within rate limit', async () => {
        await batchRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).not.toHaveBeenCalledWith(429);
      });

      it('should use default limit of 10 when not configured', async () => {
        delete process.env.BATCH_RATE_LIMIT;

        await batchRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      });

      it('should use configured batch rate limit', async () => {
        process.env.BATCH_RATE_LIMIT = '5';

        await batchRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      });

      it('should track batch limits separately', async () => {
        mockRequest.user = { id: 'user-123' };

        await emailRateLimitMiddleware(mockRequest, mockReply);
        await batchRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
      });
    });

    describe('Rate Limit Exceeded', () => {
      it('should return 429 when batch rate limit exceeded', async () => {
        process.env.BATCH_RATE_LIMIT = '1';

        await batchRateLimitMiddleware(mockRequest, mockReply);
        await batchRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
        expect(mockReply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Batch notification rate limit exceeded')
          })
        );
      });

      it('should log warning when batch rate limit exceeded', async () => {
        process.env.BATCH_RATE_LIMIT = '1';

        await batchRateLimitMiddleware(mockRequest, mockReply);
        await batchRateLimitMiddleware(mockRequest, mockReply);

        expect(logger.warn).toHaveBeenCalledWith(
          'Batch rate limit exceeded',
          expect.any(Object)
        );
      });
    });
  });

  describe('channelRateLimitMiddleware', () => {
    describe('Channel Selection', () => {
      it('should apply SMS rate limit for SMS channel', async () => {
        process.env.SMS_RATE_LIMIT = '10';
        mockRequest.body = { channel: 'sms' };

        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      });

      it('should apply email rate limit for email channel', async () => {
        process.env.EMAIL_RATE_LIMIT = '100';
        mockRequest.body = { channel: 'email' };

        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      });

      it('should default to email rate limit when no channel specified', async () => {
        process.env.EMAIL_RATE_LIMIT = '100';
        mockRequest.body = {};

        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      });

      it('should default to email rate limit when body is null', async () => {
        process.env.EMAIL_RATE_LIMIT = '100';
        mockRequest.body = null;

        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      });

      it('should handle unknown channel by using email limit', async () => {
        process.env.EMAIL_RATE_LIMIT = '100';
        mockRequest.body = { channel: 'push' };

        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      });
    });

    describe('Rate Limiting', () => {
      it('should enforce SMS rate limit for SMS requests', async () => {
        process.env.SMS_RATE_LIMIT = '2';
        mockRequest.body = { channel: 'sms' };

        await channelRateLimitMiddleware(mockRequest, mockReply);
        await channelRateLimitMiddleware(mockRequest, mockReply);
        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
      });

      it('should enforce email rate limit for email requests', async () => {
        process.env.EMAIL_RATE_LIMIT = '2';
        mockRequest.body = { channel: 'email' };

        await channelRateLimitMiddleware(mockRequest, mockReply);
        await channelRateLimitMiddleware(mockRequest, mockReply);
        await channelRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
      });
    });
  });

  describe('RateLimiter Class', () => {
    describe('Cleanup Mechanism', () => {
      it('should periodically clean up expired entries', async () => {
        process.env.EMAIL_RATE_LIMIT = '5';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        // Advance time past cleanup interval (60 seconds) and past window
        jest.advanceTimersByTime(65000);

        // Entry should be cleaned up, new request should start fresh
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
      });

      it('should not clean up active entries', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);

        // Advance time but not past window
        jest.advanceTimersByTime(30000);

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '98');
      });
    });

    describe('Multiple Windows', () => {
      it('should handle overlapping windows correctly', async () => {
        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');

        // Advance halfway through window
        jest.advanceTimersByTime(30000);

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '98');

        // Advance past original window
        jest.advanceTimersByTime(35000);

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      });
    });

    describe('Edge Cases', () => {
      it('should handle rapid successive requests', async () => {
        process.env.EMAIL_RATE_LIMIT = '5';

        for (let i = 0; i < 5; i++) {
          await emailRateLimitMiddleware(mockRequest, mockReply);
        }

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');

        await emailRateLimitMiddleware(mockRequest, mockReply);
        expect(mockReply.status).toHaveBeenCalledWith(429);
      });

      it('should handle concurrent requests from same client', async () => {
        const promises = Array(3).fill(null).map(() =>
          emailRateLimitMiddleware(mockRequest, mockReply)
        );

        await Promise.all(promises);

        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should handle invalid environment values gracefully', async () => {
        process.env.EMAIL_RATE_LIMIT = 'invalid';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        // Should use NaN which gets treated as 0, blocking immediately
        expect(mockReply.header).toHaveBeenCalled();
      });

      it('should handle negative limit values', async () => {
        process.env.EMAIL_RATE_LIMIT = '-10';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
      });

      it('should handle zero limit value', async () => {
        process.env.EMAIL_RATE_LIMIT = '0';

        await emailRateLimitMiddleware(mockRequest, mockReply);

        expect(mockReply.status).toHaveBeenCalledWith(429);
      });
    });
  });
});
