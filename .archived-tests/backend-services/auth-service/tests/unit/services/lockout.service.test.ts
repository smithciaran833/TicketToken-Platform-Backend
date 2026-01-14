import { LockoutService } from '../../../src/services/lockout.service';
import { redis } from '../../../src/config/redis';

jest.mock('../../../src/config/redis');

describe('LockoutService', () => {
  let lockoutService: LockoutService;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    lockoutService = new LockoutService();
    mockRedis = redis as jest.Mocked<typeof redis>;
    jest.clearAllMocks();
  });

  describe('recordFailedAttempt', () => {
    it('should increment failed attempt counter', async () => {
      mockRedis.incr = jest.fn().mockResolvedValue(1);
      mockRedis.expire = jest.fn().mockResolvedValue(1);

      await lockoutService.recordFailedAttempt('user-123', '192.168.1.1');

      expect(mockRedis.incr).toHaveBeenCalledWith('lockout:user-123');
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should set expiry on first failed attempt', async () => {
      mockRedis.incr = jest.fn().mockResolvedValue(1);
      mockRedis.expire = jest.fn().mockResolvedValue(1);

      await lockoutService.recordFailedAttempt('user-123', '192.168.1.1');

      expect(mockRedis.expire).toHaveBeenCalledWith(
        'lockout:user-123',
        expect.any(Number)
      );
    });

    it('should track attempts by IP address', async () => {
      mockRedis.incr = jest.fn().mockResolvedValue(2);
      mockRedis.expire = jest.fn().mockResolvedValue(1);

      await lockoutService.recordFailedAttempt('user-123', '10.0.0.1');

      expect(mockRedis.incr).toHaveBeenCalledWith('lockout:ip:10.0.0.1');
    });

    it('should handle concurrent failed attempts', async () => {
      mockRedis.incr = jest.fn().mockResolvedValue(5);
      mockRedis.expire = jest.fn().mockResolvedValue(1);

      await Promise.all([
        lockoutService.recordFailedAttempt('user-123', '10.0.0.1'),
        lockoutService.recordFailedAttempt('user-123', '10.0.0.1'),
        lockoutService.recordFailedAttempt('user-123', '10.0.0.1'),
      ]);

      expect(mockRedis.incr).toHaveBeenCalledTimes(6); // 3 for user, 3 for IP
    });
  });

  describe('checkLockout', () => {
    it('should not lock on first few failed attempts', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('3');

      await expect(
        lockoutService.checkLockout('user-123', '10.0.0.1')
      ).resolves.not.toThrow();
    });

    it('should lock account after threshold exceeded', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('6');

      await expect(
        lockoutService.checkLockout('user-123', '10.0.0.1')
      ).rejects.toThrow('Account locked');
    });

    it('should provide unlock time in error', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('10');
      mockRedis.ttl = jest.fn().mockResolvedValue(1800); // 30 minutes

      try {
        await lockoutService.checkLockout('user-123', '10.0.0.1');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toContain('Account locked');
        expect(error.unlockAt).toBeDefined();
      }
    });

    it('should check both user and IP lockout', async () => {
      mockRedis.get = jest.fn()
        .mockResolvedValueOnce('3') // user attempts
        .mockResolvedValueOnce('10'); // IP attempts (high)

      await expect(
        lockoutService.checkLockout('user-123', '10.0.0.1')
      ).rejects.toThrow();
    });

    it('should allow login if no failed attempts', async () => {
      mockRedis.get = jest.fn().mockResolvedValue(null);

      await expect(
        lockoutService.checkLockout('user-123', '10.0.0.1')
      ).resolves.not.toThrow();
    });
  });

  describe('clearFailedAttempts', () => {
    it('should clear user lockout counter', async () => {
      mockRedis.del = jest.fn().mockResolvedValue(1);

      await lockoutService.clearFailedAttempts('user-123', '10.0.0.1');

      expect(mockRedis.del).toHaveBeenCalledWith('lockout:user-123');
    });

    it('should clear IP lockout counter', async () => {
      mockRedis.del = jest.fn().mockResolvedValue(1);

      await lockoutService.clearFailedAttempts('user-123', '10.0.0.1');

      expect(mockRedis.del).toHaveBeenCalledWith('lockout:ip:10.0.0.1');
    });

    it('should clear both counters on successful login', async () => {
      mockRedis.del = jest.fn().mockResolvedValue(1);

      await lockoutService.clearFailedAttempts('user-123', '192.168.1.1');

      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });
  });

  describe('isLocked', () => {
    it('should return true if account is locked', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('10');

      const locked = await lockoutService.isLocked('user-123');

      expect(locked).toBe(true);
    });

    it('should return false if account is not locked', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('2');

      const locked = await lockoutService.isLocked('user-123');

      expect(locked).toBe(false);
    });

    it('should return false if no attempts recorded', async () => {
      mockRedis.get = jest.fn().mockResolvedValue(null);

      const locked = await lockoutService.isLocked('user-123');

      expect(locked).toBe(false);
    });
  });

  describe('getAttemptCount', () => {
    it('should return current attempt count', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('4');

      const count = await lockoutService.getAttemptCount('user-123');

      expect(count).toBe(4);
    });

    it('should return 0 if no attempts', async () => {
      mockRedis.get = jest.fn().mockResolvedValue(null);

      const count = await lockoutService.getAttemptCount('user-123');

      expect(count).toBe(0);
    });
  });

  describe('getRemainingAttempts', () => {
    it('should calculate remaining attempts', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('2');
      const MAX_ATTEMPTS = 5;

      const remaining = await lockoutService.getRemainingAttempts('user-123');

      expect(remaining).toBe(MAX_ATTEMPTS - 2);
    });

    it('should return 0 if account is locked', async () => {
      mockRedis.get = jest.fn().mockResolvedValue('10');

      const remaining = await lockoutService.getRemainingAttempts('user-123');

      expect(remaining).toBe(0);
    });
  });
});
