import { BruteForceProtectionService } from '../../../src/services/brute-force-protection.service';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis');

describe('BruteForceProtectionService', () => {
  let service: BruteForceProtectionService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    // Create fresh mock Redis instance
    mockRedis = {
      get: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      ttl: jest.fn(),
    } as any;

    service = new BruteForceProtectionService(mockRedis);
    jest.clearAllMocks();
  });

  describe('recordFailedAttempt', () => {
    const identifier = 'user@example.com';

    describe('when account is already locked', () => {
      it('should return locked status with lockoutUntil date', async () => {
        const ttlSeconds = 600; // 10 minutes remaining
        mockRedis.get.mockResolvedValue('locked');
        mockRedis.ttl.mockResolvedValue(ttlSeconds);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingAttempts).toBe(0);
        expect(result.lockoutUntil).toBeInstanceOf(Date);
        expect(mockRedis.get).toHaveBeenCalledWith(`auth_lock:${identifier}`);
        expect(mockRedis.ttl).toHaveBeenCalledWith(`auth_lock:${identifier}`);
      });
    });

    describe('when recording first failed attempt', () => {
      it('should increment counter and set expiry', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValue(1);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(4);
        expect(result.lockoutUntil).toBeUndefined();
        expect(mockRedis.incr).toHaveBeenCalledWith(`failed_auth:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`failed_auth:${identifier}`, 900);
      });
    });

    describe('when recording subsequent failed attempts', () => {
      it('should increment counter without setting expiry on second attempt', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValue(2);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(3);
        expect(mockRedis.incr).toHaveBeenCalledWith(`failed_auth:${identifier}`);
        expect(mockRedis.expire).not.toHaveBeenCalled();
      });

      it('should return correct remaining attempts on third attempt', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValue(3);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(2);
      });

      it('should return correct remaining attempts on fourth attempt', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValue(4);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingAttempts).toBe(1);
      });
    });

    describe('when max attempts reached', () => {
      it('should lock account on fifth attempt', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValue(5);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingAttempts).toBe(0);
        expect(result.lockoutUntil).toBeInstanceOf(Date);
        expect(mockRedis.setex).toHaveBeenCalledWith(`auth_lock:${identifier}`, 900, 'locked');
        expect(mockRedis.del).toHaveBeenCalledWith(`failed_auth:${identifier}`);
      });

      it('should lock account when attempts exceed max', async () => {
        mockRedis.get.mockResolvedValue(null);
        mockRedis.incr.mockResolvedValue(6);

        const result = await service.recordFailedAttempt(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingAttempts).toBe(0);
        expect(mockRedis.setex).toHaveBeenCalledWith(`auth_lock:${identifier}`, 900, 'locked');
      });
    });
  });

  describe('clearFailedAttempts', () => {
    const identifier = 'user@example.com';

    it('should delete failed attempts key from Redis', async () => {
      await service.clearFailedAttempts(identifier);

      expect(mockRedis.del).toHaveBeenCalledWith(`failed_auth:${identifier}`);
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
    });

    it('should work even if key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      await service.clearFailedAttempts(identifier);

      expect(mockRedis.del).toHaveBeenCalledWith(`failed_auth:${identifier}`);
    });
  });

  describe('isLocked', () => {
    const identifier = 'user@example.com';

    it('should return true when account is locked', async () => {
      mockRedis.get.mockResolvedValue('locked');

      const result = await service.isLocked(identifier);

      expect(result).toBe(true);
      expect(mockRedis.get).toHaveBeenCalledWith(`auth_lock:${identifier}`);
    });

    it('should return false when account is not locked', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isLocked(identifier);

      expect(result).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith(`auth_lock:${identifier}`);
    });

    it('should return false when lock key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isLocked(identifier);

      expect(result).toBe(false);
    });
  });

  describe('getLockInfo', () => {
    const identifier = 'user@example.com';

    describe('when account is locked', () => {
      it('should return locked status with remaining time', async () => {
        const remainingTime = 600; // 10 minutes
        mockRedis.ttl.mockResolvedValue(remainingTime);

        const result = await service.getLockInfo(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingTime).toBe(remainingTime);
        expect(mockRedis.ttl).toHaveBeenCalledWith(`auth_lock:${identifier}`);
      });

      it('should return correct remaining time for different durations', async () => {
        mockRedis.ttl.mockResolvedValue(300); // 5 minutes

        const result = await service.getLockInfo(identifier);

        expect(result.locked).toBe(true);
        expect(result.remainingTime).toBe(300);
      });
    });

    describe('when account is not locked', () => {
      it('should return not locked when ttl is 0', async () => {
        mockRedis.ttl.mockResolvedValue(0);

        const result = await service.getLockInfo(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingTime).toBeUndefined();
      });

      it('should return not locked when ttl is negative', async () => {
        mockRedis.ttl.mockResolvedValue(-1);

        const result = await service.getLockInfo(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingTime).toBeUndefined();
      });

      it('should return not locked when key does not exist (ttl -2)', async () => {
        mockRedis.ttl.mockResolvedValue(-2);

        const result = await service.getLockInfo(identifier);

        expect(result.locked).toBe(false);
        expect(result.remainingTime).toBeUndefined();
      });
    });
  });
});
