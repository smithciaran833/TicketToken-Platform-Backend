import { db } from '../config/database';
import { logger } from '../config/logger';
import Bull from 'bull';

export interface DeliveryTrackingData {
  notificationId: string;
  userId: string;
  channel: 'email' | 'sms' | 'push';
  recipient: string;
  providerMessageId?: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced' | 'retrying';
  attempts: number;
  maxAttempts?: number;
  lastError?: string;
  providerResponse?: any;
}

export class DeliveryTracker {
  private retryQueue: Bull.Queue;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RETRY_DELAYS = [
    5000,    // 5 seconds
    30000,   // 30 seconds
    300000   // 5 minutes
  ];

  constructor() {
    this.retryQueue = new Bull('notification-retry', {
      redis: {
        port: parseInt(process.env.REDIS_PORT || '6379'),
        host: process.env.REDIS_HOST || 'redis',
        password: process.env.REDIS_PASSWORD
      }
    });

    this.initializeRetryProcessor();
  }

  private initializeRetryProcessor() {
    this.retryQueue.process(async (job) => {
      const { notificationId, attempt } = job.data;
      await this.retryNotification(notificationId, attempt);
    });
  }

  async trackDelivery(data: DeliveryTrackingData): Promise<void> {
    try {
      // Update notification history
      await db('notification_history')
        .where('id', data.notificationId)
        .update({
          delivery_status: data.status,
          delivery_attempts: data.attempts,
          last_attempt_at: new Date(),
          delivered_at: data.status === 'delivered' ? new Date() : null,
          failed_reason: data.lastError,
          provider_message_id: data.providerMessageId,
          provider_response: JSON.stringify(data.providerResponse || {}),
          should_retry: this.shouldRetry(data),
          updated_at: new Date()
        });

      // Update daily stats
      await this.updateStats(data);

      // Schedule retry if needed
      if (this.shouldRetry(data)) {
        await this.scheduleRetry(data);
      }

      logger.info('Delivery tracked', {
        notificationId: data.notificationId,
        status: data.status,
        attempts: data.attempts
      });
    } catch (error) {
      logger.error('Failed to track delivery', { error, data });
    }
  }

  private shouldRetry(data: DeliveryTrackingData): boolean {
    if (data.status === 'delivered' || data.status === 'bounced') {
      return false;
    }

    if (data.attempts >= (data.maxAttempts || this.MAX_ATTEMPTS)) {
      return false;
    }

    if (data.status === 'failed' || data.status === 'retrying') {
      return true;
    }

    return false;
  }

  private async scheduleRetry(data: DeliveryTrackingData): Promise<void> {
    const delay = this.RETRY_DELAYS[data.attempts - 1] || this.RETRY_DELAYS[this.RETRY_DELAYS.length - 1];
    
    await this.retryQueue.add(
      {
        notificationId: data.notificationId,
        attempt: data.attempts + 1,
        userId: data.userId,
        channel: data.channel,
        recipient: data.recipient
      },
      {
        delay,
        attempts: 1,
        backoff: {
          type: 'fixed',
          delay: 0
        }
      }
    );

    // Update retry_after timestamp
    await db('notification_history')
      .where('id', data.notificationId)
      .update({
        retry_after: new Date(Date.now() + delay),
        delivery_status: 'retrying'
      });

    logger.info('Retry scheduled', {
      notificationId: data.notificationId,
      attempt: data.attempts + 1,
      delayMs: delay
    });
  }

  private async retryNotification(notificationId: string, attempt: number): Promise<void> {
    try {
      // Get notification details
      const notification = await db('notification_history')
        .where('id', notificationId)
        .first();

      if (!notification) {
        logger.error('Notification not found for retry', { notificationId });
        return;
      }

      // Re-send based on channel
      // This would call back to the notification service
      // For now, just mark as retried
      logger.info('Retrying notification', {
        notificationId,
        attempt,
        channel: notification.channel
      });

      // In real implementation, this would re-send the notification
      // For mock, simulate success/failure
      const success = Math.random() > 0.3; // 70% success rate on retry

      await this.trackDelivery({
        notificationId,
        userId: notification.user_id,
        channel: notification.channel,
        recipient: notification.recipient,
        status: success ? 'delivered' : 'failed',
        attempts: attempt,
        lastError: success ? undefined : 'Retry failed'
      });
    } catch (error) {
      logger.error('Retry failed', { error, notificationId });
    }
  }

  private async updateStats(data: DeliveryTrackingData): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    
    try {
      await db.raw(`
        INSERT INTO notification_delivery_stats (
          date, channel, provider,
          total_sent, total_delivered, total_failed, total_bounced, total_retried
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (date, channel, provider) 
        DO UPDATE SET
          total_sent = notification_delivery_stats.total_sent + EXCLUDED.total_sent,
          total_delivered = notification_delivery_stats.total_delivered + EXCLUDED.total_delivered,
          total_failed = notification_delivery_stats.total_failed + EXCLUDED.total_failed,
          total_bounced = notification_delivery_stats.total_bounced + EXCLUDED.total_bounced,
          total_retried = notification_delivery_stats.total_retried + EXCLUDED.total_retried,
          updated_at = CURRENT_TIMESTAMP
      `, [
        today,
        data.channel,
        'mock', // or get from provider response
        data.status === 'sent' ? 1 : 0,
        data.status === 'delivered' ? 1 : 0,
        data.status === 'failed' ? 1 : 0,
        data.status === 'bounced' ? 1 : 0,
        data.status === 'retrying' ? 1 : 0
      ]);
    } catch (error) {
      logger.error('Failed to update stats', { error });
    }
  }

  async getDeliveryStats(startDate?: Date, endDate?: Date): Promise<any> {
    const query = db('notification_delivery_stats');
    
    if (startDate) {
      query.where('date', '>=', startDate);
    }
    
    if (endDate) {
      query.where('date', '<=', endDate);
    }
    
    return query.select(
      db.raw('SUM(total_sent) as total_sent'),
      db.raw('SUM(total_delivered) as total_delivered'),
      db.raw('SUM(total_failed) as total_failed'),
      db.raw('SUM(total_bounced) as total_bounced'),
      db.raw('SUM(total_retried) as total_retried'),
      db.raw('ROUND(100.0 * SUM(total_delivered) / NULLIF(SUM(total_sent), 0), 2) as delivery_rate'),
      'channel'
    )
    .groupBy('channel');
  }

  async getPendingRetries(): Promise<any[]> {
    return db('notification_history')
      .where('delivery_status', 'retrying')
      .where('should_retry', true)
      .where('retry_after', '<=', new Date())
      .orderBy('retry_after', 'asc')
      .limit(100);
  }
}

export const deliveryTracker = new DeliveryTracker();
