import axios from 'axios';
import crypto from 'crypto';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { NotificationResponse } from '../types/notification.types';

interface WebhookOptions {
  url: string;
  secret?: string;
  data: any;
  headers?: Record<string, string>;
}

class WebhookProvider {
  async send(options: WebhookOptions): Promise<NotificationResponse> {
    try {
      if (!env.ENABLE_WEBHOOK_DELIVERY) {
        logger.info('Webhook delivery disabled', { url: options.url });
        return {
          id: 'mock-webhook-' + Date.now(),
          status: 'sent',
          channel: 'webhook',
        };
      }

      // Generate signature if secret provided
      const signature = options.secret 
        ? this.generateSignature(options.data, options.secret)
        : undefined;

      const headers = {
        'Content-Type': 'application/json',
        'X-TicketToken-Signature': signature,
        'X-TicketToken-Timestamp': Date.now().toString(),
        ...options.headers,
      };

      const response = await axios.post(options.url, options.data, {
        headers,
        timeout: 10000,
      });

      logger.info('Webhook delivered successfully', {
        url: options.url,
        status: response.status,
      });

      return {
        id: 'webhook-' + Date.now(),
        status: 'delivered',
        channel: 'webhook',
        deliveredAt: new Date(),
      };
    } catch (error: any) {
      logger.error('Failed to deliver webhook', {
        url: options.url,
        error: error.message,
      });

      return {
        id: 'webhook-' + Date.now(),
        status: 'failed',
        channel: 'webhook',
        failureReason: error.message,
      };
    }
  }

  private generateSignature(data: any, secret: string): string {
    const payload = JSON.stringify(data);
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }

  async validateWebhook(body: string, signature: string, secret: string): Promise<boolean> {
    const expectedSignature = this.generateSignature(JSON.parse(body), secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }
}

export const webhookProvider = new WebhookProvider();
