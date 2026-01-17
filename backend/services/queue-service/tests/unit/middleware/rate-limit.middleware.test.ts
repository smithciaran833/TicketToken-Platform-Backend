// Mock logger BEFORE imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock RateLimiterService
const mockRateLimiter = {
  isRateLimited: jest.fn(),
  getWaitTime: jest.fn(),
  acquire: jest.fn(),
  release: jest.fn(),
};

jest.mock('../../../src/services/rate-limiter.service', () => ({
  RateLimiterService: {
    getInstance: jest.fn(() => mockRateLimiter),
  },
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { rateLimitMiddleware, globalRateLimit } from '../../../src/middleware/rate-limit.middleware';
import { logger } from '../../../src/utils/logger';

describe('Rate Limit Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let finishHandler: () => void;

  beforeEach(() => {
    mockRequest = {
      ip: '127.0.0.1',
      url: '/api/queues',
    };

    finishHandler = jest.fn();
    mockReply = {
      statusCode: 200,
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
      raw: {
        on: jest.fn((event: string, handler: () => void) => {
          if (event === 'finish') {
            finishHandler = handler;
          }
        }),
      } as any,
    };

    // Reset mocks
    mockRateLimiter.isRateLimited.mockReset();
    mockRateLimiter.getWaitTime.mockReset();
    mockRateLimiter.acquire.mockReset();
    mockRateLimiter.release.mockReset();
  });

  describe('rateLimitMiddleware', () => {
    describe('when not rate limited', () => {
      beforeEach(() => {
        mockRateLimiter.isRateLimited.mockResolvedValue(false);
        mockRateLimiter.acquire.mockResolvedValue(undefined);
      });

      it('should check rate limit for service', async () => {
        const middleware = rateLimitMiddleware({ service: 'test-service' });

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRateLimiter.isRateLimited).toHaveBeenCalledWith('test-service');
      });

      it('should use default service name "internal"', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRateLimiter.isRateLimited).toHaveBeenCalledWith('internal');
      });

      it('should acquire rate limit when not limited', async () => {
        const middleware = rateLimitMiddleware({ service: 'api' });

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRateLimiter.acquire).toHaveBeenCalledWith('api');
      });

      it('should register finish handler to release rate limit', async () => {
        const middleware = rateLimitMiddleware({ service: 'api' });

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.raw!.on).toHaveBeenCalledWith('finish', expect.any(Function));
      });

      it('should release rate limit on finish', async () => {
        const middleware = rateLimitMiddleware({ service: 'api' });

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        finishHandler();

        expect(mockRateLimiter.release).toHaveBeenCalledWith('api');
      });

      it('should not return 429 response', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.code).not.toHaveBeenCalledWith(429);
      });
    });

    describe('when rate limited', () => {
      beforeEach(() => {
        mockRateLimiter.isRateLimited.mockResolvedValue(true);
        mockRateLimiter.getWaitTime.mockResolvedValue(5000);
      });

      it('should return 429 status code', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.code).toHaveBeenCalledWith(429);
      });

      it('should return error response with default message', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Rate limit exceeded',
          message: 'Too many requests, please try again later.',
          retryAfter: 5,
        });
      });

      it('should return custom message when provided', async () => {
        const middleware = rateLimitMiddleware({
          message: 'Custom rate limit message',
        });

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.send).toHaveBeenCalledWith({
          error: 'Rate limit exceeded',
          message: 'Custom rate limit message',
          retryAfter: 5,
        });
      });

      it('should set X-RateLimit-Limit header', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
      });

      it('should set X-RateLimit-Remaining header', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
      });

      it('should set X-RateLimit-Reset header', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.header).toHaveBeenCalledWith(
          'X-RateLimit-Reset',
          expect.any(String)
        );
      });

      it('should set Retry-After header in seconds', async () => {
        mockRateLimiter.getWaitTime.mockResolvedValue(10000);
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.header).toHaveBeenCalledWith('Retry-After', '10');
      });

      it('should log warning when rate limited', async () => {
        const middleware = rateLimitMiddleware({ service: 'test-api' });

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(logger.warn).toHaveBeenCalledWith(
          'Rate limit exceeded for test-api',
          {
            ip: '127.0.0.1',
            path: '/api/queues',
          }
        );
      });

      it('should not acquire rate limit when already limited', async () => {
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockRateLimiter.acquire).not.toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should allow request when isRateLimited throws', async () => {
        mockRateLimiter.isRateLimited.mockRejectedValue(new Error('Redis error'));
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.code).not.toHaveBeenCalledWith(429);
        expect(logger.error).toHaveBeenCalledWith(
          'Rate limit middleware error:',
          expect.any(Error)
        );
      });

      it('should allow request when acquire throws', async () => {
        mockRateLimiter.isRateLimited.mockResolvedValue(false);
        mockRateLimiter.acquire.mockRejectedValue(new Error('Acquire failed'));
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockReply.code).not.toHaveBeenCalledWith(429);
        expect(logger.error).toHaveBeenCalled();
      });

      it('should log error details', async () => {
        const testError = new Error('Connection timeout');
        mockRateLimiter.isRateLimited.mockRejectedValue(testError);
        const middleware = rateLimitMiddleware();

        await middleware(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(logger.error).toHaveBeenCalledWith(
          'Rate limit middleware error:',
          testError
        );
      });
    });
  });

  describe('globalRateLimit', () => {
    beforeEach(() => {
      mockRateLimiter.isRateLimited.mockResolvedValue(false);
      mockRateLimiter.acquire.mockResolvedValue(undefined);
    });

    it('should be a function', () => {
      expect(typeof globalRateLimit).toBe('function');
    });

    it('should use "internal" service', async () => {
      await globalRateLimit(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockRateLimiter.isRateLimited).toHaveBeenCalledWith('internal');
    });

    it('should use custom API message when rate limited', async () => {
      mockRateLimiter.isRateLimited.mockResolvedValue(true);
      mockRateLimiter.getWaitTime.mockResolvedValue(1000);

      await globalRateLimit(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'API rate limit exceeded. Please slow down your requests.',
        })
      );
    });
  });
});
