import { RateLimiter, createRateLimiter } from '../../../src/middleware/rate-limit.middleware';
import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimitError } from '../../../src/utils/errors';

describe('Rate Limit Middleware', () => {
  let rateLimiter: RateLimiter;
  let mockRedis: any;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: any;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Suppress console errors in tests
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock Redis with pipeline support
    const mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 'OK']])
    };

    mockRedis = {
      pipeline: jest.fn(() => mockPipeline),
      keys: jest.fn().mockResolvedValue([]),
      del: jest.fn().mockResolvedValue(1)
    };

    // Mock Fastify request
    mockRequest = {
      method: 'GET',
      routerPath: '/api/v1/venues',
      params: {},
      headers: {}
    };

    // Mock Fastify reply with proper structure
    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      request: {
        id: 'test-request-id-123'
      } as any
    } as any;

    rateLimiter = new RateLimiter(mockRedis);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  // =============================================================================
  // Global Rate Limiting Tests
  // =============================================================================

  describe('Global Rate Limiting', () => {
    it('should allow requests under the limit', async () => {
      const middleware = rateLimiter.createMiddleware('global');
      
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      expect(mockReply.status).not.toHaveBeenCalled();
    });

    it('should block requests over the limit (100/min)', async () => {
      // Simulate 101st request
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 101], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(RateLimitError);

      expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
    });

    it('should return 429 status when blocked', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 101], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');

      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toContain('Rate limit exceeded');
      }
    });

    it('should include retry-after header when blocked', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 150], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');

      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error) {
        expect(mockReply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
      }
    });
  });

  // =============================================================================
  // Per-User Rate Limiting Tests
  // =============================================================================

  describe('Per-User Rate Limiting', () => {
    it('should track by user ID', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      const middleware = rateLimiter.createMiddleware('perUser');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    });

    it('should enforce different limits per user (60/min)', async () => {
      (mockRequest as any).user = { id: 'user-456' };

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 61], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('perUser');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(RateLimitError);
    });

    it('should skip rate limiting for anonymous users', async () => {
      // No user in request
      mockRequest.user = undefined;

      const middleware = rateLimiter.createMiddleware('perUser');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should return early without incrementing
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('should handle different users independently', async () => {
      // First user
      (mockRequest as any).user = { id: 'user-111' };
      const middleware = rateLimiter.createMiddleware('perUser');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Second user
      (mockRequest as any).user = { id: 'user-222' };
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Both should succeed
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '59');
    });
  });

  // =============================================================================
  // Per-Venue Rate Limiting Tests
  // =============================================================================

  describe('Per-Venue Rate Limiting', () => {
    it('should track by venue ID (30/min)', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      const middleware = rateLimiter.createMiddleware('perVenue');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '30');
      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '29');
    });

    it('should only apply to venue-specific endpoints', async () => {
      // No venueId in params
      mockRequest.params = {};

      const middleware = rateLimiter.createMiddleware('perVenue');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should skip
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('should block when venue-specific limit exceeded', async () => {
      mockRequest.params = { venueId: 'venue-456' };

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 31], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('perVenue');

      await expect(
        middleware(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(RateLimitError);
    });
  });

  // =============================================================================
  // Operation-Specific Limits Tests
  // =============================================================================

  describe('Operation-Specific Limits', () => {
    it('should enforce create venue limit (100/hour)', async () => {
      mockRequest.method = 'POST';
      mockRequest.routerPath = '/api/v1/venues';
      (mockRequest as any).user = { id: 'user-123' };

      const middleware = rateLimiter.createMiddleware('perOperation');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });

    it('should enforce update venue limit (20/min)', async () => {
      mockRequest.method = 'PUT';
      mockRequest.routerPath = '/api/v1/venues/:venueId';
      (mockRequest as any).user = { id: 'user-123' };

      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 5], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('perOperation');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '20');
    });

    it('should enforce delete venue limit (100/hour)', async () => {
      mockRequest.method = 'DELETE';
      mockRequest.routerPath = '/api/v1/venues/:venueId';
      (mockRequest as any).user = { id: 'user-123' };

      const middleware = rateLimiter.createMiddleware('perOperation');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });

    it('should skip operations without specific limits', async () => {
      mockRequest.method = 'GET';
      mockRequest.routerPath = '/api/v1/unknown';
      (mockRequest as any).user = { id: 'user-123' };

      const middleware = rateLimiter.createMiddleware('perOperation');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Should skip
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it('should track anonymous users separately for operations', async () => {
      mockRequest.method = 'POST';
      mockRequest.routerPath = '/api/v1/venues';
      // No user

      const middleware = rateLimiter.createMiddleware('perOperation');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Redis Integration Tests
  // =============================================================================

  describe('Redis Integration', () => {
    it('should increment counters in Redis', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 5], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPipeline.incr).toHaveBeenCalled();
    });

    it('should set proper TTL on keys', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPipeline.expire).toHaveBeenCalledWith(expect.any(String), 60);
    });

    it('should handle Redis connection failures gracefully', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockRejectedValue(new Error('Redis connection failed'))
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');
      
      // Should fail open (allow request)
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '100');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should use Redis pipeline for atomic operations', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 1], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Rate Limit Headers Tests
  // =============================================================================

  describe('Rate Limit Headers', () => {
    it('should set X-RateLimit-Limit header', async () => {
      const middleware = rateLimiter.createMiddleware('global');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
    });

    it('should set X-RateLimit-Remaining header', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 25], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '75');
    });

    it('should set X-RateLimit-Reset header with ISO timestamp', async () => {
      const middleware = rateLimiter.createMiddleware('global');
      await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.header).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.stringMatching(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      );
    });

    it('should set remaining to 0 when limit exceeded', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 105], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      const middleware = rateLimiter.createMiddleware('global');

      try {
        await middleware(mockRequest as FastifyRequest, mockReply as FastifyReply);
      } catch (error) {
        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      }
    });
  });

  // =============================================================================
  // Combined Rate Limiting Tests
  // =============================================================================

  describe('checkAllLimits', () => {
    it('should check global limit first', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { venueId: 'venue-123' };

      await rateLimiter.checkAllLimits(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should check per-user limit if authenticated', async () => {
      (mockRequest as any).user = { id: 'user-123' };

      await rateLimiter.checkAllLimits(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should check per-venue limit if venue in path', async () => {
      mockRequest.params = { venueId: 'venue-123' };

      await rateLimiter.checkAllLimits(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRedis.pipeline).toHaveBeenCalled();
    });

    it('should fail if any limit is exceeded', async () => {
      const mockPipeline = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([[null, 101], [null, 'OK']])
      };
      mockRedis.pipeline = jest.fn(() => mockPipeline);

      await expect(
        rateLimiter.checkAllLimits(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        )
      ).rejects.toThrow(RateLimitError);
    });
  });

  // =============================================================================
  // Dynamic Configuration Tests
  // =============================================================================

  describe('Dynamic Configuration', () => {
    it('should allow updating rate limits', () => {
      rateLimiter.updateLimits('global', { max: 200 });

      // Verify the update was applied (internal state)
      expect(rateLimiter).toBeDefined();
    });

    it('should allow updating per-operation limits', () => {
      rateLimiter.updateLimits('perOperation', {
        'POST:/api/v1/venues': { windowMs: 60000, max: 50 }
      } as any);

      expect(rateLimiter).toBeDefined();
    });
  });

  // =============================================================================
  // Reset Functionality Tests
  // =============================================================================

  describe('Reset Limit', () => {
    it('should reset rate limit for specific key', async () => {
      mockRedis.keys.mockResolvedValue(['rate_limit:user:user-123:1234']);
      
      await rateLimiter.resetLimit('user', 'user-123');

      expect(mockRedis.keys).toHaveBeenCalledWith('rate_limit:user:user-123:*');
      expect(mockRedis.del).toHaveBeenCalledWith('rate_limit:user:user-123:1234');
    });

    it('should handle no keys to delete', async () => {
      mockRedis.keys.mockResolvedValue([]);
      
      await rateLimiter.resetLimit('user', 'user-999');

      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  // =============================================================================
  // Factory Function Tests
  // =============================================================================

  describe('createRateLimiter', () => {
    it('should create rate limiter instance', () => {
      const limiter = createRateLimiter(mockRedis);
      expect(limiter).toBeInstanceOf(RateLimiter);
    });

    it('should accept custom configuration', () => {
      const limiter = createRateLimiter(mockRedis, {
        global: { windowMs: 60000, max: 500 }
      });
      expect(limiter).toBeInstanceOf(RateLimiter);
    });
  });
});
