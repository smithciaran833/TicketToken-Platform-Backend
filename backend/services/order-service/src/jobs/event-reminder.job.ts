import { JobExecutor } from './job-executor';
import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
// import { notificationService } from '../services/notification.service';
// import { NotificationType } from '../types/notification.types';

const NotificationType = {
  EVENT_REMINDER: 'EVENT_REMINDER'
} as const;

export class EventReminderJob extends JobExecutor {
  constructor() {
    super({
      name: 'event-reminder',
      intervalSeconds: 3600, // Every hour
      enableRetry: true,
      enableCircuitBreaker: true,
      enableDistributedLock: true,
    });
  }

  private get db() {
    return getDatabase();
  }

  protected async executeCore(): Promise<void> {
    try {
      // Find events happening in the next 24 hours that haven't had reminders sent
      const result = await this.db.query(
        `SELECT DISTINCT o.*, e.event_date, e.event_name
         FROM orders o
         JOIN events e ON o.event_id = e.id
         WHERE o.status = 'CONFIRMED'
         AND e.event_date BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
         AND NOT EXISTS (
           SELECT 1 FROM notification_logs nl
           WHERE nl.order_id = o.id
           AND nl.notification_type = $1
           AND nl.created_at > NOW() - INTERVAL '48 hours'
         )
         LIMIT 100`,
        [NotificationType.EVENT_REMINDER]
      );

      logger.info('Processing event reminders', { count: result.rows.length });

      for (const order of result.rows) {
        await this.sendEventReminder(order);
      }
    } catch (error) {
      logger.error('Error in event reminder job', { error });
      throw error;
    }
  }

  private async sendEventReminder(order: any): Promise<void> {
    try {
      const context = {
        tenantId: order.tenant_id,
        userId: order.user_id,
        orderId: order.id,
        order,
      };

      // Schedule reminder notification
      await this.db.query(
        `INSERT INTO scheduled_notifications (tenant_id, order_id, user_id, notification_type, channel, scheduled_for, metadata)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6)`,
        [
          order.tenant_id,
          order.id,
          order.user_id,
          NotificationType.EVENT_REMINDER,
          'EMAIL',
          JSON.stringify({ eventDate: order.event_date, eventName: order.event_name }),
        ]
      );

      logger.info('Event reminder scheduled', { orderId: order.id, eventDate: order.event_date });
    } catch (error) {
      logger.error('Error sending event reminder', { error, orderId: order.id });
    }
  }
}
