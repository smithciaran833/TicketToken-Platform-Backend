import { JobExecutor } from './job-executor';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { EmailService } from '../services/email.service';
import { SMSService } from '../services/sms.service';
import { PushNotificationService } from '../services/push-notification.service';
import { NotificationChannel } from '../types/notification.types';

export class NotificationSchedulerJob extends JobExecutor {
  private emailService: EmailService;
  private smsService: SMSService;
  private pushService: PushNotificationService;

  constructor() {
    super({
      name: 'notification-scheduler',
      intervalSeconds: 60, // Every minute
      enableRetry: true,
      enableCircuitBreaker: true,
      enableDistributedLock: true,
    });
    this.emailService = new EmailService();
    this.smsService = new SMSService();
    this.pushService = new PushNotificationService();
  }

  protected async executeCore(): Promise<void> {
    const db = getDatabase();
    try {
      // Get pending notifications that are due
      const result = await db.query(
        `SELECT * FROM scheduled_notifications 
         WHERE status = 'PENDING' 
         AND scheduled_for <= NOW() 
         AND retry_count < max_retries 
         ORDER BY scheduled_for ASC 
         LIMIT 100`
      );

      logger.info('Processing scheduled notifications', { count: result.rows.length });

      for (const notification of result.rows) {
        await this.processNotification(notification);
      }
    } catch (error) {
      logger.error('Error in notification scheduler', { error });
      throw error;
    }
  }

  private async processNotification(notification: any): Promise<void> {
    const db = getDatabase();
    try {
      // Mark as being processed
      await db.query(
        'UPDATE scheduled_notifications SET last_attempted_at = NOW() WHERE id = $1',
        [notification.id]
      );

      // Send based on channel - actually call the service methods
      switch (notification.channel) {
        case NotificationChannel.EMAIL:
          await this.emailService.sendEmail({
            to: notification.recipient,
            subject: notification.subject || 'Notification',
            htmlBody: notification.html_body,
            textBody: notification.text_body,
            metadata: { 
              tenantId: notification.tenant_id, 
              userId: notification.user_id,
              orderId: notification.order_id 
            }
          });
          logger.info('Email notification sent', { notificationId: notification.id, recipient: notification.recipient });
          break;
        case NotificationChannel.SMS:
          await this.smsService.sendSMS({
            to: notification.recipient,
            message: notification.text_body || notification.subject || '',
            metadata: { 
              tenantId: notification.tenant_id, 
              userId: notification.user_id,
              orderId: notification.order_id 
            }
          });
          logger.info('SMS notification sent', { notificationId: notification.id, recipient: notification.recipient });
          break;
        case NotificationChannel.PUSH:
          await this.pushService.sendPush({
            userId: notification.user_id,
            title: notification.subject || 'Notification',
            body: notification.text_body || '',
            data: { notificationId: notification.id, orderId: notification.order_id },
            metadata: { 
              tenantId: notification.tenant_id,
              orderId: notification.order_id 
            }
          });
          logger.info('Push notification sent', { notificationId: notification.id, userId: notification.user_id });
          break;
      }

      // Mark as sent
      await db.query(
        `UPDATE scheduled_notifications 
         SET status = 'SENT', sent_at = NOW(), updated_at = NOW() 
         WHERE id = $1`,
        [notification.id]
      );

      logger.info('Scheduled notification sent', { notificationId: notification.id });
    } catch (error) {
      logger.error('Error processing scheduled notification', { error, notificationId: notification.id });

      // Increment retry count
      await db.query(
        `UPDATE scheduled_notifications 
         SET retry_count = retry_count + 1, updated_at = NOW() 
         WHERE id = $1`,
        [notification.id]
      );

      // If max retries reached, mark as failed
      if (notification.retry_count + 1 >= notification.max_retries) {
        await db.query(
          `UPDATE scheduled_notifications 
           SET status = 'FAILED', updated_at = NOW() 
           WHERE id = $1`,
          [notification.id]
        );
      }
    }
  }
}
