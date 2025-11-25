import { createHmac } from 'crypto';
import { logger } from '../utils/logger';
import { getDatabase } from '../config/database';
import { SendWebhookRequest, NotificationType, NotificationStatus, NotificationChannel } from '../types/notification.types';
import { retry } from '../utils/retry';

export class WebhookService {
  async sendWebhook(request: SendWebhookRequest): Promise<void> {
    try {
      const payload = JSON.stringify(request.payload);
      const signature = request.signature || this.generateSignature(payload);

      await retry(
        async () => {
          // TODO: Implement actual HTTP POST with fetch or axios
          // const response = await fetch(request.url, {
          //   method: 'POST',
          //   headers: {
          //     'Content-Type': 'application/json',
          //     'X-Webhook-Signature': signature
          //   },
          //   body: payload
          // });
          // if (!response.ok) throw new Error(`Webhook failed: ${response.status}`);
          
          logger.info('[Console] Webhook sent', { url: request.url, payload: request.payload });
        },
        { maxAttempts: 3, delayMs: 1000 }
      );
    } catch (error) {
      logger.error('Error sending webhook', { error, url: request.url });
      throw error;
    }
  }

  async sendOrderEvent(
    tenantId: string,
    userId: string,
    orderId: string,
    eventType: string,
    webhookUrl: string,
    orderData: any
  ): Promise<void> {
    const payload = {
      event: eventType,
      orderId,
      order: orderData,
      timestamp: new Date().toISOString(),
    };

    await this.sendWebhook({
      url: webhookUrl,
      payload,
      metadata: { tenantId, userId, orderId },
    });

    await this.logNotification(tenantId, userId, orderId, NotificationType.ORDER_CONFIRMED, webhookUrl);
  }

  private generateSignature(payload: string): string {
    const secret = process.env.WEBHOOK_SECRET || 'default-secret';
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  verifySignature(payload: string, signature: string): boolean {
    const expectedSignature = this.generateSignature(payload);
    return signature === expectedSignature;
  }

  private async logNotification(
    tenantId: string,
    userId: string,
    orderId: string,
    type: NotificationType,
    webhookUrl: string
  ): Promise<void> {
    const db = getDatabase();
    try {
      await db.query(
        `INSERT INTO notification_logs (tenant_id, user_id, order_id, notification_type, channel, recipient, status, sent_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [tenantId, userId, orderId, type, NotificationChannel.WEBHOOK, webhookUrl, NotificationStatus.SENT]
      );
    } catch (error) {
      logger.error('Failed to log webhook notification to database', { 
        error, 
        orderId, 
        webhookUrl,
        type,
        impact: 'notification was sent but not recorded in logs'
      });
      // Don't throw - logging failure shouldn't prevent notification from being considered sent
    }
  }
}
