/**
 * Payment Event Processor Integration Tests
 * Tests event processing with actual database and queue
 */

import { Pool } from 'pg';
import Bull from 'bull';
import { PaymentEventProcessor, PaymentEvent } from '../../../src/processors/payment-event-processor';
import { v4 as uuidv4 } from 'uuid';

// Existing test data from database
const TEST_USER_ID = '8f111508-77ad-4d4b-9d39-0010274386ab';
const TEST_EVENT_ID = '00000000-0000-0000-0000-000000000066';

describe('PaymentEventProcessor', () => {
  let pool: Pool;
  let queue: Bull.Queue;
  let processor: PaymentEventProcessor;
  const createdOrderIds: string[] = [];
  const createdPaymentIntentIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    queue = new Bull('payment-events-test', {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || 'redis_dev_pass_123',
      },
    });

    processor = new PaymentEventProcessor(pool, queue);
  });

  afterAll(async () => {
    // Clean up created data
    for (const id of createdPaymentIntentIds) {
      await pool.query('DELETE FROM payment_state_transitions WHERE payment_id = $1', [id]);
      await pool.query('DELETE FROM payment_intents WHERE id = $1', [id]);
    }
    for (const id of createdOrderIds) {
      await pool.query('DELETE FROM payment_attempts WHERE order_id = $1', [id]);
      await pool.query('DELETE FROM orders WHERE id = $1', [id]);
    }

    await queue.empty();
    await queue.close();
    await pool.end();
  });

  async function createTestOrder(): Promise<string> {
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
      [orderId, tenantId, TEST_USER_ID, TEST_EVENT_ID, orderNumber, 'PENDING', 10000, 10000]
    );

    createdOrderIds.push(orderId);
    return orderId;
  }

  async function createTestPaymentIntent(orderId: string): Promise<string> {
    const paymentIntentId = uuidv4();

    // Use correct column names: amount (not amount_cents), no tenant_id required
    await pool.query(
      `INSERT INTO payment_intents (id, order_id, amount, status)
       VALUES ($1, $2, $3, $4)`,
      [paymentIntentId, orderId, 100.00, 'pending']
    );

    createdPaymentIntentIds.push(paymentIntentId);
    return paymentIntentId;
  }

  async function createTestPaymentAttempt(orderId: string, attemptNumber: number): Promise<void> {
    const tenantResult = await pool.query('SELECT id FROM tenants LIMIT 1');
    const tenantId = tenantResult.rows[0]?.id;

    await pool.query(
      `INSERT INTO payment_attempts (order_id, tenant_id, attempt_number, status, amount_cents, provider)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [orderId, tenantId, attemptNumber, 'FAILED', 10000, 'stripe']
    );
  }

  describe('processPaymentEvent()', () => {
    describe('payment.completed', () => {
      it('should log event and queue fulfillment', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.completed',
          paymentId,
          orderId,
          amount: 10000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
        };

        await processor.processPaymentEvent(event);

        // Verify event was logged
        const transitions = await pool.query(
          'SELECT * FROM payment_state_transitions WHERE payment_id = $1',
          [paymentId]
        );
        expect(transitions.rows.length).toBeGreaterThan(0);
        expect(transitions.rows[0].to_state).toBe('payment.completed');

        // Verify jobs were queued
        const fulfillJobs = await queue.getJobs(['waiting', 'delayed']);
        const hasFulfillJob = fulfillJobs.some(
          job => job.name === 'order.fulfill' && job.data.orderId === orderId
        );
        expect(hasFulfillJob).toBe(true);
      });

      it('should queue email notification', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.completed',
          paymentId,
          orderId,
          amount: 15000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
        };

        await processor.processPaymentEvent(event);

        const emailJobs = await queue.getJobs(['waiting', 'delayed']);
        const hasEmailJob = emailJobs.some(
          job => job.name === 'email.payment_success' && job.data.orderId === orderId
        );
        expect(hasEmailJob).toBe(true);
      });
    });

    describe('payment.failed', () => {
      it('should queue retry when attempt count is below 3', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);
        await createTestPaymentAttempt(orderId, 1);

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.failed',
          paymentId,
          orderId,
          amount: 10000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
        };

        await processor.processPaymentEvent(event);

        const retryJobs = await queue.getJobs(['waiting', 'delayed']);
        const hasRetryJob = retryJobs.some(
          job => job.name === 'payment.retry' && job.data.orderId === orderId
        );
        expect(hasRetryJob).toBe(true);
      });

      it('should not queue retry when attempt count is 3 or more', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);
        await createTestPaymentAttempt(orderId, 3);

        // Clear queue before test
        await queue.empty();

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.failed',
          paymentId,
          orderId,
          amount: 10000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
        };

        await processor.processPaymentEvent(event);

        const retryJobs = await queue.getJobs(['waiting', 'delayed']);
        const hasRetryJob = retryJobs.some(
          job => job.name === 'payment.retry' && job.data.orderId === orderId
        );
        expect(hasRetryJob).toBe(false);
      });

      it('should log failed payment event', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.failed',
          paymentId,
          orderId,
          amount: 10000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
        };

        await processor.processPaymentEvent(event);

        const transitions = await pool.query(
          'SELECT * FROM payment_state_transitions WHERE payment_id = $1',
          [paymentId]
        );
        expect(transitions.rows.length).toBeGreaterThan(0);
        expect(transitions.rows[0].to_state).toBe('payment.failed');
      });
    });

    describe('other event types', () => {
      it('should log payment.created event', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.created',
          paymentId,
          orderId,
          amount: 10000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
        };

        await processor.processPaymentEvent(event);

        const transitions = await pool.query(
          'SELECT * FROM payment_state_transitions WHERE payment_id = $1',
          [paymentId]
        );
        expect(transitions.rows.length).toBeGreaterThan(0);
        expect(transitions.rows[0].to_state).toBe('payment.created');
      });

      it('should log payment.updated event', async () => {
        const orderId = await createTestOrder();
        const paymentId = await createTestPaymentIntent(orderId);

        const event: PaymentEvent = {
          id: uuidv4(),
          type: 'payment.updated',
          paymentId,
          orderId,
          amount: 10000,
          currency: 'USD',
          provider: 'stripe',
          timestamp: new Date(),
          metadata: { update: 'test' },
        };

        await processor.processPaymentEvent(event);

        const transitions = await pool.query(
          'SELECT * FROM payment_state_transitions WHERE payment_id = $1',
          [paymentId]
        );
        expect(transitions.rows.length).toBeGreaterThan(0);
        expect(transitions.rows[0].to_state).toBe('payment.updated');
      });
    });
  });
});
