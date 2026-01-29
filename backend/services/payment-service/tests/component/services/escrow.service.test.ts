/**
 * COMPONENT TEST: EscrowService
 *
 * Tests escrow functionality with REAL Database
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

// Mock DatabaseService
jest.mock('../../../src/services/databaseService', () => ({
  DatabaseService: {
    getPool: () => getSharedPool(),
  },
}));

// Mock fee calculation service
jest.mock('../../../src/services/fee-calculation.service', () => ({
  feeCalculationService: {
    calculateStripeFee: jest.fn((amount: number) => Math.round(amount * 0.029) + 30),
    calculatePlatformFee: jest.fn((amount: number) => Math.round(amount * 0.05)),
  },
}));

import { escrowService } from '../../../src/services/escrow.service';

describe('EscrowService Component Tests', () => {
  let pool: Pool;
  let tenantId: string;
  let orderId: string;
  let paymentIntentId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    orderId = uuidv4();
    paymentIntentId = `pi_test_${uuidv4().slice(0, 8)}`;

    // Clear mocks
    jest.clearAllMocks();

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM escrow_events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM escrow_accounts WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // CREATE ESCROW
  // ===========================================================================
  describe('createEscrow()', () => {
    it('should create an escrow account with default hold period', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      expect(escrow.id).toBeDefined();
      expect(escrow.orderId).toBe(orderId);
      expect(escrow.paymentIntentId).toBe(paymentIntentId);
      expect(escrow.amount).toBe(10000);
      expect(escrow.heldAmount).toBe(10000);
      expect(escrow.releasedAmount).toBe(0);
      expect(escrow.status).toBe('held');
      expect(escrow.tenantId).toBe(tenantId);

      // Hold until should be ~7 days from now (default)
      const daysFromNow = (escrow.holdUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysFromNow).toBeGreaterThan(6.9);
      expect(daysFromNow).toBeLessThan(7.1);
    });

    it('should create escrow with custom hold period', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 5000,
        holdDays: 14,
        tenantId,
      });

      const daysFromNow = (escrow.holdUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysFromNow).toBeGreaterThan(13.9);
      expect(daysFromNow).toBeLessThan(14.1);
    });

    it('should create escrow with release conditions', async () => {
      const releaseConditions = ['event_completed', 'no_disputes'];

      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        releaseConditions,
        tenantId,
      });

      expect(escrow.releaseConditions).toEqual(releaseConditions);
    });

    it('should store escrow in database', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // Verify in database
      const result = await pool.query(
        'SELECT * FROM escrow_accounts WHERE id = $1',
        [escrow.id]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].amount).toBe(10000);
      expect(result.rows[0].status).toBe('held');
    });
  });

  // ===========================================================================
  // GET ESCROW
  // ===========================================================================
  describe('getEscrow()', () => {
    it('should retrieve escrow account', async () => {
      const created = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const retrieved = await escrowService.getEscrow(created.id, tenantId);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.amount).toBe(10000);
    });

    it('should return null for non-existent escrow', async () => {
      const result = await escrowService.getEscrow(uuidv4(), tenantId);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      const otherTenantId = uuidv4();

      await pool.query(`
        INSERT INTO tenants (id, name, slug, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `, [otherTenantId, 'Other Tenant', `other-${otherTenantId.slice(0, 8)}`]);

      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // Try to access from different tenant
      const result = await escrowService.getEscrow(escrow.id, otherTenantId);

      expect(result).toBeNull();

      // Cleanup
      await pool.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
    });

    it('should hide sensitive fields (paymentIntentId)', async () => {
      const created = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const retrieved = await escrowService.getEscrow(created.id, tenantId);

      // Should hide payment_intent_id in external responses
      expect(retrieved!.paymentIntentId).toBe('');
      expect(retrieved!.releaseConditions).toEqual([]);
    });
  });

  // ===========================================================================
  // RELEASE ESCROW
  // ===========================================================================
  describe('releaseEscrow()', () => {
    it('should release full escrow amount', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const released = await escrowService.releaseEscrow({
        escrowId: escrow.id,
        tenantId,
        reason: 'Event completed',
      });

      expect(released.status).toBe('released');
      expect(released.heldAmount).toBe(0);
      expect(released.releasedAmount).toBe(10000);
    });

    it('should release partial amount', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const released = await escrowService.releaseEscrow({
        escrowId: escrow.id,
        amount: 4000,
        tenantId,
        reason: 'Partial release',
      });

      expect(released.status).toBe('partially_released');
      expect(released.heldAmount).toBe(6000);
      expect(released.releasedAmount).toBe(4000);
    });

    it('should handle multiple partial releases', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // First release: 3000
      await escrowService.releaseEscrow({
        escrowId: escrow.id,
        amount: 3000,
        tenantId,
        reason: 'First partial',
      });

      // Second release: 5000
      const afterSecond = await escrowService.releaseEscrow({
        escrowId: escrow.id,
        amount: 5000,
        tenantId,
        reason: 'Second partial',
      });

      expect(afterSecond.heldAmount).toBe(2000);
      expect(afterSecond.releasedAmount).toBe(8000);

      // Third release: remaining 2000
      const final = await escrowService.releaseEscrow({
        escrowId: escrow.id,
        amount: 2000,
        tenantId,
        reason: 'Final release',
      });

      expect(final.status).toBe('released');
      expect(final.heldAmount).toBe(0);
      expect(final.releasedAmount).toBe(10000);
    });

    it('should prevent over-release', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      await expect(
        escrowService.releaseEscrow({
          escrowId: escrow.id,
          amount: 15000,
          tenantId,
          reason: 'Over-release attempt',
        })
      ).rejects.toThrow('Release amount exceeds held amount');
    });

    it('should prevent releasing already released escrow', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // Release full amount
      await escrowService.releaseEscrow({
        escrowId: escrow.id,
        tenantId,
      });

      // Try to release again
      await expect(
        escrowService.releaseEscrow({
          escrowId: escrow.id,
          tenantId,
        })
      ).rejects.toThrow('Escrow already fully released');
    });

    it('should create escrow event on release', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      await escrowService.releaseEscrow({
        escrowId: escrow.id,
        amount: 4000,
        tenantId,
        reason: 'Test release',
      });

      // Check escrow_events table
      const events = await pool.query(
        'SELECT * FROM escrow_events WHERE escrow_id = $1',
        [escrow.id]
      );

      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].event_type).toBe('released');
      expect(events.rows[0].amount).toBe(4000);
      expect(events.rows[0].reason).toBe('Test release');
    });
  });

  // ===========================================================================
  // CANCEL ESCROW
  // ===========================================================================
  describe('cancelEscrow()', () => {
    it('should cancel pending escrow', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const cancelled = await escrowService.cancelEscrow(
        escrow.id,
        'Order cancelled',
        tenantId
      );

      expect(cancelled.status).toBe('cancelled');
    });

    it('should prevent cancelling fully released escrow', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // Release it first
      await escrowService.releaseEscrow({
        escrowId: escrow.id,
        tenantId,
      });

      // Try to cancel
      await expect(
        escrowService.cancelEscrow(escrow.id, 'Cancel attempt', tenantId)
      ).rejects.toThrow('Cannot cancel fully released escrow');
    });

    it('should create escrow event on cancellation', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      await escrowService.cancelEscrow(escrow.id, 'Fraud detected', tenantId);

      const events = await pool.query(
        'SELECT * FROM escrow_events WHERE escrow_id = $1',
        [escrow.id]
      );

      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].event_type).toBe('cancelled');
      expect(events.rows[0].reason).toBe('Fraud detected');
    });
  });

  // ===========================================================================
  // DISPUTE ESCROW
  // ===========================================================================
  describe('disputeEscrow()', () => {
    it('should mark escrow as disputed', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const disputeId = `dp_test_${uuidv4().slice(0, 8)}`;

      const disputed = await escrowService.disputeEscrow(
        escrow.id,
        disputeId,
        tenantId
      );

      expect(disputed.status).toBe('disputed');
    });

    it('should prevent releasing disputed escrow', async () => {
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // Mark as disputed
      await escrowService.disputeEscrow(escrow.id, 'dp_test_123', tenantId);

      // Try to release
      await expect(
        escrowService.releaseEscrow({
          escrowId: escrow.id,
          tenantId,
        })
      ).rejects.toThrow('Escrow is under dispute');
    });
  });

  // ===========================================================================
  // AUTOMATIC RELEASE PROCESSING
  // ===========================================================================
  describe('processReadyEscrows()', () => {
    it('should auto-release escrows past hold period', async () => {
      // Create escrow with hold_until in the past
      const escrow = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        holdDays: 0, // Will be in the past immediately
        tenantId,
      });

      // Manually set hold_until to past
      await pool.query(`
        UPDATE escrow_accounts
        SET hold_until = NOW() - INTERVAL '1 day'
        WHERE id = $1
      `, [escrow.id]);

      const processedCount = await escrowService.processReadyEscrows();

      expect(processedCount).toBe(1);

      // Verify escrow was released
      const updated = await pool.query(
        'SELECT * FROM escrow_accounts WHERE id = $1',
        [escrow.id]
      );

      expect(updated.rows[0].status).toBe('released');
    });

    it('should not release escrows with future hold dates', async () => {
      await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        holdDays: 7,
        tenantId,
      });

      const processedCount = await escrowService.processReadyEscrows();

      expect(processedCount).toBe(0);
    });

    it('should handle multiple ready escrows', async () => {
      // Create 3 escrows ready for release
      for (let i = 0; i < 3; i++) {
        const escrow = await escrowService.createEscrow({
          orderId: uuidv4(),
          paymentIntentId: `pi_test_${i}`,
          amount: 10000,
          holdDays: 0,
          tenantId,
        });

        await pool.query(`
          UPDATE escrow_accounts
          SET hold_until = NOW() - INTERVAL '1 day'
          WHERE id = $1
        `, [escrow.id]);
      }

      const processedCount = await escrowService.processReadyEscrows();

      expect(processedCount).toBe(3);
    });
  });

  // ===========================================================================
  // LIST ESCROWS FOR ORDER
  // ===========================================================================
  describe('listEscrowsForOrder()', () => {
    it('should list all escrows for an order', async () => {
      // Create multiple escrows for same order
      await escrowService.createEscrow({
        orderId,
        paymentIntentId: 'pi_test_1',
        amount: 5000,
        tenantId,
      });

      await escrowService.createEscrow({
        orderId,
        paymentIntentId: 'pi_test_2',
        amount: 7500,
        tenantId,
      });

      const escrows = await escrowService.listEscrowsForOrder(orderId, tenantId);

      expect(escrows).toHaveLength(2);
      expect(escrows[0].orderId).toBe(orderId);
      expect(escrows[1].orderId).toBe(orderId);
    });

    it('should return empty array for order with no escrows', async () => {
      const escrows = await escrowService.listEscrowsForOrder(uuidv4(), tenantId);

      expect(escrows).toEqual([]);
    });

    it('should enforce tenant isolation when listing', async () => {
      const otherTenantId = uuidv4();

      await pool.query(`
        INSERT INTO tenants (id, name, slug, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
      `, [otherTenantId, 'Other Tenant', `other-${otherTenantId.slice(0, 8)}`]);

      await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      // Try to list from different tenant
      const escrows = await escrowService.listEscrowsForOrder(orderId, otherTenantId);

      expect(escrows).toEqual([]);

      // Cleanup
      await pool.query('DELETE FROM tenants WHERE id = $1', [otherTenantId]);
    });
  });

  // ===========================================================================
  // GET ESCROW BY PAYMENT INTENT (Internal)
  // ===========================================================================
  describe('getEscrowByPaymentIntent()', () => {
    it('should retrieve escrow by payment intent ID', async () => {
      const created = await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        tenantId,
      });

      const retrieved = await escrowService.getEscrowByPaymentIntent(
        paymentIntentId,
        tenantId
      );

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.paymentIntentId).toBe(paymentIntentId);
    });

    it('should return full escrow data including sensitive fields', async () => {
      await escrowService.createEscrow({
        orderId,
        paymentIntentId,
        amount: 10000,
        releaseConditions: ['event_completed'],
        tenantId,
      });

      const retrieved = await escrowService.getEscrowByPaymentIntent(
        paymentIntentId,
        tenantId
      );

      // Internal method should include sensitive fields
      expect(retrieved!.paymentIntentId).toBe(paymentIntentId);
      expect(retrieved!.releaseConditions).toEqual(['event_completed']);
    });
  });
});
