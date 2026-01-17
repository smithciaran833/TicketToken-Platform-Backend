import { db } from '../config/database';
import { logger } from '../config/logger';
import { auditLogService } from './audit-log.service';

/**
 * Data Retention Service
 * 
 * Handles automatic cleanup of old data according to retention policies
 * Helps maintain GDPR/CCPA compliance
 */
class DataRetentionService {
  private retentionDays: number;
  private auditRetentionDays: number;

  constructor() {
    this.retentionDays = parseInt(process.env.DATA_RETENTION_DAYS || '90');
    this.auditRetentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '365');
  }

  /**
   * Run all data retention cleanup jobs
   */
  async runCleanup(): Promise<{
    notifications: number;
    notificationHistory: number;
    webhookEvents: number;
    auditLogs: number;
    totalRecords: number;
  }> {
    logger.info('Starting data retention cleanup', {
      retentionDays: this.retentionDays,
      auditRetentionDays: this.auditRetentionDays,
    });

    const results = {
      notifications: 0,
      notificationHistory: 0,
      webhookEvents: 0,
      auditLogs: 0,
      totalRecords: 0,
    };

    try {
      // Clean up old notifications
      results.notifications = await this.cleanupNotifications();
      
      // Clean up old notification history
      results.notificationHistory = await this.cleanupNotificationHistory();
      
      // Clean up old webhook events
      results.webhookEvents = await this.cleanupWebhookEvents();
      
      // Clean up old audit logs
      results.auditLogs = await this.cleanupAuditLogs();

      results.totalRecords = 
        results.notifications +
        results.notificationHistory +
        results.webhookEvents +
        results.auditLogs;

      logger.info('Data retention cleanup completed', results);

      return results;
    } catch (error) {
      logger.error('Data retention cleanup failed', { error });
      throw error;
    }
  }

  /**
   * Clean up old notification records
   */
  private async cleanupNotifications(): Promise<number> {
    const cutoffDate = this.getCutoffDate(this.retentionDays);

    try {
      const result = await db('notification_history')
        .where('created_at', '<', cutoffDate)
        .where('status', 'in', ['sent', 'delivered', 'failed'])
        .delete();

      logger.info('Cleaned up old notifications', {
        count: result,
        cutoffDate,
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup notifications', { error });
      return 0;
    }
  }

  /**
   * Clean up old notification history
   */
  private async cleanupNotificationHistory(): Promise<number> {
    const cutoffDate = this.getCutoffDate(this.retentionDays);

    try {
      const result = await db('notification_history')
        .where('created_at', '<', cutoffDate)
        .delete();

      logger.info('Cleaned up old notification history', {
        count: result,
        cutoffDate,
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup notification history', { error });
      return 0;
    }
  }

  /**
   * Clean up old webhook events
   */
  private async cleanupWebhookEvents(): Promise<number> {
    const cutoffDate = this.getCutoffDate(this.retentionDays);

    try {
      const result = await db('notification_webhook_events')
        .where('received_at', '<', cutoffDate)
        .where('processed', true)
        .delete();

      logger.info('Cleaned up old webhook events', {
        count: result,
        cutoffDate,
      });

      return result;
    } catch (error) {
      logger.error('Failed to cleanup webhook events', { error });
      return 0;
    }
  }

  /**
   * Clean up old audit logs (except critical events)
   */
  private async cleanupAuditLogs(): Promise<number> {
    try {
      const result = await auditLogService.cleanup(this.auditRetentionDays);
      return result;
    } catch (error) {
      logger.error('Failed to cleanup audit logs', { error });
      return 0;
    }
  }

  /**
   * Anonymize user data instead of deleting (GDPR compliant approach)
   */
  async anonymizeUserData(userId: string): Promise<void> {
    logger.info('Anonymizing user data', { userId });

    try {
      // Anonymize notification history
      await db('notification_history')
        .where('recipient_id', userId)
        .update({
          recipient_email: null,
          recipient_email_encrypted: null,
          recipient_email_hash: null,
          recipient_phone: null,
          recipient_phone_encrypted: null,
          recipient_phone_hash: null,
          recipient_name: 'ANONYMIZED',
          anonymized_at: new Date(),
        });

      // Anonymize notifications (notification_history already updated above, skip duplicate)
      // await db('notification_history')
      //   .where('recipient_id', userId)
      //   .update({
      //     metadata: db.raw("jsonb_set(metadata, '{recipient}', '\"ANONYMIZED\"'::jsonb)"),
      //     anonymized_at: new Date(),
      //   });

      // Delete consent records
      await db('consent_records')
        .where('customer_id', userId)
        .delete();

      // Delete preferences
      await db('notification_preferences')
        .where('user_id', userId)
        .delete();

      logger.info('User data anonymized successfully', { userId });
    } catch (error) {
      logger.error('Failed to anonymize user data', { error, userId });
      throw error;
    }
  }

  /**
   * Delete user data (hard delete for right-to-be-forgotten)
   */
  async deleteUserData(userId: string, requestedBy: string): Promise<void> {
    logger.warn('Deleting user data (right-to-be-forgotten)', { 
      userId,
      requestedBy,
    });

    try {
      // Log the deletion for audit trail
      await auditLogService.logDataDeletion({
        userId,
        requestedBy,
        reason: 'right-to-be-forgotten',
      });

      // Delete in order to respect foreign key constraints
      await db('notification_engagement')
        .where('user_id', userId)
        .delete();

      await db('notification_tracking')
        .where('recipient_id', userId)
        .delete();

      await db('notification_history')
        .where('recipient_id', userId)
        .delete();

      // notification_history already deleted above, no separate notifications table
      // await db('notification_history')
      //   .where('recipient_id', userId)
      //   .delete();

      await db('consent_records')
        .where('customer_id', userId)
        .delete();

      await db('notification_preferences')
        .where('user_id', userId)
        .delete();

      // Keep audit logs for compliance (don't delete those)

      logger.info('User data deleted successfully', { userId });
    } catch (error) {
      logger.error('Failed to delete user data', { error, userId });
      throw error;
    }
  }

  /**
   * Get data retention statistics
   */
  async getRetentionStats(): Promise<{
    oldNotifications: number;
    oldHistory: number;
    oldWebhooks: number;
    oldAuditLogs: number;
    retentionDate: Date;
  }> {
    const cutoffDate = this.getCutoffDate(this.retentionDays);
    const auditCutoffDate = this.getCutoffDate(this.auditRetentionDays);

    const [notifications, history, webhooks, auditLogs] = await Promise.all([
      db('notification_history')
        .where('created_at', '<', cutoffDate)
        .count('* as count')
        .first(),
      db('notification_history')
        .where('created_at', '<', cutoffDate)
        .count('* as count')
        .first(),
      db('notification_webhook_events')
        .where('received_at', '<', cutoffDate)
        .where('processed', true)
        .count('* as count')
        .first(),
      db('audit_log')
        .where('created_at', '<', auditCutoffDate)
        .where('severity', '!=', 'critical')
        .count('* as count')
        .first(),
    ]);

    return {
      oldNotifications: parseInt(notifications?.count as string) || 0,
      oldHistory: parseInt(history?.count as string) || 0,
      oldWebhooks: parseInt(webhooks?.count as string) || 0,
      oldAuditLogs: parseInt(auditLogs?.count as string) || 0,
      retentionDate: cutoffDate,
    };
  }

  /**
   * Calculate cutoff date for retention
   */
  private getCutoffDate(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  /**
   * Get user data size (for GDPR reporting)
   */
  async getUserDataSize(userId: string): Promise<{
    notifications: number;
    history: number;
    consent: number;
    preferences: number;
    total: number;
  }> {
    const [notifications, history, consent, preferences] = await Promise.all([
      db('notification_history')
        .where('recipient_id', userId)
        .count('* as count')
        .first(),
      db('notification_history')
        .where('recipient_id', userId)
        .count('* as count')
        .first(),
      db('consent_records')
        .where('customer_id', userId)
        .count('* as count')
        .first(),
      db('notification_preferences')
        .where('user_id', userId)
        .count('* as count')
        .first(),
    ]);

    const notificationCount = parseInt(notifications?.count as string) || 0;
    const historyCount = parseInt(history?.count as string) || 0;
    const consentCount = parseInt(consent?.count as string) || 0;
    const preferenceCount = parseInt(preferences?.count as string) || 0;

    return {
      notifications: notificationCount,
      history: historyCount,
      consent: consentCount,
      preferences: preferenceCount,
      total: notificationCount + historyCount + consentCount + preferenceCount,
    };
  }
}

export const dataRetentionService = new DataRetentionService();
