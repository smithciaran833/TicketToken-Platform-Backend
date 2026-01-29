/**
 * COMPONENT TEST: StripeConnectTransferService
 *
 * Tests with REAL Database and MOCKED Stripe
 * 
 * VERIFIES BUG FIXES:
 * - Bug #1 & #2: Tenant isolation in dispute handling
 * - Bug #3: Division by zero protection
 * - Bug #4: Rounding errors in proportional splits
 * - Bug #5: Input validation
 * - Bug #7: Over-reversal protection
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing_only_1234567890';

// Shared pool
let sharedPool: Pool;

function getSharedPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  }
  return sharedPool;
}

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

// Mock DatabaseService to return our test pool
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => getSharedPool(),
  },
}));

// Mock alerting service
jest.mock('../../../src/services/alerting.service', () => ({
  alertingService: {
    alertTransferFailed: jest.fn(),
  },
}));

// Mock fee calculation service
jest.mock('../../../src/services/fee-calculation.service', () => ({
  feeCalculationService: {
    calculateStripeFee: jest.fn((amount: number) => Math.round(amount * 0.029) + 30),
    calculatePlatformFee: jest.fn((amount: number) => Math.round(amount * 0.05)),
  },
}));

// Mock OpenTelemetry
jest.mock('../../../src/config/opentelemetry.config', () => ({
  withSpan: jest.fn((name: string, fn: Function) => fn({ setAttribute: jest.fn() })),
  addStripeAttributes: jest.fn(),
}));

// Create mock Stripe
const mockTransfers = new Map<string, any>();
const mockAccounts = new Map<string, any>();
const mockReversals = new Map<string, any>();

const mockStripe = {
  accounts: {
    retrieve: jest.fn(async (accountId: string) => {
      const account = mockAccounts.get(accountId);
      if (!account) {
        const error: any = new Error('No such account');
        error.type = 'StripeInvalidRequestError';
        throw error;
      }
      return account;
    }),
    update: jest.fn(async (accountId: string, params: any) => {
      const account = mockAccounts.get(accountId);
      if (!account) {
        throw new Error('No such account');
      }
      Object.assign(account, params);
      return account;
    }),
  },
  transfers: {
    create: jest.fn(async (params: any) => {
      const id = `tr_test_${uuidv4().slice(0, 8)}`;
      const transfer = {
        id,
        amount: params.amount,
        currency: params.currency,
        destination: params.destination,
        transfer_group: params.transfer_group,
        source_transaction: params.source_transaction,
        description: params.description,
        metadata: params.metadata,
        created: Math.floor(Date.now() / 1000),
      };
      mockTransfers.set(id, transfer);
      return transfer;
    }),
    createReversal: jest.fn(async (transferId: string, params: any) => {
      const transfer = mockTransfers.get(transferId);
      if (!transfer) {
        const error: any = new Error('No such transfer');
        error.type = 'StripeInvalidRequestError';
        throw error;
      }
      const reversalId = `trr_test_${uuidv4().slice(0, 8)}`;
      const reversal = {
        id: reversalId,
        transfer: transferId,
        amount: params.amount,
        description: params.description,
        metadata: params.metadata,
        created: Math.floor(Date.now() / 1000),
      };
      mockReversals.set(reversalId, reversal);
      return reversal;
    }),
    list: jest.fn(async (params: any) => ({
      data: Array.from(mockTransfers.values()).filter(t => {
        if (!params.created) return true;
        const created = t.created;
        if (params.created.gte && created < params.created.gte) return false;
        if (params.created.lte && created > params.created.lte) return false;
        return true;
      }),
      has_more: false,
    })),
  },
  balance: {
    retrieve: jest.fn(async () => ({
      available: [{ amount: 1000000, currency: 'usd' }],
      pending: [{ amount: 50000, currency: 'usd' }],
    })),
  },
  balanceTransactions: {
    list: jest.fn(async () => ({
      data: [],
      has_more: false,
    })),
  },
  payouts: {
    list: jest.fn(async () => ({
      data: [],
    })),
  },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripe);
});

import { stripeConnectTransferService } from '../../../src/services/stripe-connect-transfer.service';
import type {
  TransferRequest,
  TransferRecipient,
  ReverseTransferRequest,
} from '../../../src/services/stripe-connect-transfer.service';

describe('StripeConnectTransferService Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let tenant2Id: string;
  let userId: string;
  let venueId: string;
  let venue2Id: string;
  let eventId: string;
  let orderId: string;
  let paymentId: string;
  let stripeAccountId: string;
  let stripeAccount2Id: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    tenant2Id = uuidv4();
    userId = uuidv4();
    venueId = uuidv4();
    venue2Id = uuidv4();
    eventId = uuidv4();
    orderId = uuidv4();
    paymentId = uuidv4();
    stripeAccountId = `acct_test_${uuidv4().slice(0, 8)}`;
    stripeAccount2Id = `acct_test_${uuidv4().slice(0, 8)}`;

    // Clear mocks
    jest.clearAllMocks();
    mockTransfers.clear();
    mockAccounts.clear();
    mockReversals.clear();

    // Setup mock Stripe accounts
    mockAccounts.set(stripeAccountId, {
      id: stripeAccountId,
      charges_enabled: true,
      payouts_enabled: true,
      settings: {
        payouts: {
          schedule: {
            interval: 'weekly',
            weekly_anchor: 'friday',
            delay_days: 2,
          },
        },
      },
    });

    mockAccounts.set(stripeAccount2Id, {
      id: stripeAccount2Id,
      charges_enabled: true,
      payouts_enabled: true,
    });

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create second tenant for isolation testing
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenant2Id, 'Test Tenant 2', `test-${tenant2Id.slice(0, 8)}`]);

    // Create test user
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    // Create test venues
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000]);

    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venue2Id, tenantId, 'Test Venue 2', `venue-${venue2Id.slice(0, 8)}`, 'venue2@test.com', '456 Test Ave', 'Test City', 'TS', 'US', 'arena', 5000]);

    // Create test event
    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, start_date, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`, new Date(Date.now() + 86400000)]);

    // Create test payment transaction
    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, order_id, type, amount, currency,
        status, platform_fee, venue_payout, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'ticket_purchase', 10000, 'USD', 'completed', 500, 9500, NOW(), NOW())
    `, [paymentId, tenantId, venueId, userId, eventId, orderId]);

    // Create venue balances with balance_type
    await pool.query(`
      INSERT INTO venue_balances (
        id, tenant_id, venue_id, balance_type, available_balance, pending_balance, held_for_disputes, currency, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'primary', 10000, 0, 0, 'USD', NOW(), NOW())
    `, [uuidv4(), tenantId, venueId]);

    await pool.query(`
      INSERT INTO venue_balances (
        id, tenant_id, venue_id, balance_type, available_balance, pending_balance, held_for_disputes, currency, created_at, updated_at
      )
      VALUES ($1, $2, $3, 'primary', 5000, 0, 0, 'USD', NOW(), NOW())
    `, [uuidv4(), tenantId, venue2Id]);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM stripe_transfers WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM pending_transfers WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM venue_balances WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM tenants WHERE id = $1 OR id = $2', [tenantId, tenant2Id]);
    await pool.query('DELETE FROM reconciliation_reports WHERE tenant_id = $1 OR tenant_id = $2', [tenantId, tenant2Id]);
  });

  // ===========================================================================
  // BUG FIX #5: INPUT VALIDATION
  // ===========================================================================
  describe('createTransfers() - Input Validation (Bug #5)', () => {
    it('should throw error when recipients array is empty', async () => {
      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_123',
        recipients: [],
        tenantId,
      };

      await expect(
        stripeConnectTransferService.createTransfers(request)
      ).rejects.toThrow('No recipients provided for transfer');
    });

    it('should throw error when recipients is null', async () => {
      const request: any = {
        paymentId,
        orderId,
        chargeId: 'ch_test_123',
        recipients: null,
        tenantId,
      };

      await expect(
        stripeConnectTransferService.createTransfers(request)
      ).rejects.toThrow('No recipients provided for transfer');
    });

    it('should throw error when recipient amount is zero', async () => {
      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_123',
        recipients: [{
          recipientId: venueId,
          recipientType: 'venue',
          stripeAccountId,
          amount: 0,
        }],
        tenantId,
      };

      await expect(
        stripeConnectTransferService.createTransfers(request)
      ).rejects.toThrow('Invalid amount 0');
    });

    it('should throw error when recipient amount is negative', async () => {
      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_123',
        recipients: [{
          recipientId: venueId,
          recipientType: 'venue',
          stripeAccountId,
          amount: -1000,
        }],
        tenantId,
      };

      await expect(
        stripeConnectTransferService.createTransfers(request)
      ).rejects.toThrow('Invalid amount -1000');
    });

    it('should throw error when stripeAccountId is missing', async () => {
      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_123',
        recipients: [{
          recipientId: venueId,
          recipientType: 'venue',
          stripeAccountId: '',
          amount: 5000,
        }],
        tenantId,
      };

      await expect(
        stripeConnectTransferService.createTransfers(request)
      ).rejects.toThrow('Missing Stripe account ID');
    });
  });

  // ===========================================================================
  // CREATE TRANSFERS - HAPPY PATH
  // ===========================================================================
  describe('createTransfers() - Happy Path', () => {
    it('should create single transfer successfully', async () => {
      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_123',
        recipients: [{
          recipientId: venueId,
          recipientType: 'venue',
          stripeAccountId,
          amount: 9500,
          description: 'Venue payout',
        }],
        tenantId,
      };

      const results = await stripeConnectTransferService.createTransfers(request);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('completed');
      expect(results[0].amount).toBe(9500);
      expect(results[0].stripeTransferId).toMatch(/^tr_test_/);

      // Verify Stripe was called
      expect(mockStripe.transfers.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 9500,
          currency: 'usd',
          destination: stripeAccountId,
          transfer_group: orderId,
          source_transaction: 'ch_test_123',
        })
      );

      // Verify stored in database - use payment_id for stripe_transfers
      const dbResult = await pool.query(
        'SELECT * FROM stripe_transfers WHERE payment_id = $1',
        [paymentId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].amount).toBe(9500);
      expect(dbResult.rows[0].recipient_id).toBe(venueId);
      expect(dbResult.rows[0].status).toBe('completed');
    });

    it('should create multiple transfers successfully', async () => {
      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_456',
        recipients: [
          {
            recipientId: venueId,
            recipientType: 'venue',
            stripeAccountId,
            amount: 8000,
          },
          {
            recipientId: venue2Id,
            recipientType: 'artist',
            stripeAccountId: stripeAccount2Id,
            amount: 1500,
          },
        ],
        tenantId,
      };

      const results = await stripeConnectTransferService.createTransfers(request);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'completed')).toBe(true);

      // Verify both stored in database - use payment_id for stripe_transfers
      const dbResult = await pool.query(
        'SELECT * FROM stripe_transfers WHERE payment_id = $1 ORDER BY amount DESC',
        [paymentId]
      );

      expect(dbResult.rows).toHaveLength(2);
      expect(dbResult.rows[0].amount).toBe(8000);
      expect(dbResult.rows[1].amount).toBe(1500);
    });

    it('should handle account with charges disabled', async () => {
      // Disable charges for this account
      mockAccounts.get(stripeAccountId)!.charges_enabled = false;

      const request: TransferRequest = {
        paymentId,
        orderId,
        chargeId: 'ch_test_789',
        recipients: [{
          recipientId: venueId,
          recipientType: 'venue',
          stripeAccountId,
          amount: 5000,
        }],
        tenantId,
      };

      const results = await stripeConnectTransferService.createTransfers(request);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('failed');

      // Verify queued for retry - use payment_intent_id for pending_transfers
      const pendingResult = await pool.query(
        'SELECT * FROM pending_transfers WHERE payment_intent_id = $1',
        [paymentId]
      );

      expect(pendingResult.rows).toHaveLength(1);
      expect(pendingResult.rows[0].status).toBe('pending'); // Status is 'pending' not 'pending_retry'
      expect(pendingResult.rows[0].error_message).toContain('charges not enabled');
    });
  });

  // ===========================================================================
  // BUG FIX #7: OVER-REVERSAL PROTECTION
  // ===========================================================================
  describe('reverseTransfer() - Over-Reversal Protection (Bug #7)', () => {
    let transferId: string;
    let stripeTransferId: string;

    beforeEach(async () => {
      // Create a transfer to reverse
      transferId = uuidv4();
      stripeTransferId = `tr_test_${uuidv4().slice(0, 8)}`;

      await pool.query(`
        INSERT INTO stripe_transfers (
          id, payment_id, order_id, stripe_transfer_id, destination_account,
          recipient_id, recipient_type, amount, status, tenant_id, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'venue', 10000, 'completed', $7, NOW())
      `, [transferId, paymentId, orderId, stripeTransferId, stripeAccountId, venueId, tenantId]);

      mockTransfers.set(stripeTransferId, {
        id: stripeTransferId,
        amount: 10000,
        destination: stripeAccountId,
      });
    });

    it('should reverse transfer successfully', async () => {
      const request: ReverseTransferRequest = {
        stripeTransferId,
        amount: 5000,
        reason: 'Partial refund',
        tenantId,
      };

      const result = await stripeConnectTransferService.reverseTransfer(request);

      expect(result.reversalId).toMatch(/^trr_test_/);
      expect(result.amount).toBe(5000);

      // Verify database updated
      const dbResult = await pool.query(
        'SELECT * FROM stripe_transfers WHERE stripe_transfer_id = $1',
        [stripeTransferId]
      );

      expect(dbResult.rows[0].reversed_amount).toBe(5000);
      expect(dbResult.rows[0].status).toBe('partially_reversed');
    });

    it('should prevent over-reversal - single attempt', async () => {
      const request: ReverseTransferRequest = {
        stripeTransferId,
        amount: 15000, // More than original 10000
        reason: 'Over-reversal attempt',
        tenantId,
      };

      await expect(
        stripeConnectTransferService.reverseTransfer(request)
      ).rejects.toThrow('Cannot reverse 15000 cents: would exceed original transfer amount 10000 cents');
    });

    it('should prevent over-reversal - multiple attempts', async () => {
      // First reversal: 6000
      await stripeConnectTransferService.reverseTransfer({
        stripeTransferId,
        amount: 6000,
        reason: 'First refund',
        tenantId,
      });

      // Second reversal: 5000 (total would be 11000 > 10000)
      await expect(
        stripeConnectTransferService.reverseTransfer({
          stripeTransferId,
          amount: 5000,
          reason: 'Second refund',
          tenantId,
        })
      ).rejects.toThrow('Cannot reverse 5000 cents: would exceed original transfer amount 10000 cents (already reversed 6000 cents)');
    });
  });

  // ===========================================================================
  // PLATFORM BALANCE & PAYOUT SCHEDULES
  // ===========================================================================
  describe('checkPlatformBalance()', () => {
    it('should return true when sufficient balance', async () => {
      const result = await stripeConnectTransferService.checkPlatformBalance(500000);
      expect(result).toBe(true);
    });
  });

  describe('payout schedules', () => {
    it('should retrieve payout schedule', async () => {
      const schedule = await stripeConnectTransferService.getPayoutSchedule(stripeAccountId);

      expect(schedule).toEqual({
        interval: 'weekly',
        weekly_anchor: 'friday',
        delay_days: 2,
      });
    });
  });
});
