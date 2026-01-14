/**
 * Unit Tests: Discount Combination Service
 * Tests promo code combination rules and discount calculations
 * Comprehensive coverage of all business logic and edge cases
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockPool),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { DiscountCombinationService } from '../../../src/services/discount-combination.service';
import { CombinationRuleType } from '../../../src/types/combination.types';
import { DiscountType, PromoCode } from '../../../src/types/promo-code.types';

describe('DiscountCombinationService', () => {
  let service: DiscountCombinationService;
  const tenantId = 'tenant-123';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DiscountCombinationService();
  });

  describe('validateCombination', () => {
    it('should allow combination when no rules exist', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.validateCombination(tenantId, ['promo-1', 'promo-2']);

      expect(result.canCombine).toBe(true);
      expect(result.errorMessage).toBeUndefined();
      expect(result.conflictingRules).toBeUndefined();
    });

    it('should allow combination when rules exist but no conflicts', async () => {
      const rule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.MUTUALLY_EXCLUSIVE,
        promo_code_ids: ['other-1', 'other-2'], // Different codes
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [rule] });

      const result = await service.validateCombination(tenantId, ['promo-1', 'promo-2']);

      expect(result.canCombine).toBe(true);
    });

    it('should reject when single promo code conflicts with mutually exclusive rule', async () => {
      const rule = {
        id: 'rule-123',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.MUTUALLY_EXCLUSIVE,
        promo_code_ids: ['promo-1', 'promo-2'],
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [rule] });

      const result = await service.validateCombination(tenantId, ['promo-1']);

      expect(result.canCombine).toBe(false);
      expect(result.conflictingRules).toEqual(['rule-123']);
      expect(result.errorMessage).toContain('mutually exclusive');
      expect(result.errorMessage).toContain('promo-1');
    });

    it('should reject when multiple promo codes conflict with mutually exclusive rule', async () => {
      const rule = {
        id: 'rule-123',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.MUTUALLY_EXCLUSIVE,
        promo_code_ids: ['promo-1', 'promo-2', 'promo-3'],
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [rule] });

      const result = await service.validateCombination(tenantId, ['promo-1', 'promo-2']);

      expect(result.canCombine).toBe(false);
      expect(result.conflictingRules).toContain('rule-123');
      expect(result.errorMessage).toContain('promo-1');
      expect(result.errorMessage).toContain('promo-2');
    });

    it('should stop at first mutually exclusive conflict (priority order)', async () => {
      const highPriorityRule = {
        id: 'rule-high',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.MUTUALLY_EXCLUSIVE,
        promo_code_ids: ['promo-1', 'promo-2'],
        priority: 20,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const lowPriorityRule = {
        id: 'rule-low',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.MUTUALLY_EXCLUSIVE,
        promo_code_ids: ['promo-3', 'promo-4'],
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [highPriorityRule, lowPriorityRule] });

      const result = await service.validateCombination(tenantId, ['promo-1', 'promo-2']);

      expect(result.canCombine).toBe(false);
      expect(result.conflictingRules).toEqual(['rule-high']);
    });

    it('should allow stackable promo codes', async () => {
      const rule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: ['promo-1', 'promo-2'],
        max_combined_discount_percent: 50,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [rule] });

      const result = await service.validateCombination(tenantId, ['promo-1', 'promo-2']);

      expect(result.canCombine).toBe(true);
      expect(result.maxDiscount).toBe(50);
    });

    it('should return maxDiscount only when all codes match stackable rule', async () => {
      const rule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: ['code-1', 'code-2'],
        max_combined_discount_percent: 30,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [rule] });

      // Only one code matches
      const result = await service.validateCombination(tenantId, ['code-1', 'code-3']);

      expect(result.canCombine).toBe(true);
      expect(result.maxDiscount).toBeUndefined();
    });

    it('should return maxDiscount when exact match with stackable rule', async () => {
      const rule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: ['code-1', 'code-2'],
        max_combined_discount_percent: 40,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [rule] });

      const result = await service.validateCombination(tenantId, ['code-1', 'code-2']);

      expect(result.canCombine).toBe(true);
      expect(result.maxDiscount).toBe(40);
    });

    it('should query only active rules for tenant', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.validateCombination(tenantId, ['code-1']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $1'),
        [tenantId]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = TRUE'),
        expect.any(Array)
      );
    });

    it('should order rules by priority DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await service.validateCombination(tenantId, ['code-1']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority DESC'),
        expect.any(Array)
      );
    });

    it('should handle empty promo code array', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.validateCombination(tenantId, []);

      expect(result.canCombine).toBe(true);
    });

    it('should handle single promo code', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.validateCombination(tenantId, ['code-1']);

      expect(result.canCombine).toBe(true);
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(service.validateCombination(tenantId, ['code-1'])).rejects.toThrow('Database connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith('Error validating promo code combination', expect.any(Object));
    });

    it('should map database rows to rules correctly', async () => {
      const dbRow = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: ['a', 'b'],
        max_combined_discount_percent: 25,
        priority: 5,
        is_active: true,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockQuery.mockResolvedValue({ rows: [dbRow] });

      const result = await service.validateCombination(tenantId, ['a', 'b']);

      expect(result.canCombine).toBe(true);
      expect(result.maxDiscount).toBe(25);
    });
  });

  describe('calculateCombinedDiscount', () => {
    it('should return 0 for empty promo codes array', async () => {
      const result = await service.calculateCombinedDiscount([], 10000);

      expect(result).toBe(0);
    });

    it('should handle single percentage discount', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10, // 10%
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      expect(result).toBe(1000); // 10% of 10000
    });

    it('should handle single fixed amount discount', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 500,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      expect(result).toBe(500);
    });

    it('should floor percentage discounts', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10.5, // 10.5%
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 9999);

      // 9999 * 0.105 = 1049.895, Math.floor = 1049
      expect(result).toBe(1049);
    });

    it('should cap fixed amount discount at remaining total', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 15000, // More than order total
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      expect(result).toBe(10000); // Capped at order total
    });

    it('should apply fixed amount discounts before percentage discounts', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10, // 10%
        } as PromoCode,
        {
          id: 'promo-2',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 1000, // $10
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      // Fixed amount applied first: 10000 - 1000 = 9000
      // Then percentage: 9000 * 10% = 900
      // Total discount: 1000 + 900 = 1900
      expect(result).toBe(1900);
    });

    it('should apply multiple percentage discounts sequentially', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 20, // 20%
        } as PromoCode,
        {
          id: 'promo-2',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10, // 10%
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      // First: 10000 * 20% = 2000, remaining = 8000
      // Second: 8000 * 10% = 800
      // Total discount: 2800
      expect(result).toBe(2800);
    });

    it('should apply multiple fixed amounts sequentially', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 500,
        } as PromoCode,
        {
          id: 'promo-2',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 300,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      // First: 500, remaining = 9500
      // Second: 300, remaining = 9200
      // Total: 800
      expect(result).toBe(800);
    });

    it('should handle complex combination of fixed and percentage discounts', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10,
        } as PromoCode,
        {
          id: 'promo-2',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 1000,
        } as PromoCode,
        {
          id: 'promo-3',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 5,
        } as PromoCode,
        {
          id: 'promo-4',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 500,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      // Fixed first: 1000, remaining = 9000
      // Fixed second: 500, remaining = 8500
      // Percentage first: 8500 * 10% = 850, remaining = 7650
      // Percentage second: 7650 * 5% = 382, remaining = 7268
      // Total: 1000 + 500 + 850 + 382 = 2732
      expect(result).toBe(2732);
    });

    it('should handle zero order total', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 10,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 0);

      expect(result).toBe(0);
    });

    it('should handle zero discount value', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 0,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      expect(result).toBe(0);
    });

    it('should handle 100% discount', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 100,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      expect(result).toBe(10000);
    });

    it('should handle discounts that reduce order to zero', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 5000,
        } as PromoCode,
        {
          id: 'promo-2',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 100,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 5000);

      // Fixed: 5000, remaining = 0
      // Percentage: 0 * 100% = 0
      // Total: 5000
      expect(result).toBe(5000);
    });

    it('should not apply discount when order total is consumed', async () => {
      const promoCodes = [
        {
          id: 'promo-1',
          discountType: DiscountType.FIXED_AMOUNT,
          discountValue: 10000,
        } as PromoCode,
        {
          id: 'promo-2',
          discountType: DiscountType.PERCENTAGE,
          discountValue: 50,
        } as PromoCode,
      ];

      const result = await service.calculateCombinedDiscount(promoCodes, 10000);

      // Fixed consumes all: 10000, remaining = 0
      // Percentage can't apply: 0 * 50% = 0
      // Total: 10000
      expect(result).toBe(10000);
    });
  });

  describe('checkMaxDiscount', () => {
    const promoCodeIds = ['promo-1', 'promo-2'];

    it('should return true if discount within max limit', async () => {
      const stackableRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: promoCodeIds,
        max_combined_discount_percent: 50,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [stackableRule] });

      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 3000, 10000); // 30%

      expect(result).toBe(true);
    });

    it('should return false if discount exceeds max limit', async () => {
      const stackableRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: promoCodeIds,
        max_combined_discount_percent: 20,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [stackableRule] });

      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 3000, 10000); // 30%

      expect(result).toBe(false);
    });

    it('should return true if exactly at max limit', async () => {
      const stackableRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: promoCodeIds,
        max_combined_discount_percent: 25,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [stackableRule] });

      // 2500 / 10000 = 25% (exactly at limit)
      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 2500, 10000);

      expect(result).toBe(true);
    });

    it('should return true if no max discount configured', async () => {
      const stackableRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: promoCodeIds,
        max_combined_discount_percent: null,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [stackableRule] });

      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 8000, 10000); // 80%

      expect(result).toBe(true);
    });

    it('should return false if combination not allowed', async () => {
      const mutuallyExclusiveRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.MUTUALLY_EXCLUSIVE,
        promo_code_ids: promoCodeIds,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mutuallyExclusiveRule] });

      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 3000, 10000);

      expect(result).toBe(false);
    });

    it('should handle zero discount amount', async () => {
      const stackableRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: promoCodeIds,
        max_combined_discount_percent: 50,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [stackableRule] });

      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 0, 10000); // 0%

      expect(result).toBe(true);
    });

    it('should return true when no stackable rule matches', async () => {
      const stackableRule = {
        id: 'rule-1',
        tenant_id: tenantId,
        rule_type: CombinationRuleType.STACKABLE,
        promo_code_ids: ['other-1', 'other-2'], // Different codes
        max_combined_discount_percent: 10,
        priority: 10,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [stackableRule] });

      // No stackable rule matches, so no maxDiscount constraint
      const result = await service.checkMaxDiscount(tenantId, promoCodeIds, 8000, 10000); // 80%

      expect(result).toBe(true);
    });
  });
});
