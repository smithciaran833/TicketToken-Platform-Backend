import { TimeoutService, TimeoutController } from '../../../src/services/timeout.service';
import { FastifyRequest } from 'fastify';

jest.mock('../../../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

jest.mock('../../../src/config', () => ({
  config: {
    timeouts: {
      default: 30000,
      payment: 60000,
      nftMinting: 120000,
    },
  },
  timeoutConfig: {
    services: {
      'auth-service': {
        default: 5000,
        endpoints: {
          'POST /auth/login': 10000,
          'POST /auth/register': 15000,
        },
      },
      'venue-service': {
        default: 8000,
        endpoints: {
          'GET /venues/:id': 3000,
          'POST /venues': 12000,
        },
      },
      'ticket-service': {
        default: 10000,
        endpoints: {
          'POST /tickets/purchase': 25000,
        },
      },
    },
  },
}));

describe('TimeoutService', () => {
  let timeoutService: TimeoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    timeoutService = new TimeoutService();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('executeWithTimeout', () => {
    it('returns result when operation completes within timeout', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const promise = timeoutService.executeWithTimeout(mockFn, 5000);
      
      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('rejects with timeout error when operation exceeds timeout', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve('too-late'), 10000);
        });
      });

      const promise = timeoutService.executeWithTimeout(mockFn, 5000);

      // Advance time past the timeout
      jest.advanceTimersByTime(5000);

      await expect(promise).rejects.toThrow('Operation timed out after 5000ms');
    });

    it('uses the provided timeout value', async () => {
      const mockFn = jest.fn().mockImplementation(() => {
        return new Promise(resolve => {
          setTimeout(() => resolve('result'), 8000);
        });
      });

      const promise = timeoutService.executeWithTimeout(mockFn, 10000);

      // Should not timeout at 5000ms
      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Should not timeout at 8000ms
      jest.advanceTimersByTime(3000);
      await Promise.resolve();

      // Resolve the promise
      jest.advanceTimersByTime(100);
      const result = await promise;

      expect(result).toBe('result');
    });

    it('rejects immediately if function throws synchronously', async () => {
      const error = new Error('Sync error');
      const mockFn = jest.fn().mockRejectedValue(error);

      await expect(
        timeoutService.executeWithTimeout(mockFn, 5000)
      ).rejects.toThrow('Sync error');
    });
  });

  describe('calculateTimeout', () => {
    const createMockRequest = (
      method: string,
      url: string,
      routeUrl?: string
    ): FastifyRequest => {
      return {
        method,
        url,
        routeOptions: routeUrl ? { url: routeUrl } as any : undefined,
      } as FastifyRequest;
    };

    it('returns endpoint-specific timeout when exact match exists', () => {
      const mockRequest = createMockRequest('POST', '/auth/login', '/auth/login');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'auth-service');

      expect(timeout).toBe(10000);
    });

    it('returns service default timeout when no endpoint match', () => {
      const mockRequest = createMockRequest('GET', '/auth/profile', '/auth/profile');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'auth-service');

      expect(timeout).toBe(5000);
    });

    it('returns different endpoint timeout for different endpoints', () => {
      const mockRequest = createMockRequest('POST', '/auth/register', '/auth/register');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'auth-service');

      expect(timeout).toBe(15000);
    });

    it('returns payment timeout for payment URLs', () => {
      const mockRequest = createMockRequest('POST', '/payment/process');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'unknown-service');

      expect(timeout).toBe(60000);
    });

    it('returns payment timeout for checkout URLs', () => {
      const mockRequest = createMockRequest('POST', '/checkout/complete');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'unknown-service');

      expect(timeout).toBe(60000);
    });

    it('returns NFT minting timeout for nft URLs', () => {
      const mockRequest = createMockRequest('POST', '/nft/create');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'unknown-service');

      expect(timeout).toBe(120000);
    });

    it('returns NFT minting timeout for mint URLs', () => {
      const mockRequest = createMockRequest('POST', '/tickets/mint');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'unknown-service');

      expect(timeout).toBe(120000);
    });

    it('returns default timeout for unknown service and URL', () => {
      const mockRequest = createMockRequest('GET', '/some/random/path', '/some/random/path');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'unknown-service');

      expect(timeout).toBe(30000);
    });

    it('uses request.url when routeOptions.url is not available', () => {
      const mockRequest = createMockRequest('POST', '/auth/login');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'auth-service');

      // Should still match the endpoint
      expect(timeout).toBe(10000);
    });

    it('prioritizes endpoint match over URL pattern match', () => {
      const mockRequest = createMockRequest('POST', '/payment/tickets', '/tickets/purchase');

      const timeout = timeoutService.calculateTimeout(mockRequest, 'ticket-service');

      // Should use ticket-service endpoint config (25000), not payment URL pattern (60000)
      expect(timeout).toBe(25000);
    });
  });

  describe('createTimeoutController', () => {
    it('creates a TimeoutController instance', () => {
      const controller = timeoutService.createTimeoutController(10000);

      expect(controller).toBeInstanceOf(TimeoutController);
    });

    it('creates controller with specified timeout', () => {
      const controller = timeoutService.createTimeoutController(5000);

      expect(controller.getStats().totalTimeout).toBe(5000);
    });
  });
});

describe('TimeoutController', () => {
  let controller: TimeoutController;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('initializes with total timeout', () => {
      controller = new TimeoutController(10000);

      expect(controller.getStats().totalTimeout).toBe(10000);
    });

    it('sets deadline correctly', () => {
      controller = new TimeoutController(10000);

      const stats = controller.getStats();
      expect(stats.deadline).toBe(new Date('2024-01-01T00:00:10.000Z').toISOString());
    });
  });

  describe('getRemaining', () => {
    it('returns full timeout at start', () => {
      controller = new TimeoutController(10000);

      expect(controller.getRemaining()).toBe(10000);
    });

    it('returns reduced timeout after time passes', () => {
      controller = new TimeoutController(10000);

      jest.advanceTimersByTime(3000);

      expect(controller.getRemaining()).toBe(7000);
    });

    it('returns 0 when deadline has passed', () => {
      controller = new TimeoutController(10000);

      jest.advanceTimersByTime(15000);

      expect(controller.getRemaining()).toBe(0);
    });

    it('never returns negative values', () => {
      controller = new TimeoutController(5000);

      jest.advanceTimersByTime(10000);

      expect(controller.getRemaining()).toBe(0);
    });
  });

  describe('allocate', () => {
    beforeEach(() => {
      controller = new TimeoutController(10000);
    });

    it('allocates percentage of remaining time', () => {
      const allocated = controller.allocate(0.5);

      expect(allocated).toBe(5000);
    });

    it('allocates correct amount after time passes', () => {
      jest.advanceTimersByTime(2000);

      const allocated = controller.allocate(0.5);

      expect(allocated).toBe(4000); // 50% of 8000 remaining
    });

    it('tracks consumed time', () => {
      controller.allocate(0.3);
      controller.allocate(0.2);

      const stats = controller.getStats();
      expect(stats.consumed).toBe(5000); // 3000 + 2000
    });

    it('allocates based on current remaining time', () => {
      controller.allocate(0.5); // Allocates 5000

      jest.advanceTimersByTime(3000);

      const allocated = controller.allocate(0.5); // 50% of 7000 remaining

      expect(allocated).toBe(3500);
    });

    it('returns 0 when deadline has passed', () => {
      jest.advanceTimersByTime(12000);

      const allocated = controller.allocate(0.5);

      expect(allocated).toBe(0);
    });

    it('floors allocated time to integer', () => {
      jest.advanceTimersByTime(1000);

      const allocated = controller.allocate(0.33); // 33% of 9000 = 2970

      expect(allocated).toBe(2970);
    });
  });

  describe('hasExpired', () => {
    beforeEach(() => {
      controller = new TimeoutController(10000);
    });

    it('returns false at start', () => {
      expect(controller.hasExpired()).toBe(false);
    });

    it('returns false before deadline', () => {
      jest.advanceTimersByTime(5000);

      expect(controller.hasExpired()).toBe(false);
    });

    it('returns true at deadline', () => {
      jest.advanceTimersByTime(10000);

      expect(controller.hasExpired()).toBe(true);
    });

    it('returns true after deadline', () => {
      jest.advanceTimersByTime(15000);

      expect(controller.hasExpired()).toBe(true);
    });
  });

  describe('getElapsed', () => {
    beforeEach(() => {
      controller = new TimeoutController(10000);
    });

    it('returns 0 at start', () => {
      expect(controller.getElapsed()).toBe(0);
    });

    it('returns elapsed time', () => {
      jest.advanceTimersByTime(3500);

      expect(controller.getElapsed()).toBe(3500);
    });

    it('continues counting after deadline', () => {
      jest.advanceTimersByTime(15000);

      expect(controller.getElapsed()).toBe(15000);
    });
  });

  describe('getStats', () => {
    beforeEach(() => {
      controller = new TimeoutController(10000);
    });

    it('returns complete stats object', () => {
      const stats = controller.getStats();

      expect(stats).toEqual({
        totalTimeout: 10000,
        elapsed: 0,
        remaining: 10000,
        consumed: 0,
        deadline: new Date('2024-01-01T00:00:10.000Z').toISOString(),
      });
    });

    it('returns updated stats after time passes', () => {
      jest.advanceTimersByTime(3000);

      const stats = controller.getStats();

      expect(stats).toEqual({
        totalTimeout: 10000,
        elapsed: 3000,
        remaining: 7000,
        consumed: 0,
        deadline: new Date('2024-01-01T00:00:10.000Z').toISOString(),
      });
    });

    it('includes consumed time in stats', () => {
      controller.allocate(0.3);
      controller.allocate(0.2);

      jest.advanceTimersByTime(2000);

      const stats = controller.getStats();

      expect(stats.consumed).toBe(5000);
      expect(stats.elapsed).toBe(2000);
      expect(stats.remaining).toBe(8000);
    });

    it('maintains correct deadline in stats', () => {
      jest.advanceTimersByTime(5000);

      const stats = controller.getStats();

      expect(stats.deadline).toBe(new Date('2024-01-01T00:00:10.000Z').toISOString());
    });
  });
});
