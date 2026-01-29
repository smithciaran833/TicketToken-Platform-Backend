/**
 * COMPONENT TEST: TransactionTimeoutService
 *
 * Tests transaction timeout handling with REAL Database
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

import { TransactionTimeoutService } from '../../../src/services/transaction-timeout.service';

describe('TransactionTimeoutService Component Tests', () => {
  let pool: Pool;
  let service: TransactionTimeoutService;
  let tenantId: string;
  let userId: string;
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
    venueId = uuidv4();
    eventId = uuidv4();

    service = new TransactionTimeoutService(pool, {
      pendingTimeoutMinutes: 15,
      processingTimeoutMinutes: 5,
      checkIntervalMinutes: 1,
    });

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
    // Stop service if running
    service.stop();

    await pool.query('DELETE FROM inventory_reservations WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_transactions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // HELPER: Create Transaction
  // ===========================================================================
  async function createTransaction(
    status: string,
    createdAgo: number = 0 // minutes ago
  ): Promise<string> {
    const txId = uuidv4();
    const orderId = uuidv4();

    await pool.query(`
      INSERT INTO payment_transactions (
        id, tenant_id, venue_id, user_id, event_id, order_id, type, amount, currency,
        status, platform_fee, venue_payout, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'ticket_purchase', 100, 'USD', $7, 5, 95, NOW() - INTERVAL '${createdAgo} minutes', NOW())
    `, [txId, tenantId, venueId, userId, eventId, orderId, status]);

    return txId;
  }

  // ===========================================================================
  // HELPER: Create Inventory Reservation
  // ===========================================================================
  async function createReservation(transactionId: string, status: string = 'held'): Promise<string> {
    const resId = uuidv4();

    await pool.query(`
      INSERT INTO inventory_reservations (id, tenant_id, transaction_id, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
    `, [resId, tenantId, transactionId, status]);

    return resId;
  }

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  describe('configuration', () => {
    it('should have default config', () => {
      const config = service.getConfig();

      expect(config.pendingTimeoutMinutes).toBe(15);
      expect(config.processingTimeoutMinutes).toBe(5);
      expect(config.checkIntervalMinutes).toBe(1);
    });

    it('should accept custom config', () => {
      const customService = new TransactionTimeoutService(pool, {
        pendingTimeoutMinutes: 30,
        processingTimeoutMinutes: 10,
      });

      const config = customService.getConfig();

      expect(config.pendingTimeoutMinutes).toBe(30);
      expect(config.processingTimeoutMinutes).toBe(10);
      expect(config.checkIntervalMinutes).toBe(1); // Default
    });
  });

  // ===========================================================================
  // FIND TIMED OUT TRANSACTIONS
  // ===========================================================================
  describe('findTimedOutTransactions()', () => {
    it('should find pending transactions past timeout', async () => {
      // Create old pending transaction (20 min ago, timeout is 15 min)
      await createTransaction('pending', 20);

      const timedOut = await service.findTimedOutTransactions('pending');

      expect(timedOut).toHaveLength(1);
      expect(timedOut[0].status).toBe('pending');
    });

    it('should NOT find recent pending transactions', async () => {
      // Create recent pending transaction (5 min ago, timeout is 15 min)
      await createTransaction('pending', 5);

      const timedOut = await service.findTimedOutTransactions('pending');

      expect(timedOut).toHaveLength(0);
    });

    it('should find processing transactions past timeout', async () => {
      // Create old processing transaction (10 min ago, timeout is 5 min)
      await createTransaction('processing', 10);

      const timedOut = await service.findTimedOutTransactions('processing');

      expect(timedOut).toHaveLength(1);
      expect(timedOut[0].status).toBe('processing');
    });

    it('should detect inventory reservations', async () => {
      const txId = await createTransaction('pending', 20);
      await createReservation(txId, 'held');

      const timedOut = await service.findTimedOutTransactions('pending');

      expect(timedOut).toHaveLength(1);
      expect(timedOut[0].has_reserved_inventory).toBe(true);
    });

    it('should NOT include completed transactions', async () => {
      await createTransaction('completed', 20);
      await createTransaction('failed', 20);
      await createTransaction('refunded', 20);

      const timedOut = await service.findTimedOutTransactions('pending');

      expect(timedOut).toHaveLength(0);
    });
  });

  // ===========================================================================
  // HANDLE TIMEOUT
  // ===========================================================================
  describe('handleTimeout()', () => {
    it('should mark transaction as failed with timeout metadata', async () => {
      const txId = await createTransaction('pending', 20);

      const transaction = {
        id: txId,
        tenant_id: tenantId,
        user_id: userId,
        amount: 100,
        status: 'pending',
        created_at: new Date(),
        has_reserved_inventory: false,
      };

      await service.handleTimeout(transaction);

      // Verify transaction status
      const result = await pool.query(
        'SELECT status, metadata FROM payment_transactions WHERE id = $1',
        [txId]
      );

      expect(result.rows[0].status).toBe('failed');
      expect(result.rows[0].metadata.failure_reason).toBe('timeout');
      expect(result.rows[0].metadata.previous_status).toBe('pending');
      expect(result.rows[0].metadata.timeout_at).toBeDefined();
    });

    it('should release inventory when present', async () => {
      const txId = await createTransaction('pending', 20);
      const resId = await createReservation(txId, 'held');

      const transaction = {
        id: txId,
        tenant_id: tenantId,
        user_id: userId,
        amount: 100,
        status: 'pending',
        created_at: new Date(),
        has_reserved_inventory: true,
      };

      const released = await service.handleTimeout(transaction);

      expect(released).toBe(true);

      // Verify reservation released
      const result = await pool.query(
        'SELECT status FROM inventory_reservations WHERE id = $1',
        [resId]
      );

      expect(result.rows[0].status).toBe('released');
    });

    it('should return false when no inventory to release', async () => {
      const txId = await createTransaction('pending', 20);

      const transaction = {
        id: txId,
        tenant_id: tenantId,
        user_id: userId,
        amount: 100,
        status: 'pending',
        created_at: new Date(),
        has_reserved_inventory: false,
      };

      const released = await service.handleTimeout(transaction);

      expect(released).toBe(false);
    });
  });

  // ===========================================================================
  // CHECK TIMEOUTS
  // ===========================================================================
  describe('checkTimeouts()', () => {
    it('should find and handle all timed out transactions', async () => {
      // Create 2 pending timeouts
      await createTransaction('pending', 20);
      await createTransaction('pending', 25);

      // Create 1 processing timeout
      await createTransaction('processing', 10);

      const result = await service.checkTimeouts();

      expect(result.timedOutCount).toBe(3);
      expect(result.errors).toHaveLength(0);
    });

    it('should release inventory for all timed out transactions', async () => {
      const tx1 = await createTransaction('pending', 20);
      const tx2 = await createTransaction('pending', 25);

      await createReservation(tx1, 'held');
      await createReservation(tx2, 'held');

      const result = await service.checkTimeouts();

      expect(result.timedOutCount).toBe(2);
      expect(result.releasedInventoryCount).toBe(2);
    });

    it('should return zero counts when no timeouts', async () => {
      await createTransaction('pending', 5); // Not timed out yet

      const result = await service.checkTimeouts();

      expect(result.timedOutCount).toBe(0);
      expect(result.releasedInventoryCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  // ===========================================================================
  // MANUAL TIMEOUT
  // ===========================================================================
  describe('timeoutTransaction()', () => {
    it('should manually timeout a specific transaction', async () => {
      const txId = await createTransaction('pending', 5); // Not timed out yet

      const result = await service.timeoutTransaction(txId, tenantId, 'Manual test');

      expect(result).toBe(true);

      // Verify status
      const dbResult = await pool.query(
        'SELECT status FROM payment_transactions WHERE id = $1',
        [txId]
      );

      expect(dbResult.rows[0].status).toBe('failed');
    });

    it('should reject timeout for non-existent transaction', async () => {
      await expect(
        service.timeoutTransaction(uuidv4(), tenantId)
      ).rejects.toThrow('not found');
    });

    it('should reject timeout for completed transaction', async () => {
      const txId = await createTransaction('completed', 5);

      await expect(
        service.timeoutTransaction(txId, tenantId)
      ).rejects.toThrow('Cannot timeout');
    });

    it('should reject timeout for already failed transaction', async () => {
      const txId = await createTransaction('failed', 5);

      await expect(
        service.timeoutTransaction(txId, tenantId)
      ).rejects.toThrow('Cannot timeout');
    });

    it('should allow timeout for processing transaction', async () => {
      const txId = await createTransaction('processing', 2);

      const result = await service.timeoutTransaction(txId, tenantId);

      expect(result).toBe(true);
    });
  });

  // ===========================================================================
  // TIMEOUT STATISTICS
  // ===========================================================================
  describe('getTimeoutStatistics()', () => {
    it('should calculate timeout statistics', async () => {
      const startDate = new Date(Date.now() - 86400000);
      const endDate = new Date(Date.now() + 86400000);

      // Create and timeout some transactions
      const tx1 = await createTransaction('pending', 20);
      const tx2 = await createTransaction('pending', 25);
      const tx3 = await createTransaction('processing', 10);

      await service.timeoutTransaction(tx1, tenantId);
      await service.timeoutTransaction(tx2, tenantId);
      await service.timeoutTransaction(tx3, tenantId);

      const stats = await service.getTimeoutStatistics(tenantId, startDate, endDate);

      expect(stats.totalTimeouts).toBe(3);
      expect(stats.totalAmount).toBe(300); // 3 x $100
    });

    it('should return zero for no timeouts', async () => {
      const startDate = new Date();
      const endDate = new Date();

      const stats = await service.getTimeoutStatistics(tenantId, startDate, endDate);

      expect(stats.totalTimeouts).toBe(0);
      expect(stats.totalAmount).toBe(0);
    });

    it('should only count transactions with timeout reason', async () => {
      const startDate = new Date(Date.now() - 86400000);
      const endDate = new Date(Date.now() + 86400000);

      // Create timed out transaction
      const tx1 = await createTransaction('pending', 20);
      await service.timeoutTransaction(tx1, tenantId);

      // Create failed transaction (not timeout)
      await pool.query(`
        UPDATE payment_transactions
        SET status = 'failed'
        WHERE id = $1
      `, [await createTransaction('pending', 0)]);

      const stats = await service.getTimeoutStatistics(tenantId, startDate, endDate);

      expect(stats.totalTimeouts).toBe(1); // Only the timeout, not the regular failure
    });
  });

  // ===========================================================================
  // PENDING COUNT
  // ===========================================================================
  describe('getPendingCount()', () => {
    it('should count pending and processing transactions', async () => {
      await createTransaction('pending', 0);
      await createTransaction('pending', 5);
      await createTransaction('processing', 2);
      await createTransaction('completed', 0);
      await createTransaction('failed', 0);

      const count = await service.getPendingCount(tenantId);

      expect(count).toBe(3); // 2 pending + 1 processing
    });

    it('should return zero when no pending transactions', async () => {
      await createTransaction('completed', 0);

      const count = await service.getPendingCount(tenantId);

      expect(count).toBe(0);
    });
  });

  // ===========================================================================
  // SERVICE LIFECYCLE
  // ===========================================================================
  describe('service lifecycle', () => {
    it('should start and stop the service', () => {
      service.start();
      expect((service as any).intervalId).toBeDefined();

      service.stop();
      expect((service as any).intervalId).toBeUndefined();
    });

    it('should warn when starting already running service', () => {
      service.start();
      service.start(); // Second start should warn

      service.stop();
    });

    it('should handle stop when not running', () => {
      service.stop(); // Should not throw
    });
  });
});
