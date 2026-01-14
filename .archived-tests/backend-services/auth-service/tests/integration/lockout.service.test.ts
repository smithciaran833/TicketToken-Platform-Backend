import { LockoutService } from '../../src/services/lockout.service';
import { redis } from '../../src/config/redis';
import { RateLimitError } from '../../src/errors';

/**
 * INTEGRATION TESTS FOR LOCKOUT SERVICE
 * 
 * These tests verify account lockout functionality:
 * - User and IP-based failed attempt tracking
 * - Lockout after max attempts (user: 5, IP: 10)
 * - Parallel tracking of user and IP attempts
 * - TTL expiration management
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
  
  console.log(`✓ Running lockout service integration tests against test environment`);
});

describe('LockoutService Integration Tests', () => {
  let service: LockoutService;

  beforeAll(async () => {
    service = new LockoutService();
  });

  afterEach(async () => {
    // Clean up Redis keys after each test
    const keys = await redis.keys('lockout:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    await redis.quit();
  });

  describe('recordFailedAttempt()', () => {
    const userId = 'test-user-123';
    const ipAddress = '192.168.1.100';

    describe('First failed attempt', () => {
      it('should increment both user and IP counters', async () => {
        await service.recordFailedAttempt(userId, ipAddress);

        const userAttempts = await redis.get(`lockout:user:${userId}`);
        const ipAttempts = await redis.get(`lockout:ip:${ipAddress}`);

        expect(userAttempts).toBe('1');
        expect(ipAttempts).toBe('1');
      });

      it('should set expiry on user key when first attempt', async () => {
        await service.recordFailedAttempt(userId, ipAddress);

        const ttl = await redis.ttl(`lockout:user:${userId}`);
        expect(ttl).toBeGreaterThan(0);
      });

      it('should set expiry on IP key when first attempt', async () => {
        await service.recordFailedAttempt(userId, ipAddress);

        const ttl = await redis.ttl(`lockout:ip:${ipAddress}`);
        expect(ttl).toBeGreaterThan(0);
      });
    });

    describe('Subsequent failed attempts', () => {
      it('should increment user counter on each attempt', async () => {
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);

        const userAttempts = await redis.get(`lockout:user:${userId}`);
        expect(userAttempts).toBe('3');
      });

      it('should increment IP counter on each attempt', async () => {
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);

        const ipAttempts = await redis.get(`lockout:ip:${ipAddress}`);
        expect(ipAttempts).toBe('2');
      });

      it('should not reset expiry on subsequent attempts', async () => {
        await service.recordFailedAttempt(userId, ipAddress);
        const ttlAfterFirst = await redis.ttl(`lockout:user:${userId}`);

        await new Promise(resolve => setTimeout(resolve, 100));

        await service.recordFailedAttempt(userId, ipAddress);
        const ttlAfterSecond = await redis.ttl(`lockout:user:${userId}`);

        expect(ttlAfterSecond).toBeLessThanOrEqual(ttlAfterFirst);
      });
    });

    describe('User lockout threshold', () => {
      it('should throw RateLimitError when user reaches max attempts (5)', async () => {
        // 4 attempts should succeed
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);

        // 5th attempt should throw
        await expect(
          service.recordFailedAttempt(userId, ipAddress)
        ).rejects.toThrow(RateLimitError);
      });

      it('should include TTL in error message', async () => {
        for (let i = 0; i < 4; i++) {
          await service.recordFailedAttempt(userId, ipAddress);
        }

        try {
          await service.recordFailedAttempt(userId, ipAddress);
          fail('Should have thrown RateLimitError');
        } catch (error: any) {
          expect(error).toBeInstanceOf(RateLimitError);
          expect(error.message).toContain('Try again in');
          expect(error.message).toContain('minutes');
        }
      });
    });

    describe('IP lockout threshold', () => {
      it('should throw RateLimitError when IP reaches 2x max attempts (10)', async () => {
        const differentUserId = 'different-user';

        // 9 attempts should succeed
        for (let i = 0; i < 9; i++) {
          await service.recordFailedAttempt(differentUserId, ipAddress);
        }

        // 10th attempt should throw
        await expect(
          service.recordFailedAttempt(differentUserId, ipAddress)
        ).rejects.toThrow(RateLimitError);
      });

      it('should track different IPs independently', async () => {
        const ip1 = '192.168.1.1';
        const ip2 = '192.168.1.2';

        await service.recordFailedAttempt(userId, ip1);
        await service.recordFailedAttempt(userId, ip1);
        await service.recordFailedAttempt(userId, ip2);

        const ip1Attempts = await redis.get(`lockout:ip:${ip1}`);
        const ip2Attempts = await redis.get(`lockout:ip:${ip2}`);

        expect(ip1Attempts).toBe('2');
        expect(ip2Attempts).toBe('1');
      });
    });

    describe('Parallel tracking', () => {
      it('should track user and IP attempts independently', async () => {
        const user1 = 'user-1';
        const user2 = 'user-2';
        const sharedIp = '192.168.1.100';

        await service.recordFailedAttempt(user1, sharedIp);
        await service.recordFailedAttempt(user2, sharedIp);

        const user1Attempts = await redis.get(`lockout:user:${user1}`);
        const user2Attempts = await redis.get(`lockout:user:${user2}`);
        const ipAttempts = await redis.get(`lockout:ip:${sharedIp}`);

        expect(user1Attempts).toBe('1');
        expect(user2Attempts).toBe('1');
        expect(ipAttempts).toBe('2');
      });
    });
  });

  describe('checkLockout()', () => {
    const userId = 'test-user-456';
    const ipAddress = '10.0.0.50';

    describe('When not locked', () => {
      it('should not throw when no attempts recorded', async () => {
        await expect(
          service.checkLockout(userId, ipAddress)
        ).resolves.not.toThrow();
      });

      it('should not throw when attempts below threshold', async () => {
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);
        await service.recordFailedAttempt(userId, ipAddress);

        await expect(
          service.checkLockout(userId, ipAddress)
        ).resolves.not.toThrow();
      });
    });

    describe('When user is locked', () => {
      beforeEach(async () => {
        // Lock the user by exceeding max attempts
        for (let i = 0; i < 5; i++) {
          try {
            await service.recordFailedAttempt(userId, ipAddress);
          } catch (error) {
            // Expected on 5th attempt
          }
        }
      });

      it('should throw RateLimitError', async () => {
        await expect(
          service.checkLockout(userId, ipAddress)
        ).rejects.toThrow(RateLimitError);
      });

      it('should include TTL in error', async () => {
        try {
          await service.checkLockout(userId, ipAddress);
          fail('Should have thrown');
        } catch (error: any) {
          expect(error).toBeInstanceOf(RateLimitError);
          expect(error.message).toContain('Account locked');
        }
      });
    });

    describe('When IP is locked', () => {
      beforeEach(async () => {
        // Lock the IP by exceeding 2x max attempts
        for (let i = 0; i < 10; i++) {
          try {
            await service.recordFailedAttempt(`user-${i}`, ipAddress);
          } catch (error) {
            // Expected on 10th attempt
          }
        }
      });

      it('should throw RateLimitError', async () => {
        await expect(
          service.checkLockout('new-user', ipAddress)
        ).rejects.toThrow(RateLimitError);
      });

      it('should indicate IP block in error message', async () => {
        try {
          await service.checkLockout('new-user', ipAddress);
          fail('Should have thrown');
        } catch (error: any) {
          expect(error.message).toContain('IP');
        }
      });
    });
  });

  describe('clearFailedAttempts()', () => {
    const userId = 'test-user-789';
    const ipAddress = '172.16.0.1';

    it('should delete user key from Redis', async () => {
      await service.recordFailedAttempt(userId, ipAddress);
      await service.recordFailedAttempt(userId, ipAddress);

      await service.clearFailedAttempts(userId, ipAddress);

      const userAttempts = await redis.get(`lockout:user:${userId}`);
      expect(userAttempts).toBeNull();
    });

    it('should delete IP key from Redis', async () => {
      await service.recordFailedAttempt(userId, ipAddress);
      await service.recordFailedAttempt(userId, ipAddress);

      await service.clearFailedAttempts(userId, ipAddress);

      const ipAttempts = await redis.get(`lockout:ip:${ipAddress}`);
      expect(ipAttempts).toBeNull();
    });

    it('should delete both keys in parallel', async () => {
      await service.recordFailedAttempt(userId, ipAddress);
      await service.recordFailedAttempt(userId, ipAddress);
      await service.recordFailedAttempt(userId, ipAddress);

      const beforeUser = await redis.get(`lockout:user:${userId}`);
      const beforeIp = await redis.get(`lockout:ip:${ipAddress}`);
      expect(beforeUser).toBe('3');
      expect(beforeIp).toBe('3');

      await service.clearFailedAttempts(userId, ipAddress);

      const afterUser = await redis.get(`lockout:user:${userId}`);
      const afterIp = await redis.get(`lockout:ip:${ipAddress}`);
      expect(afterUser).toBeNull();
      expect(afterIp).toBeNull();
    });

    it('should handle non-existent keys gracefully', async () => {
      await expect(
        service.clearFailedAttempts('non-existent-user', '0.0.0.0')
      ).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent attempts from same user', async () => {
      const userId = 'concurrent-user';
      const ipAddress = '192.168.100.1';

      await Promise.all([
        service.recordFailedAttempt(userId, ipAddress),
        service.recordFailedAttempt(userId, ipAddress),
        service.recordFailedAttempt(userId, ipAddress),
      ]);

      const attempts = await redis.get(`lockout:user:${userId}`);
      expect(parseInt(attempts || '0')).toBeGreaterThanOrEqual(3);
    });

    it('should handle different users from same IP', async () => {
      const ip = '192.168.200.1';

      await service.recordFailedAttempt('user-a', ip);
      await service.recordFailedAttempt('user-b', ip);
      await service.recordFailedAttempt('user-c', ip);

      const ipAttempts = await redis.get(`lockout:ip:${ip}`);
      expect(ipAttempts).toBe('3');

      const userAAttempts = await redis.get(`lockout:user:user-a`);
      const userBAttempts = await redis.get(`lockout:user:user-b`);
      const userCAttempts = await redis.get(`lockout:user:user-c`);

      expect(userAAttempts).toBe('1');
      expect(userBAttempts).toBe('1');
      expect(userCAttempts).toBe('1');
    });
  });
});
