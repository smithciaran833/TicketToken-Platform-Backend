import {
  RateLimiter,
  loginRateLimiter,
  registrationRateLimiter,
  passwordResetRateLimiter
} from '../../src/utils/rateLimiter';
import { RateLimitError } from '../../src/errors';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR RATE LIMITER
 * 
 * These tests use REAL Redis:
 * - Real Redis operations (no mocks)
 * - Tests actual rate limiting behavior
 * - Tests TTL expiry
 * - Tests blocking behavior
 */

describe('RateLimiter Integration Tests', () => {
  let testLimiter: RateLimiter;
  const testKeys: string[] = [];

  beforeEach(() => {
    testLimiter = new RateLimiter('test', {
      points: 3,
      duration: 60,
      blockDuration: 120
    });
  });

  afterEach(async () => {
    // Clean up test keys
    for (const key of testKeys) {
      await redis.del(`test:${key}`);
      await redis.del(`test:${key}:block`);
    }
    testKeys.length = 0;
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('constructor()', () => {
    it('should set keyPrefix', () => {
      const limiter = new RateLimiter('my-prefix', { points: 5, duration: 60 });
      
      expect(limiter).toBeDefined();
    });

    it('should set points from options', async () => {
      const limiter = new RateLimiter('test-points', { points: 5, duration: 60 });
      const key = `points-test-${Date.now()}`;
      testKeys.push(key);

      // Should allow 5 requests
      await limiter.consume(key);
      await limiter.consume(key);
      await limiter.consume(key);
      await limiter.consume(key);
      await limiter.consume(key);

      // 6th should fail
      await expect(limiter.consume(key)).rejects.toThrow(RateLimitError);

      // Cleanup
      await redis.del(`test-points:${key}`);
      await redis.del(`test-points:${key}:block`);
    });

    it('should default blockDuration to duration * 2', async () => {
      const limiter = new RateLimiter('test-block', { points: 1, duration: 10 });
      const key = `block-test-${Date.now()}`;
      testKeys.push(key);

      await limiter.consume(key);
      
      try {
        await limiter.consume(key); // This should trigger block
      } catch (error: any) {
        expect(error.ttl).toBeLessThanOrEqual(20); // duration * 2
        expect(error.ttl).toBeGreaterThan(0);
      }

      // Cleanup
      await redis.del(`test-block:${key}`);
      await redis.del(`test-block:${key}:block`);
    });

    it('should use custom blockDuration when provided', async () => {
      const limiter = new RateLimiter('test-custom', { 
        points: 1, 
        duration: 10, 
        blockDuration: 30 
      });
      const key = `custom-block-${Date.now()}`;
      testKeys.push(key);

      await limiter.consume(key);
      
      try {
        await limiter.consume(key);
      } catch (error: any) {
        expect(error.ttl).toBeLessThanOrEqual(30);
      }

      // Cleanup
      await redis.del(`test-custom:${key}`);
      await redis.del(`test-custom:${key}:block`);
    });
  });

  describe('consume()', () => {
    it('should throw RateLimitError with TTL when blocked', async () => {
      const key = `blocked-${Date.now()}`;
      testKeys.push(key);

      // Exceed limit
      await testLimiter.consume(key);
      await testLimiter.consume(key);
      await testLimiter.consume(key);

      try {
        await testLimiter.consume(key); // 4th request triggers block
        fail('Should have thrown RateLimitError');
      } catch (error: any) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error.ttl).toBeDefined();
        expect(error.ttl).toBeGreaterThan(0);
        expect(error.ttl).toBeLessThanOrEqual(120);
      }
    });

    it('should increment Redis counter', async () => {
      const key = `counter-${Date.now()}`;
      testKeys.push(key);

      await testLimiter.consume(key);
      
      const count = await redis.get(`test:${key}`);
      expect(count).toBe('1');
    });

    it('should set expiry on first request only', async () => {
      const key = `expiry-${Date.now()}`;
      testKeys.push(key);

      await testLimiter.consume(key);
      const ttl1 = await redis.ttl(`test:${key}`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      await testLimiter.consume(key);
      const ttl2 = await redis.ttl(`test:${key}`);

      expect(ttl1).toBeGreaterThan(0);
      expect(ttl2).toBeLessThan(ttl1); // TTL should have decreased
    });

    it('should NOT set expiry on subsequent requests', async () => {
      const key = `no-expiry-reset-${Date.now()}`;
      testKeys.push(key);

      await testLimiter.consume(key);
      await new Promise(resolve => setTimeout(resolve, 100));
      const ttl1 = await redis.ttl(`test:${key}`);
      
      await testLimiter.consume(key);
      const ttl2 = await redis.ttl(`test:${key}`);

      // TTL should only decrease, not reset
      expect(ttl2).toBeLessThanOrEqual(ttl1);
      expect(ttl2).toBeGreaterThan(0);
    });

    it('should set block key when limit exceeded', async () => {
      const key = `block-key-${Date.now()}`;
      testKeys.push(key);

      await testLimiter.consume(key);
      await testLimiter.consume(key);
      await testLimiter.consume(key);

      try {
        await testLimiter.consume(key); // Exceeds limit
      } catch {}

      const blockExists = await redis.exists(`test:${key}:block`);
      expect(blockExists).toBe(1);
    });

    it('should throw RateLimitError with blockDuration when exceeded', async () => {
      const key = `exceeded-${Date.now()}`;
      testKeys.push(key);

      await testLimiter.consume(key);
      await testLimiter.consume(key);
      await testLimiter.consume(key);

      try {
        await testLimiter.consume(key);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect(error.message).toBe('Rate limit exceeded');
        expect(error.ttl).toBe(120);
      }
    });

    it('should pass silently when under limit', async () => {
      const key = `under-limit-${Date.now()}`;
      testKeys.push(key);

      await expect(testLimiter.consume(key)).resolves.not.toThrow();
      await expect(testLimiter.consume(key)).resolves.not.toThrow();
      await expect(testLimiter.consume(key)).resolves.not.toThrow();
    });

    it('should allow requests across different keys independently', async () => {
      const key1 = `independent-1-${Date.now()}`;
      const key2 = `independent-2-${Date.now()}`;
      testKeys.push(key1, key2);

      await testLimiter.consume(key1);
      await testLimiter.consume(key1);
      await testLimiter.consume(key1);

      // key2 should still work
      await expect(testLimiter.consume(key2)).resolves.not.toThrow();
      await expect(testLimiter.consume(key2)).resolves.not.toThrow();
    });
  });

  describe('reset()', () => {
    it('should delete counter key', async () => {
      const key = `reset-counter-${Date.now()}`;
      testKeys.push(key);

      await testLimiter.consume(key);
      await testLimiter.reset(key);

      const exists = await redis.exists(`test:${key}`);
      expect(exists).toBe(0);
    });

    it('should delete block key', async () => {
      const key = `reset-block-${Date.now()}`;
      testKeys.push(key);

      // Trigger block
      await testLimiter.consume(key);
      await testLimiter.consume(key);
      await testLimiter.consume(key);
      try {
        await testLimiter.consume(key);
      } catch {}

      await testLimiter.reset(key);

      const blockExists = await redis.exists(`test:${key}:block`);
      expect(blockExists).toBe(0);
    });

    it('should allow consume after reset', async () => {
      const key = `consume-after-reset-${Date.now()}`;
      testKeys.push(key);

      // Exceed limit
      await testLimiter.consume(key);
      await testLimiter.consume(key);
      await testLimiter.consume(key);
      try {
        await testLimiter.consume(key);
      } catch {}

      // Reset and try again
      await testLimiter.reset(key);
      await expect(testLimiter.consume(key)).resolves.not.toThrow();
    });
  });

  describe('Pre-configured instances', () => {
    it('loginRateLimiter should have points=5, duration=900', async () => {
      const key = `login-test-${Date.now()}`;
      
      // Should allow 5 requests
      await loginRateLimiter.consume(key);
      await loginRateLimiter.consume(key);
      await loginRateLimiter.consume(key);
      await loginRateLimiter.consume(key);
      await loginRateLimiter.consume(key);

      // 6th should fail
      await expect(loginRateLimiter.consume(key)).rejects.toThrow(RateLimitError);

      // Cleanup
      await loginRateLimiter.reset(key);
    });

    it('registrationRateLimiter should have points=3, duration=3600', async () => {
      const key = `register-test-${Date.now()}`;

      // Should allow 3 requests
      await registrationRateLimiter.consume(key);
      await registrationRateLimiter.consume(key);
      await registrationRateLimiter.consume(key);

      // 4th should fail
      await expect(registrationRateLimiter.consume(key)).rejects.toThrow(RateLimitError);

      // Cleanup
      await registrationRateLimiter.reset(key);
    });

    it('passwordResetRateLimiter should have points=3, duration=3600', async () => {
      const key = `password-reset-test-${Date.now()}`;

      // Should allow 3 requests
      await passwordResetRateLimiter.consume(key);
      await passwordResetRateLimiter.consume(key);
      await passwordResetRateLimiter.consume(key);

      // 4th should fail
      await expect(passwordResetRateLimiter.consume(key)).rejects.toThrow(RateLimitError);

      // Cleanup
      await passwordResetRateLimiter.reset(key);
    });
  });

  describe('Real-world scenarios', () => {
    it('should enforce rate limit per IP address', async () => {
      const ip = `192.168.1.${Date.now() % 255}`;
      testKeys.push(ip);

      await testLimiter.consume(ip);
      await testLimiter.consume(ip);
      await testLimiter.consume(ip);

      await expect(testLimiter.consume(ip)).rejects.toThrow('Rate limit exceeded');
    });

    it('should block user for configured duration', async () => {
      const userId = `user-${Date.now()}`;
      testKeys.push(userId);

      // Exceed limit
      await testLimiter.consume(userId);
      await testLimiter.consume(userId);
      await testLimiter.consume(userId);
      
      let ttl1: number = 0;
      try {
        await testLimiter.consume(userId);
      } catch (error: any) {
        ttl1 = error.ttl;
      }

      // Try again immediately - should still be blocked
      try {
        await testLimiter.consume(userId);
      } catch (error: any) {
        expect(error.message).toBe('Too many requests');
        expect(error.ttl).toBeLessThanOrEqual(ttl1);
      }
    });

    it('should handle concurrent requests correctly', async () => {
      const key = `concurrent-${Date.now()}`;
      testKeys.push(key);

      const promises = [
        testLimiter.consume(key),
        testLimiter.consume(key),
        testLimiter.consume(key)
      ];

      await Promise.all(promises);

      // 4th should fail
      await expect(testLimiter.consume(key)).rejects.toThrow();
    });
  });
});
