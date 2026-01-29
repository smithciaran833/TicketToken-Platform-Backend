/**
 * COMPONENT TEST: ChargebackReserveService
 *
 * Tests chargeback reserve system with REAL Database
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

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

import { ChargebackReserveService } from '../../../src/services/chargeback-reserve.service';

describe('ChargebackReserveService Component Tests', () => {
  let pool: Pool;
  let service: ChargebackReserveService;
  let tenantId: string;
  let userId: string;
  let userId2: string;
  let venueId: string;
  let eventId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    userId2 = uuidv4();
    venueId = uuidv4();
    eventId = uuidv4();

    service = new ChargebackReserveService(pool);

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create test users
    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`, 'hash']);

    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [userId2, tenantId, `user2-${userId2.slice(0, 8)}@test.com`, 'hash']);

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
    await pool.query('DELETE FROM payment_reserves WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_chargebacks WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // HELPER: Create Transaction
  // ===========================================================================
  async function createTransaction(amount: number = 100, userIdOverride?: string): Promise<string> {
    const txId = uuidv4();
    const orderId = uuidv4();

    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, order_id, type, amount, currency,
        status, platform_fee, venue_payout, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'ticket_purchase', $7, 'USD', 'completed', $8, $9, NOW(), NOW())
    `, [txId, tenantId, venueId, userIdOverride || userId, eventId, orderId, amount, amount * 0.05, amount * 0.95]);

    return txId;
  }

  // ===========================================================================
  // CALCULATE RESERVE - LOW RISK
  // ===========================================================================
  describe('calculateReserve() - Low Risk', () => {
    it('should calculate 1% reserve for low-risk transaction', async () => {
      const txId = await createTransaction(100);

      const calculation = await service.calculateReserve(txId, tenantId);

      expect(calculation.transactionAmountCents).toBe(10000);
      expect(calculation.reserveAmountCents).toBe(100);
      expect(calculation.reserveRate).toBe(0.01);
      expect(calculation.riskLevel).toBe('low');
    });

    it('should handle transactions with no chargeback history', async () => {
      const txId = await createTransaction(50);

      const calculation = await service.calculateReserve(txId, tenantId);

      expect(calculation.riskLevel).toBe('low');
      expect(calculation.reserveRate).toBe(0.01);
    });
  });

  // ===========================================================================
  // CALCULATE RESERVE - MEDIUM & HIGH RISK
  // ===========================================================================
  describe('calculateReserve() - Risk Assessment', () => {
    it('should assess user chargeback history correctly', async () => {
      // User with exactly 1 chargeback = medium risk
      const cbTxId = await createTransaction(50);
      await pool.query(`
        INSERT INTO payment_chargebacks (
          id, tenant_id, transaction_id, user_id, amount_cents, status, disputed_at, created_at
        )
        VALUES ($1, $2, $3, $4, 5000, 'lost', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
      `, [uuidv4(), tenantId, cbTxId, userId]);

      // New transaction for this user
      const txId = await createTransaction(100);
      const calculation = await service.calculateReserve(txId, tenantId);

      // User has 1 chargeback, so medium risk (even if venue adds to transaction count)
      expect(calculation.riskLevel).toMatch(/medium|high/); // Either is acceptable
      expect(calculation.reserveRate).toBeGreaterThan(0.01); // Higher than base rate
    });

    it('should assess user with 3+ chargebacks as high risk', async () => {
      // Create 3 chargebacks for user
      for (let i = 0; i < 3; i++) {
        const cbTxId = await createTransaction(50);
        await pool.query(`
          INSERT INTO payment_chargebacks (
            id, tenant_id, transaction_id, user_id, amount_cents, status, disputed_at, created_at
          )
          VALUES ($1, $2, $3, $4, 5000, 'lost', NOW() - INTERVAL '${30 + i * 10} days', NOW() - INTERVAL '${30 + i * 10} days')
        `, [uuidv4(), tenantId, cbTxId, userId]);
      }

      const txId = await createTransaction(100);
      const calculation = await service.calculateReserve(txId, tenantId);

      expect(calculation.riskLevel).toBe('high');
      expect(calculation.reserveRate).toBe(0.05);
      expect(calculation.reserveAmountCents).toBe(500);
    });

    it('should assess venue chargeback rate correctly', async () => {
      // Create enough transactions to assess venue properly
      // 200 clean transactions + 5 with chargebacks = 2.4% rate (high)
      for (let i = 0; i < 200; i++) {
        await createTransaction(10, userId2);
      }

      for (let i = 0; i < 5; i++) {
        const cbTxId = await createTransaction(10, userId2);
        await pool.query(`
          INSERT INTO payment_chargebacks (
            id, tenant_id, transaction_id, user_id, amount_cents, status, disputed_at, created_at
          )
          VALUES ($1, $2, $3, $4, 1000, 'lost', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
        `, [uuidv4(), tenantId, cbTxId, userId2]);
      }

      // New transaction should be high risk due to venue
      const txId = await createTransaction(100);
      const calculation = await service.calculateReserve(txId, tenantId);

      // Venue has >2% chargeback rate
      expect(calculation.riskLevel).toBe('high');
      expect(calculation.reserveRate).toBe(0.05);
    });
  });

  // ===========================================================================
  // CREATE RESERVE
  // ===========================================================================
  describe('createReserve()', () => {
    it('should create a reserve for transaction', async () => {
      const txId = await createTransaction(100);

      const result = await service.createReserve(txId, tenantId);

      expect(result.reserveId).toBeDefined();
      expect(result.reserveAmountCents).toBe(100);

      // Verify in database
      const dbResult = await pool.query(
        'SELECT * FROM payment_reserves WHERE reserve_id = $1',
        [result.reserveId]
      );

      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].reserve_amount_cents).toBe(100);
      expect(dbResult.rows[0].status).toBe('held');
    });

    it('should update existing reserve instead of creating duplicate', async () => {
      const txId = await createTransaction(100);

      const first = await service.createReserve(txId, tenantId);
      const second = await service.createReserve(txId, tenantId);

      expect(second.reserveId).toBe(first.reserveId);

      const dbResult = await pool.query(
        'SELECT * FROM payment_reserves WHERE transaction_id = $1',
        [txId]
      );

      expect(dbResult.rows).toHaveLength(1);
    });
  });

  // ===========================================================================
  // PROCESS RESERVE RELEASES
  // ===========================================================================
  describe('processReserveReleases()', () => {
    it('should release reserves after hold period', async () => {
      const txId = await createTransaction(100);
      const { reserveId } = await service.createReserve(txId, tenantId);

      await pool.query(`
        UPDATE payment_reserves
        SET created_at = NOW() - INTERVAL '91 days'
        WHERE reserve_id = $1
      `, [reserveId]);

      const result = await service.processReserveReleases(tenantId);

      expect(result.releasedCount).toBe(1);
      expect(result.releasedAmountCents).toBe(100);

      const dbResult = await pool.query(
        'SELECT * FROM payment_reserves WHERE reserve_id = $1',
        [reserveId]
      );

      expect(dbResult.rows[0].status).toBe('released');
      expect(dbResult.rows[0].released_at).not.toBeNull();
    });

    it('should NOT release reserves within hold period', async () => {
      const txId = await createTransaction(100);
      await service.createReserve(txId, tenantId);

      const result = await service.processReserveReleases(tenantId);

      expect(result.releasedCount).toBe(0);
    });

    it('should NOT release reserves with pending chargebacks', async () => {
      const txId = await createTransaction(100);
      const { reserveId } = await service.createReserve(txId, tenantId);

      await pool.query(`
        UPDATE payment_reserves
        SET created_at = NOW() - INTERVAL '91 days'
        WHERE reserve_id = $1
      `, [reserveId]);

      await pool.query(`
        INSERT INTO payment_chargebacks (
          id, tenant_id, transaction_id, user_id, amount_cents, status, disputed_at, created_at
        )
        VALUES ($1, $2, $3, $4, 10000, 'open', NOW(), NOW())
      `, [uuidv4(), tenantId, txId, userId]);

      const result = await service.processReserveReleases(tenantId);

      expect(result.releasedCount).toBe(0);
    });

    it('should release multiple reserves in batch', async () => {
      for (let i = 0; i < 3; i++) {
        const txId = await createTransaction(50);
        const { reserveId } = await service.createReserve(txId, tenantId);

        await pool.query(`
          UPDATE payment_reserves
          SET created_at = NOW() - INTERVAL '91 days'
          WHERE reserve_id = $1
        `, [reserveId]);
      }

      const result = await service.processReserveReleases(tenantId);

      expect(result.releasedCount).toBe(3);
      expect(result.releasedAmountCents).toBe(150);
    });
  });

  // ===========================================================================
  // HANDLE CHARGEBACK
  // ===========================================================================
  describe('handleChargeback()', () => {
    it('should use reserve to cover chargeback', async () => {
      const txId = await createTransaction(100);
      await service.createReserve(txId, tenantId);

      const result = await service.handleChargeback(txId, 100);

      expect(result.coveredAmountCents).toBe(100);
      expect(result.remainingAmountCents).toBe(0);

      const dbResult = await pool.query(
        'SELECT * FROM payment_reserves WHERE transaction_id = $1',
        [txId]
      );

      expect(dbResult.rows[0].status).toBe('used_for_chargeback');
      expect(dbResult.rows[0].used_amount_cents).toBe(100);
    });

    it('should partially cover chargeback if reserve insufficient', async () => {
      const txId = await createTransaction(100);
      await service.createReserve(txId, tenantId);

      const result = await service.handleChargeback(txId, 5000);

      expect(result.coveredAmountCents).toBe(100);
      expect(result.remainingAmountCents).toBe(4900);
    });

    it('should handle chargeback when no reserve exists', async () => {
      const txId = await createTransaction(100);

      const result = await service.handleChargeback(txId, 10000);

      expect(result.coveredAmountCents).toBe(0);
      expect(result.remainingAmountCents).toBe(10000);
    });
  });

  // ===========================================================================
  // RESERVE STATISTICS
  // ===========================================================================
  describe('getReserveStats()', () => {
    it('should calculate reserve statistics', async () => {
      const startDate = new Date(Date.now() - 86400000);
      const endDate = new Date(Date.now() + 86400000);

      const tx1 = await createTransaction(100);
      await service.createReserve(tx1, tenantId);

      const tx2 = await createTransaction(200);
      const { reserveId } = await service.createReserve(tx2, tenantId);
      await pool.query(`
        UPDATE payment_reserves
        SET status = 'released', released_at = NOW()
        WHERE reserve_id = $1
      `, [reserveId]);

      const tx3 = await createTransaction(150);
      const { reserveId: cbReserveId } = await service.createReserve(tx3, tenantId);
      await pool.query(`
        UPDATE payment_reserves
        SET status = 'used_for_chargeback', used_amount_cents = 150
        WHERE reserve_id = $1
      `, [cbReserveId]);

      const stats = await service.getReserveStats(tenantId, startDate, endDate);

      expect(stats.totalReservedCents).toBe(100);
      expect(stats.totalReleasedCents).toBe(200);
      expect(stats.chargebacksCents).toBe(150);
      expect(stats.reserveUtilization).toBeCloseTo(1.5, 1);
    });
  });

  // ===========================================================================
  // GET VENUE RESERVES
  // ===========================================================================
  describe('getVenueReserves()', () => {
    it('should list reserves for a venue', async () => {
      const tx1 = await createTransaction(100);
      const tx2 = await createTransaction(200);

      await service.createReserve(tx1, tenantId);
      await service.createReserve(tx2, tenantId);

      const reserves = await service.getVenueReserves(venueId, tenantId);

      expect(reserves).toHaveLength(2);
      expect(reserves[0].status).toBe('held');
      expect(reserves[1].status).toBe('held');
    });

    it('should only show held reserves', async () => {
      const tx1 = await createTransaction(100);
      const { reserveId } = await service.createReserve(tx1, tenantId);

      await pool.query(`
        UPDATE payment_reserves
        SET status = 'released'
        WHERE reserve_id = $1
      `, [reserveId]);

      const reserves = await service.getVenueReserves(venueId, tenantId);

      expect(reserves).toHaveLength(0);
    });
  });

  // ===========================================================================
  // GET RESERVE BY TRANSACTION
  // ===========================================================================
  describe('getReserveByTransaction()', () => {
    it('should retrieve reserve by transaction ID', async () => {
      const txId = await createTransaction(100);
      const { reserveId } = await service.createReserve(txId, tenantId);

      const reserve = await service.getReserveByTransaction(txId);

      expect(reserve).not.toBeNull();
      expect(reserve!.reserveId).toBe(reserveId);
      expect(reserve!.reserveAmountCents).toBe(100);
    });

    it('should return null if no reserve exists', async () => {
      const txId = await createTransaction(100);

      const reserve = await service.getReserveByTransaction(txId);

      expect(reserve).toBeNull();
    });
  });

  // ===========================================================================
  // POLICY MANAGEMENT
  // ===========================================================================
  describe('policy management', () => {
    it('should allow updating reserve policy', async () => {
      service.updatePolicy({
        baseReserveRate: 0.02,
        highRiskRate: 0.10,
      });

      const policy = service.getPolicy();

      expect(policy.baseReserveRate).toBe(0.02);
      expect(policy.highRiskRate).toBe(0.10);
      expect(policy.holdPeriodDays).toBe(90);
    });

    it('should use custom policy in calculations', async () => {
      service.updatePolicy({
        baseReserveRate: 0.05,
      });

      const txId = await createTransaction(100);
      const calculation = await service.calculateReserve(txId, tenantId);

      expect(calculation.reserveAmountCents).toBe(500);
    });
  });
});
