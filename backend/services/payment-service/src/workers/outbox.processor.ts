import { Pool } from 'pg';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

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
    // Process every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processOutboxEvents();
    }, 5000);
    
    // Also process immediately
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
    // Exponential backoff with jitter
    const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempts);
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    return Math.min(baseDelay + jitter, 60000); // Max 1 minute
  }

  private async processOutboxEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const client = await this.pool.connect();

    try {
      // Get unprocessed events or events that need retry
      const result = await client.query(`
        SELECT * FROM outbox 
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
        this.log.info(`Processed ${result.rows.length} outbox events`);
      }

    } catch (error) {
      this.log.error('Error processing outbox events:', error);
    } finally {
      client.release();
      this.isProcessing = false;
    }
  }

  private async processEvent(client: any, event: any) {
    const retryDelay = this.calculateRetryDelay(event.attempts || 0);

    try {
      // Check if we should wait before retrying
      if (event.last_attempt_at) {
        const timeSinceLastAttempt = Date.now() - new Date(event.last_attempt_at).getTime();
        if (timeSinceLastAttempt < retryDelay) {
          return; // Skip this event for now
        }
      }

      this.log.info(`Processing outbox event: ${event.event_type}`, {
        eventId: event.id,
        aggregateId: event.aggregate_id,
        attempts: event.attempts
      });

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
          this.log.warn(`Unknown event type: ${event.event_type}`);
          success = true; // Mark as processed to avoid infinite loop
      }

      if (success) {
        // Mark as processed
        await client.query(`
          UPDATE outbox 
          SET processed_at = NOW()
          WHERE id = $1
        `, [event.id]);

        this.log.info(`Successfully processed event ${event.id}`);
      } else {
        // Update retry attempt
        await client.query(`
          UPDATE outbox 
          SET attempts = attempts + 1,
              last_attempt_at = NOW(),
              last_error = 'Processing failed'
          WHERE id = $1
        `, [event.id]);

        this.log.warn(`Failed to process event ${event.id}, will retry`);
      }

    } catch (error: any) {
      this.log.error(`Error processing event ${event.id}:`, error);

      // Update retry attempt with error message
      await client.query(`
        UPDATE outbox 
        SET attempts = attempts + 1,
            last_attempt_at = NOW(),
            last_error = $2
        WHERE id = $1
      `, [event.id, error.message || 'Unknown error']);

      // If we've exceeded max attempts, move to DLQ
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

      // Notify ticket service to create tickets
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
      this.log.error('Failed to notify ticket service of payment:', {
        orderId: payload.orderId,
        error: error.message
      });

      // Return false to trigger retry
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
      this.log.error('Failed to notify ticket service of payment failure:', {
        orderId: payload.orderId,
        error: error.message
      });
      return false;
    }
  }

  private async handleTicketCreation(event: any): Promise<boolean> {
    const payload = event.payload;
    
    try {
      // Send to minting service queue
      const queueService = require('../services/queueService').queueService;
      await queueService.publish('ticket.mint', payload);
      
      this.log.info('Queued tickets for minting:', {
        orderId: payload.orderId,
        quantity: payload.tickets?.length || 0
      });

      return true;

    } catch (error: any) {
      this.log.error('Failed to queue tickets for minting:', {
        orderId: payload.orderId,
        error: error.message
      });
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

      // Mark original as processed (moved to DLQ)
      await client.query(`
        UPDATE outbox 
        SET processed_at = NOW(),
            last_error = 'Moved to DLQ after max retries'
        WHERE id = $1
      `, [event.id]);

      this.log.warn(`Moved event ${event.id} to dead letter queue after ${event.attempts} attempts`);

    } catch (dlqError) {
      this.log.error(`Failed to move event ${event.id} to DLQ:`, dlqError);
    }
  }
}

export const outboxProcessor = new OutboxProcessor();
