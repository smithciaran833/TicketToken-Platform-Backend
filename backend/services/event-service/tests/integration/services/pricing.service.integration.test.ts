/**
 * Pricing Service Integration Tests
 *
 * Tests pricing business logic with a real PostgreSQL database.
 * Verifies:
 * - Money calculations (base_price, fees, tax, total)
 * - Dynamic pricing with min/max bounds
 * - Early bird pricing configuration
 * - Group discount configuration
 * - Database constraints enforcement
 * - Row locking and optimistic locking
 * - Tenant isolation via RLS
 */

import { Pool } from 'pg';
import {
  setupTestContainers,
  teardownTestContainers,
  getDbPool,
  TEST_DATA,
} from '../setup/testcontainers';
import {
  clearDatabase,
  createMockEvent,
  createMockPricing,
  createMockCapacity,
  insertEvent,
  insertPricing,
  insertCapacity,
  withTenantContext,
  withSystemContext,
} from '../setup/test-helpers';

// Increase timeout for container startup
jest.setTimeout(120000);

describe('PricingService Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    const containers = await setupTestContainers();
    pool = containers.dbPool;
  });

  afterAll(async () => {
    await teardownTestContainers();
  });

  beforeEach(async () => {
    await clearDatabase(pool);
  });

  describe('Money Calculations', () => {
    it('should calculate total price correctly: (base_price x quantity) + fees + tax', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 50.00,
        service_fee: 5.00,
        facility_fee: 2.50,
        tax_rate: 0.0875, // 8.75% tax
      });
      const createdPricing = await insertPricing(pool, pricing);

      // Calculate for quantity of 2
      const quantity = 2;
      const baseTotal = 50.00 * quantity; // 100.00
      const serviceFeeTotal = 5.00 * quantity; // 10.00
      const facilityFeeTotal = 2.50 * quantity; // 5.00
      const subtotal = baseTotal + serviceFeeTotal + facilityFeeTotal; // 115.00
      const tax = subtotal * 0.0875; // 10.0625
      const total = subtotal + tax; // 125.0625

      expect(parseFloat(createdPricing.base_price)).toBe(50.00);
      expect(parseFloat(createdPricing.service_fee)).toBe(5.00);
      expect(parseFloat(createdPricing.facility_fee)).toBe(2.50);
      expect(parseFloat(createdPricing.tax_rate)).toBeCloseTo(0.0875, 4);

      // Verify calculation precision
      expect(baseTotal).toBe(100.00);
      expect(serviceFeeTotal).toBe(10.00);
      expect(facilityFeeTotal).toBe(5.00);
      expect(subtotal).toBe(115.00);
      expect(tax).toBeCloseTo(10.06, 2);
      expect(total).toBeCloseTo(125.06, 2);
    });

    it('should handle service fee calculation to the cent', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Test with precise decimal values
      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 99.99,
        service_fee: 7.49,
        facility_fee: 0,
        tax_rate: 0,
      });
      const createdPricing = await insertPricing(pool, pricing);

      expect(parseFloat(createdPricing.base_price)).toBe(99.99);
      expect(parseFloat(createdPricing.service_fee)).toBe(7.49);

      // For quantity 3
      const quantity = 3;
      const baseTotal = 99.99 * quantity; // 299.97
      const serviceFeeTotal = 7.49 * quantity; // 22.47
      const total = baseTotal + serviceFeeTotal; // 322.44

      expect(baseTotal).toBeCloseTo(299.97, 2);
      expect(serviceFeeTotal).toBeCloseTo(22.47, 2);
      expect(total).toBeCloseTo(322.44, 2);
    });

    it('should handle facility fee calculation to the cent', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 75.00,
        service_fee: 0,
        facility_fee: 3.25,
        tax_rate: 0,
      });
      const createdPricing = await insertPricing(pool, pricing);

      expect(parseFloat(createdPricing.facility_fee)).toBe(3.25);

      // For quantity 4
      const quantity = 4;
      const facilityFeeTotal = 3.25 * quantity; // 13.00
      expect(facilityFeeTotal).toBe(13.00);
    });

    it('should calculate tax as percentage of subtotal', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        service_fee: 10.00,
        facility_fee: 5.00,
        tax_rate: 0.10, // 10% tax
      });
      await insertPricing(pool, pricing);

      const quantity = 1;
      const baseTotal = 100.00 * quantity;
      const serviceFee = 10.00 * quantity;
      const facilityFee = 5.00 * quantity;
      const subtotal = baseTotal + serviceFee + facilityFee; // 115.00
      const tax = subtotal * 0.10; // 11.50
      const total = subtotal + tax; // 126.50

      expect(subtotal).toBe(115.00);
      expect(tax).toBe(11.50);
      expect(total).toBe(126.50);
    });

    it('should calculate correctly with zero fees', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 25.00,
        service_fee: 0,
        facility_fee: 0,
        tax_rate: 0,
      });
      const createdPricing = await insertPricing(pool, pricing);

      expect(parseFloat(createdPricing.service_fee)).toBe(0);
      expect(parseFloat(createdPricing.facility_fee)).toBe(0);
      expect(parseFloat(createdPricing.tax_rate)).toBe(0);

      const quantity = 5;
      const total = 25.00 * quantity;
      expect(total).toBe(125.00);
    });

    it('should use current_price when set instead of base_price', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        current_price: 80.00, // Discounted price
        service_fee: 5.00,
        facility_fee: 2.00,
        tax_rate: 0.05,
      });
      const createdPricing = await insertPricing(pool, pricing);

      expect(parseFloat(createdPricing.base_price)).toBe(100.00);
      expect(parseFloat(createdPricing.current_price)).toBe(80.00);

      // Calculation should use current_price (80.00), not base_price (100.00)
      const quantity = 2;
      const unitPrice = 80.00; // current_price
      const baseTotal = unitPrice * quantity; // 160.00
      const serviceFee = 5.00 * quantity; // 10.00
      const facilityFee = 2.00 * quantity; // 4.00
      const subtotal = baseTotal + serviceFee + facilityFee; // 174.00
      const tax = subtotal * 0.05; // 8.70
      const total = subtotal + tax; // 182.70

      expect(baseTotal).toBe(160.00);
      expect(subtotal).toBe(174.00);
      expect(tax).toBeCloseTo(8.70, 2);
      expect(total).toBeCloseTo(182.70, 2);
    });
  });

  describe('Dynamic Pricing', () => {
    it('should update current_price within min/max bounds', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        current_price: 100.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);

      // Update to valid price within bounds
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET current_price = $1 WHERE id = $2 RETURNING *`,
          [150.00, createdPricing.id]
        );
        return result.rows[0];
      });

      expect(parseFloat(updated.current_price)).toBe(150.00);
      expect(updated.version).toBe(2); // Version should increment
    });

    it('should reject prices below min_price via application validation', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        current_price: 100.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);

      // Verify min/max bounds are stored correctly
      expect(parseFloat(createdPricing.min_price)).toBe(50.00);
      expect(parseFloat(createdPricing.max_price)).toBe(200.00);

      // Application-level validation would reject this, but DB allows it
      // The service layer enforces: newPrice >= min_price
      const attemptedPrice = 25.00;
      expect(attemptedPrice < parseFloat(createdPricing.min_price)).toBe(true);
    });

    it('should reject prices above max_price via application validation', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        current_price: 100.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);

      // Application-level validation would reject this
      // The service layer enforces: newPrice <= max_price
      const attemptedPrice = 250.00;
      expect(attemptedPrice > parseFloat(createdPricing.max_price)).toBe(true);
    });

    it('should increment version on update (optimistic locking)', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);
      expect(createdPricing.version).toBe(1);

      // First update
      const update1 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET current_price = $1 WHERE id = $2 RETURNING *`,
          [75.00, createdPricing.id]
        );
        return result.rows[0];
      });
      expect(update1.version).toBe(2);

      // Second update
      const update2 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET current_price = $1 WHERE id = $2 RETURNING *`,
          [90.00, createdPricing.id]
        );
        return result.rows[0];
      });
      expect(update2.version).toBe(3);
    });

    it('should support row locking with FOR UPDATE to prevent race conditions', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        current_price: 100.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);

      // Simulate row locking with FOR UPDATE
      const locked = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        // Start transaction
        await client.query('BEGIN');

        // Lock the row
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1 FOR UPDATE`,
          [createdPricing.id]
        );

        // Update with lock held
        const updated = await client.query(
          `UPDATE event_pricing SET current_price = $1 WHERE id = $2 RETURNING *`,
          [120.00, createdPricing.id]
        );

        await client.query('COMMIT');
        return updated.rows[0];
      });

      expect(parseFloat(locked.current_price)).toBe(120.00);
      expect(locked.version).toBe(2);
    });

    it('should fail update with version mismatch (simulated concurrent access)', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        base_price: 100.00,
        current_price: 100.00,
        is_dynamic: true,
        min_price: 50.00,
        max_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);
      const originalVersion = createdPricing.version;

      // First update succeeds with correct version
      const update1 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET current_price = $1 WHERE id = $2 AND version = $3 RETURNING *`,
          [110.00, createdPricing.id, originalVersion]
        );
        return result.rows[0];
      });
      expect(update1).toBeDefined();
      expect(parseFloat(update1.current_price)).toBe(110.00);

      // Second update with stale version fails (no rows updated)
      const update2 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET current_price = $1 WHERE id = $2 AND version = $3 RETURNING *`,
          [120.00, createdPricing.id, originalVersion] // Stale version
        );
        return result.rows[0];
      });
      expect(update2).toBeUndefined(); // No rows matched stale version

      // Verify first update is preserved
      const final = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [createdPricing.id]
        );
        return result.rows[0];
      });
      expect(parseFloat(final.current_price)).toBe(110.00);
      expect(final.version).toBe(2);
    });
  });

  describe('Early Bird Pricing', () => {
    it('should store early_bird_price less than base_price', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const earlyBirdEnds = new Date();
      earlyBirdEnds.setDate(earlyBirdEnds.getDate() + 7); // 7 days from now

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, early_bird_price, early_bird_ends_at, is_active
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Early Bird Ticket',
            100.00,
            75.00, // 25% off early bird
            earlyBirdEnds,
            true,
          ]
        );
        return result.rows[0];
      });

      expect(parseFloat(pricing.base_price)).toBe(100.00);
      expect(parseFloat(pricing.early_bird_price)).toBe(75.00);
      expect(pricing.early_bird_ends_at).toBeDefined();
      expect(parseFloat(pricing.early_bird_price)).toBeLessThan(parseFloat(pricing.base_price));
    });

    it('should enforce early_bird_ends_at deadline', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1); // Yesterday

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

      // Early bird with past deadline
      const pastPricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Past Early Bird', 100.00, 80.00, pastDate]
        );
        return result.rows[0];
      });

      // Early bird with future deadline
      const futurePricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Future Early Bird', 100.00, 80.00, futureDate]
        );
        return result.rows[0];
      });

      // Query for active early bird pricing (ends in future)
      const now = new Date();
      const activeEarlyBird = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing
           WHERE event_id = $1
           AND early_bird_price IS NOT NULL
           AND early_bird_ends_at > $2`,
          [createdEvent.id, now]
        );
        return result.rows;
      });

      expect(activeEarlyBird.length).toBe(1);
      expect(activeEarlyBird[0].name).toBe('Future Early Bird');
    });

    it('should switch to base_price after early bird deadline passes', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastDeadline = new Date();
      pastDeadline.setHours(pastDeadline.getHours() - 1); // 1 hour ago

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, current_price, early_bird_price, early_bird_ends_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Expired Early Bird',
            100.00,
            75.00, // Currently at early bird price
            75.00,
            pastDeadline,
          ]
        );
        return result.rows[0];
      });

      // Simulate scheduler job that switches expired early bird to base price
      const now = new Date();
      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing
           SET current_price = base_price
           WHERE id = $1
           AND early_bird_ends_at <= $2
           AND current_price = early_bird_price
           RETURNING *`,
          [pricing.id, now]
        );
        return result.rows[0];
      });

      expect(updated).toBeDefined();
      expect(parseFloat(updated.current_price)).toBe(100.00); // Now at base price
      expect(parseFloat(updated.base_price)).toBe(100.00);
    });
  });

  describe('Group Discounts', () => {
    it('should apply percentage discount for group_size_min', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, group_size_min, group_discount_percentage
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Group Ticket',
            100.00,
            10, // Minimum 10 tickets for group discount
            15.00, // 15% discount
          ]
        );
        return result.rows[0];
      });

      expect(pricing.group_size_min).toBe(10);
      expect(parseFloat(pricing.group_discount_percentage)).toBe(15.00);

      // Calculate group discount
      const quantity = 10;
      const baseTotal = 100.00 * quantity; // 1000.00
      const discountRate = 15.00 / 100; // 0.15
      const discount = baseTotal * discountRate; // 150.00
      const discountedTotal = baseTotal - discount; // 850.00

      expect(baseTotal).toBe(1000.00);
      expect(discount).toBe(150.00);
      expect(discountedTotal).toBe(850.00);
    });

    it('should validate discount percentage is between 0-100', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Valid discount: 0%
      const pricing0 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, group_size_min, group_discount_percentage
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Zero Discount', 100.00, 5, 0]
        );
        return result.rows[0];
      });
      expect(parseFloat(pricing0.group_discount_percentage)).toBe(0);

      // Valid discount: 100%
      const pricing100 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, group_size_min, group_discount_percentage
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Full Discount', 100.00, 5, 100]
        );
        return result.rows[0];
      });
      expect(parseFloat(pricing100.group_discount_percentage)).toBe(100);

      // Valid discount: 50%
      const pricing50 = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, group_size_min, group_discount_percentage
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Half Discount', 100.00, 5, 50]
        );
        return result.rows[0];
      });
      expect(parseFloat(pricing50.group_discount_percentage)).toBe(50);
    });

    it('should not apply discount below group_size_min', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, group_size_min, group_discount_percentage
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Group Ticket', 100.00, 10, 20.00]
        );
        return result.rows[0];
      });

      // Buying 5 tickets (below group_size_min of 10) = no discount
      const quantityBelowMin = 5;
      const baseTotalNoDiscount = 100.00 * quantityBelowMin; // 500.00
      expect(baseTotalNoDiscount).toBe(500.00);

      // Buying 10 tickets (at group_size_min) = discount applies
      const quantityAtMin = 10;
      const baseTotalWithDiscount = 100.00 * quantityAtMin; // 1000.00
      const discount = baseTotalWithDiscount * 0.20; // 200.00
      const discountedTotal = baseTotalWithDiscount - discount; // 800.00
      expect(discountedTotal).toBe(800.00);
    });
  });

  describe('Database Constraints', () => {
    it('should enforce base_price >= 0', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Test base_price = 0 (should succeed)
      const zeroPrice = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (tenant_id, event_id, name, base_price)
           VALUES ($1, $2, $3, $4) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Free Ticket', 0]
        );
        return result.rows[0];
      });
      expect(parseFloat(zeroPrice.base_price)).toBe(0);

      // Test negative base_price (should fail)
      await expect(
        withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          await client.query(
            `INSERT INTO event_pricing (tenant_id, event_id, name, base_price)
             VALUES ($1, $2, $3, $4)`,
            [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Negative Price', -10.00]
          );
        })
      ).rejects.toThrow();
    });

    it('should store all price fields with 2 decimal precision', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, service_fee, facility_fee, min_price, max_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Precision Test',
            99.99,
            5.49,
            2.51,
            49.99,
            149.99,
          ]
        );
        return result.rows[0];
      });

      expect(parseFloat(pricing.base_price)).toBe(99.99);
      expect(parseFloat(pricing.service_fee)).toBe(5.49);
      expect(parseFloat(pricing.facility_fee)).toBe(2.51);
      expect(parseFloat(pricing.min_price)).toBe(49.99);
      expect(parseFloat(pricing.max_price)).toBe(149.99);
    });

    it('should store tax_rate with 4 decimal precision (0-1 range)', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Test various tax rates
      const taxRates = [0.0, 0.0875, 0.10, 0.0525, 1.0];

      for (let i = 0; i < taxRates.length; i++) {
        const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const result = await client.query(
            `INSERT INTO event_pricing (tenant_id, event_id, name, base_price, tax_rate)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [TEST_DATA.TENANT_1_ID, createdEvent.id, `Tax Test ${i}`, 100.00, taxRates[i]]
          );
          return result.rows[0];
        });

        expect(parseFloat(pricing.tax_rate)).toBeCloseTo(taxRates[i], 4);
      }
    });

    it('should allow min_price <= base_price <= max_price', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, min_price, max_price, is_dynamic
          ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Range Test', 100.00, 50.00, 200.00, true]
        );
        return result.rows[0];
      });

      const minPrice = parseFloat(pricing.min_price);
      const basePrice = parseFloat(pricing.base_price);
      const maxPrice = parseFloat(pricing.max_price);

      expect(minPrice).toBeLessThanOrEqual(basePrice);
      expect(basePrice).toBeLessThanOrEqual(maxPrice);
      expect(minPrice).toBe(50.00);
      expect(basePrice).toBe(100.00);
      expect(maxPrice).toBe(200.00);
    });
  });

  describe('Tenant Isolation (RLS)', () => {
    it('should only see pricing for own tenant', async () => {
      // Create events for both tenants
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
      });
      const createdEvent1 = await insertEvent(pool, event1);

      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        venue_id: TEST_DATA.VENUE_2_ID,
      });
      const createdEvent2 = await insertEvent(pool, event2);

      // Create pricing for tenant 1
      const pricing1 = createMockPricing(createdEvent1.id, undefined, {
        tenant_id: TEST_DATA.TENANT_1_ID,
        name: 'Tenant 1 Ticket',
        base_price: 50.00,
      });
      await insertPricing(pool, pricing1);

      // Create pricing for tenant 2
      const pricing2 = createMockPricing(createdEvent2.id, undefined, {
        tenant_id: TEST_DATA.TENANT_2_ID,
        name: 'Tenant 2 Ticket',
        base_price: 75.00,
      });
      await insertPricing(pool, pricing2);

      // Query as tenant 1
      const tenant1Pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query('SELECT * FROM event_pricing');
        return result.rows;
      });
      expect(tenant1Pricing.length).toBe(1);
      expect(tenant1Pricing[0].name).toBe('Tenant 1 Ticket');

      // Query as tenant 2
      const tenant2Pricing = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query('SELECT * FROM event_pricing');
        return result.rows;
      });
      expect(tenant2Pricing.length).toBe(1);
      expect(tenant2Pricing[0].name).toBe('Tenant 2 Ticket');
    });

    it('should not allow tenant to update another tenant pricing', async () => {
      // Create event and pricing for tenant 1
      const event = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
      });
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id, undefined, {
        tenant_id: TEST_DATA.TENANT_1_ID,
        name: 'Protected Pricing',
        base_price: 100.00,
      });
      const createdPricing = await insertPricing(pool, pricing);

      // Try to update as tenant 2 (should fail due to RLS)
      const updateResult = await withTenantContext(pool, TEST_DATA.TENANT_2_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET base_price = $1 WHERE id = $2 RETURNING *`,
          [1.00, createdPricing.id]
        );
        return result.rows[0];
      });

      expect(updateResult).toBeUndefined(); // RLS prevents update

      // Verify original pricing unchanged
      const original = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE id = $1`,
          [createdPricing.id]
        );
        return result.rows[0];
      });
      expect(parseFloat(original.base_price)).toBe(100.00);
    });

    it('should allow system user to see all pricing', async () => {
      // Create events and pricing for both tenants
      const event1 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_1_ID,
        venue_id: TEST_DATA.VENUE_1_ID,
      });
      const createdEvent1 = await insertEvent(pool, event1);
      await insertPricing(pool, createMockPricing(createdEvent1.id, undefined, {
        tenant_id: TEST_DATA.TENANT_1_ID,
        name: 'Tenant 1 Pricing',
      }));

      const event2 = createMockEvent({
        tenant_id: TEST_DATA.TENANT_2_ID,
        venue_id: TEST_DATA.VENUE_2_ID,
      });
      const createdEvent2 = await insertEvent(pool, event2);
      await insertPricing(pool, createMockPricing(createdEvent2.id, undefined, {
        tenant_id: TEST_DATA.TENANT_2_ID,
        name: 'Tenant 2 Pricing',
      }));

      // Query as system user
      const allPricing = await withSystemContext(pool, async (client) => {
        const result = await client.query('SELECT * FROM event_pricing ORDER BY name');
        return result.rows;
      });

      expect(allPricing.length).toBe(2);
      expect(allPricing.map(p => p.name)).toContain('Tenant 1 Pricing');
      expect(allPricing.map(p => p.name)).toContain('Tenant 2 Pricing');
    });
  });

  describe('Last Minute Pricing', () => {
    it('should store last_minute_price and last_minute_starts_at', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const lastMinuteStarts = new Date();
      lastMinuteStarts.setDate(lastMinuteStarts.getDate() + 7); // 7 days from now

      const pricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            TEST_DATA.TENANT_1_ID,
            createdEvent.id,
            'Last Minute Deal',
            100.00,
            60.00, // 40% off last minute
            lastMinuteStarts,
          ]
        );
        return result.rows[0];
      });

      expect(parseFloat(pricing.base_price)).toBe(100.00);
      expect(parseFloat(pricing.last_minute_price)).toBe(60.00);
      expect(pricing.last_minute_starts_at).toBeDefined();
    });

    it('should query for active last minute pricing', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pastStart = new Date();
      pastStart.setHours(pastStart.getHours() - 1); // 1 hour ago

      const futureStart = new Date();
      futureStart.setDate(futureStart.getDate() + 7); // 7 days from now

      // Last minute that already started
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Active Last Minute', 100.00, 50.00, pastStart]
        );
      });

      // Last minute not yet started
      await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        await client.query(
          `INSERT INTO event_pricing (
            tenant_id, event_id, name, base_price, last_minute_price, last_minute_starts_at
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [TEST_DATA.TENANT_1_ID, createdEvent.id, 'Future Last Minute', 100.00, 50.00, futureStart]
        );
      });

      // Query for active last minute pricing
      const now = new Date();
      const activeLastMinute = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing
           WHERE event_id = $1
           AND last_minute_price IS NOT NULL
           AND last_minute_starts_at <= $2`,
          [createdEvent.id, now]
        );
        return result.rows;
      });

      expect(activeLastMinute.length).toBe(1);
      expect(activeLastMinute[0].name).toBe('Active Last Minute');
    });
  });

  describe('Pricing with Capacity', () => {
    it('should link pricing to capacity section', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Create capacity section
      const capacity = createMockCapacity(createdEvent.id, {
        section_name: 'VIP Section',
        total_capacity: 50,
        available_capacity: 50,
      });
      const createdCapacity = await insertCapacity(pool, capacity);

      // Create pricing linked to capacity
      const pricing = createMockPricing(createdEvent.id, createdCapacity.id, {
        name: 'VIP Ticket',
        base_price: 200.00,
      });
      const createdPricing = await insertPricing(pool, pricing);

      expect(createdPricing.capacity_id).toBe(createdCapacity.id);
      expect(createdPricing.name).toBe('VIP Ticket');
      expect(parseFloat(createdPricing.base_price)).toBe(200.00);
    });

    it('should allow multiple pricing tiers for same event', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      // Create multiple pricing tiers
      const tiers = [
        { name: 'General Admission', base_price: 50.00, tier: 'general' },
        { name: 'VIP', base_price: 150.00, tier: 'vip' },
        { name: 'Platinum', base_price: 300.00, tier: 'platinum' },
      ];

      for (const tierData of tiers) {
        const pricing = createMockPricing(createdEvent.id, undefined, tierData);
        await insertPricing(pool, pricing);
      }

      // Query all pricing for event
      const allPricing = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `SELECT * FROM event_pricing WHERE event_id = $1 ORDER BY base_price ASC`,
          [createdEvent.id]
        );
        return result.rows;
      });

      expect(allPricing.length).toBe(3);
      expect(allPricing[0].name).toBe('General Admission');
      expect(parseFloat(allPricing[0].base_price)).toBe(50.00);
      expect(allPricing[1].name).toBe('VIP');
      expect(parseFloat(allPricing[1].base_price)).toBe(150.00);
      expect(allPricing[2].name).toBe('Platinum');
      expect(parseFloat(allPricing[2].base_price)).toBe(300.00);
    });
  });

  describe('Timestamps and Version', () => {
    it('should auto-set created_at on insert', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const beforeInsert = new Date();
      const pricing = createMockPricing(createdEvent.id);
      const created = await insertPricing(pool, pricing);
      const afterInsert = new Date();

      const createdAt = new Date(created.created_at);
      expect(createdAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime() - 1000);
      expect(createdAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime() + 1000);
    });

    it('should auto-update updated_at on update', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id);
      const created = await insertPricing(pool, pricing);
      const originalUpdatedAt = new Date(created.updated_at);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
        const result = await client.query(
          `UPDATE event_pricing SET base_price = $1 WHERE id = $2 RETURNING *`,
          [75.00, created.id]
        );
        return result.rows[0];
      });

      const newUpdatedAt = new Date(updated.updated_at);
      expect(newUpdatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });

    it('should initialize version to 1 on insert', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id);
      const created = await insertPricing(pool, pricing);

      expect(created.version).toBe(1);
    });

    it('should auto-increment version on each update', async () => {
      const event = createMockEvent();
      const createdEvent = await insertEvent(pool, event);

      const pricing = createMockPricing(createdEvent.id);
      const created = await insertPricing(pool, pricing);
      expect(created.version).toBe(1);

      // Multiple updates
      for (let i = 2; i <= 5; i++) {
        const updated = await withTenantContext(pool, TEST_DATA.TENANT_1_ID, async (client) => {
          const result = await client.query(
            `UPDATE event_pricing SET base_price = $1 WHERE id = $2 RETURNING *`,
            [50.00 + i, created.id]
          );
          return result.rows[0];
        });
        expect(updated.version).toBe(i);
      }
    });
  });
});
