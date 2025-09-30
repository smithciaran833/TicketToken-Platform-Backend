import axios from 'axios';
import crypto from 'crypto';
import { Pool } from 'pg';

export interface OutboundWebhook {
  url: string;
  event: string;
  payload: any;
  secret: string;
}

export class OutboundWebhookService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async send(webhook: OutboundWebhook): Promise<void> {
    const signature = this.generateSignature(webhook.payload, webhook.secret);
    
    try {
      const response = await axios.post(webhook.url, webhook.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': webhook.event
        },
        timeout: 5000
      });

      await this.logWebhook(webhook, response.status, null);
    } catch (error: any) {
      await this.logWebhook(webhook, error.response?.status || 0, error.message);
      throw error;
    }
  }

  private generateSignature(payload: any, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  private async logWebhook(webhook: OutboundWebhook, status: number, error: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO outbound_webhooks (url, event, payload, status, error, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [webhook.url, webhook.event, JSON.stringify(webhook.payload), status, error]
    );
  }
}
