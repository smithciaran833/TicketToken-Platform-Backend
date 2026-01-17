// Mock dependencies before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../../src/config/database.config', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../../src/utils/token-bucket', () => ({
  TokenBucket: jest.fn().mockImplementation(() => ({
    tryConsume: jest.fn().mockReturnValue(true),
  })),
}));

jest.mock('../../../src/config/rate-limits.config', () => ({
  RATE_LIMITS: {
    stripe: {
      maxPerSecond: 10,
      maxConcurrent: 5,
      burstSize: 100,
    },
    solana: {
      maxPerSecond: 5,
      maxConcurrent: 3,
    },
  },
  RATE_LIMIT_GROUPS: {
    payment: ['stripe', 'checkout'],
  },
}));

import { RateLimiterService } from '../../../src/services/rate-limiter.service';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let mockPool: any;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    mockPool = {
      connect: jest.fn().mockResolvedValue(mockClient),
      query: jest.fn(),
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);

    // Reset singleton
    (RateLimiterService as any).instance = null;
  });

  afterEach(() => {
    if (service) {
      service.stop();
    }
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize as singleton', () => {
      const instance1 = RateLimiterService.getInstance();
      const instance2 = RateLimiterService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should initialize limiters for all services', () => {
      service = new RateLimiterService();

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiter initialized for stripe'),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiter initialized for solana'),
        expect.any(Object)
      );
    });

    it('should start metrics collection', () => {
      service = new RateLimiterService();
      expect(service).toBeDefined();
    });
  });

  describe('getStatus', () => {
    beforeEach(() => {
      service = new RateLimiterService();
    });

    it('should return status for all services', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            service_name: 'stripe',
            tokens_available: 50,
            concurrent_requests: 2,
            max_concurrent: 5,
            refill_rate: 10,
            bucket_size: 100,
            last_refill: new Date(Date.now() - 1000),
            updated_at: new Date(),
          },
          {
            service_name: 'solana',
            tokens_available: 20,
            concurrent_requests: 1,
            max_concurrent: 3,
            refill_rate: 5,
            bucket_size: 50,
            last_refill: new Date(Date.now() - 2000),
            updated_at: new Date(),
          },
        ],
      });

      const status = await service.getStatus();

      expect(status).toHaveProperty('stripe');
      expect(status).toHaveProperty('solana');
      expect(status.stripe).toHaveProperty('tokensAvailable');
      expect(status.stripe).toHaveProperty('concurrent');
      expect(status.stripe).toHaveProperty('maxConcurrent');
      expect(status.stripe).toHaveProperty('refillRate');
    });

    it('should calculate current tokens with refill', async () => {
      const twoSecondsAgo = new Date(Date.now() - 2000);
      mockPool.query.mockResolvedValue({
        rows: [
          {
            service_name: 'stripe',
            tokens_available: 50,
            concurrent_requests: 2,
            max_concurrent: 5,
            refill_rate: 10, // 10 per second
            bucket_size: 100,
            last_refill: twoSecondsAgo,
            updated_at: new Date(),
          },
        ],
      });

      const status = await service.getStatus();

      // Should be: 50 + (2 seconds * 10 tokens/sec) = 70
      expect(status.stripe.tokensAvailable).toBeGreaterThan(50);
      expect(status.stripe.tokensAvailable).toBeLessThanOrEqual(100); // Capped at bucket size
    });

    it('should return empty object if no limiters', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const status = await service.getStatus();

      expect(status).toEqual({});
    });
  });

  describe('isRateLimited', () => {
    beforeEach(() => {
      service = new RateLimiterService();
    });

    it('should return false when rate limit available', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            tokens_available: 10,
            concurrent_requests: 2,
            max_concurrent: 5,
          },
        ],
      });

      const result = await service.isRateLimited('stripe');

      expect(result).toBe(false);
    });

    it('should return false if limiter not configured', async () => {
      const result = await service.isRateLimited('unknown');

      expect(result).toBe(false);
    });

    it('should return false if no rows returned', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await service.isRateLimited('stripe');

      expect(result).toBe(false);
    });
  });

  describe('getWaitTime', () => {
    beforeEach(() => {
      service = new RateLimiterService();
    });

    it('should return 0 if tokens available', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            tokens_available: 5,
            refill_rate: 10,
          },
        ],
      });

      const waitTime = await service.getWaitTime('stripe');

      expect(waitTime).toBe(0);
    });

    it('should return 0 if limiter not configured', async () => {
      const waitTime = await service.getWaitTime('unknown');

      expect(waitTime).toBe(0);
    });

    it('should return 0 if no rows returned', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const waitTime = await service.getWaitTime('stripe');

      expect(waitTime).toBe(0);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      service = new RateLimiterService();
    });

    it('should reset rate limiter successfully', async () => {
      mockPool.query.mockResolvedValue(undefined);

      await service.reset('stripe');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rate_limiters'),
        ['stripe']
      );
      expect(logger.info).toHaveBeenCalledWith('Rate limiter reset for stripe');
    });

    it('should handle reset errors', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));

      await service.reset('stripe');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to reset rate limiter for stripe:',
        expect.any(Error)
      );
    });

    it('should not fail if limiter not configured', async () => {
      await service.reset('unknown');

      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  describe('emergencyStop', () => {
    beforeEach(() => {
      service = new RateLimiterService();
    });

    it('should pause all rate limiters', async () => {
      mockPool.query.mockResolvedValue(undefined);

      await service.emergencyStop();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rate_limiters')
      );
      expect(logger.warn).toHaveBeenCalledWith('Emergency stop: All rate limiters paused');
    });

    it('should handle emergency stop errors', async () => {
      mockPool.query.mockRejectedValue(new Error('DB error'));

      await service.emergencyStop();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to execute emergency stop:',
        expect.any(Error)
      );
    });
  });

  describe('resume', () => {
    beforeEach(() => {
      service = new RateLimiterService();
    });

    it('should resume all rate limiters', async () => {
      mockPool.query.mockResolvedValue(undefined);

      await service.resume();

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rate_limiters'),
        expect.arrayContaining([5, 'stripe'])
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE rate_limiters'),
        expect.arrayContaining([3, 'solana'])
      );
      expect(logger.info).toHaveBeenCalledWith('All rate limiters resumed');
    });

    it('should handle resume errors gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce(undefined) // First service succeeds
        .mockRejectedValueOnce(new Error('DB error')); // Second service fails

      await service.resume();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to resume rate limiter'),
        expect.any(Error)
      );
      expect(logger.info).toHaveBeenCalledWith('All rate limiters resumed');
    });
  });

  describe('stop', () => {
    it('should clear metrics interval', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      service = new RateLimiterService();

      service.stop();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it('should handle stop when no interval set', () => {
      service = new RateLimiterService();
      (service as any).metricsInterval = null;

      expect(() => service.stop()).not.toThrow();
    });
  });
});
