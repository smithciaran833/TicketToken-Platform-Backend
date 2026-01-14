const mockRateLimiter = {
  fixedWindow: jest.fn(),
};

const mockKeyBuilder = {
  rateLimit: jest.fn((type: string, id: string) => `rl:${type}:${id}`),
};

jest.mock('@tickettoken/shared', () => ({
  getRateLimiter: () => mockRateLimiter,
  getKeyBuilder: () => mockKeyBuilder,
}));

import { RateLimitService } from '../../../src/services/rate-limit.service';

describe('RateLimitService', () => {
  let service: RateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RateLimitService();
  });

  describe('consume', () => {
    it('allows request under limit', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true, remaining: 4 });

      await expect(service.consume('login', null, 'user@example.com')).resolves.toBeUndefined();
    });

    it('throws error when limit exceeded', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: false, retryAfter: 30 });

      await expect(service.consume('login', null, 'user@example.com'))
        .rejects.toThrow('Rate limit exceeded');
    });

    it('uses correct limits for login action (5/60s)', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true });

      await service.consume('login', null, 'user@example.com');

      expect(mockRateLimiter.fixedWindow).toHaveBeenCalledWith(
        expect.any(String),
        5,        // points
        60 * 1000 // duration in ms
      );
    });

    it('uses correct limits for register action (3/300s)', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true });

      await service.consume('register', null, 'user@example.com');

      expect(mockRateLimiter.fixedWindow).toHaveBeenCalledWith(
        expect.any(String),
        3,
        300 * 1000
      );
    });

    it('uses correct limits for wallet action (10/60s)', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true });

      await service.consume('wallet', null, '0x123');

      expect(mockRateLimiter.fixedWindow).toHaveBeenCalledWith(
        expect.any(String),
        10,
        60 * 1000
      );
    });

    it('uses default limit for unknown action (100/60s)', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true });

      await service.consume('unknown-action', null, 'user@example.com');

      expect(mockRateLimiter.fixedWindow).toHaveBeenCalledWith(
        expect.any(String),
        100,
        60 * 1000
      );
    });

    it('includes venueId in key when provided', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true });

      await service.consume('login', 'venue-123', 'user@example.com');

      expect(mockKeyBuilder.rateLimit).toHaveBeenCalledWith('login:venue-123', 'user@example.com');
    });

    it('excludes venueId from key when null', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: true });

      await service.consume('login', null, 'user@example.com');

      expect(mockKeyBuilder.rateLimit).toHaveBeenCalledWith('login', 'user@example.com');
    });

    it('includes retryAfter in error message', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: false, retryAfter: 45 });

      await expect(service.consume('login', null, 'test'))
        .rejects.toThrow('Try again in 45 seconds');
    });

    it('uses duration as retryAfter when not provided', async () => {
      mockRateLimiter.fixedWindow.mockResolvedValue({ allowed: false });

      await expect(service.consume('login', null, 'test'))
        .rejects.toThrow('Try again in 60 seconds');
    });
  });
});
