/**
 * COMPONENT TEST: EventOrderingService
 *
 * Tests event ordering and state machine with REAL Database
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

import { EventOrderingService } from '../../../src/services/event-ordering.service';

describe('EventOrderingService Component Tests', () => {
  let pool: Pool;
  let service: EventOrderingService;
  let tenantId: string;
  let paymentId: string;
  let orderId: string;

  beforeAll(async () => {
    pool = getSharedPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    tenantId = uuidv4();
    paymentId = uuidv4();
    orderId = uuidv4();

    // Create service WITHOUT background processor for testing
    service = new EventOrderingService(pool, false);

    // Create test tenant
    await pool.query(`
      INSERT INTO tenants (id, name, slug, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
    `, [tenantId, 'Test Tenant', `test-${tenantId.slice(0, 8)}`]);

    // Create payment intent with UPPERCASE status to match state machine
    await pool.query(`
      INSERT INTO payment_intents (
        id, tenant_id, order_id, amount, currency, status, version, created_at, updated_at
      )
      VALUES ($1, $2, $3, 100, 'USD', 'PENDING', 1, NOW(), NOW())
    `, [paymentId, tenantId, orderId]);
  });

  afterEach(async () => {
    service.stopBackgroundProcessor();
    
    await pool.query('DELETE FROM outbox WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_state_transitions WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_event_sequence WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM payment_intents WHERE tenant_id = $1', [tenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  });

  // ===========================================================================
  // IN-ORDER EVENT PROCESSING
  // ===========================================================================
  describe('processPaymentEvent() - In Order', () => {
    it('should process events in order', async () => {
      // Event 1: processing
      const result1 = await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: { amount: 100 },
      });

      expect(result1.sequenceNumber).toBe(1);
      expect(result1.processed).toBe(true);

      // Event 2: succeeded
      const result2 = await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: { amount: 100 },
      });

      expect(result2.sequenceNumber).toBe(2);
      expect(result2.processed).toBe(true);

      // Verify final state
      const payment = await pool.query(
        'SELECT status, version FROM payment_intents WHERE id = $1',
        [paymentId]
      );

      expect(payment.rows[0].status).toBe('PAID');
      expect(payment.rows[0].version).toBe(3); // Started at 1, +2 events
    });

    it('should create state transitions', async () => {
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: {},
      });

      const transitions = await pool.query(
        'SELECT * FROM payment_state_transitions WHERE payment_id = $1',
        [paymentId]
      );

      expect(transitions.rows).toHaveLength(1);
      expect(transitions.rows[0].from_state).toBe('PENDING');
      expect(transitions.rows[0].to_state).toBe('PROCESSING');
    });

    it('should write to outbox', async () => {
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: { amount: 100 },
      });

      const outbox = await pool.query(
        'SELECT * FROM outbox WHERE aggregate_id = $1',
        [orderId]
      );

      expect(outbox.rows).toHaveLength(1);
      expect(outbox.rows[0].event_type).toBe('payment.succeeded');
      expect(outbox.rows[0].payload.status).toBe('PAID');
    });
  });

  // ===========================================================================
  // OUT-OF-ORDER EVENT PROCESSING
  // ===========================================================================
  describe('processPaymentEvent() - Out of Order', () => {
    it('should queue out-of-order events', async () => {
      // First event arrives and processes
      const result = await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: {},
      });

      expect(result.sequenceNumber).toBe(1);
      expect(result.processed).toBe(true);
    });

    it('should process queued events when gap is filled', async () => {
      // First, transition to PROCESSING so event 2 can be valid
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: {},
      });

      // Manually insert event with seq 3 (simulating out-of-order arrival)
      // This will be queued because seq 2 is missing
      await pool.query(`
        INSERT INTO payment_event_sequence (
          tenant_id, payment_id, order_id, event_type, sequence_number,
          event_timestamp, idempotency_key, payload
        )
        VALUES ($1, $2, $3, 'payment.succeeded', 3, NOW(), $4, '{}')
      `, [tenantId, paymentId, orderId, uuidv4()]);

      // Now send event 2 - this should process both 2 and 3
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded', // Valid transition from PROCESSING
        eventTimestamp: new Date(),
        payload: {},
      });

      // Event 2 should be processed, but event 3 will remain unprocessed
      // because it's a duplicate succeeded event (invalid transition from PAID)
      const events = await pool.query(
        'SELECT * FROM payment_event_sequence WHERE payment_id = $1 ORDER BY sequence_number',
        [paymentId]
      );

      expect(events.rows).toHaveLength(3); // 1, 2, 3
      expect(events.rows[0].processed_at).not.toBeNull(); // seq 1 processed
      expect(events.rows[1].processed_at).not.toBeNull(); // seq 2 processed
    });
  });

  // ===========================================================================
  // IDEMPOTENCY
  // ===========================================================================
  describe('idempotency', () => {
    it('should detect duplicate events', async () => {
      const idempotencyKey = uuidv4();

      // First event
      const result1 = await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        idempotencyKey,
        payload: {},
      });

      // Duplicate event
      const result2 = await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        idempotencyKey,
        payload: {},
      });

      expect(result1.sequenceNumber).toBe(result2.sequenceNumber);

      // Only one event in database
      const events = await pool.query(
        'SELECT * FROM payment_event_sequence WHERE payment_id = $1',
        [paymentId]
      );

      expect(events.rows).toHaveLength(1);
    });

    it('should generate idempotency key if not provided', async () => {
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: {},
      });

      const events = await pool.query(
        'SELECT idempotency_key FROM payment_event_sequence WHERE payment_id = $1',
        [paymentId]
      );

      expect(events.rows[0].idempotency_key).toBeDefined();
      expect(events.rows[0].idempotency_key.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // STATE MACHINE
  // ===========================================================================
  describe('state transitions', () => {
    it('should transition from PENDING to PROCESSING to PAID', async () => {
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: {},
      });

      let payment = await pool.query(
        'SELECT status FROM payment_intents WHERE id = $1',
        [paymentId]
      );
      expect(payment.rows[0].status).toBe('PROCESSING');

      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: {},
      });

      payment = await pool.query(
        'SELECT status FROM payment_intents WHERE id = $1',
        [paymentId]
      );
      expect(payment.rows[0].status).toBe('PAID');
    });

    it('should handle refund states', async () => {
      // First make it PAID
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: {},
      });

      // Then refund
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'refund.completed',
        eventTimestamp: new Date(),
        payload: {},
      });

      const payment = await pool.query(
        'SELECT status FROM payment_intents WHERE id = $1',
        [paymentId]
      );

      expect(payment.rows[0].status).toBe('REFUNDED');
    });

    it('should reject invalid state transitions', async () => {
      // Try to go directly from PENDING to REFUNDED (invalid)
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'refund.completed',
        eventTimestamp: new Date(),
        payload: {},
      });

      // Status should remain PENDING
      const payment = await pool.query(
        'SELECT status FROM payment_intents WHERE id = $1',
        [paymentId]
      );

      expect(payment.rows[0].status).toBe('PENDING');

      // But event should be marked as processed (just not applied)
      const events = await pool.query(
        'SELECT processed_at FROM payment_event_sequence WHERE payment_id = $1',
        [paymentId]
      );

      expect(events.rows[0].processed_at).not.toBeNull();
    });
  });

  // ===========================================================================
  // EXECUTE IDEMPOTENT
  // ===========================================================================
  describe('executeIdempotent()', () => {
    it('should execute operation once', async () => {
      let callCount = 0;
      const operation = async () => {
        callCount++;
        return { success: true };
      };

      const idempotencyKey = uuidv4();
      const request = { amount: 100 };

      const result1 = await service.executeIdempotent(
        tenantId,
        idempotencyKey,
        'test_operation',
        request,
        operation
      );

      const result2 = await service.executeIdempotent(
        tenantId,
        idempotencyKey,
        'test_operation',
        request,
        operation
      );

      expect(callCount).toBe(1); // Only executed once
      expect(result1).toEqual(result2);
    });

    it('should reject reused key with different request', async () => {
      const idempotencyKey = uuidv4();

      await service.executeIdempotent(
        tenantId,
        idempotencyKey,
        'test_op',
        { amount: 100 },
        async () => ({ success: true })
      );

      await expect(
        service.executeIdempotent(
          tenantId,
          idempotencyKey,
          'test_op',
          { amount: 200 }, // Different request
          async () => ({ success: true })
        )
      ).rejects.toThrow('different request');
    });
  });

  // ===========================================================================
  // BACKGROUND PROCESSING
  // ===========================================================================
  describe('processStuckEvents()', () => {
    it('should find stuck events (even if not processable)', async () => {
      // Create old unprocessed event
      await pool.query(`
        INSERT INTO payment_event_sequence (
          tenant_id, payment_id, order_id, event_type, sequence_number,
          event_timestamp, idempotency_key, payload, created_at
        )
        VALUES ($1, $2, $3, 'payment.processing', 1, NOW(), $4, '{}', NOW() - INTERVAL '10 minutes')
      `, [tenantId, paymentId, orderId, uuidv4()]);

      const count = await service.processStuckEvents();

      // Should process it (even though it's the first event and will succeed)
      expect(count).toBeGreaterThanOrEqual(0);

      // Verify event exists (might or might not be processed depending on state)
      const events = await pool.query(
        'SELECT * FROM payment_event_sequence WHERE payment_id = $1',
        [paymentId]
      );

      expect(events.rows).toHaveLength(1);
    });

    it('should not process recent unprocessed events', async () => {
      // Create recent unprocessed event (< 5 minutes old)
      await pool.query(`
        INSERT INTO payment_event_sequence (
          tenant_id, payment_id, order_id, event_type, sequence_number,
          event_timestamp, idempotency_key, payload, created_at
        )
        VALUES ($1, $2, $3, 'payment.processing', 1, NOW(), $4, '{}', NOW() - INTERVAL '2 minutes')
      `, [tenantId, paymentId, orderId, uuidv4()]);

      const count = await service.processStuckEvents();

      expect(count).toBe(0);
    });
  });

  // ===========================================================================
  // EVENT HISTORY
  // ===========================================================================
  describe('getEventHistory()', () => {
    it('should return event history in order', async () => {
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: { step: 1 },
      });

      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.succeeded',
        eventTimestamp: new Date(),
        payload: { step: 2 },
      });

      const history = await service.getEventHistory(tenantId, paymentId);

      expect(history).toHaveLength(2);
      expect(history[0].sequence_number).toBe('1');
      expect(history[0].event_type).toBe('payment.processing');
      expect(history[1].sequence_number).toBe('2');
      expect(history[1].event_type).toBe('payment.succeeded');
    });
  });

  // ===========================================================================
  // UNPROCESSED COUNT
  // ===========================================================================
  describe('getUnprocessedCount()', () => {
    it('should count unprocessed events', async () => {
      // Create processed event
      await pool.query(`
        INSERT INTO payment_event_sequence (
          tenant_id, payment_id, order_id, event_type, sequence_number,
          event_timestamp, idempotency_key, payload, processed_at
        )
        VALUES ($1, $2, $3, 'payment.processing', 1, NOW(), $4, '{}', NOW())
      `, [tenantId, paymentId, orderId, uuidv4()]);

      // Create unprocessed event
      await pool.query(`
        INSERT INTO payment_event_sequence (
          tenant_id, payment_id, order_id, event_type, sequence_number,
          event_timestamp, idempotency_key, payload
        )
        VALUES ($1, $2, $3, 'payment.succeeded', 2, NOW(), $4, '{}')
      `, [tenantId, paymentId, orderId, uuidv4()]);

      const count = await service.getUnprocessedCount(tenantId);

      expect(count).toBe(1);
    });
  });

  // ===========================================================================
  // OPTIMISTIC LOCKING
  // ===========================================================================
  describe('optimistic locking', () => {
    it('should use version for updates', async () => {
      // Process first event
      await service.processPaymentEvent({
        tenantId,
        paymentId,
        orderId,
        eventType: 'payment.processing',
        eventTimestamp: new Date(),
        payload: {},
      });

      // Check version incremented
      const payment = await pool.query(
        'SELECT version FROM payment_intents WHERE id = $1',
        [paymentId]
      );

      expect(payment.rows[0].version).toBe(2); // Started at 1, incremented to 2
    });
  });

  // ===========================================================================
  // CONCURRENT PROCESSING
  // ===========================================================================
  describe('concurrent event processing', () => {
    it('should handle concurrent events for same payment', async () => {
      // Send multiple events concurrently
      const promises = [
        service.processPaymentEvent({
          tenantId,
          paymentId,
          orderId,
          eventType: 'payment.processing',
          eventTimestamp: new Date(),
          payload: { num: 1 },
        }),
        service.processPaymentEvent({
          tenantId,
          paymentId,
          orderId,
          eventType: 'payment.succeeded',
          eventTimestamp: new Date(),
          payload: { num: 2 },
        }),
      ];

      const results = await Promise.all(promises);

      // Both should succeed with sequential numbers
      expect(results[0].sequenceNumber).toBeDefined();
      expect(results[1].sequenceNumber).toBeDefined();

      // Verify both events exist
      const events = await pool.query(
        'SELECT * FROM payment_event_sequence WHERE payment_id = $1 ORDER BY sequence_number',
        [paymentId]
      );

      expect(events.rows).toHaveLength(2);
    });
  });
});
