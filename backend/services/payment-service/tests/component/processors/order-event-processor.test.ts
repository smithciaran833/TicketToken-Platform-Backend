/**
 * COMPONENT TEST: OrderEventProcessor
 *
 * Tests order event processing with REAL Database
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

import { OrderEventProcessor, OrderEvent } from '../../../src/processors/order-event-processor';
import { OrderState } from '../../../src/services/state-machine/order-state-machine';

describe('OrderEventProcessor Component Tests', () => {
  let pool: Pool;
  let processor: OrderEventProcessor;
  let tenantId: string;
  let userId: string;
  let venueId: string;
  let eventId: string;
  let orderId: string;

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
    orderId = uuidv4();

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

    // Create test order
    await pool.query(`
      INSERT INTO orders (id, tenant_id, user_id, venue_id, event_id, status, total_amount, currency, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `, [orderId, tenantId, userId, venueId, eventId, OrderState.PAYMENT_PROCESSING, 10000, 'USD']);

    processor = new OrderEventProcessor(pool);
  });

  afterEach(async () => {
    await pool.query('DELETE FROM orders WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM events WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM venues WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // PAYMENT RECEIVED EVENT
  // ===========================================================================
  describe('order.payment_received', () => {
    it('should transition order from PAYMENT_PROCESSING to PAID', async () => {
      const event: OrderEvent = {
        orderId,
        type: 'order.payment_received',
        payload: { amount: 10000 },
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.PAID);
    });

    it('should not transition if not in PAYMENT_PROCESSING state', async () => {
      // Set order to different state
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.CREATED, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.payment_received',
        payload: {},
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.CREATED);
    });
  });

  // ===========================================================================
  // ITEMS SHIPPED EVENT
  // ===========================================================================
  describe('order.items_shipped', () => {
    it('should transition order from PAID to FULFILLED', async () => {
      // Set order to PAID state
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.PAID, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.items_shipped',
        payload: { trackingNumber: 'TRACK123' },
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.FULFILLED);
    });

    it('should not transition if not in PAID state', async () => {
      // Order is in PAYMENT_PROCESSING state
      const event: OrderEvent = {
        orderId,
        type: 'order.items_shipped',
        payload: {},
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.PAYMENT_PROCESSING);
    });
  });

  // ===========================================================================
  // CANCELLATION EVENT
  // ===========================================================================
  describe('order.cancelled', () => {
    it('should cancel order in CREATED state', async () => {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.CREATED, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.cancelled',
        payload: { reason: 'Customer request' },
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.CANCELLED);
    });

    it('should cancel order in PAYMENT_PENDING state', async () => {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.PAYMENT_PENDING, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.cancelled',
        payload: {},
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.CANCELLED);
    });

    it('should cancel order in PAYMENT_FAILED state', async () => {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.PAYMENT_FAILED, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.cancelled',
        payload: {},
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.CANCELLED);
    });

    it('should NOT cancel order in FULFILLED state', async () => {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.FULFILLED, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.cancelled',
        payload: {},
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.FULFILLED);
    });

    it('should NOT cancel order in PAID state', async () => {
      await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2',
        [OrderState.PAID, orderId]
      );

      const event: OrderEvent = {
        orderId,
        type: 'order.cancelled',
        payload: {},
        timestamp: new Date(),
      };

      await processor.processOrderEvent(event);

      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.PAID);
    });
  });

  // ===========================================================================
  // ERROR HANDLING
  // ===========================================================================
  describe('error handling', () => {
    it('should throw error for non-existent order', async () => {
      const event: OrderEvent = {
        orderId: uuidv4(), // Non-existent
        type: 'order.payment_received',
        payload: {},
        timestamp: new Date(),
      };

      await expect(processor.processOrderEvent(event)).rejects.toThrow('not found');
    });
  });

  // ===========================================================================
  // UNKNOWN EVENT TYPES
  // ===========================================================================
  describe('unknown event types', () => {
    it('should handle unknown event type gracefully', async () => {
      const event: OrderEvent = {
        orderId,
        type: 'order.unknown_event',
        payload: {},
        timestamp: new Date(),
      };

      // Should not throw
      await processor.processOrderEvent(event);

      // Status should remain unchanged
      const result = await pool.query(
        'SELECT status FROM orders WHERE id = $1',
        [orderId]
      );
      expect(result.rows[0].status).toBe(OrderState.PAYMENT_PROCESSING);
    });
  });
});
