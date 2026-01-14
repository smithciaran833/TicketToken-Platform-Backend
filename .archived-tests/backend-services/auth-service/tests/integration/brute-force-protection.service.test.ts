import { BruteForceProtectionService } from '../../src/services/brute-force-protection.service';
import { redis } from '../../src/config/redis';

/**
 * INTEGRATION TESTS FOR BRUTE FORCE PROTECTION SERVICE
 * 
 * These tests verify brute force protection functionality:
 * - Failed attempt tracking with Redis
 * - Account lockout after max attempts (5)
 * - 15-minute lockout duration
 * - TTL management and expiration
 * - Clearing failed attempts
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
  
  console.log(`✓ Running brute force protection integration tests against test environment`);
});

describe('BruteForceProtectionService Integration Tests', () => {
  let service: BruteForceProtectionService;

  beforeAll(async () => {
    service = new BruteForceProtectionService(redis);
  });

  afterEach(async () => {
    // Clean up Redis keys after each test
    const failedKeys = await redis.keys('failed_auth:*');
    const lockKeys = await redis.keys('auth_lock:*');
    
    if (failedKeys.length > 0) {
      await redis.del(...failedKeys);
    }
    if (lockKeys.length > 0) {
      await redis.del(...lockKeys);
    }
  });

  afterAll(async () => {
    // Final cleanup and close connection
    await redis.quit();
  });

  describe('recordFailedAttempt()', () => {
    describe('First failed attempt', () => {
      it('should increment counter and return 4 remaining attempts', async () => {
        const identifier = `test-user-${Date.now()}@example.com`;

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(4);
        expect(result.lockoutUntil).toBeUndefined();

        // Verify counter in Redis
        const attempts = await redis.get(`failed_auth:${identifier}`);
        expect(attempts).toBe('1');
      });

      it('should set 15-minute (900s) expiry on first attempt', async () => {
        const identifier = `test-expiry-${Date.now()}@example.com`;

        await service.recordFailedAttempt(identifier);

        const ttl = await redis.ttl(`failed_auth:${identifier}`);
        expect(ttl).toBeGreaterThan(890); // At least 14m 50s
        expect(ttl).toBeLessThanOrEqual(900); // At most 15m
      });
    });

    describe('Subsequent failed attempts', () => {
      it('should increment counter without resetting expiry on second attempt', async () => {
        const identifier = `test-second-${Date.now()}@example.com`;

        // First attempt
        await service.recordFailedAttempt(identifier);
        const ttlAfterFirst = await redis.ttl(`failed_auth:${identifier}`);

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 100));

        // Second attempt
        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(3);

        // Verify counter
        const attempts = await redis.get(`failed_auth:${identifier}`);
        expect(attempts).toBe('2');

        // TTL should be same or less (not reset to 900)
        // Redis TTL has 1-second granularity, so may be equal on rapid calls
        const ttlAfterSecond = await redis.ttl(`failed_auth:${identifier}`);
        expect(ttlAfterSecond).toBeLessThanOrEqual(ttlAfterFirst);
      });

      it('should return 2 remaining attempts on third attempt', async () => {
        const identifier = `test-third-${Date.now()}@example.com`;

        await service.recordFailedAttempt(identifier);
        await service.recordFailedAttempt(identifier);
        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(2);

        const attempts = await redis.get(`failed_auth:${identifier}`);
        expect(attempts).toBe('3');
      });

      it('should return 1 remaining attempt on fourth attempt', async () => {
        const identifier = `test-fourth-${Date.now()}@example.com`;

        await service.recordFailedAttempt(identifier);
        await service.recordFailedAttempt(identifier);
        await service.recordFailedAttempt(identifier);
        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(1);

        const attempts = await redis.get(`failed_auth:${identifier}`);
        expect(attempts).toBe('4');
      });
    });

    describe('Account lockout on max attempts', () => {
      it('should lock account on 5th attempt', async () => {
        const identifier = `test-lockout-${Date.now()}@example.com`;

        // 4 failed attempts
        await service.recordFailedAttempt(identifier);
        await service.recordFailedAttempt(identifier);
        await service.recordFailedAttempt(identifier);
        await service.recordFailedAttempt(identifier);

        // 5th attempt should trigger lockout
        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingAttempts).toBe(0);
        expect(result.lockoutUntil).toBeInstanceOf(Date);

        // Verify lock key exists in Redis
        const lockExists = await redis.get(`auth_lock:${identifier}`);
        expect(lockExists).toBe('locked');

        // Verify failed attempts counter was cleared
        const attempts = await redis.get(`failed_auth:${identifier}`);
        expect(attempts).toBeNull();
      });

      it('should set 15-minute lockout duration', async () => {
        const identifier = `test-lockout-duration-${Date.now()}@example.com`;

        // Trigger lockout
        for (let i = 0; i < 5; i++) {
          await service.recordFailedAttempt(identifier);
        }

        // Check lock TTL
        const ttl = await redis.ttl(`auth_lock:${identifier}`);
        expect(ttl).toBeGreaterThan(890); // At least 14m 50s
        expect(ttl).toBeLessThanOrEqual(900); // At most 15m
      });

      it('should calculate correct lockoutUntil timestamp', async () => {
        const identifier = `test-lockout-timestamp-${Date.now()}@example.com`;

        const beforeLockout = Date.now();
        
        // Trigger lockout
        for (let i = 0; i < 5; i++) {
          await service.recordFailedAttempt(identifier);
        }

        const result = await service.recordFailedAttempt(identifier);
        const afterLockout = Date.now();

        expect(result.lockoutUntil).toBeInstanceOf(Date);
        const lockoutTime = result.lockoutUntil!.getTime();
        
        // Should be approximately 15 minutes (900s) from now
        const minExpected = beforeLockout + (890 * 1000); // 14m 50s
        const maxExpected = afterLockout + (900 * 1000); // 15m
        
        expect(lockoutTime).toBeGreaterThanOrEqual(minExpected);
        expect(lockoutTime).toBeLessThanOrEqual(maxExpected);
      });
    });

    describe('Already locked account', () => {
      it('should return locked status immediately when already locked', async () => {
        const identifier = `test-already-locked-${Date.now()}@example.com`;

        // Trigger lockout
        for (let i = 0; i < 5; i++) {
          await service.recordFailedAttempt(identifier);
        }

        // Try another attempt while locked
        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingAttempts).toBe(0);
        expect(result.lockoutUntil).toBeInstanceOf(Date);
      });

      it('should return lockoutUntil based on remaining TTL', async () => {
        const identifier = `test-lockout-ttl-${Date.now()}@example.com`;

        // Trigger lockout
        for (let i = 0; i < 5; i++) {
          await service.recordFailedAttempt(identifier);
        }

        // Wait a moment to let some TTL expire
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check lockout info
        const result = await service.recordFailedAttempt(identifier);
        const ttl = await redis.ttl(`auth_lock:${identifier}`);

        expect(result.lockoutUntil).toBeInstanceOf(Date);
        
        // The lockoutUntil should match the TTL
        const expectedLockoutTime = Date.now() + (ttl * 1000);
        const actualLockoutTime = result.lockoutUntil!.getTime();
        
        // Allow 1 second tolerance
        expect(Math.abs(actualLockoutTime - expectedLockoutTime)).toBeLessThan(1000);
      });
    });
  });

  describe('clearFailedAttempts()', () => {
    it('should delete failed_auth key from Redis', async () => {
      const identifier = `test-clear-${Date.now()}@example.com`;

      // Record some failed attempts
      await service.recordFailedAttempt(identifier);
      await service.recordFailedAttempt(identifier);

      // Verify counter exists
      const beforeClear = await redis.get(`failed_auth:${identifier}`);
      expect(beforeClear).toBe('2');

      // Clear attempts
      await service.clearFailedAttempts(identifier);

      // Verify counter is deleted
      const afterClear = await redis.get(`failed_auth:${identifier}`);
      expect(afterClear).toBeNull();
    });

    it('should handle non-existent keys gracefully', async () => {
      const identifier = `test-nonexistent-${Date.now()}@example.com`;

      // Should not throw error
      await expect(
        service.clearFailedAttempts(identifier)
      ).resolves.not.toThrow();
    });

    it('should not affect lock keys', async () => {
      const identifier = `test-clear-not-lock-${Date.now()}@example.com`;

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(identifier);
      }

      // Verify lock exists
      const lockBefore = await redis.get(`auth_lock:${identifier}`);
      expect(lockBefore).toBe('locked');

      // Clear attempts (should not clear lock)
      await service.clearFailedAttempts(identifier);

      // Lock should still exist
      const lockAfter = await redis.get(`auth_lock:${identifier}`);
      expect(lockAfter).toBe('locked');
    });
  });

  describe('isLocked()', () => {
    it('should return true when account is locked', async () => {
      const identifier = `test-is-locked-true-${Date.now()}@example.com`;

      // Trigger lockout
      for (let i = 0; i < 5; i++) {
        await service.recordFailedAttempt(identifier);
      }

      const isLocked = await service.isLocked(identifier);

      expect(isLocked).toBe(true);
    });

    it('should return false when account is not locked', async () => {
      const identifier = `test-is-locked-false-${Date.now()}@example.com`;

      const isLocked = await service.isLocked(identifier);

      expect(isLocked).toBe(false);
    });

    it('should return false when lock has expired', async () => {
      const identifier = `test-lock-expired-${Date.now()}@example.com`;

      // Manually set a lock with 1 second TTL
      await redis.setex(`auth_lock:${identifier}`, 1, 'locked');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      const isLocked = await service.isLocked(identifier);

      expect(isLocked).toBe(false);
    });

    it('should return false after failed attempts but before lockout', async () => {
      const identifier = `test-before-lockout-${Date.now()}@example.com`;

      // 4 failed attempts (not locked yet)
      await service.recordFailedAttempt(identifier);
      await service.recordFailedAttempt(identifier);
      await service.recordFailedAttempt(identifier);
      await service.recordFailedAttempt(identifier);

      const isLocked = await service.isLocked(identifier);

      expect(isLocked).toBe(false);
    });
  });

  describe('getLockInfo()', () => {
    describe('When account is locked', () => {
      it('should return locked:true with remainingTime', async () => {
        const identifier = `test-lock-info-${Date.now()}@example.com`;

        // Trigger lockout
        for (let i = 0; i < 5; i++) {
          await service.recordFailedAttempt(identifier);
        }

        const lockInfo = await service.getLockInfo(identifier);

        expect(lockInfo.locked).toBe(true);
        expect(lockInfo.remainingTime).toBeDefined();
        expect(lockInfo.remainingTime).toBeGreaterThan(0);
        expect(lockInfo.remainingTime).toBeLessThanOrEqual(900);
      });

      it('should return accurate remaining time', async () => {
        const identifier = `test-remaining-time-${Date.now()}@example.com`;

        // Trigger lockout
        for (let i = 0; i < 5; i++) {
          await service.recordFailedAttempt(identifier);
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 500));

        const lockInfo = await service.getLockInfo(identifier);
        const actualTTL = await redis.ttl(`auth_lock:${identifier}`);

        // Should match actual TTL (within 1 second tolerance)
        expect(Math.abs(lockInfo.remainingTime! - actualTTL)).toBeLessThan(1);
      });
    });

    describe('When account is not locked', () => {
      it('should return locked:false when no lock exists', async () => {
        const identifier = `test-no-lock-${Date.now()}@example.com`;

        const lockInfo = await service.getLockInfo(identifier);

        expect(lockInfo.locked).toBe(false);
        expect(lockInfo.remainingTime).toBeUndefined();
      });

      it('should return locked:false when TTL is 0', async () => {
        const identifier = `test-ttl-zero-${Date.now()}@example.com`;

        // Manually set lock with instant expiration
        await redis.setex(`auth_lock:${identifier}`, 1, 'locked');
        await new Promise(resolve => setTimeout(resolve, 1100));

        const lockInfo = await service.getLockInfo(identifier);

        expect(lockInfo.locked).toBe(false);
        expect(lockInfo.remainingTime).toBeUndefined();
      });

      it('should return locked:false when TTL is negative', async () => {
        const identifier = `test-ttl-negative-${Date.now()}@example.com`;

        const lockInfo = await service.getLockInfo(identifier);

        expect(lockInfo.locked).toBe(false);
      });
    });
  });

  describe('Edge Cases & Concurrent Access', () => {
    it('should handle multiple identifiers independently', async () => {
      const identifier1 = `test-multi-1-${Date.now()}@example.com`;
      const identifier2 = `test-multi-2-${Date.now()}@example.com`;

      // Record different numbers of attempts
      await service.recordFailedAttempt(identifier1);
      await service.recordFailedAttempt(identifier1);
      
      await service.recordFailedAttempt(identifier2);
      await service.recordFailedAttempt(identifier2);
      await service.recordFailedAttempt(identifier2);
      await service.recordFailedAttempt(identifier2);

      // Check each independently
      const result1 = await service.recordFailedAttempt(identifier1);
      const result2 = await service.recordFailedAttempt(identifier2);

      expect(result1.remainingAttempts).toBe(2); // 3rd attempt
      expect(result2.locked).toBe(true); // 5th attempt - locked
    });

    it('should handle rapid successive attempts', async () => {
      const identifier = `test-rapid-${Date.now()}@example.com`;

      // Rapid fire 5 attempts
      const results = await Promise.all([
        service.recordFailedAttempt(identifier),
        service.recordFailedAttempt(identifier),
        service.recordFailedAttempt(identifier),
        service.recordFailedAttempt(identifier),
        service.recordFailedAttempt(identifier),
      ]);

      // Last result should show lock
      const finalResult = results[results.length - 1];
      expect(finalResult.locked).toBe(true);
    });
  });
});
