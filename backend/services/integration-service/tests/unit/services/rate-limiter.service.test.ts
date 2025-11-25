import { rateLimiterService } from '../../../src/services/rate-limiter.service';

describe('RateLimiterService', () => {
  beforeEach(() => {
    // Clear rate limit state before each test
    rateLimiterService.clearAll();
  });

  describe('checkLimit', () => {
    it('should allow requests within rate limit', async () => {
      const result = await rateLimiterService.checkLimit('mailchimp', 'venue-123');

      expect(result.allowed).toBe(true);
    });

    it('should block requests exceeding rate limit', async () => {
      const provider = 'mailchimp';
      const venueId = 'venue-123';

      // Make requests up to the limit (10 per second for Mailchimp)
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId);
      }

      // Next request should be blocked
      const result = await rateLimiterService.checkLimit(provider, venueId);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track different providers independently', async () => {
      const venueId = 'venue-123';

      const mailchimpResult = await rateLimiterService.checkLimit('mailchimp', venueId);
      const stripeResult = await rateLimiterService.checkLimit('stripe', venueId);

      expect(mailchimpResult.allowed).toBe(true);
      expect(stripeResult.allowed).toBe(true);
    });

    it('should track different venues independently', async () => {
      const provider = 'mailchimp';

      const venue1Result = await rateLimiterService.checkLimit(provider, 'venue-1');
      const venue2Result = await rateLimiterService.checkLimit(provider, 'venue-2');

      expect(venue1Result.allowed).toBe(true);
      expect(venue2Result.allowed).toBe(true);
    });

    it('should reset after time window expires', async () => {
      jest.useFakeTimers();
      
      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Fill the rate limit
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId);
      }

      // Should be blocked
      let result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(false);

      // Advance time past the window (1 second for Mailchimp)
      jest.advanceTimersByTime(1100);

      // Should be allowed again
      result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(true);

      jest.useRealTimers();
    });

    it('should track operations separately', async () => {
      const provider = 'mailchimp';
      const venueId = 'venue-123';

      const result1 = await rateLimiterService.checkLimit(provider, venueId, 'operation1');
      const result2 = await rateLimiterService.checkLimit(provider, venueId, 'operation2');

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
    });
  });

  describe('executeWithRateLimit', () => {
    it('should execute function if under rate limit', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');

      const result = await rateLimiterService.executeWithRateLimit(
        'mailchimp',
        'venue-123',
        'api_call',
        mockFn
      );

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should wait and retry if rate limit exceeded', async () => {
      jest.useFakeTimers();
      
      const venueId = 'venue-123';
      const provider = 'mailchimp';
      const operation = 'api_call';

      // Fill the rate limit
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId, operation);
      }

      const mockFn = jest.fn().mockResolvedValue('success');

      // Start execution (will be rate limited)
      const promise = rateLimiterService.executeWithRateLimit(
        provider,
        venueId,
        operation,
        mockFn
      );

      // Advance time to allow retry
      jest.advanceTimersByTime(1100);

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should propagate function errors', async () => {
      const mockFn = jest.fn().mockRejectedValue(new Error('Function error'));

      await expect(
        rateLimiterService.executeWithRateLimit(
          'mailchimp',
          'venue-123',
          'api_call',
          mockFn
        )
      ).rejects.toThrow('Function error');
    });
  });

  describe('getUsageStats', () => {
    it('should return usage statistics', async () => {
      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Make some requests
      for (let i = 0; i < 5; i++) {
        await rateLimiterService.checkLimit(provider, venueId);
      }

      const stats = rateLimiterService.getUsageStats(provider, venueId);

      expect(stats).toBeDefined();
      expect(stats?.current).toBe(5);
      expect(stats?.max).toBe(10); // Mailchimp's limit
      expect(stats?.resetsIn).toBeGreaterThan(0);
    });

    it('should return null for non-existent key', () => {
      const stats = rateLimiterService.getUsageStats('unknown', 'venue-999');

      expect(stats).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset rate limit for specific key', async () => {
      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Fill the rate limit
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId);
      }

      // Should be blocked
      let result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(false);

      // Reset
      rateLimiterService.reset(provider, venueId);

      // Should be allowed again
      result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(true);
    });

    it('should reset specific operation independently', async () => {
      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Fill rate limit for operation1
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId, 'operation1');
      }

      // Fill rate limit for operation2
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId, 'operation2');
      }

      // Reset only operation1
      rateLimiterService.reset(provider, venueId, 'operation1');

      // operation1 should be allowed
      const result1 = await rateLimiterService.checkLimit(provider, venueId, 'operation1');
      expect(result1.allowed).toBe(true);

      // operation2 should still be blocked
      const result2 = await rateLimiterService.checkLimit(provider, venueId, 'operation2');
      expect(result2.allowed).toBe(false);
    });
  });

  describe('Provider-specific limits', () => {
    it('should enforce Mailchimp limits (10/second)', async () => {
      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Make 10 requests (should all succeed)
      for (let i = 0; i < 10; i++) {
        const result = await rateLimiterService.checkLimit(provider, venueId);
        expect(result.allowed).toBe(true);
      }

      // 11th request should fail
      const result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(false);
    });

    it('should enforce QuickBooks limits (100/minute)', async () => {
      const venueId = 'venue-123';
      const provider = 'quickbooks';

      // Make 100 requests (should all succeed)
      for (let i = 0; i < 100; i++) {
        const result = await rateLimiterService.checkLimit(provider, venueId);
        expect(result.allowed).toBe(true);
      }

      // 101st request should fail
      const result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(false);
    });

    it('should enforce Square limits (100/10 seconds)', async () => {
      const venueId = 'venue-123';
      const provider = 'square';

      // Make 100 requests (should all succeed)
      for (let i = 0; i < 100; i++) {
        const result = await rateLimiterService.checkLimit(provider, venueId);
        expect(result.allowed).toBe(true);
      }

      // 101st request should fail
      const result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(false);
    });

    it('should enforce Stripe limits (100/second)', async () => {
      const venueId = 'venue-123';
      const provider = 'stripe';

      // Make 100 requests (should all succeed)
      for (let i = 0; i < 100; i++) {
        const result = await rateLimiterService.checkLimit(provider, venueId);
        expect(result.allowed).toBe(true);
      }

      // 101st request should fail
      const result = await rateLimiterService.checkLimit(provider, venueId);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Cleanup', () => {
    it('should cleanup expired entries', () => {
      jest.useFakeTimers();

      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Create some entries
      rateLimiterService.checkLimit(provider, venueId);

      // Verify entry exists
      let stats = rateLimiterService.getUsageStats(provider, venueId);
      expect(stats).toBeDefined();

      // Advance time significantly
      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour

      // Trigger cleanup
      rateLimiterService.cleanup();

      // Entry should be removed
      stats = rateLimiterService.getUsageStats(provider, venueId);
      expect(stats).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('Concurrent requests', () => {
    it('should handle concurrent requests correctly', async () => {
      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Make 15 concurrent requests (limit is 10)
      const promises = Array.from({ length: 15 }, () =>
        rateLimiterService.checkLimit(provider, venueId)
      );

      const results = await Promise.all(promises);

      // First 10 should be allowed
      const allowed = results.filter((r) => r.allowed);
      const blocked = results.filter((r) => !r.allowed);

      expect(allowed.length).toBe(10);
      expect(blocked.length).toBe(5);
    });
  });

  describe('waitIfNeeded', () => {
    it('should not wait if under limit', async () => {
      const startTime = Date.now();

      await rateLimiterService.waitIfNeeded('mailchimp', 'venue-123');

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100); // Should be immediate
    });

    it('should wait if limit exceeded', async () => {
      jest.useFakeTimers();

      const venueId = 'venue-123';
      const provider = 'mailchimp';

      // Fill the rate limit
      for (let i = 0; i < 10; i++) {
        await rateLimiterService.checkLimit(provider, venueId);
      }

      // Start waiting
      const promise = rateLimiterService.waitIfNeeded(provider, venueId);

      // Advance time
      jest.advanceTimersByTime(1100);

      await promise;

      jest.useRealTimers();
    });
  });

  describe('clearAll', () => {
    it('should clear all rate limits', async () => {
      // Create some entries
      await rateLimiterService.checkLimit('mailchimp', 'venue-1');
      await rateLimiterService.checkLimit('stripe', 'venue-2');

      let stats1 = rateLimiterService.getUsageStats('mailchimp', 'venue-1');
      let stats2 = rateLimiterService.getUsageStats('stripe', 'venue-2');

      expect(stats1).toBeDefined();
      expect(stats2).toBeDefined();

      // Clear all
      rateLimiterService.clearAll();

      stats1 = rateLimiterService.getUsageStats('mailchimp', 'venue-1');
      stats2 = rateLimiterService.getUsageStats('stripe', 'venue-2');

      expect(stats1).toBeNull();
      expect(stats2).toBeNull();
    });
  });
});
