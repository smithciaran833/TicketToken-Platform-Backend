/**
 * COMPONENT TEST: PurchaseLimiterService
 *
 * Tests purchase limits for high-demand events
 */

import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.PURCHASE_COOLDOWN_MINUTES = '10';

const mockQuery = jest.fn();
const mockRedisExists = jest.fn();
const mockRedisTtl = jest.fn();
const mockRedisSetex = jest.fn();

jest.mock('../../../../src/config/database', () => ({
  query: mockQuery,
}));

jest.mock('../../../../src/services/redisService', () => ({
  RedisService: {
    getClient: () => ({
      exists: mockRedisExists,
      ttl: mockRedisTtl,
      setex: mockRedisSetex,
    }),
  },
}));

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    error: jest.fn(),
    child: () => ({ error: jest.fn(), info: jest.fn() }),
  },
}));

import { PurchaseLimiterService } from '../../../../src/services/high-demand/purchase-limiter.service';

describe('PurchaseLimiterService Component Tests', () => {
  let service: PurchaseLimiterService;
  let userId: string;
  let eventId: string;

  beforeEach(() => {
    userId = uuidv4();
    eventId = uuidv4();
    mockQuery.mockReset();
    mockRedisExists.mockReset();
    mockRedisTtl.mockReset();
    mockRedisSetex.mockReset();

    // Default mocks
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('event_purchase_limits')) {
        return { rows: [{ purchase_limit_per_user: 4, purchase_limit_per_payment_method: 4, purchase_limit_per_address: 8 }] };
      }
      if (sql.includes('SUM(ticket_count)')) {
        return { rows: [{ total: '0' }] };
      }
      if (sql.includes('billing_address')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    mockRedisExists.mockResolvedValue(0);

    service = new PurchaseLimiterService();
  });

  // ===========================================================================
  // CHECK PURCHASE LIMIT
  // ===========================================================================
  describe('checkPurchaseLimit()', () => {
    it('should allow purchase within limits', async () => {
      const result = await service.checkPurchaseLimit(
        userId,
        eventId,
        2,
        { type: 'card', fingerprint: 'fp_123' }
      );

      expect(result.allowed).toBe(true);
      expect(result.limits.perUser).toBe(4);
    });

    it('should reject when user limit exceeded', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('event_purchase_limits')) {
          return { rows: [{ purchase_limit_per_user: 4 }] };
        }
        if (sql.includes('SUM(ticket_count)') && sql.includes('user_id')) {
          return { rows: [{ total: '3' }] }; // Already has 3
        }
        return { rows: [{ total: '0' }] };
      });

      const result = await service.checkPurchaseLimit(
        userId,
        eventId,
        2, // Requesting 2 more, total would be 5
        { type: 'card' }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Maximum 4 tickets per person');
    });

    it('should reject when payment method limit exceeded', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('event_purchase_limits')) {
          return { rows: [{ purchase_limit_per_user: 10, purchase_limit_per_payment_method: 4 }] };
        }
        if (sql.includes('payment_method_fingerprint')) {
          return { rows: [{ total: '3' }] };
        }
        return { rows: [{ total: '0' }] };
      });

      const result = await service.checkPurchaseLimit(
        userId,
        eventId,
        2,
        { type: 'card', fingerprint: 'fp_123' }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('payment method');
    });

    it('should check address limits', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('event_purchase_limits')) {
          return { rows: [{ purchase_limit_per_user: 10, purchase_limit_per_payment_method: 10, purchase_limit_per_address: 8 }] };
        }
        if (sql.includes('billing_address')) {
          return { rows: [{ billing_address: '123 Main St' }] };
        }
        if (sql.includes('normalized_address')) {
          return { rows: [{ total: '7' }] };
        }
        return { rows: [{ total: '0' }] };
      });

      const result = await service.checkPurchaseLimit(
        userId,
        eventId,
        2,
        { type: 'card' }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('household');
    });

    it('should enforce cooldown period', async () => {
      mockRedisExists.mockResolvedValueOnce(1); // Cooldown exists
      mockRedisTtl.mockResolvedValueOnce(300); // 5 minutes remaining

      const result = await service.checkPurchaseLimit(
        userId,
        eventId,
        2,
        { type: 'card' }
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('wait');
    });

    it('should return default limits when not configured', async () => {
      mockQuery.mockImplementation(async (sql: string) => {
        if (sql.includes('event_purchase_limits')) {
          return { rows: [] }; // No custom limits
        }
        return { rows: [{ total: '0' }] };
      });

      const result = await service.checkPurchaseLimit(
        userId,
        eventId,
        2,
        { type: 'card' }
      );

      expect(result.limits.perUser).toBe(4);
      expect(result.limits.perPaymentMethod).toBe(4);
      expect(result.limits.perAddress).toBe(8);
    });
  });

  // ===========================================================================
  // RECORD PURCHASE
  // ===========================================================================
  describe('recordPurchase()', () => {
    it('should set cooldown in Redis', async () => {
      await service.recordPurchase(userId, eventId, 2, { type: 'card' });

      expect(mockRedisSetex).toHaveBeenCalledWith(
        `cooldown:${userId}:${eventId}`,
        600, // 10 minutes in seconds
        '1'
      );
    });
  });

  // ===========================================================================
  // ENFORCE DYNAMIC LIMITS
  // ===========================================================================
  describe('enforceDynamicLimits()', () => {
    it('should reduce limits for very high demand', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.enforceDynamicLimits(eventId, 0.95);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE event_purchase_limits'),
        expect.arrayContaining([eventId, 2, 2])
      );
    });

    it('should moderately reduce limits for high demand', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.enforceDynamicLimits(eventId, 0.75);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE event_purchase_limits'),
        expect.arrayContaining([eventId, 3, 3])
      );
    });
  });

  // ===========================================================================
  // GET PURCHASE LIMIT STATS
  // ===========================================================================
  describe('getPurchaseLimitStats()', () => {
    it('should return purchase statistics', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          unique_purchasers: '500',
          avg_tickets: '2.5',
          max_tickets: '4',
          violations: '25',
        }]
      });

      const result = await service.getPurchaseLimitStats(eventId);

      expect(result.uniquePurchasers).toBe(500);
      expect(result.averageTicketsPerPurchaser).toBe(2.5);
      expect(result.maxTicketsPurchased).toBe(4);
      expect(result.limitViolationsBlocked).toBe(25);
    });
  });
});
