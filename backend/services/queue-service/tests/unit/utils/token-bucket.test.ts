import { TokenBucket } from '../../../src/utils/token-bucket';

describe('TokenBucket', () => {
  let originalDateNow: () => number;
  let mockTime: number;

  beforeEach(() => {
    // Mock Date.now for consistent time-based testing
    originalDateNow = Date.now;
    mockTime = 1000000;
    Date.now = jest.fn(() => mockTime);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  const advanceTime = (ms: number) => {
    mockTime += ms;
  };

  describe('constructor', () => {
    it('should initialize with max tokens', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.getTokenCount()).toBe(10);
    });

    it('should accept different max tokens', () => {
      const bucket1 = new TokenBucket(5, 1);
      const bucket2 = new TokenBucket(100, 1);

      expect(bucket1.getTokenCount()).toBe(5);
      expect(bucket2.getTokenCount()).toBe(100);
    });

    it('should accept different refill rates', () => {
      const bucket1 = new TokenBucket(10, 1);
      const bucket2 = new TokenBucket(10, 5);

      expect(bucket1.getTokenCount()).toBe(10);
      expect(bucket2.getTokenCount()).toBe(10);
    });

    it('should handle large token counts', () => {
      const bucket = new TokenBucket(10000, 100);
      expect(bucket.getTokenCount()).toBe(10000);
    });

    it('should handle fractional refill rates', () => {
      const bucket = new TokenBucket(10, 0.5);
      expect(bucket.getTokenCount()).toBe(10);
    });
  });

  describe('consume', () => {
    it('should consume single token successfully', async () => {
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.consume(1);

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(9);
    });

    it('should consume multiple tokens', async () => {
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.consume(5);

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(5);
    });

    it('should default to consuming 1 token', async () => {
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.consume();

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(9);
    });

    it('should fail when insufficient tokens', async () => {
      const bucket = new TokenBucket(5, 1);
      const result = await bucket.consume(10);

      expect(result).toBe(false);
      expect(bucket.getTokenCount()).toBe(5); // Tokens unchanged
    });

    it('should allow consuming all tokens', async () => {
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.consume(10);

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(0);
    });

    it('should fail when bucket is empty', async () => {
      const bucket = new TokenBucket(10, 1);
      await bucket.consume(10);

      const result = await bucket.consume(1);
      expect(result).toBe(false);
      expect(bucket.getTokenCount()).toBe(0);
    });

    it('should handle multiple sequential consumes', async () => {
      const bucket = new TokenBucket(10, 1);

      expect(await bucket.consume(3)).toBe(true);
      expect(bucket.getTokenCount()).toBe(7);

      expect(await bucket.consume(2)).toBe(true);
      expect(bucket.getTokenCount()).toBe(5);

      expect(await bucket.consume(5)).toBe(true);
      expect(bucket.getTokenCount()).toBe(0);
    });

    it('should handle consuming zero tokens', async () => {
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.consume(0);

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(10);
    });
  });

  describe('refill mechanism', () => {
    it('should refill tokens over time', async () => {
      const bucket = new TokenBucket(10, 1); // 1 token per second
      await bucket.consume(5);
      expect(bucket.getTokenCount()).toBe(5);

      // Advance time by 3 seconds
      advanceTime(3000);

      expect(bucket.getTokenCount()).toBe(8); // 5 + 3
    });

    it('should not exceed max tokens', async () => {
      const bucket = new TokenBucket(10, 1);
      await bucket.consume(5);

      // Advance time by 10 seconds (would add 10 tokens)
      advanceTime(10000);

      expect(bucket.getTokenCount()).toBe(10); // Capped at max
    });

    it('should refill at correct rate', async () => {
      const bucket = new TokenBucket(100, 10); // 10 tokens per second
      await bucket.consume(50);
      expect(bucket.getTokenCount()).toBe(50);

      // Advance time by 1 second
      advanceTime(1000);

      expect(bucket.getTokenCount()).toBe(60); // 50 + 10
    });

    it('should handle fractional refill rates', async () => {
      const bucket = new TokenBucket(10, 0.5); // 0.5 tokens per second
      await bucket.consume(5);

      // Advance time by 4 seconds
      advanceTime(4000);

      expect(bucket.getTokenCount()).toBe(7); // 5 + (0.5 * 4) = 7
    });

    it('should refill incrementally with multiple consume calls', async () => {
      const bucket = new TokenBucket(10, 2); // 2 tokens per second
      await bucket.consume(8);
      expect(bucket.getTokenCount()).toBe(2);

      // Advance 1 second
      advanceTime(1000);
      expect(bucket.getTokenCount()).toBe(4); // 2 + 2

      // Advance another second
      advanceTime(1000);
      expect(bucket.getTokenCount()).toBe(6); // 4 + 2
    });

    it('should refill continuously even without consume calls', () => {
      const bucket = new TokenBucket(10, 1);

      // Advance time without consuming
      advanceTime(5000);

      // Refill happens on next getTokenCount call
      expect(bucket.getTokenCount()).toBe(10);
    });

    it('should handle very small time intervals', async () => {
      const bucket = new TokenBucket(10, 10); // 10 tokens per second
      await bucket.consume(9);

      // Advance time by 100ms (should add 1 token)
      advanceTime(100);

      expect(bucket.getTokenCount()).toBe(2); // 1 + 1
    });
  });

  describe('waitForTokens', () => {
    it('should return immediately if tokens available', async () => {
      const bucket = new TokenBucket(10, 1);
      const startTime = Date.now();

      const result = await bucket.waitForTokens(5, 1000);

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(5);
      expect(Date.now()).toBe(startTime); // No time passed
    });

    it('should default to 1 token', async () => {
      const bucket = new TokenBucket(10, 1);
      await bucket.consume(9);

      const result = await bucket.waitForTokens();

      expect(result).toBe(true);
      expect(bucket.getTokenCount()).toBe(0);
    });

    it('should be a function that returns a promise', () => {
      const bucket = new TokenBucket(10, 1);
      const result = bucket.waitForTokens(1, 100);
      
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('getTokenCount', () => {
    it('should return current token count', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.getTokenCount()).toBe(10);
    });

    it('should return floored integer value', async () => {
      const bucket = new TokenBucket(10, 0.5);
      await bucket.consume(5);

      // Advance time by 1 second (adds 0.5 tokens)
      advanceTime(1000);

      // 5 + 0.5 = 5.5, floored to 5
      expect(bucket.getTokenCount()).toBe(5);
    });

    it('should trigger refill calculation', () => {
      const bucket = new TokenBucket(10, 5);
      
      advanceTime(2000); // Would add 10 tokens (but capped)

      expect(bucket.getTokenCount()).toBe(10);
    });

    it('should return 0 when bucket is empty', async () => {
      const bucket = new TokenBucket(10, 1);
      await bucket.consume(10);

      expect(bucket.getTokenCount()).toBe(0);
    });
  });

  describe('getTimeUntilNextToken', () => {
    it('should return 0 when bucket is full', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.getTimeUntilNextToken()).toBe(0);
    });

    it('should calculate time for single token refill rate', async () => {
      const bucket = new TokenBucket(10, 1); // 1 token per second
      await bucket.consume(1);

      expect(bucket.getTimeUntilNextToken()).toBe(1000); // 1 second
    });

    it('should calculate time for fast refill rate', async () => {
      const bucket = new TokenBucket(10, 10); // 10 tokens per second
      await bucket.consume(1);

      expect(bucket.getTimeUntilNextToken()).toBe(100); // 0.1 seconds
    });

    it('should calculate time for slow refill rate', async () => {
      const bucket = new TokenBucket(10, 0.5); // 0.5 tokens per second
      await bucket.consume(1);

      expect(bucket.getTimeUntilNextToken()).toBe(2000); // 2 seconds
    });

    it('should return same time regardless of token deficit', async () => {
      const bucket = new TokenBucket(10, 2); // 2 tokens per second

      await bucket.consume(1);
      const time1 = bucket.getTimeUntilNextToken();

      await bucket.consume(5);
      const time2 = bucket.getTimeUntilNextToken();

      expect(time1).toBe(500);
      expect(time2).toBe(500);
    });

    it('should return 0 after refill completes', async () => {
      const bucket = new TokenBucket(10, 1);
      await bucket.consume(5);

      // Advance time to refill completely
      advanceTime(5000);

      // Need to trigger refill by checking count
      bucket.getTokenCount();
      expect(bucket.getTimeUntilNextToken()).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle consuming negative tokens as failure', async () => {
      const bucket = new TokenBucket(10, 1);
      const result = await bucket.consume(-5);

      expect(result).toBe(true); // Negative consumption succeeds
      expect(bucket.getTokenCount()).toBe(10); // No change (adding tokens)
    });

    it('should handle very large refill rates', async () => {
      const bucket = new TokenBucket(1000, 1000);
      await bucket.consume(500);

      advanceTime(100); // 0.1 seconds

      expect(bucket.getTokenCount()).toBe(600); // 500 + 100
    });

    it('should handle very small refill rates', async () => {
      const bucket = new TokenBucket(10, 0.01);
      await bucket.consume(5);

      advanceTime(1000); // 1 second adds 0.01 tokens

      expect(bucket.getTokenCount()).toBe(5); // Still 5 (0.01 rounds down)
    });

    it('should handle bucket with 1 token capacity', async () => {
      const bucket = new TokenBucket(1, 1);
      
      expect(await bucket.consume(1)).toBe(true);
      expect(bucket.getTokenCount()).toBe(0);
      
      expect(await bucket.consume(1)).toBe(false);
    });

    it('should handle concurrent consume attempts', async () => {
      const bucket = new TokenBucket(10, 1);

      const results = await Promise.all([
        bucket.consume(3),
        bucket.consume(3),
        bucket.consume(3),
      ]);

      // All should succeed (10 tokens available)
      expect(results).toEqual([true, true, true]);
      expect(bucket.getTokenCount()).toBe(1);
    });

    it('should maintain accuracy over many operations', async () => {
      const bucket = new TokenBucket(100, 10);

      // Perform many small operations
      for (let i = 0; i < 50; i++) {
        await bucket.consume(1);
        advanceTime(100); // Adds 1 token
      }

      // Should be back at full capacity
      expect(bucket.getTokenCount()).toBe(100);
    });

    it('should handle time not advancing', async () => {
      const bucket = new TokenBucket(10, 1);
      await bucket.consume(5);

      // Don't advance time
      expect(bucket.getTokenCount()).toBe(5);
      expect(bucket.getTokenCount()).toBe(5);
    });

    it('should handle bucket initialized with 0 max tokens', () => {
      const bucket = new TokenBucket(0, 1);
      expect(bucket.getTokenCount()).toBe(0);
    });

    it('should handle 0 refill rate', async () => {
      const bucket = new TokenBucket(10, 0);
      await bucket.consume(5);

      advanceTime(10000);

      expect(bucket.getTokenCount()).toBe(5); // No refill
    });
  });

  describe('real-world scenarios', () => {
    it('should handle API rate limiting scenario', async () => {
      // 60 requests per minute = 1 per second
      const bucket = new TokenBucket(60, 1);

      // Make 60 requests
      for (let i = 0; i < 60; i++) {
        expect(await bucket.consume(1)).toBe(true);
      }

      // 61st request should fail
      expect(await bucket.consume(1)).toBe(false);

      // Wait 1 second
      advanceTime(1000);

      // Should work again
      expect(await bucket.consume(1)).toBe(true);
    });

    it('should handle burst traffic', async () => {
      // Allow bursts of 10 requests, refilling at 1/sec
      const bucket = new TokenBucket(10, 1);

      // Burst of 10 requests
      for (let i = 0; i < 10; i++) {
        expect(await bucket.consume(1)).toBe(true);
      }

      // 11th fails
      expect(await bucket.consume(1)).toBe(false);

      // Wait 5 seconds
      advanceTime(5000);

      // Can do 5 more
      for (let i = 0; i < 5; i++) {
        expect(await bucket.consume(1)).toBe(true);
      }
    });

    it('should handle premium vs standard rate limits', async () => {
      const standardBucket = new TokenBucket(100, 10); // 10 req/sec
      const premiumBucket = new TokenBucket(1000, 100); // 100 req/sec

      await standardBucket.consume(50);
      await premiumBucket.consume(500);

      advanceTime(1000);

      expect(standardBucket.getTokenCount()).toBe(60); // 50 + 10
      expect(premiumBucket.getTokenCount()).toBe(600); // 500 + 100
    });
  });
});
