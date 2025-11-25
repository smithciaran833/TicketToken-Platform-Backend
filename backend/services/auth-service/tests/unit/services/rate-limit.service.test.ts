import { RateLimitService } from '../../../src/services/rate-limit.service';

// Mock dependencies
jest.mock('../../../src/config/redis', () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  }
}));

import { redis } from '../../../src/config/redis';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockRedis: jest.Mocked<typeof redis>;

  beforeEach(() => {
    mockRedis = redis as jest.Mocked<typeof redis>;
    service = new RateLimitService();
    jest.clearAllMocks();
  });

  describe('consume', () => {
    const identifier = 'user@example.com';
    const venueId = 'venue-123';

    describe('predefined rate limits', () => {
      it('should apply login rate limit (5 per minute)', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('login', null, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:login:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:login:${identifier}`, 60);
      });

      it('should apply register rate limit (3 per 5 minutes)', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('register', null, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:register:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:register:${identifier}`, 300);
      });

      it('should apply wallet rate limit (10 per minute)', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('wallet', null, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:wallet:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:wallet:${identifier}`, 60);
      });
    });

    describe('default rate limit for unknown actions', () => {
      it('should apply default limit (100 per minute) for unknown action', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('unknown-action', null, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:unknown-action:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:unknown-action:${identifier}`, 60);
      });
    });

    describe('key generation', () => {
      it('should include venueId in key when provided', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('login', venueId, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:login:${venueId}:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:login:${venueId}:${identifier}`, 60);
      });

      it('should exclude venueId from key when null', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('login', null, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:login:${identifier}`);
        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:login:${identifier}`, 60);
      });
    });

    describe('first request', () => {
      it('should set expiry on first request (count = 1)', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('login', null, identifier);

        expect(mockRedis.expire).toHaveBeenCalledWith(`rate:login:${identifier}`, 60);
        expect(mockRedis.expire).toHaveBeenCalledTimes(1);
      });
    });

    describe('subsequent requests below limit', () => {
      it('should not set expiry on second request', async () => {
        mockRedis.incr.mockResolvedValue(2);

        await service.consume('login', null, identifier);

        expect(mockRedis.expire).not.toHaveBeenCalled();
      });

      it('should allow requests up to the limit', async () => {
        mockRedis.incr.mockResolvedValue(5);

        await expect(service.consume('login', null, identifier)).resolves.not.toThrow();
      });

      it('should allow multiple wallet requests up to limit', async () => {
        mockRedis.incr.mockResolvedValue(10);

        await expect(service.consume('wallet', null, identifier)).resolves.not.toThrow();
      });
    });

    describe('rate limit exceeded', () => {
      it('should throw error when login limit exceeded', async () => {
        mockRedis.incr.mockResolvedValue(6);
        mockRedis.ttl.mockResolvedValue(45);

        await expect(service.consume('login', null, identifier))
          .rejects.toThrow('Rate limit exceeded. Try again in 45 seconds.');

        expect(mockRedis.ttl).toHaveBeenCalledWith(`rate:login:${identifier}`);
      });

      it('should throw error when register limit exceeded', async () => {
        mockRedis.incr.mockResolvedValue(4);
        mockRedis.ttl.mockResolvedValue(180);

        await expect(service.consume('register', null, identifier))
          .rejects.toThrow('Rate limit exceeded. Try again in 180 seconds.');
      });

      it('should throw error when wallet limit exceeded', async () => {
        mockRedis.incr.mockResolvedValue(11);
        mockRedis.ttl.mockResolvedValue(30);

        await expect(service.consume('wallet', null, identifier))
          .rejects.toThrow('Rate limit exceeded. Try again in 30 seconds.');
      });

      it('should include correct TTL in error message', async () => {
        mockRedis.incr.mockResolvedValue(6);
        mockRedis.ttl.mockResolvedValue(15);

        try {
          await service.consume('login', null, identifier);
          fail('Should have thrown error');
        } catch (error: any) {
          expect(error.message).toBe('Rate limit exceeded. Try again in 15 seconds.');
        }
      });
    });

    describe('rate limit with venueId', () => {
      it('should track rate limits per venue', async () => {
        mockRedis.incr.mockResolvedValue(1);

        await service.consume('login', venueId, identifier);

        expect(mockRedis.incr).toHaveBeenCalledWith(`rate:login:${venueId}:${identifier}`);
      });

      it('should throw error when venue-specific limit exceeded', async () => {
        mockRedis.incr.mockResolvedValue(6);
        mockRedis.ttl.mockResolvedValue(40);

        await expect(service.consume('login', venueId, identifier))
          .rejects.toThrow('Rate limit exceeded. Try again in 40 seconds.');
      });
    });
  });
});
