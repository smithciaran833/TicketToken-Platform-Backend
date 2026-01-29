/**
 * COMPONENT TEST: VenueBalanceService
 *
 * Tests VenueBalanceService with REAL Database
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

// Shared pool
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
jest.mock('../../../../src/config/database', () => ({
  query: async (text: string, values?: any[]) => {
    return getSharedPool().query(text, values);
  },
  getClient: async () => {
    const client = await getSharedPool().connect();
    return {
      client,
      release: () => client.release(),
    };
  },
  getPool: () => getSharedPool(),
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
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

import { VenueBalanceService } from '../../../../src/services/core/venue-balance.service';

describe('VenueBalanceService Component Tests', () => {
  let pool: Pool;
  let service: VenueBalanceService;
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

    service = new VenueBalanceService();
  });

  afterEach(async () => {
    await pool.query('DELETE FROM stripe_transfers WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venue_balances WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_disputes WHERE payment_id IN (SELECT id FROM payment_transactions WHERE tenant_id = $1)', [tenantId]);
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // GET BALANCE
  // ===========================================================================
  describe('getBalance()', () => {
    it('should return zero balance for new venue', async () => {
      const balance = await service.getBalance(venueId, tenantId);

      expect(balance.available).toBe(0);
      expect(balance.pending).toBe(0);
      expect(balance.reserved).toBe(0);
      expect(balance.currency).toBe('USD');
    });

    it('should return correct balance after funds added', async () => {
      await service.initializeVenueBalance(venueId, tenantId);
      await service.addFunds(venueId, tenantId, 10000, 'available');

      const balance = await service.getBalance(venueId, tenantId);

      expect(balance.available).toBe(10000);
    });
  });

  // ===========================================================================
  // INITIALIZE VENUE BALANCE
  // ===========================================================================
  describe('initializeVenueBalance()', () => {
    it('should create initial zero balance', async () => {
      const balance = await service.initializeVenueBalance(venueId, tenantId);

      expect(balance.available).toBe(0);
      expect(balance.pending).toBe(0);
      expect(balance.reserved).toBe(0);
    });

    it('should be idempotent', async () => {
      await service.initializeVenueBalance(venueId, tenantId);
      const balance = await service.initializeVenueBalance(venueId, tenantId);

      expect(balance.available).toBe(0);
    });
  });

  // ===========================================================================
  // ADD FUNDS
  // ===========================================================================
  describe('addFunds()', () => {
    it('should add funds to available balance', async () => {
      const balance = await service.addFunds(venueId, tenantId, 5000, 'available');

      expect(balance.available).toBe(5000);
    });

    it('should add funds to pending balance', async () => {
      const balance = await service.addFunds(venueId, tenantId, 5000, 'pending');

      expect(balance.pending).toBe(5000);
    });

    it('should accumulate multiple additions', async () => {
      await service.addFunds(venueId, tenantId, 5000, 'available');
      await service.addFunds(venueId, tenantId, 3000, 'available');
      const balance = await service.addFunds(venueId, tenantId, 2000, 'available');

      expect(balance.available).toBe(10000);
    });
  });

  // ===========================================================================
  // CLEAR PENDING FUNDS
  // ===========================================================================
  describe('clearPendingFunds()', () => {
    it('should move funds from pending to available', async () => {
      await service.addFunds(venueId, tenantId, 10000, 'pending');

      const balance = await service.clearPendingFunds(venueId, tenantId, 10000);

      expect(balance.pending).toBe(0);
      expect(balance.available).toBe(10000);
    });

    it('should handle partial clearing', async () => {
      await service.addFunds(venueId, tenantId, 10000, 'pending');

      const balance = await service.clearPendingFunds(venueId, tenantId, 6000);

      expect(balance.pending).toBe(4000);
      expect(balance.available).toBe(6000);
    });
  });

  // ===========================================================================
  // DISPUTE HANDLING
  // ===========================================================================
  describe('holdForDispute()', () => {
    it('should move funds from available to reserved', async () => {
      await service.addFunds(venueId, tenantId, 10000, 'available');

      const balance = await service.holdForDispute(venueId, tenantId, 3000);

      expect(balance.available).toBe(7000);
      expect(balance.reserved).toBe(3000);
    });
  });

  describe('releaseDisputeHold()', () => {
    it('should move funds from reserved back to available', async () => {
      await service.addFunds(venueId, tenantId, 10000, 'available');
      await service.holdForDispute(venueId, tenantId, 3000);

      const balance = await service.releaseDisputeHold(venueId, tenantId, 3000);

      expect(balance.available).toBe(10000);
      expect(balance.reserved).toBe(0);
    });
  });

  // ===========================================================================
  // VENUE RISK LEVEL
  // ===========================================================================
  describe('getVenueRiskLevel()', () => {
    it('should return medium for venue with no transactions', async () => {
      const riskLevel = await service.getVenueRiskLevel(venueId, tenantId);

      expect(riskLevel).toBe('medium');
    });

    it('should return low for venue with good track record', async () => {
      // Create 20 successful transactions
      for (let i = 0; i < 20; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'ticket_purchase', 5000, 'USD', 'completed', 250, 4750, NOW(), NOW())
        `, [tenantId, venueId, userId, eventId]);
      }

      const riskLevel = await service.getVenueRiskLevel(venueId, tenantId);

      expect(riskLevel).toBe('low');
    });

    it('should return high for venue with many refunds', async () => {
      // Create 10 transactions, 4 refunded (40%)
      for (let i = 0; i < 6; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'ticket_purchase', 5000, 'USD', 'completed', 250, 4750, NOW(), NOW())
        `, [tenantId, venueId, userId, eventId]);
      }

      for (let i = 0; i < 4; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'ticket_purchase', 5000, 'USD', 'refunded', 250, 4750, NOW(), NOW())
        `, [tenantId, venueId, userId, eventId]);
      }

      const riskLevel = await service.getVenueRiskLevel(venueId, tenantId);

      expect(riskLevel).toBe('high');
    });

    it('should return medium for venue with moderate issues', async () => {
      // Create 10 transactions, 2 refunded (20%)
      for (let i = 0; i < 8; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'ticket_purchase', 5000, 'USD', 'completed', 250, 4750, NOW(), NOW())
        `, [tenantId, venueId, userId, eventId]);
      }

      for (let i = 0; i < 2; i++) {
        await pool.query(`
          INSERT INTO payment_transactions (
            tenant_id, venue_id, user_id, event_id, type, amount, currency,
            status, platform_fee, venue_payout, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, 'ticket_purchase', 5000, 'USD', 'refunded', 250, 4750, NOW(), NOW())
        `, [tenantId, venueId, userId, eventId]);
      }

      const riskLevel = await service.getVenueRiskLevel(venueId, tenantId);

      expect(riskLevel).toBe('medium');
    });
  });

  // ===========================================================================
  // CALCULATE PAYOUT AMOUNT
  // ===========================================================================
  describe('calculatePayoutAmount()', () => {
    it('should calculate payable amount with reserve', async () => {
      await service.addFunds(venueId, tenantId, 100000, 'available'); // $1000

      const payout = await service.calculatePayoutAmount(venueId, tenantId);

      expect(payout.available).toBe(100000);
      expect(payout.reserved).toBeGreaterThan(0); // Reserve based on risk
      expect(payout.payable).toBeLessThan(100000); // Less than available due to reserve
    });

    it('should return zero payable when below minimum', async () => {
      await service.addFunds(venueId, tenantId, 100, 'available'); // $1 - likely below minimum

      const payout = await service.calculatePayoutAmount(venueId, tenantId);

      expect(payout.payable).toBe(0);
    });
  });

  // ===========================================================================
  // PROCESS PAYOUT
  // ===========================================================================
  describe('processPayout()', () => {
    it('should process valid payout', async () => {
      await service.addFunds(venueId, tenantId, 500000, 'available'); // $5000

      const { payable } = await service.calculatePayoutAmount(venueId, tenantId);

      if (payable > 0) {
        await expect(
          service.processPayout(venueId, tenantId, payable)
        ).resolves.not.toThrow();

        const balance = await service.getBalance(venueId, tenantId);
        expect(balance.available).toBeLessThan(500000);
      }
    });

    it('should reject payout exceeding available', async () => {
      await service.addFunds(venueId, tenantId, 10000, 'available');

      await expect(
        service.processPayout(venueId, tenantId, 1000000)
      ).rejects.toThrow('Insufficient funds');
    });
  });

  // ===========================================================================
  // PAYOUT HISTORY
  // ===========================================================================
  describe('getPayoutHistory()', () => {
    it('should return empty list for venue with no payouts', async () => {
      const result = await service.getPayoutHistory(venueId, tenantId);

      expect(result.payouts).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });

    it('should return payout history with safe fields only', async () => {
      // Insert test transfer
      const orderId = uuidv4();
      const recipientId = uuidv4();
      
      await pool.query(`
        INSERT INTO stripe_transfers (
          tenant_id, venue_id, order_id, stripe_transfer_id, destination_account,
          amount, currency, status, recipient_type, recipient_id, description
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [tenantId, venueId, orderId, 'tr_test_123', 'acct_secret_123', 50000, 'usd', 'completed', 'venue', recipientId, 'Test payout']);

      const result = await service.getPayoutHistory(venueId, tenantId);

      expect(result.payouts).toHaveLength(1);
      expect(result.payouts[0].amount).toBe(50000);
      expect(result.payouts[0].status).toBe('completed');
      expect(result.payouts[0].recipientType).toBe('venue');
      
      // Should NOT include sensitive fields
      expect(result.payouts[0]).not.toHaveProperty('stripe_transfer_id');
      expect(result.payouts[0]).not.toHaveProperty('destination_account');
      expect(result.payouts[0]).not.toHaveProperty('metadata');
    });

    it('should respect pagination', async () => {
      // Insert 5 transfers
      for (let i = 0; i < 5; i++) {
        const orderId = uuidv4();
        const recipientId = uuidv4();
        
        await pool.query(`
          INSERT INTO stripe_transfers (
            tenant_id, venue_id, order_id, stripe_transfer_id, destination_account,
            amount, currency, status, recipient_type, recipient_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [tenantId, venueId, orderId, `tr_test_${i}`, 'acct_123', 10000 * (i + 1), 'usd', 'completed', 'venue', recipientId]);
      }

      const result = await service.getPayoutHistory(venueId, tenantId, 2, 0);

      expect(result.payouts).toHaveLength(2);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.limit).toBe(2);
      expect(result.pagination.offset).toBe(0);
    });
  });

  // ===========================================================================
  // WORKFLOW TESTS
  // ===========================================================================
  describe('complete workflow', () => {
    it('should handle full transaction lifecycle', async () => {
      // 1. Initialize venue
      await service.initializeVenueBalance(venueId, tenantId);

      // 2. Transaction comes in as pending
      await service.addFunds(venueId, tenantId, 10000, 'pending');
      let balance = await service.getBalance(venueId, tenantId);
      expect(balance.pending).toBe(10000);
      expect(balance.available).toBe(0);

      // 3. Clear pending after settlement
      await service.clearPendingFunds(venueId, tenantId, 10000);
      balance = await service.getBalance(venueId, tenantId);
      expect(balance.pending).toBe(0);
      expect(balance.available).toBe(10000);

      // 4. Dispute comes in
      await service.holdForDispute(venueId, tenantId, 3000);
      balance = await service.getBalance(venueId, tenantId);
      expect(balance.available).toBe(7000);
      expect(balance.reserved).toBe(3000);

      // 5. Dispute resolved in venue's favor
      await service.releaseDisputeHold(venueId, tenantId, 3000);
      balance = await service.getBalance(venueId, tenantId);
      expect(balance.available).toBe(10000);
      expect(balance.reserved).toBe(0);
    });
  });
});
