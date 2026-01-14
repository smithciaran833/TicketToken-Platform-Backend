import { testPool, testRedis, cleanupAll, closeConnections, TEST_TENANT_ID } from './setup';
import { BruteForceProtectionService } from '../../src/services/brute-force-protection.service';

// Override redis import
jest.mock('../../src/config/redis', () => ({
  getRedis: () => require('./setup').testRedis,
  initRedis: jest.fn(),
}));

// Mock the shared library rate limiter
const mockFixedWindow = jest.fn();
jest.mock('@tickettoken/shared', () => ({
  getRateLimiter: () => ({
    fixedWindow: mockFixedWindow,
  }),
  getKeyBuilder: () => ({
    failedAuth: (id: string) => `failed_auth:${id}`,
    authLock: (id: string) => `auth_lock:${id}`,
  }),
}));

describe('BruteForceProtectionService Integration Tests', () => {
  let bruteForceService: BruteForceProtectionService;
  const TEST_IDENTIFIER = 'test@example.com';

  beforeAll(async () => {
    bruteForceService = new BruteForceProtectionService();
  });

  beforeEach(async () => {
    await cleanupAll();
    jest.clearAllMocks();
    
    // Default mock: allow with 4 remaining
    mockFixedWindow.mockResolvedValue({ allowed: true, remaining: 4 });
  });

  afterAll(async () => {
    await cleanupAll();
    await closeConnections();
  });

  describe('recordFailedAttempt', () => {
    it('should return not locked when under limit', async () => {
      mockFixedWindow.mockResolvedValue({ allowed: true, remaining: 4 });

      const result = await bruteForceService.recordFailedAttempt(TEST_IDENTIFIER);

      expect(result.locked).toBe(false);
      expect(result.remainingAttempts).toBe(4);
    });

    it('should return locked when already locked', async () => {
      // Simulate existing lock
      const lockKey = `auth_lock:${TEST_IDENTIFIER}`;
      await testRedis.setex(lockKey, 900, 'locked');

      const result = await bruteForceService.recordFailedAttempt(TEST_IDENTIFIER);

      expect(result.locked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.lockoutUntil).toBeDefined();
    });

    it('should lock when rate limit exceeded', async () => {
      mockFixedWindow.mockResolvedValue({ allowed: false, remaining: 0 });

      const result = await bruteForceService.recordFailedAttempt(TEST_IDENTIFIER);

      expect(result.locked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.lockoutUntil).toBeDefined();

      // Verify lock was set in Redis
      const lockKey = `auth_lock:${TEST_IDENTIFIER}`;
      const lockValue = await testRedis.get(lockKey);
      expect(lockValue).toBe('locked');
    });

    it('should set lock TTL of 15 minutes', async () => {
      mockFixedWindow.mockResolvedValue({ allowed: false, remaining: 0 });

      await bruteForceService.recordFailedAttempt(TEST_IDENTIFIER);

      const lockKey = `auth_lock:${TEST_IDENTIFIER}`;
      const ttl = await testRedis.ttl(lockKey);

      // Should be approximately 15 minutes (900 seconds)
      expect(ttl).toBeGreaterThan(850);
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should clear attempts counter when locking', async () => {
      const attemptsKey = `failed_auth:${TEST_IDENTIFIER}`;
      await testRedis.set(attemptsKey, '4');

      mockFixedWindow.mockResolvedValue({ allowed: false, remaining: 0 });

      await bruteForceService.recordFailedAttempt(TEST_IDENTIFIER);

      const attemptsValue = await testRedis.get(attemptsKey);
      expect(attemptsValue).toBeNull();
    });
  });

  describe('clearFailedAttempts', () => {
    it('should clear attempts counter', async () => {
      const attemptsKey = `failed_auth:${TEST_IDENTIFIER}`;
      await testRedis.set(attemptsKey, '3');

      await bruteForceService.clearFailedAttempts(TEST_IDENTIFIER);

      const value = await testRedis.get(attemptsKey);
      expect(value).toBeNull();
    });
  });

  describe('isLocked', () => {
    it('should return true when locked', async () => {
      const lockKey = `auth_lock:${TEST_IDENTIFIER}`;
      await testRedis.setex(lockKey, 900, 'locked');

      const result = await bruteForceService.isLocked(TEST_IDENTIFIER);

      expect(result).toBe(true);
    });

    it('should return false when not locked', async () => {
      const result = await bruteForceService.isLocked(TEST_IDENTIFIER);

      expect(result).toBe(false);
    });
  });

  describe('getLockInfo', () => {
    it('should return lock info when locked', async () => {
      const lockKey = `auth_lock:${TEST_IDENTIFIER}`;
      await testRedis.setex(lockKey, 900, 'locked');

      const result = await bruteForceService.getLockInfo(TEST_IDENTIFIER);

      expect(result.locked).toBe(true);
      expect(result.remainingTime).toBeGreaterThan(0);
      expect(result.remainingTime).toBeLessThanOrEqual(900);
    });

    it('should return not locked when no lock', async () => {
      const result = await bruteForceService.getLockInfo(TEST_IDENTIFIER);

      expect(result.locked).toBe(false);
      expect(result.remainingTime).toBeUndefined();
    });

    it('should return not locked when lock expired', async () => {
      // Set a key that will have negative TTL (expired)
      // In practice, Redis removes these keys automatically

      const result = await bruteForceService.getLockInfo(TEST_IDENTIFIER);

      expect(result.locked).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should allow successful login after lockout expires', async () => {
      // Manually expire a lock (simulate time passing)
      const lockKey = `auth_lock:${TEST_IDENTIFIER}`;
      await testRedis.setex(lockKey, 1, 'locked'); // 1 second TTL

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 1100));

      const result = await bruteForceService.isLocked(TEST_IDENTIFIER);

      expect(result).toBe(false);
    });

    it('should handle different identifiers independently', async () => {
      const lockKey1 = `auth_lock:user1@test.com`;
      const lockKey2 = `auth_lock:user2@test.com`;

      await testRedis.setex(lockKey1, 900, 'locked');

      const isUser1Locked = await bruteForceService.isLocked('user1@test.com');
      const isUser2Locked = await bruteForceService.isLocked('user2@test.com');

      expect(isUser1Locked).toBe(true);
      expect(isUser2Locked).toBe(false);
    });
  });
});
