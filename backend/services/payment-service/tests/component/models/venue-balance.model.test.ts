/**
 * COMPONENT TEST: VenueBalanceModel
 *
 * Tests VenueBalanceModel with REAL Database
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
jest.mock('../../../src/config/database', () => ({
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

import { VenueBalanceModel } from '../../../src/models/venue-balance.model';

describe('VenueBalanceModel Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let venueId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    venueId = uuidv4();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test venue
    await pool.query(`
      INSERT INTO venues (id, tenant_id, name, slug, email, address_line1, city, state_province, country_code, venue_type, max_capacity, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`, 'venue@test.com', '123 Test St', 'Test City', 'TS', 'US', 'theater', 1000]);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM venue_balances WHERE venue_id = $1', [venueId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // GET BALANCE
  // ===========================================================================
  describe('getBalance()', () => {
    it('should return zero balances for venue with no records', async () => {
      const balance = await VenueBalanceModel.getBalance(venueId, tenantId);

      expect(balance).toEqual({
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD',
      });
    });

    it('should return correct balances after records exist', async () => {
      // Create initial balance then update
      await VenueBalanceModel.createInitialBalance(venueId, tenantId);
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      await VenueBalanceModel.updateBalance(venueId, tenantId, 5000, 'pending');
      await VenueBalanceModel.updateBalance(venueId, tenantId, 2000, 'reserved');

      const balance = await VenueBalanceModel.getBalance(venueId, tenantId);

      expect(balance.available).toBe(10000);
      expect(balance.pending).toBe(5000);
      expect(balance.reserved).toBe(2000);
      expect(balance.currency).toBe('USD');
    });

    it('should return zero balances for non-existent venue', async () => {
      const balance = await VenueBalanceModel.getBalance('00000000-0000-0000-0000-000000000000', tenantId);

      expect(balance).toEqual({
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD',
      });
    });
  });

  // ===========================================================================
  // UPDATE BALANCE
  // ===========================================================================
  describe('updateBalance()', () => {
    it('should create initial available balance', async () => {
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');

      expect(balance.available).toBe(10000);
      expect(balance.pending).toBe(0);
      expect(balance.reserved).toBe(0);
    });

    it('should create initial pending balance', async () => {
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 5000, 'pending');

      expect(balance.available).toBe(0);
      expect(balance.pending).toBe(5000);
      expect(balance.reserved).toBe(0);
    });

    it('should create initial reserved balance', async () => {
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 2000, 'reserved');

      expect(balance.available).toBe(0);
      expect(balance.pending).toBe(0);
      expect(balance.reserved).toBe(2000);
    });

    it('should add to existing available balance', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 5000, 'available');

      expect(balance.available).toBe(15000);
    });

    it('should add to existing pending balance', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 3000, 'pending');
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 2000, 'pending');

      expect(balance.pending).toBe(5000);
    });

    it('should handle negative amounts (withdrawals)', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, -3000, 'available');

      expect(balance.available).toBe(7000);
    });

    it('should update multiple balance types independently', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      await VenueBalanceModel.updateBalance(venueId, tenantId, 5000, 'pending');
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 2000, 'reserved');

      expect(balance.available).toBe(10000);
      expect(balance.pending).toBe(5000);
      expect(balance.reserved).toBe(2000);
    });

    it('should handle concurrent updates correctly', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');

      await Promise.all([
        VenueBalanceModel.updateBalance(venueId, tenantId, 1000, 'available'),
        VenueBalanceModel.updateBalance(venueId, tenantId, 2000, 'available'),
        VenueBalanceModel.updateBalance(venueId, tenantId, 3000, 'available'),
      ]);

      const finalBalance = await VenueBalanceModel.getBalance(venueId, tenantId);
      expect(finalBalance.available).toBe(16000);
    });
  });

  // ===========================================================================
  // CREATE INITIAL BALANCE
  // ===========================================================================
  describe('createInitialBalance()', () => {
    it('should create zero balances', async () => {
      const balance = await VenueBalanceModel.createInitialBalance(venueId, tenantId);

      expect(balance).toEqual({
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD',
      });
    });

    it('should not fail if balances already exist', async () => {
      await VenueBalanceModel.createInitialBalance(venueId, tenantId);
      const balance = await VenueBalanceModel.createInitialBalance(venueId, tenantId);

      expect(balance).toEqual({
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD',
      });
    });

    it('should not overwrite existing non-zero balances', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      const balance = await VenueBalanceModel.createInitialBalance(venueId, tenantId);

      expect(balance.available).toBe(10000);
    });
  });

  // ===========================================================================
  // RECORD PAYOUT
  // ===========================================================================
  describe('recordPayout()', () => {
    it('should deduct from available balance', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 50000, 'available');
      const balance = await VenueBalanceModel.recordPayout(venueId, tenantId, 20000);

      expect(balance.available).toBe(30000);
    });

    it('should set lastPayout timestamp', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 50000, 'available');
      const balance = await VenueBalanceModel.recordPayout(venueId, tenantId, 20000);

      expect(balance.lastPayout).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // DISPUTE HANDLING
  // ===========================================================================
  describe('holdForDispute()', () => {
    it('should move funds from available to reserved', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      const balance = await VenueBalanceModel.holdForDispute(venueId, tenantId, 3000);

      expect(balance.available).toBe(7000);
      expect(balance.reserved).toBe(3000);
    });
  });

  describe('releaseDisputeHold()', () => {
    it('should move funds from reserved back to available', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      await VenueBalanceModel.holdForDispute(venueId, tenantId, 3000);
      const balance = await VenueBalanceModel.releaseDisputeHold(venueId, tenantId, 3000);

      expect(balance.available).toBe(10000);
      expect(balance.reserved).toBe(0);
    });
  });

  describe('recordDisputeLoss()', () => {
    it('should remove funds from reserved (lost to dispute)', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');
      await VenueBalanceModel.holdForDispute(venueId, tenantId, 3000);
      const balance = await VenueBalanceModel.recordDisputeLoss(venueId, tenantId, 3000);

      expect(balance.available).toBe(7000);
      expect(balance.reserved).toBe(0);
      // Note: lost_to_disputes is tracked but not exposed in VenueBalance interface
    });
  });

  // ===========================================================================
  // DATA INTEGRITY
  // ===========================================================================
  describe('data integrity', () => {
    it('should handle large amounts without precision loss', async () => {
      const largeAmount = 99999999999;

      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, largeAmount, 'available');

      expect(balance.available).toBe(largeAmount);
    });

    it('should handle very small amounts', async () => {
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, 1, 'available');

      expect(balance.available).toBe(1);
    });

    it('should handle balance going to exactly zero', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 5000, 'available');
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, -5000, 'available');

      expect(balance.available).toBe(0);
    });

    it('should allow negative balances (for accounting purposes)', async () => {
      const balance = await VenueBalanceModel.updateBalance(venueId, tenantId, -1000, 'available');

      expect(balance.available).toBe(-1000);
    });
  });

  // ===========================================================================
  // BALANCE WORKFLOW
  // ===========================================================================
  describe('balance workflow', () => {
    it('should handle typical payment flow: pending -> available', async () => {
      // Payment comes in as pending
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'pending');

      let balance = await VenueBalanceModel.getBalance(venueId, tenantId);
      expect(balance.pending).toBe(10000);
      expect(balance.available).toBe(0);

      // Payment clears
      await VenueBalanceModel.updateBalance(venueId, tenantId, -10000, 'pending');
      await VenueBalanceModel.updateBalance(venueId, tenantId, 10000, 'available');

      balance = await VenueBalanceModel.getBalance(venueId, tenantId);
      expect(balance.pending).toBe(0);
      expect(balance.available).toBe(10000);
    });

    it('should handle payout flow', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 50000, 'available');
      const balance = await VenueBalanceModel.recordPayout(venueId, tenantId, 50000);

      expect(balance.available).toBe(0);
      expect(balance.lastPayout).toBeInstanceOf(Date);
    });

    it('should handle dispute flow: hold -> release', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 20000, 'available');

      // Hold for dispute
      await VenueBalanceModel.holdForDispute(venueId, tenantId, 5000);
      let balance = await VenueBalanceModel.getBalance(venueId, tenantId);
      expect(balance.available).toBe(15000);
      expect(balance.reserved).toBe(5000);

      // Dispute resolved in venue's favor
      balance = await VenueBalanceModel.releaseDisputeHold(venueId, tenantId, 5000);
      expect(balance.available).toBe(20000);
      expect(balance.reserved).toBe(0);
    });

    it('should handle dispute flow: hold -> loss', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 20000, 'available');

      // Hold for dispute
      await VenueBalanceModel.holdForDispute(venueId, tenantId, 5000);

      // Dispute lost
      const balance = await VenueBalanceModel.recordDisputeLoss(venueId, tenantId, 5000);
      expect(balance.available).toBe(15000);
      expect(balance.reserved).toBe(0);
    });

    it('should handle refund reducing available balance', async () => {
      await VenueBalanceModel.updateBalance(venueId, tenantId, 100000, 'available');
      await VenueBalanceModel.updateBalance(venueId, tenantId, -15000, 'available');

      const balance = await VenueBalanceModel.getBalance(venueId, tenantId);
      expect(balance.available).toBe(85000);
    });
  });
});
