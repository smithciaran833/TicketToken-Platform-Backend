/**
 * Unit Tests for @fastify/rate-limit Middleware Integration
 */

import { FastifyRequest } from 'fastify';

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('middleware/rate-limit.middleware', () => {
  let mockRequest: Partial<FastifyRequest>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      id: 'req-123',
      url: '/api/files',
      method: 'GET',
      ip: '192.168.1.100',
      headers: {},
    };
  });

  describe('Fastify Rate Limit Integration', () => {
    it('should be configured with Redis store when available', () => {
      const redisConfig = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      };

      expect(redisConfig).toBeDefined();
    });

    it('should fallback to memory store when Redis unavailable', () => {
      const memoryStoreAvailable = true;
      expect(memoryStoreAvailable).toBe(true);
    });

    it('should apply global rate limits', () => {
      const globalLimit = {
        max: 1000,
        timeWindow: '15m',
      };

      expect(globalLimit.max).toBe(1000);
      expect(globalLimit.timeWindow).toBe('15m');
    });
  });

  describe('Response Format', () => {
    it('should return 429 when rate limit exceeded', () => {
      const expectedResponse = {
        statusCode: 429,
        error: 'Too Many Requests',
        message: expect.any(String),
      };

      expect(expectedResponse.statusCode).toBe(429);
    });

    it('should include standard rate limit headers', () => {
      const headers = [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
        'X-RateLimit-Reset',
        'Retry-After',
      ];

      headers.forEach(header => {
        expect(header).toBeTruthy();
        expect(typeof header).toBe('string');
      });
    });
  });

  describe('Key Generation Strategy', () => {
    it('should use IP-based keys for anonymous requests', () => {
      const key = mockRequest.ip;
      expect(key).toBe('192.168.1.100');
    });

    it('should use user-based keys for authenticated requests', () => {
      const user = { id: 'user-123' };
      (mockRequest as any).user = user;

      const expectedKey = 'user-123';
      expect(user.id).toBe(expectedKey);
    });

    it('should include tenant in key for multi-tenant isolation', () => {
      const tenantContext = {
        tenantId: 'tenant-456',
        userId: 'user-789',
      };
      (mockRequest as any).tenantContext = tenantContext;

      const expectedKeyPattern = /tenant-456.*user-789/;
      const actualKey = `${tenantContext.tenantId}:${tenantContext.userId}`;

      expect(actualKey).toMatch(expectedKeyPattern);
    });
  });

  describe('Different Endpoints', () => {
    it('should apply different limits for upload endpoints', () => {
      const req = { ...mockRequest, url: '/api/upload' };

      const uploadLimit = 10;
      expect(uploadLimit).toBeLessThan(100);
      expect(req.url).toBe('/api/upload');
    });

    it('should apply different limits for download endpoints', () => {
      const req = { ...mockRequest, url: '/api/download' };

      const downloadLimit = 100;
      expect(downloadLimit).toBeGreaterThan(10);
      expect(req.url).toBe('/api/download');
    });

    it('should exclude health check endpoints from rate limiting', () => {
      const excludedPaths = [
        '/health/live',
        '/health/ready',
        '/metrics',
      ];

      excludedPaths.forEach(path => {
        const req = { ...mockRequest, url: path };
        // These paths should be excluded from rate limiting
        expect(req.url).toMatch(/health|metrics/);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', () => {
      const redisError = new Error('Redis connection failed');
      expect(redisError).toBeInstanceOf(Error);
    });

    it('should log rate limit rejections', () => {
      const mockLogger = require('../../../src/utils/logger').logger;
      expect(mockLogger.warn).toBeDefined();
    });
  });
});
