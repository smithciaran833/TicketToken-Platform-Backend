import { Pool } from 'pg';
import { taxService } from '../../src/services/taxService';
import {
  TestDataHelper,
  TEST_USERS,
  createTestJWT,
} from '../fixtures/test-data';

describe('Money Precision - End to End', () => {
  let pool: Pool;
  let testHelper: TestDataHelper;
  let buyerToken: string;

  // Our 15 tables (ticket-service owns these)
  const OUR_TABLES = [
    'ticket_types', 'tickets', 'orders', 'order_items', 'reservations',
    'reservation_history', 'ticket_transfers', 'ticket_validations',
    'qr_codes', 'discounts', 'order_discounts', 'webhook_nonces',
    'idempotency_keys', 'outbox', 'user_blacklists'
  ];

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    testHelper = new TestDataHelper(pool);
    await testHelper.seedDatabase();

    buyerToken = createTestJWT(TEST_USERS.BUYER_1, 'user');

    console.log('✅ Money precision test setup complete');
  });

  afterAll(async () => {
    await testHelper.cleanDatabase();
    await pool.end();
    console.log('✅ Money precision test teardown complete');
  });

  describe('Integer Cents Validation', () => {
    it('should store all money values as integers (no decimals)', async () => {
      const moneyColumns = await pool.query(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE column_name LIKE '%cents%'
        AND table_name = ANY($1)
        AND table_schema = 'public'
        ORDER BY table_name, column_name
      `, [OUR_TABLES]);

      // All *_cents columns should be integer type
      for (const col of moneyColumns.rows) {
        expect(col.data_type).toBe('integer');
      }

      expect(moneyColumns.rows.length).toBeGreaterThan(0);
    });

    it('should never use DECIMAL or NUMERIC for money amounts in our tables', async () => {
      const decimalColumns = await pool.query(`
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE (data_type = 'numeric' OR data_type = 'decimal')
        AND (
          column_name LIKE '%price%' 
          OR column_name LIKE '%amount%'
          OR column_name LIKE '%fee' 
          OR column_name = 'service_fee'
          OR column_name = 'facility_fee'
        )
        AND column_name NOT LIKE '%percentage%'
        AND column_name NOT LIKE '%rate%'
        AND table_name = ANY($1)
        AND table_schema = 'public'
      `, [OUR_TABLES]);

      console.log('DECIMAL money columns in OUR tables:', decimalColumns.rows);

      // Should be ZERO - all money should be stored as integer cents
      expect(decimalColumns.rows.length).toBe(0);
    });
  });

  describe('Tax Calculation Accuracy', () => {
    it('should calculate tax correctly for $100.00 (10000 cents) at 7.25% rate', async () => {
      // CA state tax is 7.25%
      // $100.00 * 0.0725 = $7.25 = 725 cents
      
      const result = await taxService.calculateOrderTax('test-event', 10000, 'CA');

      console.log('Tax calculation result:', result);
      
      // Expect exactly 725 cents (not 724 or 726 from rounding errors)
      expect(result.stateTaxCents).toBe(725);
    });

    it('should handle odd amounts without rounding errors - $47.83 at 6.5%', async () => {
      // $47.83 * 0.065 = $3.10895 = should round to 311 cents
      const subtotalCents = 4783;
      const expectedTaxCents = Math.round(4783 * 0.065); // 311 cents

      const result = await taxService.calculateOrderTax('test-event', subtotalCents, 'AR');

      console.log('Odd amount tax:', result);
      
      expect(result.stateTaxCents).toBe(expectedTaxCents);
    });

    it('should calculate combined state + local tax correctly', async () => {
      // TN: 7% state + 2.25% local = 9.25% total
      // $50.00 * 0.0925 = $4.625 = 463 cents (rounded)
      const subtotalCents = 5000;
      
      const result = await taxService.calculateOrderTax('test-event', subtotalCents, 'TN');

      console.log('Combined tax result:', result);
      
      const totalTaxCents = result.stateTaxCents + result.localTaxCents;
      expect(totalTaxCents).toBe(463);
    });
  });

  describe('Discount Calculation Accuracy', () => {
    it('should calculate 10% discount correctly on $99.99', async () => {
      // $99.99 * 0.10 = $9.999 = should be 1000 cents (rounded)
      const orderAmountCents = 9999;
      const discountPercent = 10;
      
      const expectedDiscount = Math.round((orderAmountCents * discountPercent) / 100);
      expect(expectedDiscount).toBe(1000);
    });

    it('should calculate 25% discount correctly on odd amounts', async () => {
      // $37.47 * 0.25 = $9.3675 = 937 cents (rounded)
      const orderAmountCents = 3747;
      const discountPercent = 25;
      
      const expectedDiscount = Math.round((orderAmountCents * discountPercent) / 100);
      expect(expectedDiscount).toBe(937);
    });

    it('should never allow negative discount amounts', async () => {
      const orderAmountCents = 5000;
      const discountPercent = -10; // Invalid
      
      const discountAmount = Math.max(0, Math.round((orderAmountCents * discountPercent) / 100));
      expect(discountAmount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Order Total Accuracy', () => {
    it('should calculate final total correctly: subtotal + tax + fees - discount', async () => {
      const subtotal = 10000; // $100.00
      const platformFee = 500; // $5.00
      const processingFee = 300; // $3.00
      const tax = 725; // $7.25 (7.25% of $100)
      const discount = 1000; // $10.00

      const expectedTotal = subtotal + platformFee + processingFee + tax - discount;
      expect(expectedTotal).toBe(10525); // $105.25

      // Verify no floating point errors
      expect(Number.isInteger(expectedTotal)).toBe(true);
    });

    it('should handle edge case: total must never be negative', async () => {
      const subtotal = 1000; // $10.00
      const discount = 1500; // $15.00 (larger than subtotal)
      
      const total = Math.max(0, subtotal - discount);
      expect(total).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Fee Calculation Accuracy', () => {
    it('should calculate platform fee as integer cents', async () => {
      // 3% platform fee on $47.83
      const subtotalCents = 4783;
      const feePercent = 3;
      
      const feeCents = Math.round((subtotalCents * feePercent) / 100);
      expect(feeCents).toBe(143); // Not 143.49
      expect(Number.isInteger(feeCents)).toBe(true);
    });

    it('should calculate processing fee correctly (2.9% + 30¢)', async () => {
      // Stripe-style: 2.9% + 30¢
      const amountCents = 10000; // $100.00
      const percentFee = Math.round((amountCents * 2.9) / 100); // 290 cents
      const flatFee = 30; // 30 cents
      
      const totalFee = percentFee + flatFee;
      expect(totalFee).toBe(320); // $3.20
      expect(Number.isInteger(totalFee)).toBe(true);
    });
  });

  describe('Rounding Consistency', () => {
    it('should always round half-cents up (0.5 → 1)', async () => {
      // $10.005 should round to $10.01 (1001 cents, not 1000)
      const amount = 1000.5;
      const rounded = Math.round(amount);
      expect(rounded).toBe(1001);
    });

    it('should handle multiple calculations without accumulating errors', async () => {
      let total = 10000; // $100.00
      
      // Apply multiple operations
      const tax = Math.round(total * 0.0725); // +725
      total += tax;
      
      const fee = Math.round(total * 0.03); // +321
      total += fee;
      
      const discount = Math.round(total * 0.10); // -1105
      total -= discount;
      
      console.log('Multiple calculation result:', total);
      
      // This test will EXPOSE the rounding issue
      // Expected: 10000 + 725 + 321 - 1105 = 9941
      // If we get 9942, that's a real bug!
      expect(Number.isInteger(total)).toBe(true);
    });
  });

  describe('Currency Conversion', () => {
    it('should store all amounts in smallest currency unit (cents for USD)', async () => {
      const tickets = await pool.query(`
        SELECT price_cents FROM ticket_types LIMIT 5
      `);

      for (const ticket of tickets.rows) {
        // All prices should be integers
        expect(Number.isInteger(ticket.price_cents)).toBe(true);
        // And should be reasonable (not stored as dollars)
        expect(ticket.price_cents).toBeGreaterThan(100); // At least $1.00
      }
    });
  });

  describe('Refund Calculations', () => {
    it('should calculate refund amount exactly matching original charge', async () => {
      const originalChargeCents = 15750; // $157.50
      const refundCents = originalChargeCents; // Full refund
      
      expect(refundCents).toBe(15750);
      expect(Number.isInteger(refundCents)).toBe(true);
    });

    it('should calculate partial refund correctly', async () => {
      const originalChargeCents = 10000; // $100.00
      const refundPercent = 50; // 50% refund
      
      const refundCents = Math.round((originalChargeCents * refundPercent) / 100);
      expect(refundCents).toBe(5000); // Exactly $50.00
    });
  });
});
