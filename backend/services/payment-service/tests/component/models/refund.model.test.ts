/**
 * COMPONENT TEST: RefundModel
 *
 * Tests RefundModel with REAL Database
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

// Mock database config
jest.mock('../../../src/config/database', () => ({
  query: async (text: string, values?: any[]) => {
    return getSharedPool().query(text, values);
  },
  getClient: async () => {
    return getSharedPool().connect();
  },
  getPool: () => getSharedPool(),
}));

// Mock logger
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

import { RefundModel } from '../../../src/models/refund.model';

describe('RefundModel Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let userId: string;
  let eventId: string;
  let venueId: string;
  let transactionId: string;

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
    transactionId = uuidv4();

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

    // Create test transaction (required for refund foreign key)
    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, type, amount, currency, status,
        platform_fee, venue_payout, metadata, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
    `, [transactionId, tenantId, venueId, userId, eventId, 'ticket_purchase', 10000, 'USD', 'completed', 500, 9500, '{}']);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM payment_refunds WHERE tenant_id = $1', [tenantId]);
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
    it('should create a refund with all required fields', async () => {
      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Customer requested refund',
        status: 'pending',
      });

      expect(refund).toBeDefined();
      expect(refund.id).toBeDefined();
      expect(refund.transactionId).toBe(transactionId);
      expect(refund.tenantId).toBe(tenantId);
      expect(refund.amount).toBe(5000);
      expect(refund.reason).toBe('Customer requested refund');
      expect(refund.status).toBe('pending');
      expect(refund.createdAt).toBeInstanceOf(Date);
    });

    it('should create a refund with default pending status', async () => {
      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 3000,
        reason: 'Event cancelled',
      });

      expect(refund.status).toBe('pending');
    });

    it('should create a refund with stripe refund ID', async () => {
      const stripeRefundId = 're_test_123456789';

      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Duplicate charge',
        stripeRefundId,
      });

      expect(refund.stripeRefundId).toBe(stripeRefundId);
    });

    it('should create a refund with metadata', async () => {
      const metadata = {
        ticketIds: ['t1', 't2'],
        requestedBy: 'customer',
        supportTicket: 'TICKET-123',
      };

      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Quality issue',
        metadata,
      });

      expect(refund.metadata).toEqual(metadata);
    });

    it('should create partial refund (less than transaction amount)', async () => {
      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 2500, // Half of 5000
        reason: 'Partial refund - one ticket',
      });

      expect(refund.amount).toBe(2500);
    });

    it('should create full refund (equal to transaction amount)', async () => {
      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 10000, // Full transaction amount
        reason: 'Full refund',
      });

      expect(refund.amount).toBe(10000);
    });
  });

  // ===========================================================================
  // UPDATE STATUS
  // ===========================================================================
  describe('updateStatus()', () => {
    it('should update refund status to processing', async () => {
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test refund',
      });

      const updated = await RefundModel.updateStatus(created.id, 'processing');

      expect(updated.status).toBe('processing');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should update refund status to completed and set completedAt', async () => {
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test refund',
      });

      const updated = await RefundModel.updateStatus(created.id, 'completed');

      expect(updated.status).toBe('completed');
      expect(updated.completedAt).toBeInstanceOf(Date);
    });

    it('should update refund status to failed', async () => {
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test refund',
      });

      const updated = await RefundModel.updateStatus(created.id, 'failed');

      expect(updated.status).toBe('failed');
    });

    it('should update stripe refund ID along with status', async () => {
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test refund',
      });

      const stripeRefundId = 're_updated_123';
      const updated = await RefundModel.updateStatus(created.id, 'completed', stripeRefundId);

      expect(updated.status).toBe('completed');
      expect(updated.stripeRefundId).toBe(stripeRefundId);
    });

    it('should not overwrite existing stripe refund ID if not provided', async () => {
      const stripeRefundId = 're_original_123';

      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test refund',
        stripeRefundId,
      });

      const updated = await RefundModel.updateStatus(created.id, 'completed');

      expect(updated.stripeRefundId).toBe(stripeRefundId);
    });
  });

  // ===========================================================================
  // FIND BY ID
  // ===========================================================================
  describe('findById()', () => {
    it('should find a refund by ID with safe fields only', async () => {
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test refund',
        stripeRefundId: 're_secret_123',
        metadata: { secret: 'data' },
      });

      const found = await RefundModel.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.amount).toBe(5000);
      expect(found!.reason).toBe('Test refund');

      // Safe version hides sensitive fields
      expect(found!.stripeRefundId).toBeUndefined();
      expect(found!.metadata).toBeUndefined();
    });

    it('should return null for non-existent refund', async () => {
      const found = await RefundModel.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByIdInternal()', () => {
    it('should find a refund by ID with all fields', async () => {
      const stripeRefundId = 're_internal_456';
      const metadata = { internal: 'data', processor: 'stripe' };

      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 7500,
        reason: 'Internal test',
        stripeRefundId,
        metadata,
      });

      const found = await RefundModel.findByIdInternal(created.id);

      expect(found).toBeDefined();
      expect(found!.stripeRefundId).toBe(stripeRefundId);
      expect(found!.metadata).toEqual(metadata);
    });

    it('should return null for non-existent refund', async () => {
      const found = await RefundModel.findByIdInternal('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  // ===========================================================================
  // FIND BY TRANSACTION ID
  // ===========================================================================
  describe('findByTransactionId()', () => {
    it('should find all refunds for a transaction', async () => {
      // Create multiple refunds for the same transaction
      await RefundModel.create({
        transactionId,
        tenantId,
        amount: 2000,
        reason: 'First partial refund',
      });
      await RefundModel.create({
        transactionId,
        tenantId,
        amount: 3000,
        reason: 'Second partial refund',
      });

      const refunds = await RefundModel.findByTransactionId(transactionId);

      expect(refunds).toHaveLength(2);
      refunds.forEach(refund => {
        expect(refund.transactionId).toBe(transactionId);
      });
    });

    it('should return refunds ordered by created_at DESC', async () => {
      await RefundModel.create({
        transactionId,
        tenantId,
        amount: 1000,
        reason: 'First refund',
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await RefundModel.create({
        transactionId,
        tenantId,
        amount: 2000,
        reason: 'Second refund',
      });

      const refunds = await RefundModel.findByTransactionId(transactionId);

      // Most recent first
      expect(refunds[0].amount).toBe(2000);
      expect(refunds[1].amount).toBe(1000);
    });

    it('should return safe fields only', async () => {
      await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Test',
        stripeRefundId: 're_hidden_123',
        metadata: { hidden: true },
      });

      const refunds = await RefundModel.findByTransactionId(transactionId);

      expect(refunds[0].stripeRefundId).toBeUndefined();
      expect(refunds[0].metadata).toBeUndefined();
    });

    it('should return empty array for transaction with no refunds', async () => {
      const refunds = await RefundModel.findByTransactionId('00000000-0000-0000-0000-000000000000');
      expect(refunds).toHaveLength(0);
    });
  });

  // ===========================================================================
  // STATUS VALUES
  // ===========================================================================
  describe('status values', () => {
    const statuses: Array<'pending' | 'processing' | 'completed' | 'failed'> = [
      'pending',
      'processing',
      'completed',
      'failed',
    ];

    statuses.forEach(status => {
      it(`should handle ${status} status`, async () => {
        const refund = await RefundModel.create({
          transactionId,
          tenantId,
          amount: 5000,
          reason: `Test ${status}`,
          status,
        });

        expect(refund.status).toBe(status);

        const found = await RefundModel.findById(refund.id);
        expect(found!.status).toBe(status);
      });
    });
  });

  // ===========================================================================
  // DATA INTEGRITY
  // ===========================================================================
  describe('data integrity', () => {
    it('should handle large refund amounts without precision loss', async () => {
      const largeAmount = 99999999; // $999,999.99 in cents

      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: largeAmount,
        reason: 'Large refund test',
      });

      const found = await RefundModel.findByIdInternal(refund.id);

      expect(found!.amount).toBe(largeAmount);
    });

    it('should preserve metadata through create', async () => {
      const complexMetadata = {
        ticketIds: ['t1', 't2', 't3'],
        originalOrder: { id: 'order-123', total: 15000 },
        nested: { deep: { value: true } },
      };

      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Metadata test',
        metadata: complexMetadata,
      });

      const found = await RefundModel.findByIdInternal(created.id);
      expect(found!.metadata).toEqual(complexMetadata);
    });

    it('should parse amount correctly as integer', async () => {
      const refund = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 12345,
        reason: 'Integer test',
      });

      const found = await RefundModel.findByIdInternal(refund.id);

      expect(typeof found!.amount).toBe('number');
      expect(found!.amount).toBe(12345);
    });
  });

  // ===========================================================================
  // REFUND WORKFLOW
  // ===========================================================================
  describe('refund workflow', () => {
    it('should track refund through complete lifecycle', async () => {
      // Step 1: Create pending refund
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Lifecycle test',
      });
      expect(created.status).toBe('pending');
      expect(created.completedAt).toBeUndefined();

      // Step 2: Move to processing
      const processing = await RefundModel.updateStatus(created.id, 'processing');
      expect(processing.status).toBe('processing');

      // Step 3: Complete with stripe refund ID
      const completed = await RefundModel.updateStatus(created.id, 'completed', 're_lifecycle_123');
      expect(completed.status).toBe('completed');
      expect(completed.stripeRefundId).toBe('re_lifecycle_123');
      expect(completed.completedAt).toBeInstanceOf(Date);
    });

    it('should handle failed refund workflow', async () => {
      const created = await RefundModel.create({
        transactionId,
        tenantId,
        amount: 5000,
        reason: 'Will fail',
      });

      const processing = await RefundModel.updateStatus(created.id, 'processing');
      expect(processing.status).toBe('processing');

      const failed = await RefundModel.updateStatus(created.id, 'failed');
      expect(failed.status).toBe('failed');
      expect(failed.completedAt).toBeUndefined(); // Not completed
    });
  });
});
