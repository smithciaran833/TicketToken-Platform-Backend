/**
 * COMPONENT TEST: TransactionModel
 *
 * Tests TransactionModel with REAL Database
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-minimum-32-characters-long-for-testing';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'tickettoken_db';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'postgres';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing_only_1234567890';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_webhook_secret_for_testing_1234';
process.env.SERVICE_AUTH_SECRET = 'test-service-auth-secret-at-least-32-chars-long';
process.env.HMAC_SECRET = 'test-hmac-secret-that-is-at-least-32-characters-long';
process.env.LOG_LEVEL = 'silent';

// Shared pool for mock and tests
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  }
  return sharedPool;
}

// Mock database config to use direct pool
jest.mock('../../../src/config/database', () => ({
  query: async (text: string, values?: any[]) => {
    return getSharedPool().query(text, values);
  },
  getClient: async () => {
    return getSharedPool().connect();
  },
  getPool: () => getSharedPool(),
}));

// Mock logger to avoid config dependency
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { TransactionModel } from '../../../src/models/transaction.model';
import { TransactionStatus, TransactionType } from '../../../src/types/payment.types';

describe('TransactionModel Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let userId: string;
  let eventId: string;
  let venueId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    eventId = uuidv4();
    venueId = uuidv4();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    // Create test venue
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000]);

    // Create test event
    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`, new Date(Date.now() + 86400000)]);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // CREATE
  // ===========================================================================
  describe('create()', () => {
    it('should create a transaction with all required fields', async () => {
      const txn = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        type: TransactionType.TICKET_PURCHASE,
        amount: 10000,
        currency: 'USD',
        status: TransactionStatus.PENDING,
        platformFee: 500,
        venuePayout: 9500,
        tenantId,
      });

      expect(txn).toBeDefined();
      expect(txn.id).toBeDefined();
      expect(txn.venueId).toBe(venueId);
      expect(txn.userId).toBe(userId);
      expect(txn.eventId).toBe(eventId);
      expect(txn.type).toBe(TransactionType.TICKET_PURCHASE);
      expect(txn.amount).toBe(10000);
      expect(txn.currency).toBe('USD');
      expect(txn.status).toBe(TransactionStatus.PENDING);
      expect(txn.platformFee).toBe(500);
      expect(txn.venuePayout).toBe(9500);
    });

    it('should reject zero amount (DB constraint: amount must be positive)', async () => {
      // DB has CHECK constraint: chk_payment_transactions_amount_positive
      await expect(
        TransactionModel.create({
          venueId,
          userId,
          eventId,
          amount: 0,
          tenantId,
        })
      ).rejects.toThrow(/amount_positive/);
    });

    it('should create a transaction with minimum valid amount', async () => {
      const txn = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 1, // 1 cent - minimum valid
        tenantId,
      });

      expect(txn.amount).toBe(1);
    });

    it('should create a transaction with stripe payment intent ID', async () => {
      const stripeId = 'pi_test_123456789';

      const txn = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        stripePaymentIntentId: stripeId,
        tenantId,
      });

      expect(txn.stripePaymentIntentId).toBe(stripeId);
    });

    it('should create a transaction with metadata', async () => {
      const metadata = { ticketIds: ['t1', 't2'], promoCode: 'SAVE10' };

      const txn = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        metadata,
        tenantId,
      });

      expect(txn.metadata).toEqual(metadata);
    });

    it('should handle idempotency key (UUID format required)', async () => {
      const idempotencyKey = uuidv4(); // Must be UUID, not arbitrary string

      const txn = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        idempotencyKey,
        tenantId,
      });

      expect(txn).toBeDefined();
      expect(txn.id).toBeDefined();
    });

    it('should throw DUPLICATE_IDEMPOTENCY_KEY on duplicate', async () => {
      const idempotencyKey = uuidv4();

      await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        idempotencyKey,
        tenantId,
      });

      await expect(
        TransactionModel.create({
          venueId,
          userId,
          eventId,
          amount: 7500,
          idempotencyKey,
          tenantId,
        })
      ).rejects.toThrow('DUPLICATE_IDEMPOTENCY_KEY');
    });
  });

  // ===========================================================================
  // FIND BY ID
  // ===========================================================================
  describe('findById()', () => {
    it('should find a transaction by ID with safe fields only', async () => {
      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 10000,
        platformFee: 500,
        venuePayout: 9500,
        stripePaymentIntentId: 'pi_secret_123',
        metadata: { secret: 'data' },
        tenantId,
      });

      const found = await TransactionModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.amount).toBe(10000);

      // Safe version hides sensitive fields
      expect(found!.platformFee).toBe(0);
      expect(found!.venuePayout).toBe(0);
      expect(found!.stripePaymentIntentId).toBeUndefined();
      expect(found!.metadata).toEqual({});
    });

    it('should return null for non-existent transaction', async () => {
      const found = await TransactionModel.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByIdInternal()', () => {
    it('should find a transaction by ID with all fields', async () => {
      const stripeId = 'pi_internal_test_456';
      const metadata = { internal: 'data', ticketCount: 3 };

      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 15000,
        platformFee: 750,
        venuePayout: 14250,
        stripePaymentIntentId: stripeId,
        metadata,
        tenantId,
      });

      const found = await TransactionModel.findByIdInternal(created.id);

      expect(found).toBeDefined();
      expect(found!.platformFee).toBe(750);
      expect(found!.venuePayout).toBe(14250);
      expect(found!.stripePaymentIntentId).toBe(stripeId);
      expect(found!.metadata).toEqual(metadata);
    });
  });

  // ===========================================================================
  // FIND BY PAYMENT INTENT ID
  // ===========================================================================
  describe('findByPaymentIntentId()', () => {
    it('should find a transaction by Stripe payment intent ID', async () => {
      const stripeId = 'pi_lookup_test_789';

      await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 8000,
        stripePaymentIntentId: stripeId,
        tenantId,
      });

      const found = await TransactionModel.findByPaymentIntentId(stripeId);

      expect(found).toBeDefined();
      expect(found!.stripePaymentIntentId).toBe(stripeId);
      expect(found!.amount).toBe(8000);
    });

    it('should return null for non-existent payment intent ID', async () => {
      const found = await TransactionModel.findByPaymentIntentId('pi_does_not_exist');
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // UPDATE STATUS
  // ===========================================================================
  describe('updateStatus()', () => {
    it('should update transaction status', async () => {
      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        status: TransactionStatus.PENDING,
        tenantId,
      });

      const updated = await TransactionModel.updateStatus(
        created.id,
        TransactionStatus.COMPLETED
      );

      expect(updated.status).toBe(TransactionStatus.COMPLETED);
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        TransactionModel.updateStatus(
          '00000000-0000-0000-0000-000000000000',
          TransactionStatus.COMPLETED
        )
      ).rejects.toThrow('Transaction not found');
    });
  });

  // ===========================================================================
  // UPDATE (PARTIAL)
  // ===========================================================================
  describe('update()', () => {
    it('should update transaction amount', async () => {
      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        tenantId,
      });

      const updated = await TransactionModel.update(created.id, {
        amount: 7500,
      });

      expect(updated.amount).toBe(7500);
    });

    it('should update multiple fields at once', async () => {
      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        status: TransactionStatus.PENDING,
        platformFee: 250,
        tenantId,
      });

      const updated = await TransactionModel.update(created.id, {
        status: TransactionStatus.COMPLETED,
        amount: 6000,
        platformFee: 300,
        venuePayout: 5700,
      });

      expect(updated.status).toBe(TransactionStatus.COMPLETED);
      expect(updated.amount).toBe(6000);
      expect(updated.platformFee).toBe(300);
      expect(updated.venuePayout).toBe(5700);
    });

    it('should throw error when no fields to update', async () => {
      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        tenantId,
      });

      await expect(
        TransactionModel.update(created.id, {})
      ).rejects.toThrow('No fields to update');
    });

    it('should throw error for non-existent transaction', async () => {
      await expect(
        TransactionModel.update('00000000-0000-0000-0000-000000000000', {
          amount: 5000,
        })
      ).rejects.toThrow('Transaction not found');
    });
  });

  // ===========================================================================
  // FIND BY USER ID
  // ===========================================================================
  describe('findByUserId()', () => {
    it('should find transactions by user ID', async () => {
      await TransactionModel.create({ venueId, userId, eventId, amount: 5000, tenantId });
      await TransactionModel.create({ venueId, userId, eventId, amount: 7500, tenantId });
      await TransactionModel.create({ venueId, userId, eventId, amount: 10000, tenantId });

      const transactions = await TransactionModel.findByUserId(userId);

      expect(transactions).toHaveLength(3);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await TransactionModel.create({
          venueId,
          userId,
          eventId,
          amount: 1000 * (i + 1),
          tenantId,
        });
      }

      const transactions = await TransactionModel.findByUserId(userId, 5);
      expect(transactions).toHaveLength(5);
    });

    it('should return safe fields only', async () => {
      await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        platformFee: 250,
        stripePaymentIntentId: 'pi_user_query_test',
        tenantId,
      });

      const transactions = await TransactionModel.findByUserId(userId);

      expect(transactions[0].platformFee).toBe(0);
      expect(transactions[0].stripePaymentIntentId).toBeUndefined();
    });

    it('should return empty array for user with no transactions', async () => {
      const transactions = await TransactionModel.findByUserId('00000000-0000-0000-0000-000000000000');
      expect(transactions).toHaveLength(0);
    });
  });

  // ===========================================================================
  // FIND BY VENUE ID
  // ===========================================================================
  describe('findByVenueId()', () => {
    it('should find transactions by venue ID', async () => {
      await TransactionModel.create({ venueId, userId, eventId, amount: 5000, tenantId });
      await TransactionModel.create({ venueId, userId, eventId, amount: 7500, tenantId });

      const transactions = await TransactionModel.findByVenueId(venueId);

      expect(transactions).toHaveLength(2);
      transactions.forEach(txn => {
        expect(txn.venueId).toBe(venueId);
      });
    });

    it('should return safe fields only', async () => {
      await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        platformFee: 250,
        stripePaymentIntentId: 'pi_venue_query_test',
        tenantId,
      });

      const transactions = await TransactionModel.findByVenueId(venueId);

      expect(transactions[0].platformFee).toBe(0);
      expect(transactions[0].stripePaymentIntentId).toBeUndefined();
    });
  });

  // ===========================================================================
  // TRANSACTION TYPES
  // ===========================================================================
  describe('transaction types', () => {
    it('should handle all transaction types', async () => {
      const types = [
        TransactionType.TICKET_PURCHASE,
        TransactionType.REFUND,
        TransactionType.TRANSFER,
        TransactionType.PAYOUT,
        TransactionType.FEE,
      ];

      for (const type of types) {
        const txn = await TransactionModel.create({
          venueId,
          userId,
          eventId,
          type,
          amount: 5000,
          tenantId,
        });
        expect(txn.type).toBe(type);
      }
    });
  });

  // ===========================================================================
  // STATUS VALUES
  // ===========================================================================
  describe('status values', () => {
    it('should handle all status values', async () => {
      const statuses = [
        TransactionStatus.PENDING,
        TransactionStatus.PROCESSING,
        TransactionStatus.COMPLETED,
        TransactionStatus.FAILED,
        TransactionStatus.REFUNDED,
        TransactionStatus.PARTIALLY_REFUNDED,
      ];

      for (const status of statuses) {
        const txn = await TransactionModel.create({
          venueId,
          userId,
          eventId,
          amount: 5000,
          status,
          tenantId,
        });
        expect(txn.status).toBe(status);
      }
    });
  });

  // ===========================================================================
  // DATA INTEGRITY
  // ===========================================================================
  describe('data integrity', () => {
    it('should handle large amounts without precision loss', async () => {
      const largeAmount = 99999999; // $999,999.99 in cents

      const txn = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: largeAmount,
        platformFee: 4999999,
        venuePayout: 94999999,
        tenantId,
      });

      const found = await TransactionModel.findByIdInternal(txn.id);

      expect(found!.amount).toBe(largeAmount);
      expect(found!.platformFee).toBe(4999999);
      expect(found!.venuePayout).toBe(94999999);
    });

    it('should preserve metadata through updates', async () => {
      const metadata = {
        ticketIds: ['t1', 't2'],
        nested: { deep: { value: true } },
      };

      const created = await TransactionModel.create({
        venueId,
        userId,
        eventId,
        amount: 5000,
        metadata,
        tenantId,
      });

      const updated = await TransactionModel.update(created.id, {
        metadata: { ...metadata, updated: true },
      });

      expect(updated.metadata).toEqual({ ...metadata, updated: true });
    });
  });
});
