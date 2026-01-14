import { testPool, testRedis, cleanupAll, closeConnections, TEST_TENANT_ID } from './setup';
import { LockoutService } from '../../src/services/lockout.service';

// Override redis import
jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock env for configurable values
jest.mock('../../src/config/env', () => ({
  env: {
    LOCKOUT_MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
  },
}));

describe('LockoutService Integration Tests', () => {
  let lockoutService: LockoutService;
  const TEST_USER_ID = '00000000-0000-0000-0000-000000000001';
  const TEST_IP = '192.168.1.100';

  beforeAll(async () => {
    lockoutService = new LockoutService();
  });

  beforeEach(async () => {
    await cleanupAll();
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  describe('recordFailedAttempt', () => {
    it('should increment user attempt counter', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      const userKey = `lockout:user:${TEST_USER_ID}`;
      const attempts = await testRedis.get(userKey);

      expect(attempts).toBe('1');
    });

    it('should increment IP attempt counter', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      const ipKey = `lockout:ip:${TEST_IP}`;
      const attempts = await testRedis.get(ipKey);

      expect(attempts).toBe('1');
    });

    it('should set TTL on first attempt', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      const userKey = `lockout:user:${TEST_USER_ID}`;
      const ttl = await testRedis.ttl(userKey);

      // Should be approximately 15 minutes (900 seconds)
      expect(ttl).toBeGreaterThan(850);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should track multiple attempts', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      const userKey = `lockout:user:${TEST_USER_ID}`;
      const attempts = await testRedis.get(userKey);

      expect(attempts).toBe('3');
    });

    it('should throw RateLimitError after max user attempts', async () => {
      // Record 4 attempts
      for (let i = 0; i < 4; i++) {
        await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      }

      // 5th attempt should throw
      await expect(
        lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP)
      ).rejects.toThrow(/locked/i);
    });

    it('should throw RateLimitError after max IP attempts', async () => {
      // IP limit is 2x user limit (10 attempts)
      // Use unique user IDs to avoid user lockout first
      for (let i = 0; i < 9; i++) {
        const userId = `user-${i}`;
        await lockoutService.recordFailedAttempt(userId, TEST_IP);
      }

      // 10th attempt should throw (either user or IP locked message)
      await expect(
        lockoutService.recordFailedAttempt('another-user', TEST_IP)
      ).rejects.toThrow(/locked|failed attempts/i);
    });

    it('should include TTL in error message', async () => {
      for (let i = 0; i < 4; i++) {
        await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      }

      try {
        await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/Try again in \d+ minutes/);
      }
    });
  });

  describe('checkLockout', () => {
    it('should not throw when under limit', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      await expect(
        lockoutService.checkLockout(TEST_USER_ID, TEST_IP)
      ).resolves.not.toThrow();
    });

    it('should throw when user is locked', async () => {
      // Manually set high attempt count
      const userKey = `lockout:user:${TEST_USER_ID}`;
      await testRedis.setex(userKey, 900, '5');

      await expect(
        lockoutService.checkLockout(TEST_USER_ID, TEST_IP)
      ).rejects.toThrow(/locked/i);
    });

    it('should throw when IP is locked', async () => {
      // Manually set high IP attempt count
      const ipKey = `lockout:ip:${TEST_IP}`;
      await testRedis.setex(ipKey, 900, '10');

      await expect(
        lockoutService.checkLockout(TEST_USER_ID, TEST_IP)
      ).rejects.toThrow(/failed attempts/i);
    });

    it('should allow access for new user/IP', async () => {
      await expect(
        lockoutService.checkLockout('new-user', '10.0.0.1')
      ).resolves.not.toThrow();
    });
  });

  describe('clearFailedAttempts', () => {
    it('should clear user attempts', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      await lockoutService.clearFailedAttempts(TEST_USER_ID, TEST_IP);

      const userKey = `lockout:user:${TEST_USER_ID}`;
      const attempts = await testRedis.get(userKey);

      expect(attempts).toBeNull();
    });

    it('should clear IP attempts', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);

      await lockoutService.clearFailedAttempts(TEST_USER_ID, TEST_IP);

      const ipKey = `lockout:ip:${TEST_IP}`;
      const attempts = await testRedis.get(ipKey);

      expect(attempts).toBeNull();
    });

    it('should allow login after clearing', async () => {
      // Get close to lockout
      for (let i = 0; i < 4; i++) {
        await lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP);
      }

      await lockoutService.clearFailedAttempts(TEST_USER_ID, TEST_IP);

      // Should be able to fail again without lockout
      await expect(
        lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP)
      ).resolves.not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent attempts', async () => {
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(lockoutService.recordFailedAttempt(TEST_USER_ID, TEST_IP));
      }

      await Promise.all(promises);

      const userKey = `lockout:user:${TEST_USER_ID}`;
      const attempts = await testRedis.get(userKey);

      expect(parseInt(attempts!)).toBe(3);
    });

    it('should not cross-pollute different users', async () => {
      await lockoutService.recordFailedAttempt('user-a', TEST_IP);
      await lockoutService.recordFailedAttempt('user-a', TEST_IP);
      await lockoutService.recordFailedAttempt('user-b', TEST_IP);

      const userAKey = `lockout:user:user-a`;
      const userBKey = `lockout:user:user-b`;

      expect(await testRedis.get(userAKey)).toBe('2');
      expect(await testRedis.get(userBKey)).toBe('1');
    });

    it('should not cross-pollute different IPs', async () => {
      await lockoutService.recordFailedAttempt(TEST_USER_ID, '10.0.0.1');
      await lockoutService.recordFailedAttempt(TEST_USER_ID, '10.0.0.1');
      await lockoutService.recordFailedAttempt(TEST_USER_ID, '10.0.0.2');

      const ip1Key = `lockout:ip:10.0.0.1`;
      const ip2Key = `lockout:ip:10.0.0.2`;

      expect(await testRedis.get(ip1Key)).toBe('2');
      expect(await testRedis.get(ip2Key)).toBe('1');
    });
  });
});
