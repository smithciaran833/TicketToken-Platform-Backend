import { PurchaseLimiterService } from '../../../../src/services/high-demand/purchase-limiter.service';

// Mock Redis
const mockRedis = {
  connect: jest.fn().mockResolvedValue(undefined),
  exists: jest.fn().mockResolvedValue(0),
  ttl: jest.fn().mockResolvedValue(0),
  setEx: jest.fn().mockResolvedValue('OK')
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedis)
}));

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
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

import { query } from '../../../../src/config/database';

describe('PurchaseLimiterService', () => {
  let service: PurchaseLimiterService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new PurchaseLimiterService();
  });

  describe('checkPurchaseLimit', () => {
    const paymentMethod = {
      type: 'card',
      fingerprint: 'fp_test123',
      last4: '4242'
    };

    it('should allow purchase within limits', async () => {
      // Mock event limits
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      // Mock user purchases (0)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });

      // Mock payment method purchases (0)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });

      // Mock user address
      mockQuery.mockResolvedValueOnce({
        rows: [{ billing_address: '123 Main St' }]
      });

      // Mock address purchases (0)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });

      // Mock cooldown check (no cooldown)
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.checkPurchaseLimit(
        'user_1',
        'event_1',
        2,
        paymentMethod
      );

      expect(result.allowed).toBe(true);
      expect(result.limits).toBeDefined();
    });

    it('should block when user limit exceeded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      // User already purchased 3, requesting 2 more (total 5 > limit 4)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });

      const result = await service.checkPurchaseLimit(
        'user_2',
        'event_1',
        2,
        paymentMethod
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum 4 tickets per person');
    });

    it('should block when payment method limit exceeded', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });

      // Payment method already used for 3, requesting 2 more (total 5 > limit 4)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });

      const result = await service.checkPurchaseLimit(
        'user_3',
        'event_1',
        2,
        paymentMethod
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum 4 tickets per payment method');
    });

    it('should block when address limit exceeded', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });

      mockQuery.mockResolvedValueOnce({
        rows: [{ billing_address: '123 Main St' }]
      });

      // Address already used for 7, requesting 2 more (total 9 > limit 8)
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 7 }] });

      const result = await service.checkPurchaseLimit(
        'user_4',
        'event_1',
        2,
        paymentMethod
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum 8 tickets per household');
    });

    it('should block during cooldown period', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ billing_address: '123 Main St' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });

      // Cooldown active
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.ttl.mockResolvedValue(300); // 5 minutes remaining

      const result = await service.checkPurchaseLimit(
        'user_5',
        'event_1',
        2,
        paymentMethod
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Please wait');
      expect(result.reason).toContain('minutes');
    });

    it('should use default limits when event limits not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No event limits
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ billing_address: '123 Main St' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.checkPurchaseLimit(
        'user_6',
        'event_1',
        2,
        paymentMethod
      );

      expect(result.allowed).toBe(true);
      expect(result.limits.perUser).toBe(4); // Default
    });

    it('should handle missing payment fingerprint', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ billing_address: '123 Main St' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 0 }] });
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.checkPurchaseLimit(
        'user_7',
        'event_1',
        2,
        { type: 'card' } // No fingerprint
      );

      expect(result.allowed).toBe(true);
    });

    it('should return current purchase counts', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          purchase_limit_per_user: 4,
          purchase_limit_per_payment_method: 4,
          purchase_limit_per_address: 8,
          max_tickets_per_order: 4
        }]
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ total: 2 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ billing_address: '123 Main St' }]
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 3 }] });
      mockRedis.exists.mockResolvedValue(0);

      const result = await service.checkPurchaseLimit(
        'user_8',
        'event_1',
        1,
        paymentMethod
      );

      expect(result.current.userPurchases).toBe(2);
      expect(result.current.addressPurchases).toBe(3);
    });
  });

  describe('recordPurchase', () => {
    it('should set cooldown after purchase', async () => {
      await service.recordPurchase('user_1', 'event_1', 2, {
        type: 'card',
        fingerprint: 'fp_test'
      });

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'cooldown:user_1:event_1',
        expect.any(Number),
        '1'
      );
    });

    it('should respect custom cooldown period from env', async () => {
      process.env.PURCHASE_COOLDOWN_MINUTES = '15';

      await service.recordPurchase('user_2', 'event_1', 2, {
        type: 'card'
      });

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        expect.any(String),
        15 * 60, // 15 minutes in seconds
        '1'
      );

      delete process.env.PURCHASE_COOLDOWN_MINUTES;
    });
  });

  describe('enforceDynamicLimits', () => {
    it('should set strict limits for very high demand', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.enforceDynamicLimits('event_1', 0.95);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE event_purchase_limits'),
        ['event_1', 2, 2] // Strict limits
      );
    });

    it('should set moderate limits for high demand', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.enforceDynamicLimits('event_1', 0.8);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE event_purchase_limits'),
        ['event_1', 3, 3] // Moderate limits
      );
    });

    it('should use normal limits for normal demand', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.enforceDynamicLimits('event_1', 0.5);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE event_purchase_limits'),
        ['event_1', 4, 4] // Normal limits
      );
    });
  });

  describe('getPurchaseLimitStats', () => {
    it('should return purchase statistics', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          unique_purchasers: 100,
          avg_tickets: 2.5,
          max_tickets: 4,
          violations: 15
        }]
      });

      const result = await service.getPurchaseLimitStats('event_1');

      expect(result.uniquePurchasers).toBe(100);
      expect(result.averageTicketsPerPurchaser).toBe(2.5);
      expect(result.maxTicketsPurchased).toBe(4);
      expect(result.limitViolationsBlocked).toBe(15);
    });

    it('should handle zero values', async () => {
      mockQuery.mockResolvedValue({
        rows: [{
          unique_purchasers: 0,
          avg_tickets: null,
          max_tickets: null,
          violations: 0
        }]
      });

      const result = await service.getPurchaseLimitStats('event_2');

      expect(result.uniquePurchasers).toBe(0);
      expect(result.averageTicketsPerPurchaser).toBe(0);
    });
  });

  describe('normalizeAddress', () => {
    it('should normalize address correctly', () => {
      const normalized = (service as any).normalizeAddress(
        '123 Main St., Apt #4B'
      );

      expect(normalized).toBe('123 main st apt 4b');
    });

    it('should handle multiple spaces', () => {
      const normalized = (service as any).normalizeAddress(
        '123    Main     St'
      );

      expect(normalized).toBe('123 main st');
    });

    it('should remove special characters', () => {
      const normalized = (service as any).normalizeAddress(
        '123-A Main St!'
      );

      expect(normalized).toBe('123a main st');
    });
  });
});
