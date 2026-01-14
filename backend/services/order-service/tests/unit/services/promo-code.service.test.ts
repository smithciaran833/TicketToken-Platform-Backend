/**
 * Unit Tests: Promo Code Service
 * Tests promo code validation and application
 */

const mockQuery = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { PromoCodeService } from '../../../src/services/promo-code.service';
import { DiscountType } from '../../../src/types/promo-code.types';

describe('PromoCodeService', () => {
  let service: PromoCodeService;

  const validPromoRow = {
    id: 'promo-123',
    tenant_id: 'tenant-456',
    code: 'SAVE20',
    discount_type: 'PERCENTAGE',
    discount_value: 20,
    valid_from: new Date(Date.now() - 86400000),
    valid_until: new Date(Date.now() + 86400000),
    usage_limit: 100,
    usage_count: 10,
    per_user_limit: 1,
    min_purchase_cents: 1000,
    applicable_event_ids: null,
    applicable_categories: null,
    is_active: true,
    created_by: 'admin-1',
    metadata: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PromoCodeService();
  });

  describe('validatePromoCode', () => {
    it('should validate valid promo code', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [validPromoRow] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'SAVE20',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(true);
      expect(result.discountAmount).toBe(1000); // 20% of 5000
      expect(result.promoCode).toBeDefined();
    });

    it('should reject invalid code', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'INVALID',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Invalid promo code');
    });

    it('should reject expired code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...validPromoRow, valid_until: new Date(Date.now() - 86400000) }],
      });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'EXPIRED',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Promo code expired or not yet valid');
    });

    it('should reject not yet valid code', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...validPromoRow, valid_from: new Date(Date.now() + 86400000) }],
      });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'FUTURE',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Promo code expired or not yet valid');
    });

    it('should reject when usage limit reached', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...validPromoRow, usage_limit: 10, usage_count: 10 }],
      });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'MAXED',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Promo code usage limit reached');
    });

    it('should reject when below minimum purchase', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...validPromoRow, min_purchase_cents: 10000 }],
      });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'MINORDER',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toContain('Minimum purchase');
    });

    it('should reject when user already redeemed', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [validPromoRow] })
        .mockResolvedValueOnce({ rows: [{ count: '1' }] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'USED',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('You have already used this promo code');
    });

    it('should reject when event not applicable', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...validPromoRow, applicable_event_ids: ['event-1', 'event-2'] }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'EVENTONLY',
        orderTotal: 5000,
        userId: 'user-123',
        eventIds: ['event-3'],
      });

      expect(result.valid).toBe(false);
      expect(result.errorMessage).toBe('Promo code not applicable to these events');
    });

    it('should accept when event is applicable', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...validPromoRow, applicable_event_ids: ['event-1', 'event-2'] }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'EVENTONLY',
        orderTotal: 5000,
        userId: 'user-123',
        eventIds: ['event-1'],
      });

      expect(result.valid).toBe(true);
    });

    it('should be case insensitive', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [validPromoRow] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      await service.validatePromoCode('tenant-456', {
        code: 'save20',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPPER(code)'),
        expect.arrayContaining(['SAVE20'])
      );
    });

    it('should calculate fixed amount discount', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...validPromoRow, discount_type: 'FIXED_AMOUNT', discount_value: 500 }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'FLAT5',
        orderTotal: 10000,
        userId: 'user-123',
      });

      expect(result.discountAmount).toBe(500);
    });

    it('should cap fixed discount at order total', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ ...validPromoRow, discount_type: 'FIXED_AMOUNT', discount_value: 10000 }],
        })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const result = await service.validatePromoCode('tenant-456', {
        code: 'BIGFLAT',
        orderTotal: 5000,
        userId: 'user-123',
      });

      expect(result.discountAmount).toBe(5000);
    });
  });

  describe('applyPromoCode', () => {
    it('should record redemption and increment usage', async () => {
      await service.applyPromoCode('tenant-456', 'order-123', 'user-789', 'promo-123', 1000);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promo_code_redemptions'),
        expect.arrayContaining(['promo-123', 'order-123', 'user-789', 'tenant-456', 1000])
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE promo_codes SET usage_count = usage_count + 1'),
        ['promo-123']
      );
    });
  });

  describe('createPromoCode', () => {
    it('should create new promo code', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [validPromoRow] });

      const result = await service.createPromoCode('tenant-456', 'admin-1', {
        code: 'NEWCODE',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 15,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000 * 30),
      });

      expect(result.code).toBeDefined();
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO promo_codes'),
        expect.any(Array)
      );
    });

    it('should uppercase code on creation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [validPromoRow] });

      await service.createPromoCode('tenant-456', 'admin-1', {
        code: 'lowercase',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 10,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 86400000),
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPPER($2)'),
        expect.any(Array)
      );
    });
  });
});
