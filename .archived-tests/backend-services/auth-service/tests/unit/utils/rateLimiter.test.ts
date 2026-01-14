import { RateLimiter, loginRateLimiter } from '../../../src/utils/rateLimiter';
import { RateLimitError } from '../../../src/errors';

// Mock redis
jest.mock('../../../src/config/redis', () => ({
  redis: {
    get: jest.fn(),
    incr: jest.fn(),
    expire: jest.fn(),
    setex: jest.fn(),
    ttl: jest.fn(),
    del: jest.fn(),
  },
}));

import { redis } from '../../../src/config/redis';

describe('RateLimiter Utils', () => {
  let rateLimiter: RateLimiter;
  const mockRedis = redis as jest.Mocked<typeof redis>;

  beforeEach(() => {
    rateLimiter = new RateLimiter('test', {
      points: 5,
      duration: 60,
      blockDuration: 120,
    });
    jest.clearAllMocks();
  });

  describe('consume', () => {
    it('should allow request within limit', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(1);

      await expect(rateLimiter.consume('user-123')).resolves.not.toThrow();

      expect(mockRedis.incr).toHaveBeenCalledWith('test:user-123');
      expect(mockRedis.expire).toHaveBeenCalledWith('test:user-123', 60);
    });

    it('should not set expiry on subsequent requests', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(3);

      await rateLimiter.consume('user-123');

      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should throw RateLimitError when limit exceeded', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.incr.mockResolvedValue(6);

      await expect(rateLimiter.consume('user-123')).rejects.toThrow(RateLimitError);
      expect(mockRedis.setex).toHaveBeenCalledWith('test:user-123:block', 120, '1');
    });

    it('should throw RateLimitError when blocked', async () => {
      mockRedis.get.mockResolvedValue('1');
      mockRedis.ttl.mockResolvedValue(60);

      await expect(rateLimiter.consume('user-123')).rejects.toThrow(RateLimitError);
      expect(mockRedis.incr).not.toHaveBeenCalled();
    });

    it('should include TTL in error when blocked', async () => {
      mockRedis.get.mockResolvedValue('1');
      mockRedis.ttl.mockResolvedValue(45);

      try {
        await rateLimiter.consume('user-123');
        fail('Should have thrown RateLimitError');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).ttl).toBe(45);
      }
    });
  });

  describe('reset', () => {
    it('should delete rate limit keys', async () => {
      await rateLimiter.reset('user-123');

      expect(mockRedis.del).toHaveBeenCalledWith('test:user-123');
      expect(mockRedis.del).toHaveBeenCalledWith('test:user-123:block');
    });
  });

  describe('pre-configured limiters', () => {
    it('should have loginRateLimiter defined', () => {
      expect(loginRateLimiter).toBeDefined();
      expect(loginRateLimiter).toBeInstanceOf(RateLimiter);
    });
  });
});
