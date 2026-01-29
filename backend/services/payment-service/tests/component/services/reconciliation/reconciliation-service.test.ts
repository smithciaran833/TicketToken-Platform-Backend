/**
 * COMPONENT TEST: ReconciliationService
 *
 * Tests payment-order-ticket reconciliation with REAL PostgreSQL.
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

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

import { ReconciliationService } from '../../../../src/services/reconciliation/reconciliation-service';

describe('ReconciliationService Component Tests', () => {
  let pool: Pool;
  let service: ReconciliationService;
  let tenantId: string;
  let userId: string;
  let venueId: string;
  let eventId: string;
  let orderCounter: number;
  let ticketCounter: number;

  beforeAll(async () => {
    pool = new Pool({
      host: 'localhost',
      port: 5432,
      database: 'tickettoken_db',
      user: 'postgres',
      password: 'postgres',
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    userId = uuidv4();
    venueId = uuidv4();
    eventId = uuidv4();
    orderCounter = 0;
    ticketCounter = 0;

    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    await pool.query(`
      INSERT INTO users (id, tenant_id, email, password_hash, created_at, updated_at)
      VALUES ($1, $2, $3, 'hash', NOW(), NOW())
    `, [userId, tenantId, `user-${userId.slice(0, 8)}@test.com`]);

    await pool.query(`
      INSERT INTO venues (
        id, tenant_id, name, slug, email, address_line1, city, 
        state_province, country_code, venue_type, max_capacity, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
    `, [
      venueId, tenantId, 'Test Venue', `venue-${venueId.slice(0, 8)}`,
      'venue@test.com', '123 Main St', 'Test City', 'TS', 'US', 'arena', 1000
    ]);

    await pool.query(`
      INSERT INTO events (id, tenant_id, venue_id, name, slug, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, 'PUBLISHED', NOW(), NOW())
    `, [eventId, tenantId, venueId, 'Test Event', `event-${eventId.slice(0, 8)}`]);

    service = new ReconciliationService(pool, 5);
  });

  afterEach(async () => {
    service.stop();

    await pool.query('DELETE FROM outbox WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tickets WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM ticket_types WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_intents WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM orders WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // Helper to create an order
  async function createOrder(status: string, minutesAgo: number = 0): Promise<string> {
    const orderId = uuidv4();
    orderCounter++;
    const orderNumber = `O${orderCounter}${tenantId.slice(0, 10)}`;
    
    await pool.query(`
      INSERT INTO orders (
        id, tenant_id, user_id, event_id, order_number, status,
        subtotal_cents, total_cents, ticket_quantity, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, 10000, 10000, 2,
        NOW() - INTERVAL '${minutesAgo} minutes',
        NOW() - INTERVAL '${minutesAgo} minutes'
      )
    `, [orderId, tenantId, userId, eventId, orderNumber, status]);
    
    return orderId;
  }

  async function createPaymentIntent(orderId: string, status: string): Promise<string> {
    const paymentId = uuidv4();
    
    await pool.query(`
      INSERT INTO payment_intents (
        id, tenant_id, order_id, amount, status, version, created_at, updated_at
      ) VALUES ($1, $2, $3, 10000, $4, 1, NOW(), NOW())
    `, [paymentId, tenantId, orderId, status]);
    
    return paymentId;
  }

  // Helper to create a ticket with all required fields
  async function createTicket(orderId: string): Promise<string> {
    const ticketId = uuidv4();
    const ticketTypeId = uuidv4();
    ticketCounter++;
    
    await pool.query(`
      INSERT INTO ticket_types (
        id, tenant_id, event_id, name, price, quantity, available_quantity,
        sale_start, sale_end, created_at, updated_at
      ) VALUES (
        $1, $2, $3, 'General', 50.00, 100, 100,
        NOW() - INTERVAL '1 day', NOW() + INTERVAL '30 days', NOW(), NOW()
      )
    `, [ticketTypeId, tenantId, eventId]);
    
    await pool.query(`
      INSERT INTO tickets (
        id, tenant_id, event_id, ticket_type_id, order_id, user_id,
        ticket_number, qr_code, status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALID', NOW(), NOW())
    `, [ticketId, tenantId, eventId, ticketTypeId, orderId, userId,
        `TKT-${ticketCounter}`, `QR-${ticketId.slice(0, 8)}`]);
    
    return ticketId;
  }

  // ===========================================================================
  // RECONCILE ORPHANED PAYMENTS (CONFIRMED orders without tickets)
  // ===========================================================================
  describe('reconcileOrphanedPayments()', () => {
    it('should create outbox event for CONFIRMED order without tickets', async () => {
      const orderId = await createOrder('CONFIRMED', 6);

      await service.reconcileOrphanedPayments();

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );
      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0].event_type).toBe('order.confirmed');
      expect(outbox.rows[0].payload.reconciliation).toBe(true);
    });

    it('should not create outbox for CONFIRMED orders that have tickets', async () => {
      const orderId = await createOrder('CONFIRMED', 6);
      await createTicket(orderId);

      await service.reconcileOrphanedPayments();

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );
      expect(outbox.rows).toHaveLength(0);
    });

    it('should not flag recent CONFIRMED orders', async () => {
      const orderId = await createOrder('CONFIRMED', 2);

      await service.reconcileOrphanedPayments();

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );
      expect(outbox.rows).toHaveLength(0);
    });

    it('should reset attempts on existing unprocessed outbox events', async () => {
      const orderId = await createOrder('CONFIRMED', 6);
      
      await pool.query(`
        INSERT INTO outbox (
          tenant_id, aggregate_id, aggregate_type, event_type, payload, attempts
        ) VALUES ($1, $2, 'order', 'order.confirmed', '{}', 3)
      `, [tenantId, orderId]);

      await service.reconcileOrphanedPayments();

      const outbox = await pool.query(
        'SELECT attempts FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );
      expect(outbox.rows[0].attempts).toBe(0);
    });
  });

  // ===========================================================================
  // RECONCILE PENDING ORDERS
  // Valid transitions: PENDING → EXPIRED or PENDING → RESERVED → CONFIRMED
  // ===========================================================================
  describe('reconcilePendingOrders()', () => {
    it('should advance PENDING order to CONFIRMED when payment succeeded', async () => {
      const orderId = await createOrder('PENDING', 20);
      await createPaymentIntent(orderId, 'PAID');

      await service.reconcilePendingOrders();

      const order = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(order.rows[0].status).toBe('CONFIRMED');

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );
      expect(outbox.rows.length).toBeGreaterThanOrEqual(1);
    });

    it('should expire PENDING order when payment failed', async () => {
      const orderId = await createOrder('PENDING', 20);
      await createPaymentIntent(orderId, 'failed');

      await service.reconcilePendingOrders();

      const order = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(order.rows[0].status).toBe('EXPIRED');
    });

    it('should expire PENDING order with no payment', async () => {
      const orderId = await createOrder('PENDING', 20);

      await service.reconcilePendingOrders();

      const order = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(order.rows[0].status).toBe('EXPIRED');
    });

    it('should not touch recent PENDING orders', async () => {
      const orderId = await createOrder('PENDING', 5);

      await service.reconcilePendingOrders();

      const order = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(order.rows[0].status).toBe('PENDING');
    });
  });

  // ===========================================================================
  // FULL RECONCILIATION
  // ===========================================================================
  describe('reconcile()', () => {
    it('should run all reconciliation tasks without errors', async () => {
      await createOrder('CONFIRMED', 10); // Orphaned
      const pendingOrderId = await createOrder('PENDING', 20);
      await createPaymentIntent(pendingOrderId, 'failed');

      const result = await service.reconcile();

      expect(result.errors).toHaveLength(0);
    });

    it('should capture errors without stopping', async () => {
      const result = await service.reconcile();

      expect(result).toBeDefined();
      expect(result.orphanedPaymentsFixed).toBeGreaterThanOrEqual(0);
    });
  });

  // ===========================================================================
  // MANUAL RECONCILIATION
  // ===========================================================================
  describe('reconcileOrder()', () => {
    it('should throw error for non-existent order', async () => {
      await expect(
        service.reconcileOrder(uuidv4(), tenantId)
      ).rejects.toThrow('not found');
    });

    it('should create outbox event for CONFIRMED order without tickets', async () => {
      const orderId = await createOrder('CONFIRMED', 0);
      await createPaymentIntent(orderId, 'PAID');

      await service.reconcileOrder(orderId, tenantId);

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1 AND event_type = $2',
        [orderId, 'order.confirmed']
      );
      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0].payload.manual_reconciliation).toBe(true);
    });

    it('should not create outbox event if tickets exist', async () => {
      const orderId = await createOrder('CONFIRMED', 0);
      await createPaymentIntent(orderId, 'PAID');
      await createTicket(orderId);

      await service.reconcileOrder(orderId, tenantId);

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );
      expect(outbox.rows).toHaveLength(0);
    });
  });

  // ===========================================================================
  // STATISTICS
  // ===========================================================================
  describe('getStats()', () => {
    it('should return reconciliation statistics for tenant', async () => {
      await createOrder('PENDING', 20);
      await createOrder('CONFIRMED', 10); // No tickets

      const stats = await service.getStats(tenantId);

      expect(stats.pendingOrders).toBe(1);
      expect(stats.paidWithoutTickets).toBe(1);
    });

    it('should return zeros when no issues for tenant', async () => {
      const stats = await service.getStats(tenantId);

      expect(stats.pendingOrders).toBe(0);
      expect(stats.paidWithoutTickets).toBe(0);
      expect(stats.stuckOutboxEvents).toBe(0);
    });
  });

  // ===========================================================================
  // SERVICE LIFECYCLE
  // ===========================================================================
  describe('service lifecycle', () => {
    it('should start and stop without errors', () => {
      service.start();
      expect(() => service.start()).not.toThrow();

      service.stop();
      expect(() => service.stop()).not.toThrow();
    });
  });
});
