import { Pool } from 'pg';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { withSystemContextPool } from './system-job-utils';

const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 1000;

/**
 * SECURITY: Explicit field list for outbox queries.
 */
const OUTBOX_FIELDS = 'id, tenant_id, event_type, aggregate_type, aggregate_id, payload, correlation_id, destination_url, attempts, last_attempt_at, processed_at, created_at';

export class OutboxProcessor {
  private pool: Pool;
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private log = logger.child({ component: 'OutboxProcessor' });

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL ||
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    });
  }

  async start() {
    this.log.info('Starting outbox processor...');
    this.processingInterval = setInterval(() => {
      this.processOutboxEvents();
    }, 5000);

    this.processOutboxEvents();
  }

  async stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.log.info('Outbox processor stopped');
  }

  private createSignature(payload: any, timestamp: string, nonce: string): string {
    const signaturePayload = `${timestamp}.${nonce}.${JSON.stringify(payload)}`;
    return crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signaturePayload)
      .digest('hex');
  }

  private calculateRetryDelay(attempts: number): number {
    const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempts);
    const jitter = Math.random() * 0.3 * baseDelay;
    return Math.min(baseDelay + jitter, 60000);
  }

  private async processOutboxEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      await withSystemContextPool(this.pool, async (client) => {
        // SECURITY: Use explicit field list instead of SELECT *
        const result = await client.query(`
          SELECT ${OUTBOX_FIELDS} FROM outbox
          WHERE processed_at IS NULL
            AND attempts < $1
            AND (
              last_attempt_at IS NULL
              OR last_attempt_at < NOW() - INTERVAL '1 second' * $2
            )
          ORDER BY created_at ASC
          LIMIT 10
          FOR UPDATE SKIP LOCKED
        `, [MAX_RETRY_ATTEMPTS, this.calculateRetryDelay(0) / 1000]);

        for (const event of result.rows) {
          await this.processEvent(client, event);
        }

        if (result.rows.length > 0) {
          this.log.info({ count: result.rows.length }, 'Processed outbox events');
        }
      });

    } catch (error) {
      this.log.error({ error }, 'Error processing outbox events');
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(client: any, event: any) {
    const retryDelay = this.calculateRetryDelay(event.attempts || 0);

    try {
      if (event.last_attempt_at) {
        const timeSinceLastAttempt = Date.now() - new Date(event.last_attempt_at).getTime();
        if (timeSinceLastAttempt < retryDelay) {
          return;
        }
      }

      this.log.info({
        eventId: event.id,
        aggregateId: event.aggregate_id,
        attempts: event.attempts,
        eventType: event.event_type
      }, 'Processing outbox event');

      let success = false;

      switch (event.event_type) {
        case 'order.paid':
          success = await this.handleOrderPaid(event);
          break;
        case 'order.payment_failed':
          success = await this.handlePaymentFailed(event);
          break;
        case 'tickets.create':
          success = await this.handleTicketCreation(event);
          break;
        default:
          this.log.warn({ eventType: event.event_type }, 'Unknown event type');
          success = true;
      }

      if (success) {
        await client.query(`
          UPDATE outbox
          SET processed_at = NOW()
          WHERE id = $1
        `, [event.id]);

        this.log.info({ eventId: event.id }, 'Successfully processed event');
      } else {
        await client.query(`
          UPDATE outbox
          SET attempts = attempts + 1,
              last_attempt_at = NOW(),
              last_error = 'Processing failed'
          WHERE id = $1
        `, [event.id]);

        this.log.warn({ eventId: event.id }, 'Failed to process event, will retry');
      }

    } catch (error: any) {
      this.log.error({ eventId: event.id, error }, 'Error processing event');

      await client.query(`
        UPDATE outbox
        SET attempts = attempts + 1,
            last_attempt_at = NOW(),
            last_error = $2
        WHERE id = $1
      `, [event.id, error.message || 'Unknown error']);

      if ((event.attempts || 0) + 1 >= MAX_RETRY_ATTEMPTS) {
        await this.moveToDeadLetterQueue(client, event, error.message);
      }
    }
  }

  private async handleOrderPaid(event: any): Promise<boolean> {
    const payload = event.payload;
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    try {
      const requestBody = {
        orderId: payload.orderId,
        paymentId: payload.paymentId,
        userId: payload.userId,
        eventId: payload.eventId,
        amount: payload.amount,
        ticketQuantity: payload.ticketQuantity || payload.quantity,
        idempotencyKey: `payment-${payload.orderId}-${payload.paymentId}`,
        timestamp: new Date().toISOString()
      };

      const signature = this.createSignature(requestBody, timestamp, nonce);

      const response = await axios.post(
        'http://ticket:3004/api/v1/webhooks/payment-confirmed',
        requestBody,
        {
          headers: {
            'x-internal-signature': signature,
            'x-webhook-timestamp': timestamp,
            'x-webhook-nonce': nonce,
            'x-idempotency-key': requestBody.idempotencyKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.status >= 200 && response.status < 300;

    } catch (error: any) {
      this.log.error({
        orderId: payload.orderId,
        error: error.message
      }, 'Failed to notify ticket service of payment');

      return false;
    }
  }

  private async handlePaymentFailed(event: any): Promise<boolean> {
    const payload = event.payload;
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    try {
      const requestBody = {
        orderId: payload.orderId,
        reason: payload.reason || 'Payment failed',
        timestamp: new Date().toISOString()
      };

      const signature = this.createSignature(requestBody, timestamp, nonce);

      const response = await axios.post(
        'http://ticket:3004/api/v1/webhooks/payment-failed',
        requestBody,
        {
          headers: {
            'x-internal-signature': signature,
            'x-webhook-timestamp': timestamp,
            'x-webhook-nonce': nonce,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.status >= 200 && response.status < 300;

    } catch (error: any) {
      this.log.error({
        orderId: payload.orderId,
        error: error.message
      }, 'Failed to notify ticket service of payment failure');
      return false;
    }
  }

  private async handleTicketCreation(event: any): Promise<boolean> {
    const payload = event.payload;

    try {
      const queueService = require('../services/queueService').queueService;
      await queueService.publish('ticket.mint', payload);

      this.log.info({
        orderId: payload.orderId,
        quantity: payload.tickets?.length || 0
      }, 'Queued tickets for minting');

      return true;

    } catch (error: any) {
      this.log.error({
        orderId: payload.orderId,
        error: error.message
      }, 'Failed to queue tickets for minting');
      return false;
    }
  }

  private async moveToDeadLetterQueue(client: any, event: any, error: string) {
    try {
      await client.query(`
        INSERT INTO outbox_dlq (
          original_id,
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          attempts,
          last_error,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.id,
        event.aggregate_id,
        event.aggregate_type,
        event.event_type,
        event.payload,
        event.attempts,
        error,
        event.created_at
      ]);

      await client.query(`
        UPDATE outbox
        SET processed_at = NOW(),
            last_error = 'Moved to DLQ after max retries'
        WHERE id = $1
      `, [event.id]);

      this.log.warn({ eventId: event.id, attempts: event.attempts }, 'Moved event to dead letter queue');

    } catch (dlqError) {
      this.log.error({ eventId: event.id, error: dlqError }, 'Failed to move event to DLQ');
    }
  }
}

export const outboxProcessor = new OutboxProcessor();
