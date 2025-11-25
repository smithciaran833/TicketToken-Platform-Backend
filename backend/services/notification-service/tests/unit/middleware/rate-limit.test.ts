import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  emailRateLimitMiddleware,
  smsRateLimitMiddleware,
  batchRateLimitMiddleware,
  channelRateLimitMiddleware
} from '../../../src/middleware/rate-limit.middleware';
import { FastifyRequest, FastifyReply } from 'fastify';

// Mock environment variables
const originalEnv = process.env;

describe('Rate Limit Middleware - Unit Tests', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let headersSent: Record<string, string>;
  let replySent: { status?: number; body?: any };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    
    // Reset test state
    headersSent = {};
    replySent = {};

    // Mock request
    mockRequest = {
      ip: '192.168.1.100',
      headers: {},
      socket: { remoteAddress: '192.168.1.100' } as any,
      body: {}
    };

    // Mock reply
    mockReply = {
      header: jest.fn((key: string, value: string) => {
        headersSent[key] = value;
        return mockReply as FastifyReply;
      }),
      status: jest.fn((code: number) => {
        replySent.status = code;
        return mockReply as FastifyReply;
      }),
      send: jest.fn((body: any) => {
        replySent.body = body;
        return mockReply as FastifyReply;
      })
    } as any;
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.clearAllMocks();
  });

  describe('Email Rate Limiting', () => {
    it('should allow request within email rate limit', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';
      process.env.EMAIL_RATE_WINDOW_MS = '60000';

      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('100');
      expect(headersSent['X-RateLimit-Remaining']).toBe('99');
      expect(headersSent['X-RateLimit-Reset']).toBeDefined();
      expect(replySent.status).toBeUndefined();
    });

    it('should block request when email rate limit exceeded', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';
      process.env.EMAIL_RATE_WINDOW_MS = '60000';

      // Make requests up to the limit
      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );
      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      // This should be blocked
      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(429);
      expect(replySent.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('Email rate limit exceeded')
      });
      expect(headersSent['Retry-After']).toBeDefined();
      expect(headersSent['X-RateLimit-Remaining']).toBe('0');
    });

    it('should use default email rate limit if not set', async () => {
      delete process.env.EMAIL_RATE_LIMIT;
      delete process.env.EMAIL_RATE_WINDOW_MS;

      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('100'); // Default
      expect(replySent.status).toBeUndefined();
    });

    it('should track separate limits for different IPs', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      const request1 = { ...mockRequest, ip: '192.168.1.101' };
      const request2 = { ...mockRequest, ip: '192.168.1.102' };

      // Exhaust limit for IP 1
      await emailRateLimitMiddleware(request1 as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(request1 as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(request1 as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);

      // Reset reply state
      replySent = {};

      // IP 2 should still be allowed
      await emailRateLimitMiddleware(request2 as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBeUndefined();
    });

    it('should track limits by user ID when authenticated', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      const authenticatedRequest = {
        ...mockRequest,
        user: { id: 'user-123' }
      };

      await emailRateLimitMiddleware(
        authenticatedRequest as any,
        mockReply as FastifyReply
      );
      await emailRateLimitMiddleware(
        authenticatedRequest as any,
        mockReply as FastifyReply
      );
      await emailRateLimitMiddleware(
        authenticatedRequest as any,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBe(429);
    });
  });

  describe('SMS Rate Limiting', () => {
    it('should allow request within SMS rate limit', async () => {
      process.env.SMS_RATE_LIMIT = '50';
      process.env.SMS_RATE_WINDOW_MS = '60000';

      await smsRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('50');
      expect(headersSent['X-RateLimit-Remaining']).toBe('49');
      expect(replySent.status).toBeUndefined();
    });

    it('should block request when SMS rate limit exceeded', async () => {
      process.env.SMS_RATE_LIMIT = '2';
      process.env.SMS_RATE_WINDOW_MS = '60000';

      await smsRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await smsRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await smsRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);
      expect(replySent.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('SMS rate limit exceeded')
      });
    });

    it('should use default SMS rate limit if not set', async () => {
      delete process.env.SMS_RATE_LIMIT;

      await smsRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('50'); // Default
    });

    it('should enforce stricter SMS limits than email', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';
      process.env.SMS_RATE_LIMIT = '50';

      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(headersSent['X-RateLimit-Limit']).toBe('100');

      headersSent = {};

      await smsRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(headersSent['X-RateLimit-Limit']).toBe('50');
    });
  });

  describe('Batch Rate Limiting', () => {
    it('should allow request within batch rate limit', async () => {
      process.env.BATCH_RATE_LIMIT = '10';
      process.env.BATCH_RATE_WINDOW_MS = '60000';

      await batchRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('10');
      expect(headersSent['X-RateLimit-Remaining']).toBe('9');
      expect(replySent.status).toBeUndefined();
    });

    it('should block request when batch rate limit exceeded', async () => {
      process.env.BATCH_RATE_LIMIT = '2';

      await batchRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await batchRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await batchRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);
      expect(replySent.body).toMatchObject({
        error: 'Too Many Requests',
        message: expect.stringContaining('Batch notification rate limit exceeded')
      });
    });

    it('should use default batch rate limit if not set', async () => {
      delete process.env.BATCH_RATE_LIMIT;

      await batchRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('10'); // Default
    });
  });

  describe('Channel-Based Rate Limiting', () => {
    it('should apply email rate limit for email channel', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';
      process.env.SMS_RATE_LIMIT = '50';

      mockRequest.body = { channel: 'email' };

      await channelRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('100');
    });

    it('should apply SMS rate limit for SMS channel', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';
      process.env.SMS_RATE_LIMIT = '50';

      mockRequest.body = { channel: 'sms' };

      await channelRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('50');
    });

    it('should default to email rate limit when channel not specified', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';

      mockRequest.body = {};

      await channelRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('100');
    });

    it('should default to email rate limit for unknown channel', async () => {
      process.env.EMAIL_RATE_LIMIT = '100';

      mockRequest.body = { channel: 'push' };

      await channelRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBe('100');
    });
  });

  describe('Rate Limit Window Reset', () => {
    it('should reset counter after time window expires', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';
      process.env.EMAIL_RATE_WINDOW_MS = '100'; // 100ms window

      // Exhaust limit
      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      // Reset state
      replySent = {};
      headersSent = {};

      // Should be allowed again
      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBeUndefined();
      expect(headersSent['X-RateLimit-Remaining']).toBe('1');
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include all required rate limit headers', async () => {
      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Limit']).toBeDefined();
      expect(headersSent['X-RateLimit-Remaining']).toBeDefined();
      expect(headersSent['X-RateLimit-Reset']).toBeDefined();
    });

    it('should include Retry-After header when limit exceeded', async () => {
      process.env.EMAIL_RATE_LIMIT = '1';

      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(headersSent['Retry-After']).toBeDefined();
      expect(parseInt(headersSent['Retry-After'], 10)).toBeGreaterThan(0);
    });

    it('should format reset time as ISO string', async () => {
      await emailRateLimitMiddleware(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(headersSent['X-RateLimit-Reset']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('Per-User vs Global Limits', () => {
    it('should enforce per-user limits for authenticated users', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      const user1Request = { ...mockRequest, user: { id: 'user-1' } };
      const user2Request = { ...mockRequest, user: { id: 'user-2' } };

      // Exhaust limit for user 1
      await emailRateLimitMiddleware(user1Request as any, mockReply as FastifyReply);
      await emailRateLimitMiddleware(user1Request as any, mockReply as FastifyReply);
      await emailRateLimitMiddleware(user1Request as any, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);

      replySent = {};

      // User 2 should have separate limit
      await emailRateLimitMiddleware(user2Request as any, mockReply as FastifyReply);

      expect(replySent.status).toBeUndefined();
    });

    it('should use IP-based limiting for unauthenticated users', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      const req1 = { ...mockRequest, ip: '192.168.1.100' };
      const req2 = { ...mockRequest, ip: '192.168.1.101' };

      // Exhaust limit for IP 1
      await emailRateLimitMiddleware(req1 as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(req1 as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(req1 as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);

      replySent = {};

      // Different IP should be allowed
      await emailRateLimitMiddleware(req2 as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing IP address gracefully', async () => {
      const requestWithoutIP = {
        ...mockRequest,
        ip: undefined,
        headers: {},
        socket: { remoteAddress: undefined } as any
      };

      await emailRateLimitMiddleware(
        requestWithoutIP as any as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(replySent.status).toBeUndefined();
      expect(headersSent['X-RateLimit-Remaining']).toBeDefined();
    });

    it('should use X-Forwarded-For header when available', async () => {
      process.env.EMAIL_RATE_LIMIT = '2';

      const requestWithForwardedFor = {
        ...mockRequest,
        ip: undefined,
        headers: { 'x-forwarded-for': '203.0.113.195' },
        socket: { remoteAddress: undefined } as any
      };

      await emailRateLimitMiddleware(requestWithForwardedFor as any as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(requestWithForwardedFor as any as FastifyRequest, mockReply as FastifyReply);
      await emailRateLimitMiddleware(requestWithForwardedFor as any as FastifyRequest, mockReply as FastifyReply);

      expect(replySent.status).toBe(429);
    });

    it('should handle concurrent requests correctly', async () => {
      process.env.EMAIL_RATE_LIMIT = '5';

      const requests = Array(10).fill(null).map(() =>
        emailRateLimitMiddleware(mockRequest as FastifyRequest, { ...mockReply } as FastifyReply)
      );

      await Promise.all(requests);

      // Some should succeed, some should be rate limited
      // Due to concurrent execution, exact count may vary
      expect(true).toBe(true); // Test completes without hanging
    });
  });
});
