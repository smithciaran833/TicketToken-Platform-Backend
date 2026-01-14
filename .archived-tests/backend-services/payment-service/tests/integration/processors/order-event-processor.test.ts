/**
 * Order Event Processor Integration Tests
 * Tests event processing with actual database
 */

import { Pool } from 'pg';
import { OrderEventProcessor, OrderEvent } from '../../../src/processors/order-event-processor';
import { OrderState } from '../../../src/services/state-machine/order-state-machine';
import { v4 as uuidv4 } from 'uuid';

// Existing test data from database
const TEST_USER_ID = '8f111508-77ad-4d4b-9d39-0010274386ab';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';

describe('OrderEventProcessor', () => {
  let pool: Pool;
  let processor: OrderEventProcessor;
  const createdOrderIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
    processor = new OrderEventProcessor(pool);
  });

  afterAll(async () => {
    // Clean up created orders
    for (const id of createdOrderIds) {
      await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    }
    await pool.end();
  });

  async function createTestOrder(status: string): Promise<string> {
    // Get a tenant_id from existing data
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenantResult.rows[0]?.id;

    if (!tenantId) {
      throw new Error('No tenant found in database');
    }

    const orderId = uuidv4();
    const orderNumber = 'TEST-' + Date.now();

    await pool.query(
      `INSERT INTO orders (id, tenant_id, user_id, event_id, order_number, status, subtotal_cents, total_cents)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orderId, tenantId, TEST_USER_ID, TEST_EVENT_ID, orderNumber, status, 10000, 10000]
    );

    createdOrderIds.push(orderId);
    return orderId;
  }

  describe('processOrderEvent()', () => {
    describe('order.payment_received', () => {
      it('should update order to PAID when in PAYMENT_PROCESSING state', async () => {
        const orderId = await createTestOrder(OrderState.PAYMENT_PROCESSING);

        const event: OrderEvent = {
          orderId,
          type: 'order.payment_received',
          payload: { amount: 10000 },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.PAID);
      });

      it('should not update order if not in PAYMENT_PROCESSING state', async () => {
        const orderId = await createTestOrder(OrderState.CREATED);

        const event: OrderEvent = {
          orderId,
          type: 'order.payment_received',
          payload: { amount: 10000 },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.CREATED);
      });
    });

    describe('order.items_shipped', () => {
      it('should update order to FULFILLED when in PAID state', async () => {
        const orderId = await createTestOrder(OrderState.PAID);

        const event: OrderEvent = {
          orderId,
          type: 'order.items_shipped',
          payload: { trackingNumber: 'TRACK123' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.FULFILLED);
      });

      it('should not update order if not in PAID state', async () => {
        const orderId = await createTestOrder(OrderState.CREATED);

        const event: OrderEvent = {
          orderId,
          type: 'order.items_shipped',
          payload: { trackingNumber: 'TRACK123' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.CREATED);
      });
    });

    describe('order.cancelled', () => {
      it('should cancel order in CREATED state', async () => {
        const orderId = await createTestOrder(OrderState.CREATED);

        const event: OrderEvent = {
          orderId,
          type: 'order.cancelled',
          payload: { reason: 'Customer request' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.CANCELLED);
      });

      it('should cancel order in PAYMENT_PENDING state', async () => {
        const orderId = await createTestOrder(OrderState.PAYMENT_PENDING);

        const event: OrderEvent = {
          orderId,
          type: 'order.cancelled',
          payload: { reason: 'Payment timeout' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.CANCELLED);
      });

      it('should cancel order in PAYMENT_FAILED state', async () => {
        const orderId = await createTestOrder(OrderState.PAYMENT_FAILED);

        const event: OrderEvent = {
          orderId,
          type: 'order.cancelled',
          payload: { reason: 'Payment failed' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.CANCELLED);
      });

      it('should not cancel order in FULFILLED state', async () => {
        const orderId = await createTestOrder(OrderState.FULFILLED);

        const event: OrderEvent = {
          orderId,
          type: 'order.cancelled',
          payload: { reason: 'Customer request' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.FULFILLED);
      });

      it('should not cancel order in PAID state', async () => {
        const orderId = await createTestOrder(OrderState.PAID);

        const event: OrderEvent = {
          orderId,
          type: 'order.cancelled',
          payload: { reason: 'Customer request' },
          timestamp: new Date(),
        };

        await processor.processOrderEvent(event);

        const result = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
        expect(result.rows[0].status).toBe(OrderState.PAID);
      });
    });

    describe('error handling', () => {
      it('should throw error for non-existent order', async () => {
        const fakeOrderId = uuidv4();

        const event: OrderEvent = {
          orderId: fakeOrderId,
          type: 'order.payment_received',
          payload: {},
          timestamp: new Date(),
        };

        await expect(processor.processOrderEvent(event)).rejects.toThrow(
          `Order ${fakeOrderId} not found`
        );
      });
    });
  });
});
