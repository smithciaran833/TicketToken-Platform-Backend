import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { NotificationPreferences, NotificationFrequency, NotificationType, NotificationChannel } from '../types/notification.types';

export class NotificationPreferencesService {
  async getPreferences(userId: string, tenantId: string): Promise<NotificationPreferences | null> {
    const db = getDatabase();
    try {
      const result = await db.query(
        'SELECT * FROM notification_preferences WHERE user_id = $1 AND tenant_id = $2',
        [userId, tenantId]
      );

      if (result.rows.length === 0) {
        return this.createDefaultPreferences(userId, tenantId);
      }

      return this.mapToPreferences(result.rows[0]);
    } catch (error) {
      logger.error('Error fetching notification preferences', { error, userId });
      throw error;
    }
  }

  async updatePreferences(userId: string, tenantId: string, updates: Partial<NotificationPreferences>): Promise<NotificationPreferences> {
    const db = getDatabase();
    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.emailEnabled !== undefined) {
        fields.push(`email_enabled = $${paramIndex++}`);
        values.push(updates.emailEnabled);
      }
      if (updates.smsEnabled !== undefined) {
        fields.push(`sms_enabled = $${paramIndex++}`);
        values.push(updates.smsEnabled);
      }
      if (updates.pushEnabled !== undefined) {
        fields.push(`push_enabled = $${paramIndex++}`);
        values.push(updates.pushEnabled);
      }
      if (updates.orderConfirmation !== undefined) {
        fields.push(`order_confirmation = $${paramIndex++}`);
        values.push(updates.orderConfirmation);
      }
      if (updates.statusUpdates !== undefined) {
        fields.push(`status_updates = $${paramIndex++}`);
        values.push(updates.statusUpdates);
      }
      if (updates.reminders !== undefined) {
        fields.push(`reminders = $${paramIndex++}`);
        values.push(updates.reminders);
      }
      if (updates.marketing !== undefined) {
        fields.push(`marketing = $${paramIndex++}`);
        values.push(updates.marketing);
      }
      if (updates.frequency) {
        fields.push(`frequency = $${paramIndex++}`);
        values.push(updates.frequency);
      }
      if (updates.quietHoursStart) {
        fields.push(`quiet_hours_start = $${paramIndex++}`);
        values.push(updates.quietHoursStart);
      }
      if (updates.quietHoursEnd) {
        fields.push(`quiet_hours_end = $${paramIndex++}`);
        values.push(updates.quietHoursEnd);
      }
      if (updates.timezone) {
        fields.push(`timezone = $${paramIndex++}`);
        values.push(updates.timezone);
      }
      if (updates.languagePreference) {
        fields.push(`language_preference = $${paramIndex++}`);
        values.push(updates.languagePreference);
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId, tenantId);

      const result = await db.query(
        `UPDATE notification_preferences SET ${fields.join(', ')} WHERE user_id = $${paramIndex++} AND tenant_id = $${paramIndex++} RETURNING *`,
        values
      );

      logger.info('Updated notification preferences', { userId });
      return this.mapToPreferences(result.rows[0]);
    } catch (error) {
      logger.error('Error updating notification preferences', { error, userId });
      throw error;
    }
  }

  async canSendNotification(
    userId: string,
    tenantId: string,
    type: NotificationType,
    channel: NotificationChannel
  ): Promise<boolean> {
    const preferences = await this.getPreferences(userId, tenantId);
    if (!preferences) return true; // Default to allowing if no preferences

    // Check channel enabled
    if (channel === NotificationChannel.EMAIL && !preferences.emailEnabled) return false;
    if (channel === NotificationChannel.SMS && !preferences.smsEnabled) return false;
    if (channel === NotificationChannel.PUSH && !preferences.pushEnabled) return false;

    // Check notification type enabled
    if (type === NotificationType.ORDER_CONFIRMATION && !preferences.orderConfirmation) return false;
    if ([NotificationType.ORDER_CONFIRMED, NotificationType.ORDER_CANCELLED].includes(type) && !preferences.statusUpdates) return false;
    if (type === NotificationType.EVENT_REMINDER && !preferences.reminders) return false;
    if (type === NotificationType.RE_ENGAGEMENT && !preferences.marketing) return false;

    // Check quiet hours
    if (preferences.quietHoursStart && preferences.quietHoursEnd) {
      const inQuietHours = this.isInQuietHours(preferences.quietHoursStart, preferences.quietHoursEnd, preferences.timezone);
      if (inQuietHours) return false;
    }

    return true;
  }

  private async createDefaultPreferences(userId: string, tenantId: string): Promise<NotificationPreferences> {
    const db = getDatabase();
    try {
      const result = await db.query(
        'INSERT INTO notification_preferences (user_id, tenant_id) VALUES ($1, $2) RETURNING *',
        [userId, tenantId]
      );
      return this.mapToPreferences(result.rows[0]);
    } catch (error) {
      logger.error('Error creating default preferences', { error, userId });
      throw error;
    }
  }

  private isInQuietHours(start: string, end: string, timezone: string): boolean {
    // TODO: Implement timezone-aware quiet hours check
    // For now, simple time comparison
    const now = new Date();
    const currentTime = now.toTimeString().substring(0, 5); // HH:MM format
    return currentTime >= start && currentTime <= end;
  }

  private mapToPreferences(row: any): NotificationPreferences {
    return {
      id: row.id,
      userId: row.user_id,
      tenantId: row.tenant_id,
      emailEnabled: row.email_enabled,
      smsEnabled: row.sms_enabled,
      pushEnabled: row.push_enabled,
      orderConfirmation: row.order_confirmation,
      statusUpdates: row.status_updates,
      reminders: row.reminders,
      marketing: row.marketing,
      frequency: row.frequency,
      quietHoursStart: row.quiet_hours_start,
      quietHoursEnd: row.quiet_hours_end,
      timezone: row.timezone,
      languagePreference: row.language_preference,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const notificationPreferencesService = new NotificationPreferencesService();
