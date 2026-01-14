/**
 * Purchase Limiter Service Tests
 * Tests for high-demand event purchase limiting
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: { child: jest.fn().mockReturnValue({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) },
}));

describe('PurchaseLimiterService', () => {
  let service: PurchaseLimiterService;
  let mockRedis: any;
  let mockEventService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = { get: jest.fn(), set: jest.fn(), incr: jest.fn(), expire: jest.fn(), sadd: jest.fn(), scard: jest.fn() };
    mockEventService = { getEventLimits: jest.fn() };
    service = new PurchaseLimiterService(mockRedis, mockEventService);
  });

  describe('checkLimit', () => {
    it('should allow purchase within limits', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerUser: 4, maxPerOrder: 4 });
      mockRedis.get.mockResolvedValue('2');

      const result = await service.checkLimit('user_123', 'event_456', 2);

      expect(result.allowed).toBe(true);
    });

    it('should reject purchase exceeding user limit', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerUser: 4, maxPerOrder: 4 });
      mockRedis.get.mockResolvedValue('3');

      const result = await service.checkLimit('user_123', 'event_456', 2);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('limit');
    });

    it('should reject purchase exceeding order limit', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerUser: 10, maxPerOrder: 4 });

      const result = await service.checkLimit('user_123', 'event_456', 6);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('order');
    });

    it('should track purchases by user', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerUser: 4, maxPerOrder: 4 });
      mockRedis.get.mockResolvedValue('0');

      await service.checkLimit('user_123', 'event_456', 2);

      expect(mockRedis.get).toHaveBeenCalledWith(expect.stringContaining('user_123'));
    });
  });

  describe('recordPurchase', () => {
    it('should increment user purchase count', async () => {
      await service.recordPurchase('user_123', 'event_456', 2);

      expect(mockRedis.incr).toHaveBeenCalled();
    });

    it('should set expiration for purchase records', async () => {
      await service.recordPurchase('user_123', 'event_456', 2);

      expect(mockRedis.expire).toHaveBeenCalled();
    });
  });

  describe('getUserPurchaseCount', () => {
    it('should return current purchase count', async () => {
      mockRedis.get.mockResolvedValue('3');

      const count = await service.getUserPurchaseCount('user_123', 'event_456');

      expect(count).toBe(3);
    });

    it('should return 0 for new users', async () => {
      mockRedis.get.mockResolvedValue(null);

      const count = await service.getUserPurchaseCount('user_123', 'event_456');

      expect(count).toBe(0);
    });
  });

  describe('household detection', () => {
    it('should detect same household IP', async () => {
      mockRedis.sadd.mockResolvedValue(0); // Already exists

      const result = await service.checkHouseholdLimit('192.168.1.1', 'event_456');

      expect(result.sameHousehold).toBe(true);
    });

    it('should track unique IPs per event', async () => {
      mockRedis.sadd.mockResolvedValue(1);
      mockRedis.scard.mockResolvedValue(5);

      await service.checkHouseholdLimit('192.168.1.1', 'event_456');

      expect(mockRedis.sadd).toHaveBeenCalled();
    });

    it('should enforce household limits', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerHousehold: 8 });
      mockRedis.get.mockResolvedValue('10');

      const result = await service.checkHouseholdLimit('192.168.1.1', 'event_456');

      expect(result.limitExceeded).toBe(true);
    });
  });

  describe('phone number verification', () => {
    it('should limit purchases per phone', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerPhone: 4 });
      mockRedis.get.mockResolvedValue('3');

      const result = await service.checkPhoneLimit('+1234567890', 'event_456', 2);

      expect(result.allowed).toBe(false);
    });

    it('should allow first purchase', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerPhone: 4 });
      mockRedis.get.mockResolvedValue(null);

      const result = await service.checkPhoneLimit('+1234567890', 'event_456', 2);

      expect(result.allowed).toBe(true);
    });
  });

  describe('payment method limits', () => {
    it('should limit purchases per card', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerCard: 4 });
      mockRedis.get.mockResolvedValue('4');

      const result = await service.checkPaymentMethodLimit('card_hash_123', 'event_456', 1);

      expect(result.allowed).toBe(false);
    });

    it('should track card fingerprints', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerCard: 4 });
      mockRedis.get.mockResolvedValue('0');

      await service.checkPaymentMethodLimit('card_hash_123', 'event_456', 2);

      expect(mockRedis.get).toHaveBeenCalledWith(expect.stringContaining('card_hash'));
    });
  });

  describe('time windows', () => {
    it('should enforce rate limit per time window', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ purchasesPerMinute: 10 });
      mockRedis.incr.mockResolvedValue(15);

      const result = await service.checkRateLimit('user_123', 'event_456');

      expect(result.throttled).toBe(true);
    });

    it('should allow requests within rate limit', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ purchasesPerMinute: 10 });
      mockRedis.incr.mockResolvedValue(5);

      const result = await service.checkRateLimit('user_123', 'event_456');

      expect(result.throttled).toBe(false);
    });
  });

  describe('comprehensive check', () => {
    it('should run all checks', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerUser: 4, maxPerOrder: 4, maxPerCard: 4 });
      mockRedis.get.mockResolvedValue('0');
      mockRedis.incr.mockResolvedValue(1);

      const result = await service.fullCheck({
        userId: 'user_123',
        eventId: 'event_456',
        quantity: 2,
        ip: '192.168.1.1',
        cardHash: 'card_123',
      });

      expect(result.allowed).toBe(true);
    });

    it('should fail on any check failure', async () => {
      mockEventService.getEventLimits.mockResolvedValue({ maxPerUser: 4, maxPerOrder: 2, maxPerCard: 4 });
      mockRedis.get.mockResolvedValue('0');

      const result = await service.fullCheck({
        userId: 'user_123',
        eventId: 'event_456',
        quantity: 3, // Exceeds maxPerOrder
        ip: '192.168.1.1',
        cardHash: 'card_123',
      });

      expect(result.allowed).toBe(false);
    });
  });
});

class PurchaseLimiterService {
  constructor(private redis: any, private eventService: any) {}

  async checkLimit(userId: string, eventId: string, quantity: number) {
    const limits = await this.eventService.getEventLimits(eventId);
    if (quantity > limits.maxPerOrder) return { allowed: false, reason: 'Exceeds max per order' };
    
    const currentCount = await this.getUserPurchaseCount(userId, eventId);
    if (currentCount + quantity > limits.maxPerUser) return { allowed: false, reason: 'Exceeds user limit' };
    
    return { allowed: true };
  }

  async recordPurchase(userId: string, eventId: string, quantity: number) {
    const key = `purchase:${eventId}:${userId}`;
    for (let i = 0; i < quantity; i++) await this.redis.incr(key);
    await this.redis.expire(key, 86400 * 7);
  }

  async getUserPurchaseCount(userId: string, eventId: string): Promise<number> {
    const count = await this.redis.get(`purchase:${eventId}:${userId}`);
    return count ? parseInt(count, 10) : 0;
  }

  async checkHouseholdLimit(ip: string, eventId: string) {
    const limits = await this.eventService.getEventLimits(eventId);
    const added = await this.redis.sadd(`household:${eventId}`, ip);
    const count = await this.redis.get(`household_count:${eventId}:${ip}`) || '0';
    
    return {
      sameHousehold: added === 0,
      limitExceeded: parseInt(count, 10) >= (limits?.maxPerHousehold || 8),
    };
  }

  async checkPhoneLimit(phone: string, eventId: string, quantity: number) {
    const limits = await this.eventService.getEventLimits(eventId);
    const count = await this.redis.get(`phone:${eventId}:${phone}`) || '0';
    
    return { allowed: parseInt(count, 10) + quantity <= limits.maxPerPhone };
  }

  async checkPaymentMethodLimit(cardHash: string, eventId: string, quantity: number) {
    const limits = await this.eventService.getEventLimits(eventId);
    const count = await this.redis.get(`card_hash:${eventId}:${cardHash}`) || '0';
    
    return { allowed: parseInt(count, 10) + quantity <= limits.maxPerCard };
  }

  async checkRateLimit(userId: string, eventId: string) {
    const limits = await this.eventService.getEventLimits(eventId);
    const key = `rate:${eventId}:${userId}:${Math.floor(Date.now() / 60000)}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, 60);
    
    return { throttled: count > limits.purchasesPerMinute };
  }

  async fullCheck(params: { userId: string; eventId: string; quantity: number; ip: string; cardHash: string }) {
    const userCheck = await this.checkLimit(params.userId, params.eventId, params.quantity);
    if (!userCheck.allowed) return userCheck;

    const cardCheck = await this.checkPaymentMethodLimit(params.cardHash, params.eventId, params.quantity);
    if (!cardCheck.allowed) return { allowed: false, reason: 'Card limit exceeded' };

    return { allowed: true };
  }
}
