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
const mockGetStatus = jest.fn();
const mockIsRateLimited = jest.fn();
const mockGetWaitTime = jest.fn();
const mockReset = jest.fn();
const mockEmergencyStop = jest.fn();
const mockResume = jest.fn();

jest.mock('../../../src/services/rate-limiter.service', () => ({
  RateLimiterService: {
    getInstance: jest.fn(() => ({
      getStatus: mockGetStatus,
      isRateLimited: mockIsRateLimited,
      getWaitTime: mockGetWaitTime,
      reset: mockReset,
      emergencyStop: mockEmergencyStop,
      resume: mockResume,
    })),
  },
}));

// Mock cache integration
jest.mock('../../../src/services/cache-integration', () => ({
  serviceCache: {},
}));

import { FastifyRequest, FastifyReply } from 'fastify';
import { RateLimitController } from '../../../src/controllers/rate-limit.controller';
import { logger } from '../../../src/utils/logger';
import { AuthRequest } from '../../../src/middleware/auth.middleware';

describe('RateLimitController', () => {
  let controller: RateLimitController;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    controller = new RateLimitController();

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };

    // Reset all mocks
    mockGetStatus.mockReset();
    mockIsRateLimited.mockReset();
    mockGetWaitTime.mockReset();
    mockReset.mockReset();
    mockEmergencyStop.mockReset();
    mockResume.mockReset();
  });

  describe('getStatus', () => {
    it('should return rate limiter status', async () => {
      const status = {
        stripe: { remaining: 80, limit: 100, resetAt: Date.now() + 60000 },
        solana: { remaining: 45, limit: 50, resetAt: Date.now() + 30000 },
        email: { remaining: 900, limit: 1000, resetAt: Date.now() + 3600000 },
        paused: false,
      };

      mockGetStatus.mockReturnValue(status);

      const mockRequest = {} as FastifyRequest;

      await controller.getStatus(mockRequest, mockReply as FastifyReply);

      expect(mockGetStatus).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith(status);
    });

    it('should return empty status object', async () => {
      mockGetStatus.mockReturnValue({});

      const mockRequest = {} as FastifyRequest;

      await controller.getStatus(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({});
    });

    it('should return status with paused flag', async () => {
      const status = {
        paused: true,
        pausedAt: Date.now(),
        pausedBy: 'admin-user',
      };

      mockGetStatus.mockReturnValue(status);

      const mockRequest = {} as FastifyRequest;

      await controller.getStatus(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(status);
    });

    it('should return 500 when getStatus throws', async () => {
      mockGetStatus.mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const mockRequest = {} as FastifyRequest;

      await controller.getStatus(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to get rate limit status' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get rate limit status:',
        expect.any(Error)
      );
    });
  });

  describe('checkLimit', () => {
    it('should return not rate limited status', async () => {
      mockIsRateLimited.mockResolvedValue(false);
      mockGetWaitTime.mockResolvedValue(0);

      const mockRequest = {
        params: { service: 'stripe' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockIsRateLimited).toHaveBeenCalledWith('stripe');
      expect(mockGetWaitTime).toHaveBeenCalledWith('stripe');
      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'stripe',
        rateLimited: false,
        waitTimeMs: 0,
        waitTimeSeconds: 0,
      });
    });

    it('should return rate limited status with wait time', async () => {
      mockIsRateLimited.mockResolvedValue(true);
      mockGetWaitTime.mockResolvedValue(5500); // 5.5 seconds

      const mockRequest = {
        params: { service: 'solana' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockIsRateLimited).toHaveBeenCalledWith('solana');
      expect(mockGetWaitTime).toHaveBeenCalledWith('solana');
      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'solana',
        rateLimited: true,
        waitTimeMs: 5500,
        waitTimeSeconds: 6, // Math.ceil(5500 / 1000)
      });
    });

    it('should ceil wait time seconds correctly', async () => {
      mockIsRateLimited.mockResolvedValue(true);
      mockGetWaitTime.mockResolvedValue(1); // 1 ms

      const mockRequest = {
        params: { service: 'email' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'email',
        rateLimited: true,
        waitTimeMs: 1,
        waitTimeSeconds: 1, // Math.ceil(1 / 1000) = 1
      });
    });

    it('should handle zero wait time', async () => {
      mockIsRateLimited.mockResolvedValue(false);
      mockGetWaitTime.mockResolvedValue(0);

      const mockRequest = {
        params: { service: 'stripe' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'stripe',
        rateLimited: false,
        waitTimeMs: 0,
        waitTimeSeconds: 0,
      });
    });

    it('should handle large wait times', async () => {
      mockIsRateLimited.mockResolvedValue(true);
      mockGetWaitTime.mockResolvedValue(3600000); // 1 hour

      const mockRequest = {
        params: { service: 'solana' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'solana',
        rateLimited: true,
        waitTimeMs: 3600000,
        waitTimeSeconds: 3600,
      });
    });

    it('should check various services', async () => {
      const services = ['stripe', 'solana', 'email', 'sendgrid', 'twilio'];

      for (const service of services) {
        mockIsRateLimited.mockResolvedValue(false);
        mockGetWaitTime.mockResolvedValue(0);

        const mockRequest = {
          params: { service },
        } as unknown as FastifyRequest;

        await controller.checkLimit(mockRequest, mockReply as FastifyReply);

        expect(mockIsRateLimited).toHaveBeenLastCalledWith(service);
        expect(mockGetWaitTime).toHaveBeenLastCalledWith(service);
      }
    });

    it('should return 500 when isRateLimited throws', async () => {
      mockIsRateLimited.mockRejectedValue(new Error('Redis error'));

      const mockRequest = {
        params: { service: 'stripe' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to check rate limit' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to check rate limit:',
        expect.any(Error)
      );
    });

    it('should return 500 when getWaitTime throws', async () => {
      mockIsRateLimited.mockResolvedValue(true);
      mockGetWaitTime.mockRejectedValue(new Error('Service error'));

      const mockRequest = {
        params: { service: 'stripe' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to check rate limit' });
    });
  });

  describe('resetLimit', () => {
    it('should reset rate limit for service', async () => {
      const mockRequest = {
        params: { service: 'stripe' },
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.resetLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReset).toHaveBeenCalledWith('stripe');
      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'stripe',
        status: 'reset',
        message: 'Rate limiter for stripe has been reset',
      });
    });

    it('should log warning when rate limit is reset', async () => {
      const mockRequest = {
        params: { service: 'solana' },
        user: { userId: 'ops-user' },
      } as unknown as AuthRequest;

      await controller.resetLimit(mockRequest, mockReply as FastifyReply);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should handle missing user gracefully', async () => {
      const mockRequest = {
        params: { service: 'email' },
        user: undefined,
      } as unknown as AuthRequest;

      await controller.resetLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReset).toHaveBeenCalledWith('email');
      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'email',
        status: 'reset',
        message: 'Rate limiter for email has been reset',
      });
    });

    it('should reset various services', async () => {
      const services = ['stripe', 'solana', 'email', 'sendgrid'];

      for (const service of services) {
        const mockRequest = {
          params: { service },
          user: { userId: 'admin' },
        } as unknown as AuthRequest;

        await controller.resetLimit(mockRequest, mockReply as FastifyReply);

        expect(mockReset).toHaveBeenLastCalledWith(service);
        expect(mockReply.send).toHaveBeenLastCalledWith({
          service,
          status: 'reset',
          message: `Rate limiter for ${service} has been reset`,
        });
      }
    });

    it('should return 500 when reset throws', async () => {
      mockReset.mockImplementation(() => {
        throw new Error('Reset failed');
      });

      const mockRequest = {
        params: { service: 'stripe' },
        user: { userId: 'admin' },
      } as unknown as AuthRequest;

      await controller.resetLimit(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to reset rate limit' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to reset rate limit:',
        expect.any(Error)
      );
    });
  });

  describe('emergencyStop', () => {
    it('should stop all rate limiters', async () => {
      const mockRequest = {
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.emergencyStop(mockRequest, mockReply as FastifyReply);

      expect(mockEmergencyStop).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'stopped',
        message: 'All rate limiters have been paused',
      });
    });

    it('should log error level when emergency stop is activated', async () => {
      const mockRequest = {
        user: { userId: 'emergency-user' },
      } as unknown as AuthRequest;

      await controller.emergencyStop(mockRequest, mockReply as FastifyReply);

      // The source uses template literal syntax (error`...`)
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle missing user gracefully', async () => {
      const mockRequest = {
        user: undefined,
      } as unknown as AuthRequest;

      await controller.emergencyStop(mockRequest, mockReply as FastifyReply);

      expect(mockEmergencyStop).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'stopped',
        message: 'All rate limiters have been paused',
      });
    });

    it('should return 500 when emergencyStop throws', async () => {
      mockEmergencyStop.mockImplementation(() => {
        throw new Error('Emergency stop failed');
      });

      const mockRequest = {
        user: { userId: 'admin' },
      } as unknown as AuthRequest;

      await controller.emergencyStop(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to emergency stop' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to emergency stop:',
        expect.any(Error)
      );
    });
  });

  describe('resume', () => {
    it('should resume all rate limiters', async () => {
      const mockRequest = {
        user: { userId: 'admin-123' },
      } as unknown as AuthRequest;

      await controller.resume(mockRequest, mockReply as FastifyReply);

      expect(mockResume).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'resumed',
        message: 'All rate limiters have been resumed',
      });
    });

    it('should log info when rate limiters are resumed', async () => {
      const mockRequest = {
        user: { userId: 'ops-user' },
      } as unknown as AuthRequest;

      await controller.resume(mockRequest, mockReply as FastifyReply);

      expect(logger.info).toHaveBeenCalled();
    });

    it('should handle missing user gracefully', async () => {
      const mockRequest = {
        user: undefined,
      } as unknown as AuthRequest;

      await controller.resume(mockRequest, mockReply as FastifyReply);

      expect(mockResume).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'resumed',
        message: 'All rate limiters have been resumed',
      });
    });

    it('should return 500 when resume throws', async () => {
      mockResume.mockImplementation(() => {
        throw new Error('Resume failed');
      });

      const mockRequest = {
        user: { userId: 'admin' },
      } as unknown as AuthRequest;

      await controller.resume(mockRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to resume rate limiters' });
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to resume rate limiters:',
        expect.any(Error)
      );
    });
  });

  describe('workflow scenarios', () => {
    it('should support emergency stop and resume cycle', async () => {
      // Emergency stop
      const stopRequest = {
        user: { userId: 'admin' },
      } as unknown as AuthRequest;

      await controller.emergencyStop(stopRequest, mockReply as FastifyReply);
      expect(mockEmergencyStop).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        status: 'stopped',
        message: 'All rate limiters have been paused',
      });

      // Resume
      const resumeRequest = {
        user: { userId: 'admin' },
      } as unknown as AuthRequest;

      await controller.resume(resumeRequest, mockReply as FastifyReply);
      expect(mockResume).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenLastCalledWith({
        status: 'resumed',
        message: 'All rate limiters have been resumed',
      });
    });

    it('should support check, reset, and recheck cycle', async () => {
      // First check - rate limited
      mockIsRateLimited.mockResolvedValueOnce(true);
      mockGetWaitTime.mockResolvedValueOnce(30000);

      const checkRequest1 = {
        params: { service: 'stripe' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(checkRequest1, mockReply as FastifyReply);
      expect(mockReply.send).toHaveBeenCalledWith({
        service: 'stripe',
        rateLimited: true,
        waitTimeMs: 30000,
        waitTimeSeconds: 30,
      });

      // Reset
      const resetRequest = {
        params: { service: 'stripe' },
        user: { userId: 'admin' },
      } as unknown as AuthRequest;

      await controller.resetLimit(resetRequest, mockReply as FastifyReply);
      expect(mockReset).toHaveBeenCalledWith('stripe');

      // Second check - not rate limited
      mockIsRateLimited.mockResolvedValueOnce(false);
      mockGetWaitTime.mockResolvedValueOnce(0);

      const checkRequest2 = {
        params: { service: 'stripe' },
      } as unknown as FastifyRequest;

      await controller.checkLimit(checkRequest2, mockReply as FastifyReply);
      expect(mockReply.send).toHaveBeenLastCalledWith({
        service: 'stripe',
        rateLimited: false,
        waitTimeMs: 0,
        waitTimeSeconds: 0,
      });
    });
  });
});
