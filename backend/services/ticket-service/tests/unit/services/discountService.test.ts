/**
 * Unit Tests for src/services/discountService.ts
 */

jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

const mockQuery = jest.fn();
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    query: mockQuery,
  },
}));

import { DiscountService, discountService } from '../../../src/services/discountService';

describe('services/discountService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('applyDiscounts()', () => {
    it('returns original amount when no discount codes', async () => {
      const result = await discountService.applyDiscounts(10000, []);

      expect(result).toEqual({
        finalAmountCents: 10000,
        discountsApplied: [],
        totalDiscountCents: 0,
      });
    });

    it('returns original amount when codes array is empty', async () => {
      const result = await discountService.applyDiscounts(10000, []);

      expect(result.finalAmountCents).toBe(10000);
    });

    it('applies percentage discount correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'disc-1',
            code: 'SAVE10',
            discount_type: 'percentage',
            discount_value: 10,
            is_active: true,
            times_used: 0,
          }],
        })
        .mockResolvedValueOnce({}); // UPDATE times_used

      const result = await discountService.applyDiscounts(10000, ['SAVE10']);

      expect(result.finalAmountCents).toBe(9000); // 10% off
      expect(result.totalDiscountCents).toBe(1000);
    });

    it('applies fixed discount correctly', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'disc-1',
            code: 'FLAT5',
            discount_type: 'fixed',
            discount_value: 5, // $5 in dollars
            is_active: true,
            times_used: 0,
          }],
        })
        .mockResolvedValueOnce({});

      const result = await discountService.applyDiscounts(10000, ['FLAT5']);

      expect(result.finalAmountCents).toBe(9500); // $5 = 500 cents off
      expect(result.totalDiscountCents).toBe(500);
    });

    it('caps discount at order amount', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'disc-1',
            code: 'HUGE',
            discount_type: 'fixed',
            discount_value: 200, // $200 off
            is_active: true,
            times_used: 0,
          }],
        })
        .mockResolvedValueOnce({});

      const result = await discountService.applyDiscounts(5000, ['HUGE']); // $50 order

      expect(result.finalAmountCents).toBe(0);
      expect(result.totalDiscountCents).toBe(5000);
    });

    it('only applies first valid discount (no stacking)', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 'disc-1', code: 'SAVE10', discount_type: 'percentage', discount_value: 10, is_active: true, times_used: 0 },
            { id: 'disc-2', code: 'SAVE20', discount_type: 'percentage', discount_value: 20, is_active: true, times_used: 0 },
          ],
        })
        .mockResolvedValueOnce({});

      const result = await discountService.applyDiscounts(10000, ['SAVE10', 'SAVE20']);

      expect(result.discountsApplied).toHaveLength(1);
      expect(result.discountsApplied[0].code).toBe('SAVE10');
    });

    it('records discount usage after applying', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'disc-123',
            code: 'SAVE10',
            discount_type: 'percentage',
            discount_value: 10,
            is_active: true,
            times_used: 0,
          }],
        })
        .mockResolvedValueOnce({});

      await discountService.applyDiscounts(10000, ['SAVE10']);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('times_used = times_used + 1'),
        ['disc-123']
      );
    });

    it('filters by tenant when tenantId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await discountService.applyDiscounts(10000, ['CODE'], 'tenant-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        [['CODE'], 'tenant-123']
      );
    });

    it('returns empty when no valid discounts found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await discountService.applyDiscounts(10000, ['INVALID']);

      expect(result.finalAmountCents).toBe(10000);
      expect(result.discountsApplied).toHaveLength(0);
    });
  });

  describe('validateDiscountCode()', () => {
    it('returns invalid for non-existent code', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await discountService.validateDiscountCode('FAKE');

      expect(result).toEqual({
        valid: false,
        reason: 'Invalid discount code',
      });
    });

    it('returns invalid for inactive discount', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_active: false }],
      });

      const result = await discountService.validateDiscountCode('INACTIVE');

      expect(result).toEqual({
        valid: false,
        reason: 'Discount is not active',
      });
    });

    it('returns invalid for not-yet-active discount', async () => {
      const futureDate = new Date(Date.now() + 86400000);
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_active: true, valid_from: futureDate }],
      });

      const result = await discountService.validateDiscountCode('FUTURE');

      expect(result).toEqual({
        valid: false,
        reason: 'Discount not yet active',
      });
    });

    it('returns invalid for expired discount', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_active: true, valid_until: pastDate }],
      });

      const result = await discountService.validateDiscountCode('EXPIRED');

      expect(result).toEqual({
        valid: false,
        reason: 'Discount has expired',
      });
    });

    it('returns invalid when usage limit reached', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ is_active: true, max_uses: 10, times_used: 10 }],
      });

      const result = await discountService.validateDiscountCode('MAXED');

      expect(result).toEqual({
        valid: false,
        reason: 'Discount usage limit reached',
      });
    });

    it('returns valid with discount details', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          is_active: true,
          discount_type: 'percentage',
          discount_value: 15,
          max_uses: 100,
          times_used: 5,
        }],
      });

      const result = await discountService.validateDiscountCode('VALID');

      expect(result).toEqual({
        valid: true,
        discount: {
          type: 'percentage',
          value: 15,
        },
      });
    });

    it('filters by tenant when tenantId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await discountService.validateDiscountCode('CODE', 'tenant-123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        ['CODE', 'tenant-123']
      );
    });
  });
});
