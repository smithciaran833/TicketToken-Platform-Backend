import { Pool } from 'pg';
import axios from 'axios';
import crypto from 'crypto';
import logger from '../utils/logger';

/**
 * WEBHOOK SERVICE
 * 
 * Sends real-time webhook notifications for transfer events
 * Phase 8: Advanced Features
 */

export enum WebhookEventType {
  TRANSFER_CREATED = 'transfer.created',
  TRANSFER_ACCEPTED = 'transfer.accepted',
  TRANSFER_REJECTED = 'transfer.rejected',
  TRANSFER_COMPLETED = 'transfer.completed',
  TRANSFER_FAILED = 'transfer.failed',
  TRANSFER_CANCELLED = 'transfer.cancelled',
  BLOCKCHAIN_CONFIRMED = 'blockchain.confirmed'
}

export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: string;
  data: any;
}

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  isActive: boolean;
}

export class WebhookService {
  constructor(private readonly pool: Pool) {}

  /**
   * Send webhook notification
   */
  async sendWebhook(
    tenantId: string,
    eventType: WebhookEventType,
    data: any
  ): Promise<void> {
    try {
      // Get active webhook subscriptions for this event
      const subscriptions = await this.getActiveSubscriptions(tenantId, eventType);

      if (subscriptions.length === 0) {
        logger.debug('No webhook subscriptions found', { tenantId, eventType });
        return;
      }

      // Prepare payload
      const payload: WebhookPayload = {
        event: eventType,
        timestamp: new Date().toISOString(),
        data
      };

      // Send to all subscriptions
      const promises = subscriptions.map(subscription =>
        this.deliverWebhook(subscription, payload)
      );

      await Promise.allSettled(promises);

    } catch (error) {
      logger.error({ err: error, eventType }, 'Failed to send webhooks');
    }
  }

  /**
   * Deliver webhook to a specific endpoint
   */
  private async deliverWebhook(
    subscription: WebhookSubscription,
    payload: WebhookPayload
  ): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        // Generate signature
        const signature = this.generateSignature(payload, subscription.secret);

        // Send webhook
        const response = await axios.post(subscription.url, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-Event': payload.event,
            'User-Agent': 'TicketToken-Webhooks/1.0'
          },
          timeout: 5000
        });

        // Log successful delivery
        await this.logWebhookDelivery(
          subscription.id,
          payload.event,
          'SUCCESS',
          response.status
        );

        logger.info('Webhook delivered successfully', {
          subscriptionId: subscription.id,
          event: payload.event,
          statusCode: response.status
        });

        return;

      } catch (error) {
        attempt++;
        const err = error as any;

        logger.warn('Webhook delivery failed', {
          subscriptionId: subscription.id,
          event: payload.event,
          attempt,
          error: err.message
        });

        if (attempt >= maxRetries) {
          // Log failed delivery
          await this.logWebhookDelivery(
            subscription.id,
            payload.event,
            'FAILED',
            err.response?.status || 0,
            err.message
          );
        } else {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
  }

  /**
   * Get active webhook subscriptions
   */
  private async getActiveSubscriptions(
    tenantId: string,
    eventType: WebhookEventType
  ): Promise<WebhookSubscription[]> {
    const result = await this.pool.query(`
      SELECT 
        id,
        url,
        events,
        secret,
        is_active
      FROM webhook_subscriptions
      WHERE tenant_id = $1
        AND is_active = true
        AND $2 = ANY(events)
    `, [tenantId, eventType]);

    return result.rows.map(row => ({
      id: row.id,
      url: row.url,
      events: row.events,
      secret: row.secret,
      isActive: row.is_active
    }));
  }

  /**
   * Generate webhook signature
   */
  private generateSignature(payload: WebhookPayload, secret: string): string {
    const data = JSON.stringify(payload);
    return crypto
      .createHmac('sha256', secret)
      .update(data)
      .digest('hex');
  }

  /**
   * Log webhook delivery
   */
  private async logWebhookDelivery(
    subscriptionId: string,
    event: string,
    status: string,
    httpStatus: number,
    errorMessage?: string
  ): Promise<void> {
    try {
      await this.pool.query(`
        INSERT INTO webhook_deliveries (
          subscription_id,
          event,
          status,
          http_status,
          error_message,
          attempted_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [subscriptionId, event, status, httpStatus, errorMessage]);
    } catch (error) {
      logger.error({ err: error }, 'Failed to log webhook delivery');
    }
  }

  /**
   * Test webhook endpoint
   */
  async testWebhook(subscriptionId: string): Promise<boolean> {
    try {
      const result = await this.pool.query(`
        SELECT url, secret FROM webhook_subscriptions WHERE id = $1
      `, [subscriptionId]);

      if (result.rows.length === 0) {
        return false;
      }

      const { url, secret } = result.rows[0];

      const testPayload: WebhookPayload = {
        event: WebhookEventType.TRANSFER_CREATED,
        timestamp: new Date().toISOString(),
        data: { test: true }
      };

      const signature = this.generateSignature(testPayload, secret);

      const response = await axios.post(url, testPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': testPayload.event,
          'User-Agent': 'TicketToken-Webhooks/1.0'
        },
        timeout: 5000
      });

      return response.status >= 200 && response.status < 300;

    } catch (error) {
      logger.error({ err: error, subscriptionId }, 'Webhook test failed');
      return false;
    }
  }

  /**
   * Verify webhook signature (for incoming webhooks)
   */
  static verifySignature(payload: string, signature: string, secret: string): boolean {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}
