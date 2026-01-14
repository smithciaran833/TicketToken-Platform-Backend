import { VelocityCheckerService } from '../../../../src/services/fraud/velocity-checker.service';

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock Redis
const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  quit: jest.fn(),
  incr: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue('0'),
  sCard: jest.fn().mockResolvedValue(0),
  sAdd: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(3600),
  zAdd: jest.fn().mockResolvedValue(1),
  zRemRangeByScore: jest.fn().mockResolvedValue(0)
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    redis: {
      host: 'localhost',
      port: 6379
    }
  }
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('VelocityCheckerService', () => {
  let service: VelocityCheckerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new VelocityCheckerService();
  });

  describe('checkVelocity', () => {
    it('should allow purchase when all limits are within bounds', async () => {
      // Mock all counters returning low values
      mockRedis.get.mockResolvedValue('1');
      mockRedis.sCard.mockResolvedValue(1);

      const result = await service.checkVelocity(
        'user_1',
        'event_1',
        '192.168.1.1',
        'card_fp_1'
      );

      expect(result.allowed).toBe(true);
      expect(result.limits).toBeDefined();
    });

    it('should block when user hourly limit is exceeded', async () => {
      // Mock user hourly counter at limit
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user') && key.includes('hour')) {
          return Promise.resolve('6'); // Over limit of 5
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_2',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too many purchases in the last hour');
    });

    it('should block when user daily limit is exceeded', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user') && key.includes('day')) {
          return Promise.resolve('25'); // Over limit of 20
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_3',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily purchase limit reached');
    });

    it('should block when user weekly limit is exceeded', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user') && key.includes('week')) {
          return Promise.resolve('55'); // Over limit of 50
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_4',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Weekly purchase limit reached');
    });

    it('should block when event limit per user is exceeded', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('event') && key.includes('user')) {
          return Promise.resolve('5'); // Over limit of 4
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_5',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum 4 tickets per event');
    });

    it('should block when IP minute limit is exceeded', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('ip') && key.includes('minute')) {
          return Promise.resolve('15'); // Over limit of 10
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_6',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Too many requests from this IP');
    });

    it('should block when IP hourly limit is exceeded', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('ip') && key.includes('hour')) {
          return Promise.resolve('60'); // Over limit of 50
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_7',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Hourly IP limit exceeded');
    });

    it('should block when card daily limit is exceeded', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('card') && key.includes('day')) {
          return Promise.resolve('12'); // Over limit of 10
        }
        return Promise.resolve('0');
      });
      mockRedis.sCard.mockResolvedValue(1);

      const result = await service.checkVelocity(
        'user_8',
        'event_1',
        '192.168.1.1',
        'card_fp_1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Daily limit for this payment method');
    });

    it('should block when card is used by too many users', async () => {
      mockRedis.get.mockResolvedValue('5');
      mockRedis.sCard.mockResolvedValue(4); // Over limit of 3 unique users

      const result = await service.checkVelocity(
        'user_9',
        'event_1',
        '192.168.1.1',
        'card_fp_2'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Payment method used by too many accounts');
    });

    it('should handle missing card fingerprint gracefully', async () => {
      mockRedis.get.mockResolvedValue('1');

      const result = await service.checkVelocity(
        'user_10',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(true);
      expect(result.limits.card).toBeUndefined();
    });

    it('should bypass checks when Redis is not connected', async () => {
      // Create service with failed connection
      mockRedis.connect.mockRejectedValueOnce(new Error('Connection failed'));
      const disconnectedService = new VelocityCheckerService();

      // Wait for connection attempt to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      const result = await disconnectedService.checkVelocity(
        'user_11',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('recordPurchase', () => {
    it('should record purchase with all counters', async () => {
      await service.recordPurchase('user_1', 'event_1', '192.168.1.1', 'card_fp_1');

      // Should increment multiple counters
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('user'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('event'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('ip'));
      expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringContaining('card'));
      
      // Should set expirations
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should record purchase without card fingerprint', async () => {
      await service.recordPurchase('user_2', 'event_1', '192.168.1.1');

      expect(mockRedis.incr).toHaveBeenCalled();
      // Should not try to increment card counter
      expect(mockRedis.incr).not.toHaveBeenCalledWith(expect.stringContaining('card'));
    });

    it('should store purchase event in sorted set', async () => {
      await service.recordPurchase('user_3', 'event_1', '192.168.1.1');

      expect(mockRedis.zAdd).toHaveBeenCalledWith(
        'purchase_events',
        expect.objectContaining({
          score: expect.any(Number),
          value: expect.any(String)
        })
      );
    });

    it('should clean up old purchase events', async () => {
      await service.recordPurchase('user_4', 'event_1', '192.168.1.1');

      expect(mockRedis.zRemRangeByScore).toHaveBeenCalledWith(
        'purchase_events',
        '-inf',
        expect.any(Number)
      );
    });

    it('should handle Redis errors during recording', async () => {
      mockRedis.incr.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(
        service.recordPurchase('user_5', 'event_1', '192.168.1.1')
      ).resolves.not.toThrow();
    });

    it('should skip recording when Redis is not connected', async () => {
      mockRedis.connect.mockRejectedValueOnce(new Error('Connection failed'));
      const disconnectedService = new VelocityCheckerService();

      await new Promise(resolve => setTimeout(resolve, 100));

      await disconnectedService.recordPurchase('user_6', 'event_1', '192.168.1.1');

      // Should not crash
      expect(true).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle Redis returning null values', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.checkVelocity(
        'user_12',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(true);
    });

    it('should handle Redis returning invalid values', async () => {
      mockRedis.get.mockResolvedValue('invalid');

      const result = await service.checkVelocity(
        'user_13',
        'event_1',
        '192.168.1.1'
      );

      // Should treat as 0 and allow
      expect(result.allowed).toBe(true);
    });

    it('should handle exactly at limit threshold', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user') && key.includes('hour')) {
          return Promise.resolve('5'); // Exactly at limit
        }
        return Promise.resolve('0');
      });

      const result = await service.checkVelocity(
        'user_14',
        'event_1',
        '192.168.1.1'
      );

      // Should block at exact limit
      expect(result.allowed).toBe(false);
    });

    it('should provide reset time information when blocked', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key.includes('user') && key.includes('hour')) {
          return Promise.resolve('10');
        }
        return Promise.resolve('0');
      });
      mockRedis.ttl.mockResolvedValue(2400);

      const result = await service.checkVelocity(
        'user_15',
        'event_1',
        '192.168.1.1'
      );

      expect(result.allowed).toBe(false);
      expect(result.limits.resetIn).toBeDefined();
    });
  });
});
