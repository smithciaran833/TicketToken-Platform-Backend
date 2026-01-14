import { RateLimitError } from '../../../src/errors';

// Mock Redis
const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  ttl: jest.fn(),
};

jest.mock('../../../src/config/redis', () => ({
  getRedis: () => mockRedis,
}));

// Import after mocks
import {
  RateLimiter,
  loginRateLimiter,
  registrationRateLimiter,
  passwordResetRateLimiter,
  otpRateLimiter,
  mfaSetupRateLimiter,
  backupCodeRateLimiter,
} from '../../../src/utils/rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('consume', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter('test', { points: 5, duration: 60 });
    });

    it('allows request under limit', async () => {
      mockRedis.get.mockResolvedValue(null); // Not blocked
      mockRedis.incr.mockResolvedValue(1); // First request

      await expect(limiter.consume('user-123')).resolves.toBeUndefined();
      expect(mockRedis.incr).toHaveBeenCalledWith('test:user-123');
    });

    it('allows request at limit', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(5); // At limit

      await expect(limiter.consume('user-123')).resolves.toBeUndefined();
    });

    it('throws RateLimitError over limit', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(6); // Over limit

      await expect(limiter.consume('user-123')).rejects.toThrow(RateLimitError);
      await expect(limiter.consume('user-123')).rejects.toThrow('Rate limit exceeded');
    });

    it('sets block key when limit exceeded', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(6);

      try {
        await limiter.consume('user-123');
      } catch (e) {
        // Expected
      }

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'test:user-123:block',
        120, // Default blockDuration = duration * 2
        '1'
      );
    });

    it('throws immediately when already blocked', async () => {
      mockRedis.get.mockResolvedValue('1'); // Blocked
      mockRedis.ttl.mockResolvedValue(45);

      await expect(limiter.consume('user-123')).rejects.toThrow(RateLimitError);
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('includes TTL in error when blocked', async () => {
      mockRedis.get.mockResolvedValue('1');
      mockRedis.ttl.mockResolvedValue(45);

      try {
        await limiter.consume('user-123');
        fail('Should have thrown');
      } catch (error: any) {
        expect(error.ttl).toBe(45);
      }
    });

    it('sets expiry on first request', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await limiter.consume('user-123');

      expect(mockRedis.expire).toHaveBeenCalledWith('test:user-123', 60);
    });

    it('does not set expiry on subsequent requests', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(3); // Not first request

      await limiter.consume('user-123');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('uses tenant prefix when provided', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await limiter.consume('user-123', 1, 'tenant-456');

      expect(mockRedis.get).toHaveBeenCalledWith('tenant:tenant-456:test:user-123:block');
      expect(mockRedis.incr).toHaveBeenCalledWith('tenant:tenant-456:test:user-123');
    });

    it('respects custom blockDuration', async () => {
      const customLimiter = new RateLimiter('custom', {
        points: 3,
        duration: 60,
        blockDuration: 300,
      });
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(4); // Over limit

      try {
        await customLimiter.consume('user-123');
      } catch (e) {
        // Expected
      }

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'custom:user-123:block',
        300,
        '1'
      );
    });
  });

  describe('reset', () => {
    let limiter: RateLimiter;

    beforeEach(() => {
      limiter = new RateLimiter('test', { points: 5, duration: 60 });
    });

    it('deletes both counter and block keys', async () => {
      await limiter.reset('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith('test:user-123');
      expect(mockRedis.del).toHaveBeenCalledWith('test:user-123:block');
    });

    it('uses tenant prefix when provided', async () => {
      await limiter.reset('user-123', 'tenant-456');

      expect(mockRedis.del).toHaveBeenCalledWith('tenant:tenant-456:test:user-123');
      expect(mockRedis.del).toHaveBeenCalledWith('tenant:tenant-456:test:user-123:block');
    });
  });

  describe('pre-configured limiters', () => {
    it('loginRateLimiter has correct settings (5/15min)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await loginRateLimiter.consume('test');

      expect(mockRedis.incr).toHaveBeenCalledWith('login:test');
      expect(mockRedis.expire).toHaveBeenCalledWith('login:test', 900);
    });

    it('registrationRateLimiter has correct settings (3/hour)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await registrationRateLimiter.consume('test');

      expect(mockRedis.incr).toHaveBeenCalledWith('register:test');
      expect(mockRedis.expire).toHaveBeenCalledWith('register:test', 3600);
    });

    it('passwordResetRateLimiter has correct settings (3/hour)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await passwordResetRateLimiter.consume('test');

      expect(mockRedis.incr).toHaveBeenCalledWith('password-reset:test');
      expect(mockRedis.expire).toHaveBeenCalledWith('password-reset:test', 3600);
    });

    it('otpRateLimiter has correct settings (5/5min)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await otpRateLimiter.consume('test');

      expect(mockRedis.incr).toHaveBeenCalledWith('otp-verify:test');
      expect(mockRedis.expire).toHaveBeenCalledWith('otp-verify:test', 300);
    });

    it('mfaSetupRateLimiter has correct settings (3/hour)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await mfaSetupRateLimiter.consume('test');

      expect(mockRedis.incr).toHaveBeenCalledWith('mfa-setup:test');
      expect(mockRedis.expire).toHaveBeenCalledWith('mfa-setup:test', 3600);
    });

    it('backupCodeRateLimiter has correct settings (3/hour, 2hr block)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(4); // Over limit

      try {
        await backupCodeRateLimiter.consume('test');
      } catch (e) {
        // Expected
      }

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'backup-code:test:block',
        7200, // 2 hour block
        '1'
      );
    });
  });
});
