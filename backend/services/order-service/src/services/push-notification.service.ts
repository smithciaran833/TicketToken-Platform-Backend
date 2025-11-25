import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { SendPushRequest, NotificationType, NotificationStatus, NotificationChannel } from '../types/notification.types';
import { NotificationMetrics } from '../utils/notification-metrics';

export class PushNotificationService {
  async sendPush(request: SendPushRequest): Promise<void> {
    try {
      // TODO: Implement Firebase Cloud Messaging
      // const admin = require('firebase-admin');
      // const message = {
      //   notification: {
      //     title: request.title,
      //     body: request.body
      //   },
      //   data: request.data,
      //   token: deviceToken
      // };
      // await admin.messaging().send(message);
      
      NotificationMetrics.incrementSent('push', 'success');
      logger.info('[Console] Push notification sent', {
        userId: request.userId,
        title: request.title,
        body: request.body,
      });
    } catch (error) {
      NotificationMetrics.incrementSent('push', 'failed');
      NotificationMetrics.incrementError('push', error instanceof Error ? error.message : 'unknown');
      logger.error('Error sending push notification', { error, userId: request.userId });
      throw error;
    }
  }

  async sendOrderUpdate(
    tenantId: string,
    userId: string,
    orderId: string,
    title: string,
    body: string
  ): Promise<void> {
    await this.sendPush({
      userId,
      title,
      body,
      data: { orderId, type: 'order_update' },
      metadata: { tenantId, orderId },
    });

    await this.logNotification(tenantId, userId, orderId, NotificationType.ORDER_CONFIRMED);
  }

  private async logNotification(
    tenantId: string,
    userId: string,
    orderId: string,
    type: NotificationType
  ): Promise<void> {
    const db = getDatabase();
    try {
      await db.query(
        `INSERT INTO notification_logs (tenant_id, user_id, order_id, notification_type, channel, recipient, status, sent_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [tenantId, userId, orderId, type, NotificationChannel.PUSH, userId, NotificationStatus.SENT]
      );
    } catch (error) {
      logger.error('Failed to log push notification to database', { 
        error, 
        orderId, 
        userId,
        type,
        impact: 'notification was sent but not recorded in logs'
      });
      // Don't throw - logging failure shouldn't prevent notification from being considered sent
    }
  }
}

export const pushNotificationService = new PushNotificationService();
