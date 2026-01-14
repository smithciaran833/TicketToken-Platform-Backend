/**
 * Unit Tests: Discount Calculator Service
 * Tests all discount calculation types
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { DiscountCalculatorService } from '../../../src/services/discount-calculator.service';
import { OrderItem, BOGORule, TieredRule, EarlyBirdRule } from '../../../src/types/discount.types';
import { PromoCode, DiscountType } from '../../../src/types/promo-code.types';

describe('DiscountCalculatorService', () => {
  let service: DiscountCalculatorService;

  beforeEach(() => {
    service = new DiscountCalculatorService();
  });

  describe('calculatePercentageDiscount', () => {
    it('should calculate percentage correctly', () => {
      expect(service.calculatePercentageDiscount(10000, 10)).toBe(1000);
      expect(service.calculatePercentageDiscount(10000, 25)).toBe(2500);
      expect(service.calculatePercentageDiscount(10000, 50)).toBe(5000);
    });

    it('should floor fractional cents', () => {
      expect(service.calculatePercentageDiscount(9999, 33)).toBe(3299);
    });

    it('should handle 0%', () => {
      expect(service.calculatePercentageDiscount(10000, 0)).toBe(0);
    });

    it('should handle 100%', () => {
      expect(service.calculatePercentageDiscount(10000, 100)).toBe(10000);
    });
  });

  describe('calculateFixedAmountDiscount', () => {
    it('should return fixed amount when less than total', () => {
      expect(service.calculateFixedAmountDiscount(10000, 500)).toBe(500);
    });

    it('should cap at order total', () => {
      expect(service.calculateFixedAmountDiscount(10000, 15000)).toBe(10000);
    });

    it('should handle zero discount', () => {
      expect(service.calculateFixedAmountDiscount(10000, 0)).toBe(0);
    });
  });

  describe('calculateBOGODiscount', () => {
    // Implementation: setsQualified = floor(totalQuantity / buyQuantity), freeItems = setsQualified * getQuantity
    // For buy 1 get 1 with 4 items: 4 sets, 4 free items at 100% off = full discount

    it('should calculate buy 1 get 1 free (4 items = 4 sets = 4 free)', () => {
      const items: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 4, priceCents: 5000 },
      ];
      const rule: BOGORule = { buyQuantity: 1, getQuantity: 1, getDiscountPercent: 100 };
      const result = service.calculateBOGODiscount(items, rule);

      // 4 items / 1 buyQuantity = 4 sets, 4 * 1 getQuantity = 4 free items
      // 4 items * 5000 * 100% = 20000 discount
      expect(result.originalAmount).toBe(20000);
      expect(result.discountAmount).toBe(20000);
      expect(result.finalAmount).toBe(0);
    });

    it('should calculate buy 2 get 1 free (4 items = 2 sets = 2 free)', () => {
      const items: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 4, priceCents: 5000 },
      ];
      const rule: BOGORule = { buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 };
      const result = service.calculateBOGODiscount(items, rule);

      // 4 items / 2 buyQuantity = 2 sets, 2 * 1 getQuantity = 2 free items
      // 2 items * 5000 * 100% = 10000 discount
      expect(result.originalAmount).toBe(20000);
      expect(result.discountAmount).toBe(10000);
      expect(result.finalAmount).toBe(10000);
    });

    it('should calculate buy 2 get 1 at 50% off', () => {
      const items: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 4, priceCents: 5000 },
      ];
      const rule: BOGORule = { buyQuantity: 2, getQuantity: 1, getDiscountPercent: 50 };
      const result = service.calculateBOGODiscount(items, rule);

      // 4 items / 2 buyQuantity = 2 sets, 2 * 1 getQuantity = 2 items at 50% off
      // 2 items * 5000 * 50% = 5000 discount
      expect(result.discountAmount).toBe(5000);
    });

    it('should apply discount to cheapest items first', () => {
      const mixedItems: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 2, priceCents: 10000 },
        { id: 'item-2', ticketTypeId: 'type-2', quantity: 2, priceCents: 5000 },
      ];
      // Total 4 items, buy 2 get 1 = 2 sets = 2 free items
      const rule: BOGORule = { buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 };
      const result = service.calculateBOGODiscount(mixedItems, rule);

      // Sorted by price: 5000, 5000, 10000, 10000
      // Free items applied to cheapest: 2 * 5000 = 10000 discount
      expect(result.originalAmount).toBe(30000);
      expect(result.discountAmount).toBe(10000);
      expect(result.finalAmount).toBe(20000);
    });

    it('should handle partial free items across item types', () => {
      const mixedItems: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 1, priceCents: 3000 },
        { id: 'item-2', ticketTypeId: 'type-2', quantity: 3, priceCents: 5000 },
      ];
      // Total 4 items, buy 1 get 1 = 4 sets = 4 free items
      const rule: BOGORule = { buyQuantity: 1, getQuantity: 1, getDiscountPercent: 100 };
      const result = service.calculateBOGODiscount(mixedItems, rule);

      // Sorted: 3000 (qty 1), 5000 (qty 3)
      // Free: 1 * 3000 + 3 * 5000 = 18000 discount
      expect(result.originalAmount).toBe(18000);
      expect(result.discountAmount).toBe(18000);
    });

    it('should include rule description in appliedRules', () => {
      const items: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 4, priceCents: 5000 },
      ];
      const rule: BOGORule = { buyQuantity: 1, getQuantity: 1, getDiscountPercent: 100 };
      const result = service.calculateBOGODiscount(items, rule);

      expect(result.appliedRules[0]).toContain('BOGO');
      expect(result.appliedRules[0]).toContain('Buy 1 get 1');
    });

    it('should handle case where not enough items for a set', () => {
      const items: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 1, priceCents: 5000 },
      ];
      const rule: BOGORule = { buyQuantity: 3, getQuantity: 1, getDiscountPercent: 100 };
      const result = service.calculateBOGODiscount(items, rule);

      // 1 item / 3 buyQuantity = 0 sets = 0 free
      expect(result.discountAmount).toBe(0);
      expect(result.finalAmount).toBe(5000);
    });
  });

  describe('calculateTieredDiscount', () => {
    const items: OrderItem[] = [
      { id: 'item-1', ticketTypeId: 'type-1', quantity: 5, priceCents: 2000 },
    ];

    const rules: TieredRule[] = [
      { minQuantity: 10, discountPercent: 20 },
      { minQuantity: 5, discountPercent: 10 },
      { minQuantity: 3, discountPercent: 5 },
    ];

    it('should apply correct tier discount', () => {
      const result = service.calculateTieredDiscount(items, rules);

      expect(result.discountAmount).toBe(1000); // 10% of 10000
      expect(result.appliedRules[0]).toContain('10%');
    });

    it('should apply highest qualifying tier', () => {
      const largeOrder: OrderItem[] = [{ id: 'item-1', ticketTypeId: 'type-1', quantity: 15, priceCents: 2000 }];
      const result = service.calculateTieredDiscount(largeOrder, rules);

      expect(result.discountAmount).toBe(6000); // 20% of 30000
    });

    it('should return no discount when below minimum tier', () => {
      const smallOrder: OrderItem[] = [{ id: 'item-1', ticketTypeId: 'type-1', quantity: 2, priceCents: 2000 }];
      const result = service.calculateTieredDiscount(smallOrder, rules);

      expect(result.discountAmount).toBe(0);
      expect(result.appliedRules).toHaveLength(0);
    });
  });

  describe('calculateEarlyBirdDiscount', () => {
    it('should apply percentage discount when within cutoff', () => {
      const rule: EarlyBirdRule = {
        cutoffDate: new Date(Date.now() + 86400000), // Tomorrow
        discountValue: 15,
        discountType: 'PERCENTAGE',
      };
      const result = service.calculateEarlyBirdDiscount(10000, rule);

      expect(result.discountAmount).toBe(1500);
    });

    it('should apply fixed discount when within cutoff', () => {
      const rule: EarlyBirdRule = {
        cutoffDate: new Date(Date.now() + 86400000),
        discountValue: 500,
        discountType: 'FIXED_AMOUNT',
      };
      const result = service.calculateEarlyBirdDiscount(10000, rule);

      expect(result.discountAmount).toBe(500);
    });

    it('should return no discount after cutoff', () => {
      const rule: EarlyBirdRule = {
        cutoffDate: new Date(Date.now() - 86400000), // Yesterday
        discountValue: 15,
        discountType: 'PERCENTAGE',
      };
      const result = service.calculateEarlyBirdDiscount(10000, rule);

      expect(result.discountAmount).toBe(0);
    });
  });

  describe('applyDiscountToOrder', () => {
    it('should apply percentage promo code', () => {
      const promoCode: PromoCode = {
        id: 'promo-1', tenantId: 'tenant-1', code: 'SAVE20',
        discountType: DiscountType.PERCENTAGE, discountValue: 20,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
        usageCount: 0, perUserLimit: 1, minPurchaseCents: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      };

      const result = service.applyDiscountToOrder(promoCode, 10000);

      expect(result.discountAmount).toBe(2000);
      expect(result.appliedRules[0]).toContain('SAVE20');
    });

    it('should apply fixed amount promo code', () => {
      const promoCode: PromoCode = {
        id: 'promo-1', tenantId: 'tenant-1', code: 'FLAT500',
        discountType: DiscountType.FIXED_AMOUNT, discountValue: 500,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
        usageCount: 0, perUserLimit: 1, minPurchaseCents: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      };

      const result = service.applyDiscountToOrder(promoCode, 10000);

      expect(result.discountAmount).toBe(500);
    });

    it('should throw error for BOGO without items', () => {
      const promoCode: PromoCode = {
        id: 'promo-1', tenantId: 'tenant-1', code: 'BOGO',
        discountType: DiscountType.BOGO, discountValue: 0,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
        usageCount: 0, perUserLimit: 1, minPurchaseCents: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      };

      expect(() => service.applyDiscountToOrder(promoCode, 10000)).toThrow('BOGO discount requires order items');
    });

    it('should throw error for tiered without items', () => {
      const promoCode: PromoCode = {
        id: 'promo-1', tenantId: 'tenant-1', code: 'TIER',
        discountType: DiscountType.TIERED, discountValue: 0,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
        usageCount: 0, perUserLimit: 1, minPurchaseCents: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      };

      expect(() => service.applyDiscountToOrder(promoCode, 10000)).toThrow('Tiered discount requires order items');
    });

    it('should apply BOGO with items', () => {
      const promoCode: PromoCode = {
        id: 'promo-1', tenantId: 'tenant-1', code: 'BOGODEAL',
        discountType: DiscountType.BOGO, discountValue: 0,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
        usageCount: 0, perUserLimit: 1, minPurchaseCents: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
        metadata: { bogoRule: { buyQuantity: 2, getQuantity: 1, getDiscountPercent: 100 } },
      };

      const items: OrderItem[] = [
        { id: 'item-1', ticketTypeId: 'type-1', quantity: 4, priceCents: 1000 },
      ];

      const result = service.applyDiscountToOrder(promoCode, 4000, items);

      // 4 items / 2 = 2 sets = 2 free items = 2000 discount
      expect(result.discountAmount).toBe(2000);
    });

    it('should return zero discount for unknown type', () => {
      const promoCode = {
        id: 'promo-1', tenantId: 'tenant-1', code: 'UNKNOWN',
        discountType: 'UNKNOWN' as DiscountType, discountValue: 100,
        validFrom: new Date(), validUntil: new Date(Date.now() + 86400000),
        usageCount: 0, perUserLimit: 1, minPurchaseCents: 0, isActive: true,
        createdAt: new Date(), updatedAt: new Date(),
      };

      const result = service.applyDiscountToOrder(promoCode, 10000);

      expect(result.discountAmount).toBe(0);
    });
  });
});
