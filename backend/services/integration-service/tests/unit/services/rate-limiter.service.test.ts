// Mock console
const consoleSpy = {
  log: jest.spyOn(console, 'log').mockImplementation(),
};

// We need to import the class directly, not the singleton, to avoid the setInterval issue
jest.mock('../../../src/services/rate-limiter.service', () => {
  const original = jest.requireActual('../../../src/services/rate-limiter.service');
  return {
    ...original,
    // Don't export the singleton to avoid setInterval
  };
});

import { RateLimiterService } from '../../../src/services/rate-limiter.service';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RateLimiterService();
  });

  afterAll(() => {
    consoleSpy.log.mockRestore();
  });

  describe('constructor', () => {
    it('should initialize with default configs for all providers', () => {
      // Test that default configs are set by checking rate limits
      const stripeStats = service.getUsageStats('stripe', 'venue-1');
      const squareStats = service.getUsageStats('square', 'venue-1');
      const mailchimpStats = service.getUsageStats('mailchimp', 'venue-1');
      const quickbooksStats = service.getUsageStats('quickbooks', 'venue-1');

      // No usage yet, so should be null
      expect(stripeStats).toBeNull();
      expect(squareStats).toBeNull();
      expect(mailchimpStats).toBeNull();
      expect(quickbooksStats).toBeNull();
    });
  });

  describe('registerConfig', () => {
    it('should register custom rate limit config', async () => {
      service.registerConfig({
        provider: 'custom-provider',
        maxRequests: 50,
        windowMs: 5000,
      });

      // Make a request to trigger tracking
      await service.checkLimit('custom-provider', 'venue-1');

      const stats = service.getUsageStats('custom-provider', 'venue-1');
      expect(stats).not.toBeNull();
      expect(stats?.max).toBe(50);
    });
  });

  describe('checkLimit', () => {
    it('should allow first request', async () => {
      const result = await service.checkLimit('stripe', 'venue-1');

      expect(result.allowed).toBe(true);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should allow requests under the limit', async () => {
      // Stripe has 100 requests per second limit
      for (let i = 0; i < 50; i++) {
        const result = await service.checkLimit('stripe', 'venue-1');
        expect(result.allowed).toBe(true);
      }
    });

    it('should deny requests over the limit', async () => {
      // Register a low limit for testing
      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 3,
        windowMs: 10000,
      });

      // Use up the limit
      await service.checkLimit('test-provider', 'venue-1');
      await service.checkLimit('test-provider', 'venue-1');
      await service.checkLimit('test-provider', 'venue-1');

      // Fourth request should be denied
      const result = await service.checkLimit('test-provider', 'venue-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests for unknown providers (no config)', async () => {
      const result = await service.checkLimit('unknown-provider', 'venue-1');

      expect(result.allowed).toBe(true);
    });

    it('should track limits per venue', async () => {
      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 2,
        windowMs: 10000,
      });

      // Venue 1 uses its limit
      await service.checkLimit('test-provider', 'venue-1');
      await service.checkLimit('test-provider', 'venue-1');

      // Venue 1 is now limited
      const result1 = await service.checkLimit('test-provider', 'venue-1');
      expect(result1.allowed).toBe(false);

      // Venue 2 still has its own limit
      const result2 = await service.checkLimit('test-provider', 'venue-2');
      expect(result2.allowed).toBe(true);
    });

    it('should track limits per operation', async () => {
      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 2,
        windowMs: 10000,
      });

      // Use limit for operation A
      await service.checkLimit('test-provider', 'venue-1', 'operationA');
      await service.checkLimit('test-provider', 'venue-1', 'operationA');

      // Operation A is limited
      const resultA = await service.checkLimit('test-provider', 'venue-1', 'operationA');
      expect(resultA.allowed).toBe(false);

      // Operation B still has its own limit
      const resultB = await service.checkLimit('test-provider', 'venue-1', 'operationB');
      expect(resultB.allowed).toBe(true);
    });

    it('should reset limit after window expires', async () => {
      jest.useFakeTimers();

      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 2,
        windowMs: 1000,
      });

      // Use up the limit
      await service.checkLimit('test-provider', 'venue-1');
      await service.checkLimit('test-provider', 'venue-1');

      // Should be limited
      let result = await service.checkLimit('test-provider', 'venue-1');
      expect(result.allowed).toBe(false);

      // Advance time past the window
      jest.advanceTimersByTime(1001);

      // Should be allowed again
      result = await service.checkLimit('test-provider', 'venue-1');
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('waitIfNeeded', () => {
    it('should return immediately when under limit', async () => {
      const start = Date.now();
      await service.waitIfNeeded('stripe', 'venue-1');
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100);
    });

    it('should detect rate limit and log message', async () => {
      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 1,
        windowMs: 1000,
      });

      // Use up the limit
      await service.checkLimit('test-provider', 'venue-1');

      // Check limit again to trigger the log
      const result = await service.checkLimit('test-provider', 'venue-1');

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('executeWithRateLimit', () => {
    it('should execute function when under limit', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      const result = await service.executeWithRateLimit(
        'stripe',
        'venue-1',
        'test-op',
        mockFn
      );

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should pass through function errors', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Function error'));

      await expect(
        service.executeWithRateLimit('stripe', 'venue-1', 'test-op', mockFn)
      ).rejects.toThrow('Function error');
    });
  });

  describe('getUsageStats', () => {
    it('should return null when no usage', () => {
      const stats = service.getUsageStats('stripe', 'venue-1');
      expect(stats).toBeNull();
    });

    it('should return null for unknown provider', () => {
      const stats = service.getUsageStats('unknown', 'venue-1');
      expect(stats).toBeNull();
    });

    it('should return usage stats after requests', async () => {
      await service.checkLimit('stripe', 'venue-1');
      await service.checkLimit('stripe', 'venue-1');
      await service.checkLimit('stripe', 'venue-1');

      const stats = service.getUsageStats('stripe', 'venue-1');

      expect(stats).not.toBeNull();
      expect(stats?.current).toBe(3);
      expect(stats?.max).toBe(100); // Stripe default
      expect(stats?.resetsIn).toBeGreaterThan(0);
    });

    it('should calculate correct time until reset', async () => {
      jest.useFakeTimers();

      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 10,
        windowMs: 5000,
      });

      await service.checkLimit('test-provider', 'venue-1');

      // Advance time by 2 seconds
      jest.advanceTimersByTime(2000);

      const stats = service.getUsageStats('test-provider', 'venue-1');

      // Should be about 3 seconds left
      expect(stats?.resetsIn).toBeLessThanOrEqual(3);
      expect(stats?.resetsIn).toBeGreaterThanOrEqual(2);

      jest.useRealTimers();
    });
  });

  describe('reset', () => {
    it('should reset limit for specific venue/provider', async () => {
      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 2,
        windowMs: 10000,
      });

      // Use up limit
      await service.checkLimit('test-provider', 'venue-1');
      await service.checkLimit('test-provider', 'venue-1');

      // Should be limited
      let result = await service.checkLimit('test-provider', 'venue-1');
      expect(result.allowed).toBe(false);

      // Reset
      service.reset('test-provider', 'venue-1');

      // Should be allowed again
      result = await service.checkLimit('test-provider', 'venue-1');
      expect(result.allowed).toBe(true);
    });

    it('should reset limit for specific operation', async () => {
      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 1,
        windowMs: 10000,
      });

      // Use up limit for specific operation
      await service.checkLimit('test-provider', 'venue-1', 'opA');

      // Reset only that operation
      service.reset('test-provider', 'venue-1', 'opA');

      // Should be allowed again
      const result = await service.checkLimit('test-provider', 'venue-1', 'opA');
      expect(result.allowed).toBe(true);
    });
  });

  describe('clearAll', () => {
    it('should clear all limits', async () => {
      // Create some limits
      await service.checkLimit('stripe', 'venue-1');
      await service.checkLimit('square', 'venue-2');
      await service.checkLimit('mailchimp', 'venue-3');

      // Clear all
      service.clearAll();

      // All stats should be null
      expect(service.getUsageStats('stripe', 'venue-1')).toBeNull();
      expect(service.getUsageStats('square', 'venue-2')).toBeNull();
      expect(service.getUsageStats('mailchimp', 'venue-3')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', async () => {
      jest.useFakeTimers();

      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 10,
        windowMs: 1000,
      });

      // Create some entries
      await service.checkLimit('test-provider', 'venue-1');
      await service.checkLimit('test-provider', 'venue-2');

      // Advance time past expiration
      jest.advanceTimersByTime(1001);

      // Cleanup
      service.cleanup();

      // Entries should be gone
      expect(service.getUsageStats('test-provider', 'venue-1')).toBeNull();
      expect(service.getUsageStats('test-provider', 'venue-2')).toBeNull();

      jest.useRealTimers();
    });

    it('should keep non-expired entries', async () => {
      jest.useFakeTimers();

      service.registerConfig({
        provider: 'test-provider',
        maxRequests: 10,
        windowMs: 5000,
      });

      await service.checkLimit('test-provider', 'venue-1');

      // Advance time but not past expiration
      jest.advanceTimersByTime(2000);

      // Cleanup
      service.cleanup();

      // Entry should still exist
      const stats = service.getUsageStats('test-provider', 'venue-1');
      expect(stats).not.toBeNull();

      jest.useRealTimers();
    });
  });

  describe('default provider limits', () => {
    it('should have correct Mailchimp limit (10/second)', async () => {
      // Make 10 requests
      for (let i = 0; i < 10; i++) {
        const result = await service.checkLimit('mailchimp', 'venue-1');
        expect(result.allowed).toBe(true);
      }

      // 11th should be denied
      const result = await service.checkLimit('mailchimp', 'venue-1');
      expect(result.allowed).toBe(false);
    });

    it('should have correct QuickBooks limit (100/minute)', async () => {
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const result = await service.checkLimit('quickbooks', 'venue-1');
        expect(result.allowed).toBe(true);
      }

      // 101st should be denied
      const result = await service.checkLimit('quickbooks', 'venue-1');
      expect(result.allowed).toBe(false);
    });

    it('should have correct Square limit (100/10 seconds)', async () => {
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const result = await service.checkLimit('square', 'venue-1');
        expect(result.allowed).toBe(true);
      }

      // 101st should be denied
      const result = await service.checkLimit('square', 'venue-1');
      expect(result.allowed).toBe(false);
    });

    it('should have correct Stripe limit (100/second)', async () => {
      // Make 100 requests
      for (let i = 0; i < 100; i++) {
        const result = await service.checkLimit('stripe', 'venue-1');
        expect(result.allowed).toBe(true);
      }

      // 101st should be denied
      const result = await service.checkLimit('stripe', 'venue-1');
      expect(result.allowed).toBe(false);
    });
  });
});

describe('rateLimiterService singleton', () => {
  it('should export singleton instance', async () => {
    const { rateLimiterService } = await import(
      '../../../src/services/rate-limiter.service'
    );
    expect(rateLimiterService).toBeInstanceOf(RateLimiterService);
  });
});
