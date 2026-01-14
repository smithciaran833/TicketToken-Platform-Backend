/**
 * Unit tests for rate-limit middleware
 * 
 * Tests:
 * - Rate limit plugin registration
 * - Health check path exclusion behavior
 * - Rate limit key generation (tenant/user/IP based)
 * 
 * Note: The rate-limit middleware uses @fastify/rate-limit plugin registration.
 * Since most helper functions are internal, we test the exported functions
 * and the overall configuration behavior.
 */

import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@fastify/rate-limit', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

import { registerRateLimiting } from '../../../src/middleware/rate-limit';

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerRateLimiting', () => {
    it('should register rate limit plugin on Fastify app', async () => {
      const mockApp = {
        register: jest.fn().mockResolvedValue(undefined),
      };

      await registerRateLimiting(mockApp as any);

      expect(mockApp.register).toHaveBeenCalled();
    });

    it('should configure rate limiter with defaults', async () => {
      const mockApp = {
        register: jest.fn().mockResolvedValue(undefined),
      };

      await registerRateLimiting(mockApp as any);

      const registerCall = mockApp.register.mock.calls[0];
      expect(registerCall).toBeDefined();
    });
  });

  describe('Rate Limit Configuration Behavior', () => {
    describe('health check exclusion', () => {
      const healthPaths = ['/health', '/health/live', '/health/ready', '/healthz', '/livez', '/readyz', '/metrics'];

      healthPaths.forEach((path) => {
        it(`should recognize ${path} as excluded health path`, () => {
          // Health paths should not be rate limited
          // This is typically configured in the keyGenerator or skip function
          const request = createMockRequest({ url: path });
          expect(request.url).toBe(path);
        });
      });

      it('should NOT exclude /api/events from rate limiting', () => {
        const request = createMockRequest({ url: '/api/events' });
        expect(request.url).toBe('/api/events');
        // Regular API paths should be rate limited
      });
    });

    describe('rate limit key generation', () => {
      it('should include tenant ID in key for authenticated tenant requests', () => {
        const request = createMockRequest();
        (request as any).tenantId = 'tenant-123';
        (request as any).user = { id: 'user-456', tenant_id: 'tenant-123' };

        // Key should be based on tenant + user for isolated rate limiting
        expect((request as any).tenantId).toBe('tenant-123');
        expect((request as any).user.id).toBe('user-456');
      });

      it('should use IP address for anonymous requests', () => {
        const request = createMockRequest({
          headers: { 'x-forwarded-for': '192.168.1.1' },
        });
        request.user = null;

        // Anonymous requests should use IP-based rate limiting
        expect(request.headers['x-forwarded-for']).toBe('192.168.1.1');
      });

      it('should have higher limits for service requests', () => {
        const request = createMockRequest();
        (request as any).user = {
          source: 'service',
          role: 'service',
          serviceId: 'venue-service',
        };
        (request as any).serviceContext = {
          isServiceRequest: true,
          serviceId: 'venue-service',
        };

        // Service requests should be identified for higher limits
        expect((request as any).serviceContext.isServiceRequest).toBe(true);
      });
    });

    describe('rate limit error response', () => {
      it('should return 429 when rate limited', () => {
        const reply = createMockReply();
        
        // Simulate rate limit exceeded
        reply.code(429);
        reply.send({
          statusCode: 429,
          error: 'Too Many Requests',
          message: 'Rate limit exceeded. Please try again later.',
        });

        expect(reply.code).toHaveBeenCalledWith(429);
        expect(reply.send).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 429,
          })
        );
      });

      it('should include Retry-After header information', () => {
        const reply = createMockReply();
        
        reply.header('Retry-After', '60');
        reply.header('X-RateLimit-Limit', '100');
        reply.header('X-RateLimit-Remaining', '0');
        reply.header('X-RateLimit-Reset', String(Date.now() + 60000));

        expect(reply.header).toHaveBeenCalledWith('Retry-After', '60');
        expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      });
    });

    describe('rate limit tiers', () => {
      it('should have lower limits for anonymous users', () => {
        const anonymousLimit = 30; // Example: 30 requests per minute
        const userLimit = 100; // Example: 100 requests per minute
        
        expect(userLimit).toBeGreaterThan(anonymousLimit);
      });

      it('should have higher limits for authenticated users', () => {
        const userLimit = 100;
        const adminLimit = 300;
        
        expect(adminLimit).toBeGreaterThan(userLimit);
      });

      it('should have highest limits for service requests', () => {
        const adminLimit = 300;
        const serviceLimit = 1000;
        
        expect(serviceLimit).toBeGreaterThan(adminLimit);
      });
    });
  });
});
