const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('../../../src/config/redis', () => ({ getRedis: () => mockRedis }));
jest.mock('../../../src/utils/logger', () => ({ logger: mockLogger }));
jest.mock('../../../src/config/env', () => ({
  env: {
    isProduction: false,
    CAPTCHA_ENABLED: true,
    CAPTCHA_SECRET_KEY: 'test-secret',
    CAPTCHA_PROVIDER: 'recaptcha',
    CAPTCHA_MIN_SCORE: 0.5,
    CAPTCHA_FAIL_OPEN: false,
  },
}));

import { CaptchaService } from '../../../src/services/captcha.service';

describe('CaptchaService', () => {
  let service: CaptchaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CaptchaService();
  });

  describe('isCaptchaRequired', () => {
    it('returns false when under threshold', async () => {
      mockRedis.get.mockResolvedValue('2'); // Under 3

      const result = await service.isCaptchaRequired('test@example.com');

      expect(result).toBe(false);
    });

    it('returns true when at threshold', async () => {
      mockRedis.get.mockResolvedValue('3');

      const result = await service.isCaptchaRequired('test@example.com');

      expect(result).toBe(true);
    });

    it('returns true when over threshold', async () => {
      mockRedis.get.mockResolvedValue('5');

      const result = await service.isCaptchaRequired('test@example.com');

      expect(result).toBe(true);
    });

    it('returns false when no failures recorded', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isCaptchaRequired('test@example.com');

      expect(result).toBe(false);
    });
  });

  describe('recordFailure', () => {
    it('increments failure counter', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await service.recordFailure('test@example.com');

      expect(mockRedis.incr).toHaveBeenCalledWith('captcha:failures:test@example.com');
    });

    it('sets expiry on first failure', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await service.recordFailure('test@example.com');

      expect(mockRedis.expire).toHaveBeenCalledWith(
        'captcha:failures:test@example.com',
        15 * 60
      );
    });

    it('does not set expiry on subsequent failures', async () => {
      mockRedis.incr.mockResolvedValue(2);

      await service.recordFailure('test@example.com');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('returns requiresCaptcha true when threshold reached', async () => {
      mockRedis.incr.mockResolvedValue(3);

      const result = await service.recordFailure('test@example.com');

      expect(result.requiresCaptcha).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('returns requiresCaptcha false when under threshold', async () => {
      mockRedis.incr.mockResolvedValue(2);

      const result = await service.recordFailure('test@example.com');

      expect(result.requiresCaptcha).toBe(false);
    });
  });

  describe('clearFailures', () => {
    it('deletes failure counter', async () => {
      await service.clearFailures('test@example.com');

      expect(mockRedis.del).toHaveBeenCalledWith('captcha:failures:test@example.com');
    });
  });

  describe('verify', () => {
    it('returns success false for missing token', async () => {
      const result = await service.verify('');

      expect(result.success).toBe(false);
      expect(result.errorCodes).toContain('missing-input-response');
    });

    it('calls Google reCAPTCHA API', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.9 }),
      });

      await service.verify('valid-token', '127.0.0.1');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.google.com/recaptcha/api/siteverify',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('returns success for score above threshold', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.7 }),
      });

      const result = await service.verify('valid-token');

      expect(result.success).toBe(true);
      expect(result.score).toBe(0.7);
    });

    it('returns failure for score below threshold', async () => {
      mockFetch.mockResolvedValue({
        json: () => Promise.resolve({ success: true, score: 0.3 }),
      });

      const result = await service.verify('valid-token');

      expect(result.success).toBe(false);
    });

    it('handles verification API errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await service.verify('valid-token');

      expect(result.success).toBe(false);
      expect(result.errorCodes).toContain('verification-failed');
    });
  });
});
