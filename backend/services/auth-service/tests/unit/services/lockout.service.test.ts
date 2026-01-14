import { RateLimitError } from '../../../src/errors';

const mockRedis = {
  get: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/config/env', () => ({
  env: {
    LOCKOUT_MAX_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
  },
}));

import { LockoutService } from '../../../src/services/lockout.service';

describe('LockoutService', () => {
  let service: LockoutService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LockoutService();
  });

  describe('recordFailedAttempt', () => {
    it('increments both user and IP counters', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await service.recordFailedAttempt('user-123', '127.0.0.1');

      expect(mockRedis.incr).toHaveBeenCalledWith('lockout:user:user-123');
      expect(mockRedis.incr).toHaveBeenCalledWith('lockout:ip:127.0.0.1');
    });

    it('sets expiry on first attempt', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await service.recordFailedAttempt('user-123', '127.0.0.1');

      expect(mockRedis.expire).toHaveBeenCalledWith('lockout:user:user-123', 15 * 60);
      expect(mockRedis.expire).toHaveBeenCalledWith('lockout:ip:127.0.0.1', 15 * 60);
    });

    it('does not set expiry on subsequent attempts', async () => {
      mockRedis.incr.mockResolvedValue(2);

      await service.recordFailedAttempt('user-123', '127.0.0.1');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('throws RateLimitError when user max attempts reached', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(5) // User attempts = max
        .mockResolvedValueOnce(3); // IP attempts under
      mockRedis.ttl.mockResolvedValue(600);

      await expect(service.recordFailedAttempt('user-123', '127.0.0.1'))
        .rejects.toThrow(RateLimitError);
    });

    it('throws RateLimitError when IP max attempts reached', async () => {
      mockRedis.incr
        .mockResolvedValueOnce(3) // User attempts under
        .mockResolvedValueOnce(10); // IP attempts = max * 2
      mockRedis.ttl.mockResolvedValue(600);

      await expect(service.recordFailedAttempt('user-123', '127.0.0.1'))
        .rejects.toThrow(RateLimitError);
    });

    it('includes TTL in error', async () => {
      mockRedis.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(1);
      mockRedis.ttl.mockResolvedValue(300);

      try {
        await service.recordFailedAttempt('user-123', '127.0.0.1');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.ttl).toBe(300);
      }
    });
  });

  describe('checkLockout', () => {
    it('does not throw when under limits', async () => {
      mockRedis.get.mockResolvedValue('3');

      await expect(service.checkLockout('user-123', '127.0.0.1')).resolves.toBeUndefined();
    });

    it('throws when user is locked out', async () => {
      mockRedis.get
        .mockResolvedValueOnce('5') // User at max
        .mockResolvedValueOnce('1'); // IP under
      mockRedis.ttl.mockResolvedValue(600);

      await expect(service.checkLockout('user-123', '127.0.0.1'))
        .rejects.toThrow(RateLimitError);
    });

    it('throws when IP is locked out', async () => {
      mockRedis.get
        .mockResolvedValueOnce('1') // User under
        .mockResolvedValueOnce('10'); // IP at max * 2
      mockRedis.ttl.mockResolvedValue(600);

      await expect(service.checkLockout('user-123', '127.0.0.1'))
        .rejects.toThrow(RateLimitError);
    });

    it('does not throw when no attempts recorded', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(service.checkLockout('user-123', '127.0.0.1')).resolves.toBeUndefined();
    });
  });

  describe('clearFailedAttempts', () => {
    it('deletes both user and IP keys', async () => {
      await service.clearFailedAttempts('user-123', '127.0.0.1');

      expect(mockRedis.del).toHaveBeenCalledWith('lockout:user:user-123');
      expect(mockRedis.del).toHaveBeenCalledWith('lockout:ip:127.0.0.1');
    });
  });
});
