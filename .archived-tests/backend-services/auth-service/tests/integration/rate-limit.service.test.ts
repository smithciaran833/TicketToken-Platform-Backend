import { RateLimitService } from '../../src/services/rate-limit.service';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR RATE LIMIT SERVICE
 * 
 * These tests verify rate limiting functionality:
 * - Different limits per action (login, register, wallet)
 * - Venue-specific rate limiting
 * - TTL expiration management
 * - Error messages with retry information
 */

// Safety check
beforeAll(() => {
  const dbName = process.env.DB_NAME || 'tickettoken_db';
  const isTestDb = dbName.includes('test') || process.env.NODE_ENV === 'test';
  
  if (!isTestDb) {
    throw new Error(
      `⚠️  REFUSING TO RUN INTEGRATION TESTS AGAINST NON-TEST DATABASE!\n` +
      `Current DB_NAME: ${dbName}\n` +
      `Please set DB_NAME to include 'test' or set NODE_ENV=test`
    );
  }
  
  console.log(`✓ Running rate limit service integration tests against test environment`);
});

describe('RateLimitService Integration Tests', () => {
  let service: RateLimitService;

  beforeAll(async () => {
    service = new RateLimitService();
  });

  afterEach(async () => {
    // Clean up Redis keys after each test
    const keys = await redis.keys('rate:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('consume() - login action', () => {
    const action = 'login';
    const identifier = 'user@example.com';

    it('should allow requests up to limit (5 per 60s)', async () => {
      // Should succeed 5 times
      for (let i = 0; i < 5; i++) {
        await expect(
          service.consume(action, null, identifier)
        ).resolves.not.toThrow();
      }

      // 6th should fail
      await expect(
        service.consume(action, null, identifier)
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should set 60 second TTL on first request', async () => {
      await service.consume(action, null, identifier);

      const ttl = await redis.ttl(`rate:login:${identifier}`);
      expect(ttl).toBeGreaterThan(55);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it('should increment counter on each request', async () => {
      await service.consume(action, null, identifier);
      await service.consume(action, null, identifier);
      await service.consume(action, null, identifier);

      const count = await redis.get(`rate:login:${identifier}`);
      expect(count).toBe('3');
    });

    it('should include TTL in error message when exceeded', async () => {
      for (let i = 0; i < 5; i++) {
        await service.consume(action, null, identifier);
      }

      try {
        await service.consume(action, null, identifier);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Try again in');
        expect(error.message).toContain('seconds');
      }
    });
  });

  describe('consume() - register action', () => {
    const action = 'register';
    const identifier = 'newuser@example.com';

    it('should allow requests up to limit (3 per 300s)', async () => {
      // Should succeed 3 times
      for (let i = 0; i < 3; i++) {
        await expect(
          service.consume(action, null, identifier)
        ).resolves.not.toThrow();
      }

      // 4th should fail
      await expect(
        service.consume(action, null, identifier)
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should set 300 second (5 minute) TTL on first request', async () => {
      await service.consume(action, null, identifier);

      const ttl = await redis.ttl(`rate:register:${identifier}`);
      expect(ttl).toBeGreaterThan(295);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('consume() - wallet action', () => {
    const action = 'wallet';
    const identifier = 'wallet-address-123';

    it('should allow requests up to limit (10 per 60s)', async () => {
      // Should succeed 10 times
      for (let i = 0; i < 10; i++) {
        await expect(
          service.consume(action, null, identifier)
        ).resolves.not.toThrow();
      }

      // 11th should fail
      await expect(
        service.consume(action, null, identifier)
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should set 60 second TTL on first request', async () => {
      await service.consume(action, null, identifier);

      const ttl = await redis.ttl(`rate:wallet:${identifier}`);
      expect(ttl).toBeGreaterThan(55);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('consume() - unknown action', () => {
    const action = 'unknown';
    const identifier = 'test-id';

    it('should use default limit (100 per 60s)', async () => {
      // Should allow many requests with default limit
      for (let i = 0; i < 10; i++) {
        await expect(
          service.consume(action, null, identifier)
        ).resolves.not.toThrow();
      }

      // Should still be well under limit
      const count = await redis.get(`rate:unknown:${identifier}`);
      expect(parseInt(count || '0')).toBe(10);
    });
  });

  describe('consume() - with venueId', () => {
    const action = 'login';
    const venueId = 'venue-123';
    const identifier = 'user@venue.com';

    it('should include venueId in Redis key', async () => {
      await service.consume(action, venueId, identifier);

      const key = `rate:login:${venueId}:${identifier}`;
      const exists = await redis.exists(key);
      expect(exists).toBe(1);
    });

    it('should track venue-specific limits separately', async () => {
      const venue1 = 'venue-1';
      const venue2 = 'venue-2';

      // Use up limit for venue1
      for (let i = 0; i < 5; i++) {
        await service.consume(action, venue1, identifier);
      }

      // venue1 should be blocked
      await expect(
        service.consume(action, venue1, identifier)
      ).rejects.toThrow();

      // But venue2 should still work
      await expect(
        service.consume(action, venue2, identifier)
      ).resolves.not.toThrow();
    });
  });

  describe('consume() - without venueId', () => {
    const action = 'login';
    const identifier = 'test@example.com';

    it('should exclude venueId from Redis key when null', async () => {
      await service.consume(action, null, identifier);

      const keyWithoutVenue = `rate:login:${identifier}`;
      const exists = await redis.exists(keyWithoutVenue);
      expect(exists).toBe(1);

      // Verify no vue key created
      const keys = await redis.keys('rate:login:*');
      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe(keyWithoutVenue);
    });
  });

  describe('TTL management', () => {
    it('should set expiry only on first request', async () => {
      const action = 'login';
      const identifier = 'ttl-test';

      await service.consume(action, null, identifier);
      const ttlAfterFirst = await redis.ttl(`rate:login:${identifier}`);

      await new Promise(resolve => setTimeout(resolve, 100));

      await service.consume(action, null, identifier);
      const ttlAfterSecond = await redis.ttl(`rate:login:${identifier}`);

      // TTL should not reset (should be same or less due to time passing)
      expect(ttlAfterSecond).toBeLessThanOrEqual(ttlAfterFirst);
    });

    it('should allow requests after TTL expires', async () => {
      const action = 'login';
      const identifier = 'expire-test';

      // Set short TTL manually
      await redis.setex(`rate:login:${identifier}`, 1, '5');

      // Should be at limit
      await expect(
        service.consume(action, null, identifier)
      ).rejects.toThrow();

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should work again after expiration
      await expect(
        service.consume(action, null, identifier)
      ).resolves.not.toThrow();
    });
  });

  describe('Multiple identifiers', () => {
    it('should track different identifiers independently', async () => {
      const action = 'login';
      const user1 = 'user1@example.com';
      const user2 = 'user2@example.com';

      // Use up limit for user1
      for (let i = 0; i < 5; i++) {
        await service.consume(action, null, user1);
      }

      // user1 blocked
      await expect(
        service.consume(action, null, user1)
      ).rejects.toThrow();

      // user2 still works
      await expect(
        service.consume(action, null, user2)
      ).resolves.not.toThrow();
    });
  });

  describe('Multiple actions', () => {
    it('should track different actions independently', async () => {
      const identifier = 'multi-action-user';

      // Use up login limit
      for (let i = 0; i < 5; i++) {
        await service.consume('login', null, identifier);
      }

      // Login blocked
      await expect(
        service.consume('login', null, identifier)
      ).rejects.toThrow();

      // But wallet actions still work
      await expect(
        service.consume('wallet', null, identifier)
      ).resolves.not.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle concurrent requests', async () => {
      const action = 'login';
      const identifier = 'concurrent-test';

      // Fire 3 concurrent requests
      await Promise.all([
        service.consume(action, null, identifier),
        service.consume(action, null, identifier),
        service.consume(action, null, identifier),
      ]);

      const count = await redis.get(`rate:login:${identifier}`);
      expect(parseInt(count || '0')).toBeGreaterThanOrEqual(3);
    });

    it('should handle special characters in identifier', async () => {
      const action = 'login';
      const identifier = 'user+test@example.com';

      await expect(
        service.consume(action, null, identifier)
      ).resolves.not.toThrow();

      const keys = await redis.keys('rate:login:*');
      expect(keys.length).toBeGreaterThan(0);
    });
  });

  describe('Error messages', () => {
    it('should provide accurate retry time', async () => {
      const action = 'login';
      const identifier = 'retry-time-test';

      // Use up limit
      for (let i = 0; i < 5; i++) {
        await service.consume(action, null, identifier);
      }

      // Check error message
      try {
        await service.consume(action, null, identifier);
        fail('Should have thrown');
      } catch (error: any) {
        const ttl = await redis.ttl(`rate:login:${identifier}`);
        expect(error.message).toContain(ttl.toString());
      }
    });
  });
});
