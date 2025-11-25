/**
 * Phase 3: Advanced Discounts Tests
 *
 * Tests discount system functionality:
 * - Fixed amount discounts
 * - Percentage discounts
 * - BOGO discounts
 * - Stacking rules & priority
 * - Min purchase requirements
 * - Max discount caps
 */

import { Pool } from 'pg';
import { DatabaseService } from '../../src/services/databaseService';
import { discountService } from '../../src/services/discountService';
import { TestDataHelper, DEFAULT_TENANT_ID, TEST_EVENT } from '../fixtures/test-data';
import { v4 as uuidv4 } from 'uuid';

describe('Phase 3: Advanced Discounts Integration', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;

  beforeAll(async () => {
    await DatabaseService.initialize();
    pool = DatabaseService.getPool();
    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await DatabaseService.close();
  });

  beforeEach(async () => {
    // Clean up discounts before each test
    await pool.query('DELETE FROM order_discounts WHERE 1=1');
    await pool.query('DELETE FROM discounts WHERE tenant_id = $1', [DEFAULT_TENANT_ID]);
  });

  // Helper to create a discount
  async function createDiscount(params: {
    code: string;
    type: 'percentage' | 'fixed' | 'bogo' | 'early_bird';
    value_cents?: number;
    value_percentage?: number;
    priority?: number;
    stackable?: boolean;
    min_purchase_cents?: number;
    max_discount_cents?: number;
    max_uses?: number;
  }) {
    const result = await pool.query(
      `INSERT INTO discounts (
        tenant_id, code, type, value_cents, value_percentage,
        priority, stackable, min_purchase_cents, max_discount_cents,
        max_uses, valid_from, valid_until, event_id, active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        DEFAULT_TENANT_ID,
        params.code,
        params.type,
        params.value_cents || 0,
        params.value_percentage || null,
        params.priority || 100,
        params.stackable !== undefined ? params.stackable : false,
        params.min_purchase_cents || null,
        params.max_discount_cents || null,
        params.max_uses || null,
        new Date(Date.now() - 86400000), // 1 day ago
        new Date(Date.now() + 86400000), // 1 day from now
        TEST_EVENT.id,
        true
      ]
    );
    return result.rows[0];
  }

  describe('1. Fixed Amount Discounts', () => {
    it('should apply fixed $10 discount correctly', async () => {
      await createDiscount({
        code: 'SAVE10',
        type: 'fixed',
        value_cents: 1000 // $10
      });

      const result = await discountService.applyDiscounts(
        5000, // $50 order
        ['SAVE10'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(1000);
      expect(result.finalAmountCents).toBe(4000); // $40
      expect(result.discountsApplied).toHaveLength(1);
      expect(result.discountsApplied[0].type).toBe('fixed');
    });

    it('should not discount more than order total', async () => {
      await createDiscount({
        code: 'SAVE50',
        type: 'fixed',
        value_cents: 5000 // $50
      });

      const result = await discountService.applyDiscounts(
        3000, // $30 order
        ['SAVE50'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(3000); // Only $30
      expect(result.finalAmountCents).toBe(0);
    });
  });

  describe('2. Percentage Discounts', () => {
    it('should apply 20% discount correctly', async () => {
      await createDiscount({
        code: 'TWENTY',
        type: 'percentage',
        value_percentage: 20
      });

      const result = await discountService.applyDiscounts(
        10000, // $100 order
        ['TWENTY'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(2000); // $20
      expect(result.finalAmountCents).toBe(8000); // $80
    });

    it('should respect max discount cap', async () => {
      await createDiscount({
        code: 'FIFTY',
        type: 'percentage',
        value_percentage: 50,
        max_discount_cents: 1000 // Cap at $10
      });

      const result = await discountService.applyDiscounts(
        10000, // $100 order (50% = $50, but capped at $10)
        ['FIFTY'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(1000); // $10 cap
      expect(result.finalAmountCents).toBe(9000); // $90
    });
  });

  describe('3. BOGO Discounts', () => {
    it('should apply BOGO discount (25% off)', async () => {
      await createDiscount({
        code: 'BOGO',
        type: 'bogo'
      });

      const result = await discountService.applyDiscounts(
        10000, // $100 order
        ['BOGO'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(2500); // 25% = $25
      expect(result.finalAmountCents).toBe(7500); // $75
      expect(result.discountsApplied[0].type).toBe('bogo');
    });
  });

  describe('4. Stacking Rules', () => {
    it('should stack multiple stackable discounts', async () => {
      await createDiscount({
        code: 'STACK1',
        type: 'fixed',
        value_cents: 500,
        stackable: true,
        priority: 10
      });

      await createDiscount({
        code: 'STACK2',
        type: 'fixed',
        value_cents: 300,
        stackable: true,
        priority: 20
      });

      const result = await discountService.applyDiscounts(
        10000, // $100 order
        ['STACK1', 'STACK2'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(800); // $5 + $3
      expect(result.finalAmountCents).toBe(9200); // $92
      expect(result.discountsApplied).toHaveLength(2);
    });

    it('should not stack non-stackable discount', async () => {
      await createDiscount({
        code: 'NOSTACK',
        type: 'fixed',
        value_cents: 2000,
        stackable: false,
        priority: 10
      });

      await createDiscount({
        code: 'STACK',
        type: 'fixed',
        value_cents: 500,
        stackable: true,
        priority: 20
      });

      const result = await discountService.applyDiscounts(
        10000,
        ['NOSTACK', 'STACK'],
        TEST_EVENT.id
      );

      // Only first (non-stackable) should apply
      expect(result.totalDiscountCents).toBe(2000);
      expect(result.discountsApplied).toHaveLength(1);
      expect(result.discountsApplied[0].code).toBe('NOSTACK');
    });

    it('should apply discounts in priority order', async () => {
      await createDiscount({
        code: 'LOW_PRIORITY',
        type: 'percentage',
        value_percentage: 10,
        stackable: true,
        priority: 100
      });

      await createDiscount({
        code: 'HIGH_PRIORITY',
        type: 'percentage',
        value_percentage: 20,
        stackable: true,
        priority: 1
      });

      const result = await discountService.applyDiscounts(
        10000, // $100
        ['LOW_PRIORITY', 'HIGH_PRIORITY'],
        TEST_EVENT.id
      );

      // High priority (20%) applies first: $100 - $20 = $80
      // Low priority (10%) applies second: $80 - $8 = $72
      expect(result.finalAmountCents).toBe(7200);
      expect(result.discountsApplied[0].code).toBe('HIGH_PRIORITY');
      expect(result.discountsApplied[1].code).toBe('LOW_PRIORITY');
    });
  });

  describe('5. Minimum Purchase Requirements', () => {
    it('should reject discount when minimum not met', async () => {
      await createDiscount({
        code: 'MIN50',
        type: 'fixed',
        value_cents: 1000,
        min_purchase_cents: 5000 // $50 minimum
      });

      const result = await discountService.applyDiscounts(
        3000, // $30 order (below minimum)
        ['MIN50'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(0);
      expect(result.discountsApplied).toHaveLength(0);
    });

    it('should apply discount when minimum met', async () => {
      await createDiscount({
        code: 'MIN50',
        type: 'fixed',
        value_cents: 1000,
        min_purchase_cents: 5000 // $50 minimum
      });

      const result = await discountService.applyDiscounts(
        6000, // $60 order (meets minimum)
        ['MIN50'],
        TEST_EVENT.id
      );

      expect(result.totalDiscountCents).toBe(1000);
      expect(result.finalAmountCents).toBe(5000);
    });
  });
});
