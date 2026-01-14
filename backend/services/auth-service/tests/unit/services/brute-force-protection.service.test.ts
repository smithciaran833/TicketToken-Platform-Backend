import { BruteForceProtectionService } from '../../../src/services/brute-force-protection.service';

// Mock dependencies
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
};

const mockRateLimiter = {
  fixedWindow: jest.fn(),
};

const mockKeyBuilder = {
  failedAuth: jest.fn((id: string) => `bf:attempts:${id}`),
  authLock: jest.fn((id: string) => `bf:lock:${id}`),
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedis,
}));

jest.mock('@tickettoken/shared', () => ({
  getRateLimiter: () => mockRateLimiter,
  getKeyBuilder: () => mockKeyBuilder,
}));

describe('BruteForceProtectionService', () => {
  let service: BruteForceProtectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BruteForceProtectionService();
  });

  describe('recordFailedAttempt', () => {
    const identifier = 'user@example.com';

    it('returns locked=true with remaining time when already locked', async () => {
      mockRedis.get.mockResolvedValue('locked');
      mockRedis.ttl.mockResolvedValue(600); // 10 minutes remaining

      const result = await service.recordFailedAttempt(identifier);

      expect(result.locked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.lockoutUntil).toBeInstanceOf(Date);
      expect(mockRateLimiter.fixedWindow).not.toHaveBeenCalled();
    });

    it('returns locked=false with remaining attempts when under limit', async () => {
      mockRedis.get.mockResolvedValue(null); // Not locked
      mockRateLimiter.fixedWindow.mockResolvedValue({
        allowed: true,
        remaining: 3,
      });

      const result = await service.recordFailedAttempt(identifier);

      expect(result.locked).toBe(false);
      expect(result.remainingAttempts).toBe(3);
      expect(result.lockoutUntil).toBeUndefined();
    });

    it('locks account when limit exceeded', async () => {
      mockRedis.get.mockResolvedValue(null); // Not locked yet
      mockRateLimiter.fixedWindow.mockResolvedValue({
        allowed: false,
        remaining: 0,
      });

      const result = await service.recordFailedAttempt(identifier);

      expect(result.locked).toBe(true);
      expect(result.remainingAttempts).toBe(0);
      expect(result.lockoutUntil).toBeInstanceOf(Date);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `bf:lock:${identifier}`,
        15 * 60, // 15 minutes
        'locked'
      );
      expect(mockRedis.del).toHaveBeenCalledWith(`bf:attempts:${identifier}`);
    });

    it('uses correct keys from keyBuilder', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true, remaining: 4 });

      await service.recordFailedAttempt(identifier);

      expect(mockKeyBuilder.failedAuth).toHaveBeenCalledWith(identifier);
      expect(mockKeyBuilder.authLock).toHaveBeenCalledWith(identifier);
    });

    it('calls rateLimiter.fixedWindow with correct params', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true, remaining: 4 });

      await service.recordFailedAttempt(identifier);

      expect(mockRateLimiter.fixedWindow).toHaveBeenCalledWith(
        `bf:attempts:${identifier}`,
        5, // maxAttempts
        15 * 60 * 1000 // attemptWindow in ms
      );
    });
  });

  describe('clearFailedAttempts', () => {
    it('deletes the attempts key', async () => {
      const identifier = 'user@example.com';

      await service.clearFailedAttempts(identifier);

      expect(mockKeyBuilder.failedAuth).toHaveBeenCalledWith(identifier);
      expect(mockRedis.del).toHaveBeenCalledWith(`bf:attempts:${identifier}`);
    });
  });

  describe('isLocked', () => {
    const identifier = 'user@example.com';

    it('returns true when lock key exists', async () => {
      mockRedis.get.mockResolvedValue('locked');

      const result = await service.isLocked(identifier);

      expect(result).toBe(true);
      expect(mockKeyBuilder.authLock).toHaveBeenCalledWith(identifier);
    });

    it('returns false when lock key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isLocked(identifier);

      expect(result).toBe(false);
    });
  });

  describe('getLockInfo', () => {
    const identifier = 'user@example.com';

    it('returns locked=true with remainingTime when locked', async () => {
      mockRedis.ttl.mockResolvedValue(300); // 5 minutes

      const result = await service.getLockInfo(identifier);

      expect(result.locked).toBe(true);
      expect(result.remainingTime).toBe(300);
    });

    it('returns locked=false when TTL is 0 or negative', async () => {
      mockRedis.ttl.mockResolvedValue(0);

      const result = await service.getLockInfo(identifier);

      expect(result.locked).toBe(false);
      expect(result.remainingTime).toBeUndefined();
    });

    it('returns locked=false when TTL is -1 (key does not exist)', async () => {
      mockRedis.ttl.mockResolvedValue(-1);

      const result = await service.getLockInfo(identifier);

      expect(result.locked).toBe(false);
    });

    it('returns locked=false when TTL is -2 (key has no expiry)', async () => {
      mockRedis.ttl.mockResolvedValue(-2);

      const result = await service.getLockInfo(identifier);

      expect(result.locked).toBe(false);
    });
  });
});
