import { v4 as uuidv4 } from 'uuid';
import { DiscountService } from '../../src/services/discountService';
import { DatabaseService } from '../../src/services/databaseService';

/**
 * INTEGRATION TESTS FOR DISCOUNT SERVICE
 * 
 * Schema: discounts (id, tenant_id, code, discount_type, discount_value, max_uses, times_used, valid_from, valid_until, is_active)
 */

describe('DiscountService Integration Tests', () => {
  let discountService: DiscountService;
  let testTenantId: string;
  let testDiscountId: string;

  beforeAll(async () => {
    await DatabaseService.initialize();
    discountService = new DiscountService();
  });

  beforeEach(async () => {
    testTenantId = uuidv4();

    // Create tenant
    await DatabaseService.query(
      'INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)',
      [testTenantId, 'Test Tenant', `test-${testTenantId.substring(0, 8)}`]
    );

    // Create test percentage discount (10% off)
    const result = await DatabaseService.query(
      `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, max_uses, valid_from, valid_until, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [testTenantId, 'TEST10', 'percentage', 10, 100, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), true]
    );
    testDiscountId = result.rows[0].id;
  });

  afterEach(async () => {
    await DatabaseService.query('DELETE FROM discounts WHERE tenant_id = $1', [testTenantId]);
    await DatabaseService.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  });

  afterAll(async () => {
    await DatabaseService.close();
  });

  describe('applyDiscounts', () => {
    it('should apply percentage discount correctly', async () => {
      const result = await discountService.applyDiscounts(
        10000, // $100.00
        ['TEST10'],
        testTenantId
      );

      expect(result.finalAmountCents).toBe(9000); // $90.00
      expect(result.totalDiscountCents).toBe(1000); // $10.00
      expect(result.discountsApplied.length).toBe(1);
      expect(result.discountsApplied[0].code).toBe('TEST10');
    });

    it('should return original amount when no discount codes provided', async () => {
      const result = await discountService.applyDiscounts(10000, [], testTenantId);

      expect(result.finalAmountCents).toBe(10000);
      expect(result.totalDiscountCents).toBe(0);
      expect(result.discountsApplied.length).toBe(0);
    });

    it('should handle fixed amount discount', async () => {
      // Create fixed discount ($5.00 off = 5.00 in discount_value)
      const fixed = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'FIXED5', 'fixed', 5.00, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), true]
      );

      const result = await discountService.applyDiscounts(10000, ['FIXED5'], testTenantId);

      expect(result.finalAmountCents).toBe(9500); // $95.00
      expect(result.totalDiscountCents).toBe(500); // $5.00

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [fixed.rows[0].id]);
    });

    it('should handle expired discounts', async () => {
      const expired = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'EXPIRED', 'percentage', 50, new Date(Date.now() - 7*24*60*60*1000), new Date(Date.now() - 24*60*60*1000), true]
      );

      const result = await discountService.applyDiscounts(10000, ['EXPIRED'], testTenantId);

      expect(result.discountsApplied.length).toBe(0);
      expect(result.finalAmountCents).toBe(10000);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [expired.rows[0].id]);
    });

    it('should handle discounts not yet valid', async () => {
      const future = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'FUTURE', 'percentage', 50, new Date(Date.now() + 24*60*60*1000), new Date(Date.now() + 7*24*60*60*1000), true]
      );

      const result = await discountService.applyDiscounts(10000, ['FUTURE'], testTenantId);

      expect(result.discountsApplied.length).toBe(0);
      expect(result.finalAmountCents).toBe(10000);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [future.rows[0].id]);
    });

    it('should record discount usage', async () => {
      await discountService.applyDiscounts(10000, ['TEST10'], testTenantId);

      const usage = await DatabaseService.query(
        'SELECT times_used FROM discounts WHERE id = $1',
        [testDiscountId]
      );

      expect(usage.rows[0].times_used).toBe(1);
    });

    it('should respect max uses limit', async () => {
      const limited = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, max_uses, times_used, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [testTenantId, 'LIMITED', 'percentage', 10, 10, 10, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), true]
      );

      const result = await discountService.applyDiscounts(10000, ['LIMITED'], testTenantId);

      expect(result.discountsApplied.length).toBe(0);
      expect(result.finalAmountCents).toBe(10000);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [limited.rows[0].id]);
    });

    it('should handle invalid discount codes gracefully', async () => {
      const result = await discountService.applyDiscounts(10000, ['INVALID'], testTenantId);

      expect(result.discountsApplied.length).toBe(0);
      expect(result.finalAmountCents).toBe(10000);
    });

    it('should not apply discount below $0', async () => {
      const huge = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'HUGE', 'percentage', 200, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), true]
      );

      const result = await discountService.applyDiscounts(1000, ['HUGE'], testTenantId);

      expect(result.finalAmountCents).toBe(0);
      expect(result.totalDiscountCents).toBe(1000);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [huge.rows[0].id]);
    });

    it('should handle inactive discounts', async () => {
      const inactive = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'INACTIVE', 'percentage', 50, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), false]
      );

      const result = await discountService.applyDiscounts(10000, ['INACTIVE'], testTenantId);

      expect(result.discountsApplied.length).toBe(0);
      expect(result.finalAmountCents).toBe(10000);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [inactive.rows[0].id]);
    });

    it('should apply only first valid discount (no stacking)', async () => {
      const second = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'EXTRA5', 'percentage', 5, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), true]
      );

      const result = await discountService.applyDiscounts(10000, ['TEST10', 'EXTRA5'], testTenantId);

      // Only one discount should be applied
      expect(result.discountsApplied.length).toBe(1);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [second.rows[0].id]);
    });

    it('should handle null valid_from and valid_until', async () => {
      const noDate = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, is_active)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [testTenantId, 'NODATE', 'percentage', 15, true]
      );

      const result = await discountService.applyDiscounts(10000, ['NODATE'], testTenantId);

      expect(result.discountsApplied.length).toBe(1);
      expect(result.totalDiscountCents).toBe(1500);

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [noDate.rows[0].id]);
    });
  });

  describe('validateDiscountCode', () => {
    it('should validate active discount code', async () => {
      const result = await discountService.validateDiscountCode('TEST10', testTenantId);

      expect(result.valid).toBe(true);
      expect(result.discount).toBeDefined();
      expect(result.discount!.type).toBe('percentage');
      expect(result.discount!.value).toBe(10);
    });

    it('should reject invalid discount code', async () => {
      const result = await discountService.validateDiscountCode('DOESNOTEXIST', testTenantId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Invalid discount code');
    });

    it('should reject expired discount', async () => {
      const expired = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'EXPIRED', 'percentage', 10, new Date(Date.now() - 7*24*60*60*1000), new Date(Date.now() - 24*60*60*1000), true]
      );

      const result = await discountService.validateDiscountCode('EXPIRED', testTenantId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Discount has expired');

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [expired.rows[0].id]);
    });

    it('should reject not yet active discount', async () => {
      const future = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'FUTURE', 'percentage', 10, new Date(Date.now() + 24*60*60*1000), new Date(Date.now() + 7*24*60*60*1000), true]
      );

      const result = await discountService.validateDiscountCode('FUTURE', testTenantId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Discount not yet active');

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [future.rows[0].id]);
    });

    it('should reject discount at usage limit', async () => {
      const maxed = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, max_uses, times_used, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [testTenantId, 'MAXED', 'percentage', 10, 100, 100, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), true]
      );

      const result = await discountService.validateDiscountCode('MAXED', testTenantId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Discount usage limit reached');

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [maxed.rows[0].id]);
    });

    it('should reject inactive discount', async () => {
      const inactive = await DatabaseService.query(
        `INSERT INTO discounts (tenant_id, code, discount_type, discount_value, valid_from, valid_until, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [testTenantId, 'INACTIVE', 'percentage', 10, new Date(Date.now() - 24*60*60*1000), new Date(Date.now() + 24*60*60*1000), false]
      );

      const result = await discountService.validateDiscountCode('INACTIVE', testTenantId);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Discount is not active');

      await DatabaseService.query('DELETE FROM discounts WHERE id = $1', [inactive.rows[0].id]);
    });
  });
});
