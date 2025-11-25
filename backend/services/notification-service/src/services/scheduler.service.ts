import { db } from '../config/database';
import { logger } from '../config/logger';
import { metricsService } from './metrics.service';
import { v4 as uuidv4 } from 'uuid';
import { queueService } from './queue.service';

export interface ScheduledNotification {
  id: string;
  notificationId?: string;
  scheduledFor: Date;
  timezone: string;
  repeatPattern?: 'daily' | 'weekly' | 'monthly';
  repeatUntil?: Date;
  status: 'pending' | 'sent' | 'cancelled' | 'failed';
  metadata: Record<string, any>;
  createdAt: Date;
}

class SchedulerService {
  /**
   * Schedule notification for future delivery
   */
  async scheduleNotification(data: {
    notificationData: any;
    scheduledFor: Date;
    timezone?: string;
    repeatPattern?: 'daily' | 'weekly' | 'monthly';
    repeatUntil?: Date;
  }): Promise<ScheduledNotification> {
    try {
      const scheduleId = uuidv4();
      
      const [scheduled] = await db('scheduled_notifications')
        .insert({
          id: scheduleId,
          notification_data: JSON.stringify(data.notificationData),
          scheduled_for: data.scheduledFor,
          timezone: data.timezone || 'UTC',
          repeat_pattern: data.repeatPattern,
          repeat_until: data.repeatUntil,
          status: 'pending',
          metadata: JSON.stringify({}),
          created_at: new Date(),
        })
        .returning('*');

      logger.info('Notification scheduled', {
        scheduleId,
        scheduledFor: data.scheduledFor,
      });

      metricsService.incrementCounter('notifications_scheduled_total', {
        repeat: data.repeatPattern ? 'recurring' : 'one_time',
      });

      return this.mapToScheduled(scheduled);
    } catch (error) {
      logger.error('Failed to schedule notification', { error, data });
      throw error;
    }
  }

  /**
   * Get due notifications
   */
  async getDueNotifications(): Promise<ScheduledNotification[]> {
    try {
      const now = new Date();
      
      const due = await db('scheduled_notifications')
        .where('status', 'pending')
        .where('scheduled_for', '<=', now)
        .orderBy('scheduled_for', 'asc')
        .limit(100);

      return due.map(d => this.mapToScheduled(d));
    } catch (error) {
      logger.error('Failed to get due notifications', { error });
      throw error;
    }
  }

  /**
   * Process due notifications
   */
  async processDueNotifications(): Promise<void> {
    try {
      const due = await this.getDueNotifications();

      for (const notification of due) {
        try {
          // Add to notification queue
          await queueService.addNotificationJob(
            JSON.parse(notification.metadata.notificationData || '{}'),
            {
              priority: 5,
              jobId: `scheduled-${notification.id}`,
            }
          );

          // Update status
          await this.markAsSent(notification.id);

          // Handle recurring notifications
          if (notification.repeatPattern) {
            await this.scheduleNextOccurrence(notification);
          }

          logger.info

('Processed scheduled notification', {
            scheduleId: notification.id,
          });
        } catch (error) {
          logger.error('Failed to process scheduled notification', {
            error,
            scheduleId: notification.id,
          });
          await this.markAsFailed(notification.id);
        }
      }
    } catch (error) {
      logger.error('Failed to process due notifications', { error });
    }
  }

  /**
   * Schedule next occurrence for recurring notifications
   */
  private async scheduleNextOccurrence(notification: ScheduledNotification): Promise<void> {
    if (!notification.repeatPattern) return;

    const nextDate = this.calculateNextOccurrence(
      new Date(notification.scheduledFor),
      notification.repeatPattern
    );

    if (notification.repeatUntil && nextDate > new Date(notification.repeatUntil)) {
      logger.info('Recurring notification reached end date', {
        scheduleId: notification.id,
      });
      return;
    }

    await db('scheduled_notifications')
      .insert({
        id: uuidv4(),
        notification_data: notification.metadata.notificationData,
        scheduled_for: nextDate,
        timezone: notification.timezone,
        repeat_pattern: notification.repeatPattern,
        repeat_until: notification.repeatUntil,
        status: 'pending',
        metadata: notification.metadata,
        created_at: new Date(),
      });
  }

  /**
   * Calculate next occurrence based on pattern
   */
  private calculateNextOccurrence(currentDate: Date, pattern: string): Date {
    const next = new Date(currentDate);

    switch (pattern) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
    }

    return next;
  }

  /**
   * Cancel scheduled notification
   */
  async cancelScheduled(scheduleId: string): Promise<void> {
    try {
      await db('scheduled_notifications')
        .where({ id: scheduleId })
        .update({
          status: 'cancelled',
          updated_at: new Date(),
        });

      logger.info('Scheduled notification cancelled', { scheduleId });
      
      metricsService.incrementCounter('notifications_schedule_cancelled_total');
    } catch (error) {
      logger.error('Failed to cancel scheduled notification', { error, scheduleId });
      throw error;
    }
  }

  /**
   * Mark as sent
   */
  private async markAsSent(scheduleId: string): Promise<void> {
    await db('scheduled_notifications')
      .where({ id: scheduleId })
      .update({
        status: 'sent',
        sent_at: new Date(),
        updated_at: new Date(),
      });
  }

  /**
   * Mark as failed
   */
  private async markAsFailed(scheduleId: string): Promise<void> {
    await db('scheduled_notifications')
      .where({ id: scheduleId })
      .update({
        status: 'failed',
        updated_at: new Date(),
      });
  }

  /**
   * Get scheduled notifications list
   */
  async listScheduled(filters: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ schedules: ScheduledNotification[]; total: number }> {
    try {
      let query = db('scheduled_notifications');

      if (filters.status) {
        query = query.where({ status: filters.status });
      }

      const [{ count }] = await query.clone().count('* as count');
      
      const schedules = await query
        .orderBy('scheduled_for', 'asc')
        .limit(filters.limit || 50)
        .offset(filters.offset || 0);

      return {
        schedules: schedules.map(s => this.mapToScheduled(s)),
        total: parseInt(count as string),
      };
    } catch (error) {
      logger.error('Failed to list scheduled notifications', { error });
      throw error;
    }
  }

  /**
   * Map database row to ScheduledNotification
   */
  private mapToScheduled(row: any): ScheduledNotification {
    return {
      id: row.id,
      notificationId: row.notification_id,
      scheduledFor: row.scheduled_for,
      timezone: row.timezone,
      repeatPattern: row.repeat_pattern,
      repeatUntil: row.repeat_until,
      status: row.status,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
    };
  }
}

export const schedulerService = new SchedulerService();
