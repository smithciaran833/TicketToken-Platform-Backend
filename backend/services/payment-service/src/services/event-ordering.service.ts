import { Pool } from 'pg';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface PaymentEvent {
  paymentId: string;
  orderId?: string;
  eventType: string;
  eventTimestamp: Date;
  stripeEventId?: string;
  idempotencyKey?: string;
  payload: any;
}

interface ProcessedEvent {
  sequenceNumber: number;
  processed: boolean;
  error?: string;
}

export class EventOrderingService {
  private pool: Pool;
  private log = logger.child({ component: 'EventOrderingService' });
  private processingLocks: Map<string, Promise<any>> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
    // Start background processor for out-of-order events
    this.startBackgroundProcessor();
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
      this.log.info({ paymentId }, 'Waiting for existing processing to complete');
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
        WHERE payment_id = $1
          AND event_type = $2
          AND idempotency_key = $3
      `, [event.paymentId, event.eventType, idempotencyKey]);

      if (duplicateCheck.rows.length > 0) {
        this.log.info({
          paymentId: event.paymentId,
          eventType: event.eventType,
          idempotencyKey
        }, 'Duplicate event detected, skipping');
        await client.query('COMMIT');
        return {
          sequenceNumber: duplicateCheck.rows[0].sequence_number,
          processed: duplicateCheck.rows[0].processed_at !== null
        };
      }

      // Get next sequence number
      const seqResult = await client.query(
        'SELECT get_next_sequence_number($1) as seq',
        [event.paymentId]
      );
      const sequenceNumber = seqResult.rows[0].seq;

      // Insert event into sequence
      await client.query(`
        INSERT INTO payment_event_sequence (
          payment_id,
          order_id,
          event_type,
          sequence_number,
          event_timestamp,
          stripe_event_id,
          idempotency_key,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
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
      const isInOrder = await this.checkEventOrder(client, event.paymentId, sequenceNumber);

      if (isInOrder) {
        // Process this event and any queued events
        await this.processEventInOrder(client, event);
        await this.processQueuedEvents(client, event.paymentId);
      } else {
        this.log.warn({
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
      this.log.error({
        error,
        event
      }, 'Failed to process payment event');
      throw error;
    } finally {
      client.release();
    }
  }

  private async checkEventOrder(
    client: any,
    paymentId: string,
    sequenceNumber: number
  ): Promise<boolean> {
    // Get the last processed sequence number
    const result = await client.query(`
      SELECT MAX(sequence_number) as last_processed
      FROM payment_event_sequence
      WHERE payment_id = $1 AND processed_at IS NOT NULL
    `, [paymentId]);

    const lastProcessed = result.rows[0].last_processed || 0;
    return sequenceNumber === lastProcessed + 1;
  }

  private async processEventInOrder(client: any, event: PaymentEvent): Promise<void> {
    // Get current payment state
    const paymentResult = await client.query(`
      SELECT status, version FROM payment_intents WHERE id = $1
    `, [event.paymentId]);

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
      this.log.warn({
        paymentId: event.paymentId,
        from: currentStatus,
        to: newStatus,
        event: event.eventType
      }, 'Invalid state transition');

      // Mark event as processed but don't change state
      await client.query(`
        UPDATE payment_event_sequence
        SET processed_at = NOW()
        WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
      `, [event.paymentId, event.eventType, event.idempotencyKey]);

      return;
    }

    // Update payment state with optimistic locking
    const updateResult = await client.query(`
      UPDATE payment_intents
      SET status = $1,
          version = version + 1,
          last_event_timestamp = $2,
          updated_at = NOW()
      WHERE id = $3 AND version = $4
    `, [newStatus, event.eventTimestamp, event.paymentId, currentVersion]);

    if (updateResult.rowCount === 0) {
      throw new Error('Concurrent update detected');
    }

    // Record state transition
    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id,
        order_id,
        from_state,
        to_state,
        metadata
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
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
      WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
    `, [event.paymentId, event.eventType, event.idempotencyKey]);

    // Write to outbox for downstream services
    await client.query(`
      INSERT INTO outbox (
        aggregate_id,
        aggregate_type,
        event_type,
        payload
      ) VALUES ($1, $2, $3, $4)
    `, [
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

    this.log.info({
      paymentId: event.paymentId,
      eventType: event.eventType,
      fromState: currentStatus,
      toState: newStatus
    }, 'Payment event processed in order');
  }

  private async processQueuedEvents(client: any, paymentId: string): Promise<void> {
    // Process any events that were waiting for this one
    const queuedEvents = await client.query(`
      SELECT * FROM payment_event_sequence
      WHERE payment_id = $1
        AND processed_at IS NULL
      ORDER BY sequence_number ASC
      LIMIT 10
    `, [paymentId]);

    for (const queuedEvent of queuedEvents.rows) {
      const isInOrder = await this.checkEventOrder(client, paymentId, queuedEvent.sequence_number);

      if (isInOrder) {
        await this.processEventInOrder(client, {
          paymentId: queuedEvent.payment_id,
          orderId: queuedEvent.order_id,
          eventType: queuedEvent.event_type,
          eventTimestamp: queuedEvent.event_timestamp,
          stripeEventId: queuedEvent.stripe_event_id,
          idempotencyKey: queuedEvent.idempotency_key,
          payload: queuedEvent.payload
        });
      } else {
        // Stop processing as we hit another gap
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

  /**
   * Background processor for stuck events
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processStuckEvents();
      } catch (error) {
        this.log.error({ error }, 'Background processor error');
      }
    }, 30000); // Run every 30 seconds
  }

  private async processStuckEvents(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find payments with unprocessed events older than 5 minutes
      const stuckPayments = await client.query(`
        SELECT DISTINCT payment_id
        FROM payment_event_sequence
        WHERE processed_at IS NULL
          AND created_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      for (const row of stuckPayments.rows) {
        await this.reprocessPaymentEvents(row.payment_id);
      }

    } finally {
      client.release();
    }
  }

  private async reprocessPaymentEvents(paymentId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get all unprocessed events in order
      const events = await client.query(`
        SELECT * FROM payment_event_sequence
        WHERE payment_id = $1
          AND processed_at IS NULL
        ORDER BY sequence_number ASC
      `, [paymentId]);

      this.log.info({ paymentId, eventCount: events.rows.length }, `Reprocessing stuck events`);

      for (const event of events.rows) {
        const isInOrder = await this.checkEventOrder(client, paymentId, event.sequence_number);

        if (isInOrder) {
          await this.processEventInOrder(client, {
            paymentId: event.payment_id,
            orderId: event.order_id,
            eventType: event.event_type,
            eventTimestamp: event.event_timestamp,
            stripeEventId: event.stripe_event_id,
            idempotencyKey: event.idempotency_key,
            payload: event.payload
          });
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error({ paymentId, error }, 'Failed to reprocess events');
    } finally {
      client.release();
    }
  }

  /**
   * Handle idempotent payment operations
   */
  async executeIdempotent<T>(
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
        SELECT response, status_code
        FROM payment_idempotency
        WHERE idempotency_key = $1
      `, [idempotencyKey]);

      if (existing.rows.length > 0) {
        const row = existing.rows[0];

        // Verify request hasn't changed
        const existingHash = await client.query(`
          SELECT request_hash FROM payment_idempotency WHERE idempotency_key = $1
        `, [idempotencyKey]);

        if (existingHash.rows[0].request_hash !== requestHash) {
          throw new Error('Idempotency key reused with different request');
        }

        await client.query('COMMIT');

        this.log.info({ idempotencyKey, operation }, 'Returning idempotent response');
        return row.response as T;
      }

      // Execute the operation
      const result = await handler();

      // Store idempotent response
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await client.query(`
        INSERT INTO payment_idempotency (
          idempotency_key,
          operation,
          request_hash,
          response,
          status_code,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        idempotencyKey,
        operation,
        requestHash,
        JSON.stringify(result),
        200,
        expiresAt
      ]);

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
