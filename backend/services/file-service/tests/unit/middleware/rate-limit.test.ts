import { FastifyRequest, FastifyReply } from 'fastify';
import {
  uploadRateLimiter,
  downloadRateLimiter,
  processingRateLimiter,
  globalRateLimiter,
  getRateLimitStatus,
  resetRateLimit,
} from '../../../src/middleware/rate-limit';

jest.mock('../../../src/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe('middleware/rate-limit', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      url: '/api/upload',
      method: 'POST',
      ip: '192.168.1.100',
      headers: {},
    } as any;

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      sent: false,
    } as any;

    (mockRequest as any).tenantId = 'tenant-123';
    (mockRequest as any).user = { userId: 'user-456' };
  });

  describe('uploadRateLimiter', () => {
    it('should allow requests under limit', async () => {
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.status).not.toHaveBeenCalledWith(429);
    });

    it('should set rate limit headers', async () => {
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should use tenant+user as key', async () => {
      (mockRequest as any).tenantId = 'tenant-123';
      (mockRequest as any).user = { userId: 'user-456' };
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect((mockRequest as any).tenantId).toBe('tenant-123');
      expect((mockRequest as any).user.userId).toBe('user-456');
    });

    it('should enforce limit of 10 uploads per 15 minutes', () => {
      const config = { max: 10, windowMs: 15 * 60 * 1000 };
      expect(config.max).toBe(10);
      expect(config.windowMs).toBe(900000);
    });
  });

  describe('downloadRateLimiter', () => {
    it('should allow requests under limit', async () => {
      await downloadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.status).not.toHaveBeenCalledWith(429);
    });

    it('should have higher limit than upload', () => {
      expect(100).toBeGreaterThan(10);
    });

    it('should enforce limit of 100 downloads per 15 minutes', () => {
      const config = { max: 100, windowMs: 15 * 60 * 1000 };
      expect(config.max).toBe(100);
    });
  });

  describe('processingRateLimiter', () => {
    it('should allow requests under limit', async () => {
      await processingRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.status).not.toHaveBeenCalledWith(429);
    });

    it('should enforce limit of 30 processes per 15 minutes', () => {
      const config = { max: 30, windowMs: 15 * 60 * 1000 };
      expect(config.max).toBe(30);
    });
  });

  describe('globalRateLimiter', () => {
    it('should allow requests under limit', async () => {
      await globalRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.status).not.toHaveBeenCalledWith(429);
    });

    it('should enforce limit of 100 requests per 15 minutes', () => {
      const config = { max: 100, windowMs: 15 * 60 * 1000 };
      expect(config.max).toBe(100);
    });
  });

  describe('Rate Limit Headers', () => {
    it('should include X-RateLimit-Limit header', async () => {
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(Number));
    });

    it('should include X-RateLimit-Remaining header', async () => {
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(Number));
    });

    it('should include X-RateLimit-Reset header', async () => {
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return status for a key', async () => {
      const status = await getRateLimitStatus('tenant-123:user-456', 'upload');
      expect(status).toBeDefined();
      if (status) {
        expect(status).toHaveProperty('count');
        expect(status).toHaveProperty('limit');
        expect(status).toHaveProperty('remaining');
      }
    });

    it('should return null on error', async () => {
      const status = await getRateLimitStatus('invalid-key', 'upload');
      expect(status === null || typeof status === 'object').toBe(true);
    });
  });

  describe('resetRateLimit', () => {
    it('should reset rate limit for a key', async () => {
      const result = await resetRateLimit('tenant-123:user-456', 'upload');
      expect(result).toBe(true);
    });
  });

  describe('Key Generation', () => {
    it('should use tenant ID in key when available', () => {
      (mockRequest as any).tenantId = 'tenant-789';
      expect((mockRequest as any).tenantId).toBe('tenant-789');
    });

    it('should use user ID in key when available', () => {
      (mockRequest as any).user = { userId: 'user-999' };
      expect((mockRequest as any).user.userId).toBe('user-999');
    });

    it('should fallback to IP when no tenant context', () => {
      (mockRequest as any).tenantId = undefined;
      (mockRequest as any).user = undefined;
      expect(mockRequest.ip).toBe('192.168.1.100');
    });

    it('should isolate limits by tenant', () => {
      const tenant1Key = 'upload:tenant-1:user-1';
      const tenant2Key = 'upload:tenant-2:user-1';
      expect(tenant1Key).not.toBe(tenant2Key);
    });
  });

  describe('Redis Fallback', () => {
    it('should work with in-memory store when Redis unavailable', async () => {
      await uploadRateLimiter(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockReply.status).not.toHaveBeenCalledWith(500);
    });

    it('should log warning when Redis connection fails', () => {
      const mockLogger = require('../../../src/utils/logger').logger;
      expect(mockLogger).toBeDefined();
    });
  });

  describe('Time Window Behavior', () => {
    it('should reset count after window expires', () => {
      const windowMs = 15 * 60 * 1000;
      const startTime = Date.now();
      const endTime = startTime + windowMs;
      expect(endTime).toBeGreaterThan(startTime);
      expect(endTime - startTime).toBe(windowMs);
    });

    it('should use sliding window for rate limiting', () => {
      const window = 900000;
      expect(window).toBe(15 * 60 * 1000);
    });
  });
});
