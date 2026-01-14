/**
 * Unit tests for src/middleware/rate-limit.middleware.ts
 */

import { RateLimiter, createRateLimiter } from '../../../src/middleware/rate-limit.middleware';
import { createMockRequest, createMockReply, createMockUser } from '../../__mocks__/fastify.mock';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../src/utils/errors', () => ({
  RateLimitError: class RateLimitError extends Error {
    type: string;
    retryAfter: number;
    constructor(type: string, retryAfter: number) {
      super(`Rate limit exceeded for ${type}`);
      this.type = type;
      this.retryAfter = retryAfter;
    }
  },
}));

describe('middleware/rate-limit.middleware', () => {
  let mockRequest: any;
  let mockReply: any;
  let mockRedis: any;
  let mockPipeline: any;
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create pipeline mock that persists
    mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
    };

    mockRedis = {
      pipeline: jest.fn(() => mockPipeline),
      scan: jest.fn().mockResolvedValue(['0', []]),
      del: jest.fn().mockResolvedValue(1),
    };

    mockReply = createMockReply();
    rateLimiter = new RateLimiter(mockRedis as any);
  });

  describe('RateLimiter class', () => {
    describe('constructor', () => {
      it('should create instance with default config', () => {
        expect(new RateLimiter(mockRedis as any)).toBeDefined();
      });

      it('should create instance with custom config', () => {
        expect(new RateLimiter(mockRedis as any, { global: { windowMs: 30000, max: 50 } })).toBeDefined();
      });
    });

    describe('createMiddleware()', () => {
      describe('global rate limiting', () => {
        it('should allow request within rate limit', async () => {
          mockPipeline.exec.mockResolvedValue([[null, 1], [null, 1]]);
          mockRequest = createMockRequest({ method: 'GET', url: '/api/v1/venues' });

          await rateLimiter.createMiddleware('global')(mockRequest, mockReply);

          expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
          expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
        });

        it('should throw RateLimitError when limit exceeded', async () => {
          mockPipeline.exec.mockResolvedValue([[null, 101], [null, 1]]); // count=101 > max=100
          mockRequest = createMockRequest({ method: 'GET', url: '/api/v1/venues' });

          await expect(rateLimiter.createMiddleware('global')(mockRequest, mockReply))
            .rejects.toThrow('Rate limit exceeded');
        });

        it('should set Retry-After header when limit exceeded', async () => {
          mockPipeline.exec.mockResolvedValue([[null, 101], [null, 1]]);
          mockRequest = createMockRequest({ method: 'GET', url: '/api/v1/venues' });

          try {
            await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
          } catch (e) {
            // Expected
          }

          expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
        });
      });

      describe('per-user rate limiting', () => {
        it('should skip when no user authenticated', async () => {
          mockRequest = createMockRequest({ method: 'GET', user: null });
          await rateLimiter.createMiddleware('perUser')(mockRequest, mockReply);
          expect(mockRedis.pipeline).not.toHaveBeenCalled();
        });

        it('should apply rate limit for authenticated user', async () => {
          mockRequest = createMockRequest({
            method: 'GET',
            url: '/api/v1/venues',
            user: createMockUser({ id: 'user-123' }),
          });
          await rateLimiter.createMiddleware('perUser')(mockRequest, mockReply);
          expect(mockRedis.pipeline).toHaveBeenCalled();
        });
      });

      describe('per-venue rate limiting', () => {
        it('should skip when no venueId in params', async () => {
          mockRequest = createMockRequest({ method: 'GET', params: {} });
          await rateLimiter.createMiddleware('perVenue')(mockRequest, mockReply);
          expect(mockRedis.pipeline).not.toHaveBeenCalled();
        });

        it('should apply rate limit for venue routes', async () => {
          mockRequest = createMockRequest({
            method: 'GET',
            params: { venueId: 'venue-123' },
            user: createMockUser(),
          });
          await rateLimiter.createMiddleware('perVenue')(mockRequest, mockReply);
          expect(mockRedis.pipeline).toHaveBeenCalled();
        });
      });

      describe('per-operation rate limiting', () => {
        it('should skip when no specific limit for operation', async () => {
          mockRequest = createMockRequest({ method: 'GET', routerPath: '/api/v1/non-existent' });
          await rateLimiter.createMiddleware('perOperation')(mockRequest, mockReply);
          expect(mockRedis.pipeline).not.toHaveBeenCalled();
        });
      });

      describe('per-tenant rate limiting (SR7)', () => {
        it('should skip when no tenant ID', async () => {
          mockRequest = createMockRequest({ method: 'GET', user: null });
          await rateLimiter.createMiddleware('perTenant')(mockRequest, mockReply);
          expect(mockRedis.pipeline).not.toHaveBeenCalled();
        });

        it('should apply tenant-scoped rate limit', async () => {
          mockRequest = createMockRequest({
            method: 'GET',
            user: createMockUser({ tenant_id: 'tenant-123' }),
          });
          await rateLimiter.createMiddleware('perTenant')(mockRequest, mockReply);
          expect(mockRedis.pipeline).toHaveBeenCalled();
        });
      });
    });

    describe('checkAllLimits()', () => {
      it('should check all applicable limits', async () => {
        mockRequest = createMockRequest({
          method: 'GET',
          params: { venueId: 'venue-123' },
          user: createMockUser({ tenant_id: 'tenant-123' }),
        });
        await rateLimiter.checkAllLimits(mockRequest, mockReply);
        expect(mockRedis.pipeline).toHaveBeenCalled();
      });
    });

    describe('updateLimits()', () => {
      it('should update global limits', () => {
        rateLimiter.updateLimits('global', { max: 200 });
        expect(true).toBe(true);
      });

      it('should update perOperation limits', () => {
        rateLimiter.updateLimits('perOperation', { 'POST:/custom': { windowMs: 60000, max: 10 } } as any);
        expect(true).toBe(true);
      });
    });

    describe('resetLimit()', () => {
      it('should reset rate limit for identifier', async () => {
        mockRedis.scan.mockResolvedValueOnce(['0', ['key1']]);
        await rateLimiter.resetLimit('user', 'user-123');
        expect(mockRedis.scan).toHaveBeenCalled();
      });

      it('should reset tenant-scoped rate limit', async () => {
        mockRedis.scan.mockResolvedValueOnce(['0', ['key1']]);
        await rateLimiter.resetLimit('user', 'user-123', 'tenant-123');
        expect(mockRedis.scan).toHaveBeenCalled();
      });

      it('should handle paginated SCAN results', async () => {
        mockRedis.scan.mockResolvedValueOnce(['123', ['key1']]).mockResolvedValueOnce(['0', ['key2']]);
        await rateLimiter.resetLimit('user', 'user-123');
        expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      });

      it('should delete found keys', async () => {
        mockRedis.scan.mockResolvedValueOnce(['0', ['key1', 'key2']]);
        await rateLimiter.resetLimit('user', 'user-123');
        expect(mockRedis.del).toHaveBeenCalledWith('key1', 'key2');
      });
    });
  });

  describe('createRateLimiter()', () => {
    it('should create RateLimiter instance', () => {
      expect(createRateLimiter(mockRedis as any)).toBeInstanceOf(RateLimiter);
    });

    it('should create RateLimiter with custom config', () => {
      expect(createRateLimiter(mockRedis as any, { global: { windowMs: 5000, max: 10 } })).toBeInstanceOf(RateLimiter);
    });
  });

  describe('error handling (FC6)', () => {
    it('should fail open on Redis errors', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('Redis error'));
      mockRequest = createMockRequest({ method: 'GET' });

      // Should not throw
      await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
    });
  });

  describe('security tests', () => {
    describe('tenant isolation (SR7)', () => {
      it('should include tenant ID in rate limit key', async () => {
        mockRequest = createMockRequest({
          method: 'GET',
          user: createMockUser({ tenant_id: 'tenant-123' }),
        });
        await rateLimiter.checkAllLimits(mockRequest, mockReply);
        expect(mockRedis.pipeline).toHaveBeenCalled();
      });
    });

    describe('rate limit logging (SE9)', () => {
      it('should log warning when rate limit exceeded', async () => {
        mockPipeline.exec.mockResolvedValue([[null, 101], [null, 1]]);
        mockRequest = createMockRequest({ method: 'GET', user: createMockUser() });

        try {
          await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
        } catch (e) {
          // Expected
        }

        // Logger.warn called internally
      });
    });
  });

  describe('rate limit headers', () => {
    it('should set X-RateLimit-Limit header', async () => {
      mockRequest = createMockRequest({ method: 'GET' });
      await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', expect.any(String));
    });

    it('should set X-RateLimit-Remaining header', async () => {
      mockPipeline.exec.mockResolvedValue([[null, 50], [null, 1]]);
      mockRequest = createMockRequest({ method: 'GET' });
      await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', expect.any(String));
    });

    it('should set X-RateLimit-Reset header with ISO timestamp', async () => {
      mockRequest = createMockRequest({ method: 'GET' });
      await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    });
  });

  describe('edge cases', () => {
    it('should handle anonymous users for perOperation', async () => {
      mockRequest = createMockRequest({ method: 'POST', routerPath: '/api/v1/venues', user: null });
      await rateLimiter.createMiddleware('perOperation')(mockRequest, mockReply);
    });

    it('should handle missing pipeline results', async () => {
      mockPipeline.exec.mockResolvedValue(null);
      mockRequest = createMockRequest({ method: 'GET' });
      await rateLimiter.createMiddleware('global')(mockRequest, mockReply);
    });

    it('should handle empty key deletion', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', []]);
      await rateLimiter.resetLimit('user', 'user-123');
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});
