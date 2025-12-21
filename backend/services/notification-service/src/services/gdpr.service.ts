import { db } from '../config/database';
import { logger } from '../config/logger';
import { encryptionUtil } from '../utils/encryption.util';
import { auditLogService } from './audit-log.service';
import { dataRetentionService } from './data-retention.service';

/**
 * GDPR Service
 * 
 * Handles GDPR/CCPA compliance:
 * - Right to access (data export)
 * - Right to erasure (right-to-be-forgotten)
 * - Data portability
 */
class GDPRService {
  /**
   * Export all user data (GDPR Article 15 - Right of Access)
   */
  async exportUserData(userId: string, requestedBy: string): Promise<{
    user_id: string;
    export_date: string;
    notifications: any[];
    notification_history: any[];
    consent_records: any[];
    preferences: any[];
    audit_trail: any[];
    data_size: any;
  }> {
    logger.info('Exporting user data', { userId, requestedBy });

    try {
      // Log the export for audit trail
      await auditLogService.logDataExport({
        userId,
        requestedBy,
        format: 'json',
      });

      // Fetch all user data
      const [
        notifications,
        notificationHistory,
        consentRecords,
        preferences,
        auditTrail,
        dataSize,
      ] = await Promise.all([
        this.getNotifications(userId),
        this.getNotificationHistory(userId),
        this.getConsentRecords(userId),
        this.getPreferences(userId),
        auditLogService.getUserAuditTrail(userId, 1000),
        dataRetentionService.getUserDataSize(userId),
      ]);

      // Decrypt PII fields for export
      const decryptedHistory = await this.decryptNotificationHistory(notificationHistory);

      return {
        user_id: userId,
        export_date: new Date().toISOString(),
        notifications,
        notification_history: decryptedHistory,
        consent_records: consentRecords,
        preferences,
        audit_trail: auditTrail,
        data_size: dataSize,
      };
    } catch (error) {
      logger.error('Failed to export user data', { error, userId });
      throw error;
    }
  }

  /**
   * Delete user data (GDPR Article 17 - Right to Erasure)
   */
  async deleteUserData(
    userId: string,
    requestedBy: string,
    options: {
      method?: 'hard_delete' | 'anonymize';
      reason?: string;
    } = {}
  ): Promise<void> {
    const method = options.method || 'anonymize';
    logger.warn('Processing data deletion request', {
      userId,
      requestedBy,
      method,
      reason: options.reason,
    });

    try {
      if (method === 'hard_delete') {
        // Complete deletion (use with caution)
        await dataRetentionService.deleteUserData(userId, requestedBy);
      } else {
        // Anonymize (GDPR-compliant approach)
        await dataRetentionService.anonymizeUserData(userId);
        
        // Log the anonymization
        await auditLogService.logDataDeletion({
          userId,
          requestedBy,
          reason: options.reason || 'user_request',
        });
      }

      logger.info('User data deletion completed', {
        userId,
        method,
      });
    } catch (error) {
      logger.error('Failed to delete user data', { error, userId });
      throw error;
    }
  }

  /**
   * Get user's notification records
   */
  private async getNotifications(userId: string): Promise<any[]> {
    return await db('notification_history')
      .select(
        'id',
        'channel',
        'type',
        'template_name as template',
        'priority',
        'status',
        'created_at',
        'sent_at'
      )
      .where('recipient_id', userId)
      .orderBy('created_at', 'desc');
  }

  /**
   * Get user's notification history
   */
  private async getNotificationHistory(userId: string): Promise<any[]> {
    return await db('notification_history')
      .select('*')
      .where('recipient_id', userId)
      .orderBy('created_at', 'desc');
  }

  /**
   * Decrypt PII fields in notification history
   */
  private async decryptNotificationHistory(records: any[]): Promise<any[]> {
    if (!encryptionUtil.isEnabled()) {
      return records;
    }

    return records.map(record => {
      try {
        return {
          ...record,
          recipient_email: record.recipient_email_encrypted
            ? encryptionUtil.decryptEmail(record.recipient_email_encrypted)
            : record.recipient_email,
          recipient_phone: record.recipient_phone_encrypted
            ? encryptionUtil.decryptPhone(record.recipient_phone_encrypted)
            : record.recipient_phone,
          // Remove encrypted/hash fields from export
          recipient_email_encrypted: undefined,
          recipient_email_hash: undefined,
          recipient_phone_encrypted: undefined,
          recipient_phone_hash: undefined,
        };
      } catch (error) {
        logger.error('Failed to decrypt notification history record', {
          error,
          recordId: record.id,
        });
        return record;
      }
    });
  }

  /**
   * Get user's consent records
   */
  private async getConsentRecords(userId: string): Promise<any[]> {
    return await db('consent_records')
      .select(
        'channel',
        'type',
        'granted',
        'granted_at',
        'revoked_at',
        'ip_address',
        'user_agent'
      )
      .where('customer_id', userId)
      .orderBy('granted_at', 'desc');
  }

  /**
   * Get user's preferences
   */
  private async getPreferences(userId: string): Promise<any> {
    const preferences = await db('notification_preferences')
      .select('*')
      .where('user_id', userId)
      .first();

    return preferences || null;
  }

  /**
   * Verify if user has opted out of all communications
   */
  async hasOptedOutCompletely(userId: string): Promise<boolean> {
    const consents = await db('consent_records')
      .where('customer_id', userId)
      .where('status', 'granted');

    return consents.length === 0;
  }

  /**
   * Get data portability report (machine-readable format)
   */
  async getPortabilityData(userId: string): Promise<any> {
    const data = await this.exportUserData(userId, userId);

    // Format for portability (standardized structure)
    return {
      format_version: '1.0',
      export_timestamp: data.export_date,
      user_identifier: data.user_id,
      data_categories: {
        notifications: {
          count: data.notifications.length,
          records: data.notifications,
        },
        notification_history: {
          count: data.notification_history.length,
          records: data.notification_history,
        },
        consent: {
          count: data.consent_records.length,
          records: data.consent_records,
        },
        preferences: data.preferences,
      },
      metadata: {
        total_records: data.data_size.total,
        data_retention_days: parseInt(process.env.DATA_RETENTION_DAYS || '90'),
      },
    };
  }

  /**
   * Get user's data processing activities (for GDPR Article 30)
   */
  async getProcessingActivities(userId: string): Promise<{
    lawful_basis: string[];
    purposes: string[];
    data_categories: string[];
    recipients: string[];
    retention_period: string;
    security_measures: string[];
  }> {
    return {
      lawful_basis: [
        'Consent (GDPR Article 6(1)(a))',
        'Performance of contract (GDPR Article 6(1)(b))',
        'Legitimate interests (GDPR Article 6(1)(f))',
      ],
      purposes: [
        'Sending transactional notifications',
        'Sending marketing communications (with consent)',
        'Service updates and announcements',
        'Security and fraud prevention',
      ],
      data_categories: [
        'Email address',
        'Phone number (if provided)',
        'Notification preferences',
        'Delivery status',
      ],
      recipients: [
        'Email service provider (SendGrid)',
        'SMS service provider (Twilio)',
        'Internal analytics systems',
      ],
      retention_period: `${process.env.DATA_RETENTION_DAYS || 90} days`,
      security_measures: [
        'AES-256-GCM encryption for PII',
        'Role-based access control',
        'Audit logging',
        'Secure transmission (TLS)',
        'Regular security audits',
      ],
    };
  }

  /**
   * Validate if deletion request can be processed
   */
  async validateDeletionRequest(userId: string): Promise<{
    can_delete: boolean;
    reasons: string[];
  }> {
    const reasons: string[] = [];

    // Check for active pending notifications
    const pendingNotifications = await db('notification_history')
      .where('recipient_id', userId)
      .where('status', 'pending')
      .count('* as count')
      .first();

    const pendingCount = parseInt(pendingNotifications?.count as string) || 0;

    if (pendingCount > 0) {
      reasons.push(`${pendingCount} pending notifications must be processed first`);
    }

    // Check for legal hold requirements (if any)
    // This is a placeholder - implement based on your business rules
    const hasLegalHold = false;

    if (hasLegalHold) {
      reasons.push('Account is under legal hold and cannot be deleted');
    }

    return {
      can_delete: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Schedule automated data deletion (after grace period)
   */
  async scheduleDeletion(userId: string, gracePeriodDays: number = 30): Promise<void> {
    const deletionDate = new Date();
    deletionDate.setDate(deletionDate.getDate() + gracePeriodDays);

    await db('pending_deletions').insert({
      user_id: userId,
      requested_at: new Date(),
      scheduled_for: deletionDate,
      status: 'scheduled',
    });

    logger.info('Deletion scheduled', {
      userId,
      scheduledFor: deletionDate,
      gracePeriodDays,
    });
  }
}

export const gdprService = new GDPRService();
