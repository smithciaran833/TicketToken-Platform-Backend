import { Pool, PoolClient } from 'pg';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const log = logger.child({ component: 'EventOrderingService' });

/**
 * SECURITY: Explicit field list for event sequence queries.
 */
const EVENT_SEQUENCE_FIELDS = 'id, tenant_id, payment_id, order_id, event_type, sequence_number, event_timestamp, stripe_event_id, idempotency_key, payload, processed_at, created_at';

export interface PaymentEvent {
  tenantId: string;
  paymentId: string;
  orderId?: string;
  eventType: string;
  eventTimestamp: Date;
  stripeEventId?: string;
  idempotencyKey?: string;
  payload: any;
}

export interface ProcessedEvent {
  sequenceNumber: number;
  processed: boolean;
  error?: string;
}

export class EventOrderingService {
  private pool: Pool;
  private processingLocks: Map<string, Promise<any>> = new Map();
  private backgroundInterval: NodeJS.Timeout | null = null;

  constructor(pool: Pool, startBackground: boolean = true) {
    this.pool = pool;
    if (startBackground) {
      this.startBackgroundProcessor();
    }
  }

  /**
   * Stop background processor (for testing)
   */
  stopBackgroundProcessor(): void {
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }
  }

  /**
   * Process a payment event with ordering guarantees
   */
  async processPaymentEvent(event: PaymentEvent): Promise<ProcessedEvent> {
    const { paymentId, eventType, idempotencyKey } = event;

    // Create idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || this.generateIdempotencyKey(event);

    // Ensure we don't process the same payment concurrently
    const lockKey = `payment:${paymentId}`;
    if (this.processingLocks.has(lockKey)) {
      log.info({ paymentId }, 'Waiting for existing processing to complete');
      await this.processingLocks.get(lockKey);
    }

    const processingPromise = this.doProcessEvent(event, finalIdempotencyKey);
    this.processingLocks.set(lockKey, processingPromise);

    try {
      const result = await processingPromise;
      return result;
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }

  private async doProcessEvent(
    event: PaymentEvent,
    idempotencyKey: string
  ): Promise<ProcessedEvent> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for duplicate event
      const duplicateCheck = await client.query(`
        SELECT sequence_number, processed_at
        FROM payment_event_sequence
        WHERE tenant_id = $1
          AND payment_id = $2
          AND event_type = $3
          AND idempotency_key = $4
      `, [event.tenantId, event.paymentId, event.eventType, idempotencyKey]);

      if (duplicateCheck.rows.length > 0) {
        log.info({
          paymentId: event.paymentId,
          eventType: event.eventType,
          idempotencyKey
        }, 'Duplicate event detected, skipping');
        await client.query('COMMIT');
        return {
          sequenceNumber: parseInt(duplicateCheck.rows[0].sequence_number),
          processed: duplicateCheck.rows[0].processed_at !== null
        };
      }

      // Get next sequence number
      const seqResult = await client.query(
        'SELECT get_next_sequence_number($1) as seq',
        [event.paymentId]
      );
      const sequenceNumber = parseInt(seqResult.rows[0].seq);

      // Insert event into sequence
      await client.query(`
        INSERT INTO payment_event_sequence (
          tenant_id,
          payment_id,
          order_id,
          event_type,
          sequence_number,
          event_timestamp,
          stripe_event_id,
          idempotency_key,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        event.tenantId,
        event.paymentId,
        event.orderId,
        event.eventType,
        sequenceNumber,
        event.eventTimestamp,
        event.stripeEventId,
        idempotencyKey,
        JSON.stringify(event.payload)
      ]);

      // Check if this is the next expected event
      const isInOrder = await this.checkEventOrder(client, event.tenantId, event.paymentId, sequenceNumber);

      if (isInOrder) {
        // Process this event and any queued events
        await this.processEventInOrder(client, event, idempotencyKey);
        await this.processQueuedEvents(client, event.tenantId, event.paymentId);
      } else {
        log.warn({
          paymentId: event.paymentId,
          sequenceNumber,
          eventType: event.eventType
        }, 'Event received out of order, queuing for later');
      }

      await client.query('COMMIT');

      return {
        sequenceNumber,
        processed: isInOrder
      };

    } catch (error) {
      await client.query('ROLLBACK');
      log.error({ error, event }, 'Failed to process payment event');
      throw error;
    } finally {
      client.release();
    }
  }

  private async checkEventOrder(
    client: PoolClient,
    tenantId: string,
    paymentId: string,
    sequenceNumber: number
  ): Promise<boolean> {
    const result = await client.query(`
      SELECT MAX(sequence_number) as last_processed
      FROM payment_event_sequence
      WHERE tenant_id = $1 AND payment_id = $2 AND processed_at IS NOT NULL
    `, [tenantId, paymentId]);

    const lastProcessed = parseInt(result.rows[0].last_processed) || 0;
    return sequenceNumber === lastProcessed + 1;
  }

  private async processEventInOrder(
    client: PoolClient,
    event: PaymentEvent,
    idempotencyKey: string
  ): Promise<void> {
    // Get current payment state
    const paymentResult = await client.query(`
      SELECT status, version FROM payment_intents
      WHERE id = $1 AND tenant_id = $2
    `, [event.paymentId, event.tenantId]);

    if (paymentResult.rows.length === 0) {
      throw new Error(`Payment not found: ${event.paymentId}`);
    }

    const currentStatus = paymentResult.rows[0].status;
    const currentVersion = paymentResult.rows[0].version;

    // Determine new state based on event
    const newStatus = this.getNewStatus(event.eventType, currentStatus);

    // Validate state transition
    const isValid = await client.query(
      'SELECT validate_payment_state_transition($1, $2, $3) as valid',
      [currentStatus, newStatus, event.eventType]
    );

    if (!isValid.rows[0].valid) {
      log.warn({
        paymentId: event.paymentId,
        from: currentStatus,
        to: newStatus,
        event: event.eventType
      }, 'Invalid state transition');

      // Mark event as processed but don't change state
      await client.query(`
        UPDATE payment_event_sequence
        SET processed_at = NOW()
        WHERE tenant_id = $1 AND payment_id = $2 AND event_type = $3 AND idempotency_key = $4
      `, [event.tenantId, event.paymentId, event.eventType, idempotencyKey]);

      return;
    }

    // Update payment state with optimistic locking
    const updateResult = await client.query(`
      UPDATE payment_intents
      SET status = $1,
          version = version + 1,
          last_event_timestamp = $2,
          updated_at = NOW()
      WHERE id = $3 AND tenant_id = $4 AND version = $5
    `, [newStatus, event.eventTimestamp, event.paymentId, event.tenantId, currentVersion]);

    if (updateResult.rowCount === 0) {
      throw new Error('Concurrent update detected');
    }

    // Record state transition
    await client.query(`
      INSERT INTO payment_state_transitions (
        tenant_id,
        payment_id,
        order_id,
        from_state,
        to_state,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      event.tenantId,
      event.paymentId,
      event.orderId,
      currentStatus,
      newStatus,
      JSON.stringify({
        event_type: event.eventType,
        event_timestamp: event.eventTimestamp,
        stripe_event_id: event.stripeEventId
      })
    ]);

    // Mark event as processed
    await client.query(`
      UPDATE payment_event_sequence
      SET processed_at = NOW()
      WHERE tenant_id = $1 AND payment_id = $2 AND event_type = $3 AND idempotency_key = $4
    `, [event.tenantId, event.paymentId, event.eventType, idempotencyKey]);

    // Write to outbox for downstream services
    await client.query(`
      INSERT INTO outbox (
        tenant_id,
        aggregate_id,
        aggregate_type,
        event_type,
        payload
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      event.tenantId,
      event.orderId || event.paymentId,
      'payment',
      event.eventType,
      JSON.stringify({
        paymentId: event.paymentId,
        orderId: event.orderId,
        status: newStatus,
        previousStatus: currentStatus,
        ...event.payload
      })
    ]);

    log.info({
      paymentId: event.paymentId,
      eventType: event.eventType,
      fromState: currentStatus,
      toState: newStatus
    }, 'Payment event processed in order');
  }

  private async processQueuedEvents(client: PoolClient, tenantId: string, paymentId: string): Promise<void> {
    const queuedEvents = await client.query(`
      SELECT ${EVENT_SEQUENCE_FIELDS} FROM payment_event_sequence
      WHERE tenant_id = $1 AND payment_id = $2 AND processed_at IS NULL
      ORDER BY sequence_number ASC
      LIMIT 10
    `, [tenantId, paymentId]);

    for (const queuedEvent of queuedEvents.rows) {
      const isInOrder = await this.checkEventOrder(client, tenantId, paymentId, queuedEvent.sequence_number);

      if (isInOrder) {
        await this.processEventInOrder(client, {
          tenantId: queuedEvent.tenant_id,
          paymentId: queuedEvent.payment_id,
          orderId: queuedEvent.order_id,
          eventType: queuedEvent.event_type,
          eventTimestamp: queuedEvent.event_timestamp,
          stripeEventId: queuedEvent.stripe_event_id,
          idempotencyKey: queuedEvent.idempotency_key,
          payload: queuedEvent.payload
        }, queuedEvent.idempotency_key);
      } else {
        break;
      }
    }
  }

  private getNewStatus(eventType: string, currentStatus: string): string {
    const statusMap: Record<string, string> = {
      'payment.processing': 'PROCESSING',
      'payment.succeeded': 'PAID',
      'payment_intent.succeeded': 'PAID',
      'payment.failed': 'PAYMENT_FAILED',
      'payment_intent.payment_failed': 'PAYMENT_FAILED',
      'payment.cancelled': 'CANCELLED',
      'refund.initiated': 'REFUNDING',
      'refund.partial': 'PARTIALLY_REFUNDED',
      'refund.completed': 'REFUNDED',
      'refund.failed': currentStatus === 'REFUNDING' ? 'PAID' : currentStatus
    };

    return statusMap[eventType] || currentStatus;
  }

  private generateIdempotencyKey(event: PaymentEvent): string {
    const data = `${event.paymentId}-${event.eventType}-${event.eventTimestamp.getTime()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private startBackgroundProcessor(): void {
    this.backgroundInterval = setInterval(async () => {
      try {
        await this.processStuckEvents();
      } catch (error) {
        log.error({ error }, 'Background processor error');
      }
    }, 30000);
  }

  async processStuckEvents(): Promise<number> {
    const client = await this.pool.connect();
    let processedCount = 0;

    try {
      const stuckPayments = await client.query(`
        SELECT DISTINCT tenant_id, payment_id
        FROM payment_event_sequence
        WHERE processed_at IS NULL
          AND created_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      for (const row of stuckPayments.rows) {
        const count = await this.reprocessPaymentEvents(row.tenant_id, row.payment_id);
        processedCount += count;
      }

      return processedCount;
    } finally {
      client.release();
    }
  }

  private async reprocessPaymentEvents(tenantId: string, paymentId: string): Promise<number> {
    const client = await this.pool.connect();
    let processedCount = 0;

    try {
      await client.query('BEGIN');

      const events = await client.query(`
        SELECT ${EVENT_SEQUENCE_FIELDS} FROM payment_event_sequence
        WHERE tenant_id = $1 AND payment_id = $2 AND processed_at IS NULL
        ORDER BY sequence_number ASC
      `, [tenantId, paymentId]);

      log.info({ tenantId, paymentId, eventCount: events.rows.length }, 'Reprocessing stuck events');

      for (const event of events.rows) {
        const isInOrder = await this.checkEventOrder(client, tenantId, paymentId, event.sequence_number);

        if (isInOrder) {
          await this.processEventInOrder(client, {
            tenantId: event.tenant_id,
            paymentId: event.payment_id,
            orderId: event.order_id,
            eventType: event.event_type,
            eventTimestamp: event.event_timestamp,
            stripeEventId: event.stripe_event_id,
            idempotencyKey: event.idempotency_key,
            payload: event.payload
          }, event.idempotency_key);
          processedCount++;
        }
      }

      await client.query('COMMIT');
      return processedCount;

    } catch (error) {
      await client.query('ROLLBACK');
      log.error({ tenantId, paymentId, error }, 'Failed to reprocess events');
      return 0;
    } finally {
      client.release();
    }
  }

  /**
   * Handle idempotent payment operations
   */
  async executeIdempotent<T>(
    tenantId: string,
    idempotencyKey: string,
    operation: string,
    request: any,
    handler: () => Promise<T>
  ): Promise<T> {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing idempotent response
      const existing = await client.query(`
        SELECT response, status_code, request_hash
        FROM payment_idempotency
        WHERE idempotency_key = $1 AND tenant_id = $2
      `, [idempotencyKey, tenantId]);

      if (existing.rows.length > 0) {
        const row = existing.rows[0];

        if (row.request_hash !== requestHash) {
          throw new Error('Idempotency key reused with different request');
        }

        await client.query('COMMIT');
        log.info({ idempotencyKey, operation }, 'Returning idempotent response');
        return row.response as T;
      }

      // Execute the operation
      const result = await handler();

      // Store idempotent response
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await client.query(`
        INSERT INTO payment_idempotency (
          tenant_id,
          idempotency_key,
          operation,
          request_hash,
          response,
          status_code,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [tenantId, idempotencyKey, operation, requestHash, JSON.stringify(result), 200, expiresAt]);

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get event history for a payment
   */
  async getEventHistory(tenantId: string, paymentId: string): Promise<any[]> {
    const result = await this.pool.query(`
      SELECT ${EVENT_SEQUENCE_FIELDS} FROM payment_event_sequence
      WHERE tenant_id = $1 AND payment_id = $2
      ORDER BY sequence_number ASC
    `, [tenantId, paymentId]);

    return result.rows;
  }

  /**
   * Get unprocessed event count
   */
  async getUnprocessedCount(tenantId: string): Promise<number> {
    const result = await this.pool.query(`
      SELECT COUNT(*) as count FROM payment_event_sequence
      WHERE tenant_id = $1 AND processed_at IS NULL
    `, [tenantId]);

    return parseInt(result.rows[0].count);
  }
}
