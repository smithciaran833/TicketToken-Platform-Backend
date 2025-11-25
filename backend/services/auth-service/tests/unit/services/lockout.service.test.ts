import { LockoutService } from '../../../src/services/lockout.service';
import { RateLimitError } from '../../../src/errors';

// Mock dependencies
jest.mock('../../../src/config/redis', () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  }
}));

jest.mock('../../../src/config/env', () => ({
  env: {
    LOCKOUT_MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
  }
}));

import { redis } from '../../../src/config/redis';

describe('LockoutService', () => {
  let service: LockoutService;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    mockRedis = redis as jest.Mocked<typeof redis>;
    service = new LockoutService();
    jest.clearAllMocks();
  });

  describe('recordFailedAttempt', () => {
    const userId = 'user-123';
    const ipAddress = '192.168.1.1';

    describe('when recording first failed attempt', () => {
      it('should increment counters and set expiry for both user and IP', async () => {
        mockRedis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

        await service.recordFailedAttempt(userId, ipAddress);

        expect(mockRedis.incr).toHaveBeenCalledWith(`lockout:user:${userId}`);
        expect(mockRedis.incr).toHaveBeenCalledWith(`lockout:ip:${ipAddress}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`lockout:user:${userId}`, 900);
        expect(mockRedis.expire).toHaveBeenCalledWith(`lockout:ip:${ipAddress}`, 900);
      });
    });

    describe('when recording subsequent attempts below threshold', () => {
      it('should increment counters without setting expiry', async () => {
        mockRedis.incr.mockResolvedValueOnce(2).mockResolvedValueOnce(3);

        await service.recordFailedAttempt(userId, ipAddress);

        expect(mockRedis.incr).toHaveBeenCalledTimes(2);
        expect(mockRedis.expire).not.toHaveBeenCalled();
      });

      it('should allow attempts below max threshold', async () => {
        mockRedis.incr.mockResolvedValueOnce(4).mockResolvedValueOnce(8);

        await service.recordFailedAttempt(userId, ipAddress);

        expect(mockRedis.incr).toHaveBeenCalledTimes(2);
      });
    });

    describe('when max user attempts reached', () => {
      it('should throw RateLimitError when user reaches max attempts', async () => {
        mockRedis.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
        mockRedis.ttl.mockResolvedValue(600);

        await expect(service.recordFailedAttempt(userId, ipAddress))
          .rejects.toThrow(RateLimitError);

        expect(mockRedis.ttl).toHaveBeenCalledWith(`lockout:user:${userId}`);
      });

      it('should throw error with correct message and ttl', async () => {
        mockRedis.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(3);
        mockRedis.ttl.mockResolvedValue(900);

        try {
          await service.recordFailedAttempt(userId, ipAddress);
          fail('Should have thrown RateLimitError');
        } catch (error) {
          expect(error).toBeInstanceOf(RateLimitError);
          expect((error as RateLimitError).message).toContain('Account locked due to too many failed attempts');
          expect((error as RateLimitError).message).toContain('15 minutes');
        }
      });
    });

    describe('when max IP attempts reached', () => {
      it('should throw RateLimitError when IP reaches double max attempts', async () => {
        mockRedis.incr.mockResolvedValueOnce(3).mockResolvedValueOnce(10);
        mockRedis.ttl.mockResolvedValue(600);

        await expect(service.recordFailedAttempt(userId, ipAddress))
          .rejects.toThrow(RateLimitError);

        expect(mockRedis.ttl).toHaveBeenCalledWith(`lockout:ip:${ipAddress}`);
      });

      it('should check IP threshold at 2x max attempts', async () => {
        mockRedis.incr.mockResolvedValueOnce(2).mockResolvedValueOnce(10);
        mockRedis.ttl.mockResolvedValue(420);

        await expect(service.recordFailedAttempt(userId, ipAddress))
          .rejects.toThrow(RateLimitError);
      });
    });
  });

  describe('checkLockout', () => {
    const userId = 'user-123';
    const ipAddress = '192.168.1.1';

    describe('when user is not locked out', () => {
      it('should not throw error when attempts are below threshold', async () => {
        mockRedis.get.mockResolvedValueOnce('3').mockResolvedValueOnce('5');

        await expect(service.checkLockout(userId, ipAddress)).resolves.not.toThrow();
      });

      it('should not throw error when no attempts recorded', async () => {
        mockRedis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

        await expect(service.checkLockout(userId, ipAddress)).resolves.not.toThrow();
      });
    });

    describe('when user lockout threshold reached', () => {
      it('should throw RateLimitError when user attempts at max', async () => {
        mockRedis.get.mockResolvedValueOnce('5').mockResolvedValueOnce('3');
        mockRedis.ttl.mockResolvedValue(600);

        await expect(service.checkLockout(userId, ipAddress))
          .rejects.toThrow(RateLimitError);

        expect(mockRedis.ttl).toHaveBeenCalledWith(`lockout:user:${userId}`);
      });

      it('should throw with correct error message for user lockout', async () => {
        mockRedis.get.mockResolvedValueOnce('6').mockResolvedValueOnce('2');
        mockRedis.ttl.mockResolvedValue(720);

        try {
          await service.checkLockout(userId, ipAddress);
          fail('Should have thrown RateLimitError');
        } catch (error) {
          expect(error).toBeInstanceOf(RateLimitError);
          expect((error as RateLimitError).message).toContain('Account locked due to too many failed attempts');
          expect((error as RateLimitError).message).toContain('12 minutes');
        }
      });
    });

    describe('when IP lockout threshold reached', () => {
      it('should throw RateLimitError when IP attempts at 2x max', async () => {
        mockRedis.get.mockResolvedValueOnce('3').mockResolvedValueOnce('10');
        mockRedis.ttl.mockResolvedValue(600);

        await expect(service.checkLockout(userId, ipAddress))
          .rejects.toThrow(RateLimitError);

        expect(mockRedis.ttl).toHaveBeenCalledWith(`lockout:ip:${ipAddress}`);
      });

      it('should throw with correct error message for IP lockout', async () => {
        mockRedis.get.mockResolvedValueOnce('2').mockResolvedValueOnce('11');
        mockRedis.ttl.mockResolvedValue(480);

        try {
          await service.checkLockout(userId, ipAddress);
          fail('Should have thrown RateLimitError');
        } catch (error) {
          expect(error).toBeInstanceOf(RateLimitError);
          expect((error as RateLimitError).message).toContain('Too many failed attempts from this IP');
          expect((error as RateLimitError).message).toContain('8 minutes');
        }
      });
    });
  });

  describe('clearFailedAttempts', () => {
    const userId = 'user-123';
    const ipAddress = '192.168.1.1';

    it('should delete both user and IP lockout keys', async () => {
      await service.clearFailedAttempts(userId, ipAddress);

      expect(mockRedis.del).toHaveBeenCalledWith(`lockout:user:${userId}`);
      expect(mockRedis.del).toHaveBeenCalledWith(`lockout:ip:${ipAddress}`);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
    });

    it('should work even if keys do not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      await service.clearFailedAttempts(userId, ipAddress);

      expect(mockRedis.del).toHaveBeenCalledWith(`lockout:user:${userId}`);
      expect(mockRedis.del).toHaveBeenCalledWith(`lockout:ip:${ipAddress}`);
    });
  });
});
