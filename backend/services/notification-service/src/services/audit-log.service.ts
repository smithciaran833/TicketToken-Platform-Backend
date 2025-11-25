import { db } from '../config/database';
import { logger } from '../config/logger';

export enum AuditAction {
  PII_ACCESS = 'pii_access',
  PII_CREATED = 'pii_created',
  PII_UPDATED = 'pii_updated',
  PII_DELETED = 'pii_deleted',
  DATA_EXPORT = 'data_export',
  DATA_DELETION = 'data_deletion',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  PREFERENCE_UPDATED = 'preference_updated',
  NOTIFICATION_SENT = 'notification_sent',
  ADMIN_ACTION = 'admin_action',
}

export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export interface AuditLogEntry {
  action: AuditAction;
  actor_id?: string;
  actor_type?: 'user' | 'system' | 'admin';
  subject_id?: string;
  subject_type?: 'user' | 'notification' | 'consent';
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  severity?: AuditSeverity;
  metadata?: Record<string, any>;
}

/**
 * Audit Log Service
 * 
 * Provides comprehensive audit logging for compliance
 * Tracks all PII access and critical operations
 */
class AuditLogService {
  /**
   * Log an audit event
   */
  async log(entry: AuditLogEntry): Promise<void> {
    try {
      await db('audit_log').insert({
        action: entry.action,
        actor_id: entry.actor_id,
        actor_type: entry.actor_type || 'system',
        subject_id: entry.subject_id,
        subject_type: entry.subject_type,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        details: entry.details ? JSON.stringify(entry.details) : null,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        severity: entry.severity || AuditSeverity.INFO,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        created_at: new Date(),
      });

      // Also log to application logger for immediate visibility
      logger.info('Audit log entry', {
        action: entry.action,
        actor_id: entry.actor_id,
        subject_id: entry.subject_id,
        severity: entry.severity,
      });
    } catch (error) {
      logger.error('Failed to write audit log', { error, entry });
      // Don't throw - audit log failures shouldn't break operations
    }
  }

  /**
   * Log PII access
   */
  async logPIIAccess(params: {
    userId: string;
    field: string;
    resourceType: string;
    resourceId: string;
    actorId?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.PII_ACCESS,
      actor_id: params.actorId || params.userId,
      actor_type: 'user',
      subject_id: params.userId,
      subject_type: 'user',
      resource_type: params.resourceType,
      resource_id: params.resourceId,
      details: {
        field: params.field,
      },
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      severity: AuditSeverity.INFO,
    });
  }

  /**
   * Log data export request
   */
  async logDataExport(params: {
    userId: string;
    requestedBy: string;
    format: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.DATA_EXPORT,
      actor_id: params.requestedBy,
      actor_type: params.requestedBy === params.userId ? 'user' : 'admin',
      subject_id: params.userId,
      subject_type: 'user',
      details: {
        format: params.format,
      },
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      severity: AuditSeverity.WARNING,
    });
  }

  /**
   * Log data deletion (right-to-be-forgotten)
   */
  async logDataDeletion(params: {
    userId: string;
    requestedBy: string;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.DATA_DELETION,
      actor_id: params.requestedBy,
      actor_type: params.requestedBy === params.userId ? 'user' : 'admin',
      subject_id: params.userId,
      subject_type: 'user',
      details: {
        reason: params.reason,
      },
      ip_address: params.ipAddress,
      user_agent: params.userAgent,
      severity: AuditSeverity.CRITICAL,
    });
  }

  /**
   * Log consent change
   */
  async logConsentChange(params: {
    userId: string;
    channel: string;
    type: string;
    granted: boolean;
  }): Promise<void> {
    await this.log({
      action: params.granted ? AuditAction.CONSENT_GRANTED : AuditAction.CONSENT_REVOKED,
      actor_id: params.userId,
      actor_type: 'user',
      subject_id: params.userId,
      subject_type: 'user',
      resource_type: 'consent',
      details: {
        channel: params.channel,
        type: params.type,
      },
      severity: AuditSeverity.INFO,
    });
  }

  /**
   * Log preference update
   */
  async logPreferenceUpdate(params: {
    userId: string;
    preferences: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.PREFERENCE_UPDATED,
      actor_id: params.userId,
      actor_type: 'user',
      subject_id: params.userId,
      subject_type: 'user',
      resource_type: 'preference',
      details: {
        updated_fields: Object.keys(params.preferences),
      },
      ip_address: params.ipAddress,
      severity: AuditSeverity.INFO,
    });
  }

  /**
   * Log notification sent
   */
  async logNotificationSent(params: {
    notificationId: string;
    userId: string;
    channel: string;
    type: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.NOTIFICATION_SENT,
      actor_id: 'system',
      actor_type: 'system',
      subject_id: params.userId,
      subject_type: 'user',
      resource_type: 'notification',
      resource_id: params.notificationId,
      details: {
        channel: params.channel,
        type: params.type,
      },
      severity: AuditSeverity.INFO,
    });
  }

  /**
   * Log admin action
   */
  async logAdminAction(params: {
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
    details?: Record<string, any>;
    ipAddress?: string;
  }): Promise<void> {
    await this.log({
      action: AuditAction.ADMIN_ACTION,
      actor_id: params.adminId,
      actor_type: 'admin',
      resource_type: params.targetType,
      resource_id: params.targetId,
      details: {
        action: params.action,
        ...params.details,
      },
      ip_address: params.ipAddress,
      severity: AuditSeverity.WARNING,
    });
  }

  /**
   * Query audit logs
   */
  async query(filters: {
    userId?: string;
    action?: AuditAction;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    let query = db('audit_log').select('*');

    if (filters.userId) {
      query = query.where(function() {
        this.where('actor_id', filters.userId)
          .orWhere('subject_id', filters.userId);
      });
    }

    if (filters.action) {
      query = query.where('action', filters.action);
    }

    if (filters.startDate) {
      query = query.where('created_at', '>=', filters.startDate);
    }

    if (filters.endDate) {
      query = query.where('created_at', '<=', filters.endDate);
    }

    query = query
      .orderBy('created_at', 'desc')
      .limit(filters.limit || 100)
      .offset(filters.offset || 0);

    return await query;
  }

  /**
   * Get audit trail for a specific user
   */
  async getUserAuditTrail(userId: string, limit: number = 100): Promise<any[]> {
    return await this.query({
      userId,
      limit,
    });
  }

  /**
   * Get critical audit events
   */
  async getCriticalEvents(params: {
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<any[]> {
    let query = db('audit_log')
      .select('*')
      .where('severity', AuditSeverity.CRITICAL);

    if (params.startDate) {
      query = query.where('created_at', '>=', params.startDate);
    }

    if (params.endDate) {
      query = query.where('created_at', '<=', params.endDate);
    }

    return await query
      .orderBy('created_at', 'desc')
      .limit(params.limit || 100);
  }

  /**
   * Get PII access logs for a user
   */
  async getPIIAccessLogs(userId: string, days: number = 30): Promise<any[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return await db('audit_log')
      .select('*')
      .where('subject_id', userId)
      .where('action', AuditAction.PII_ACCESS)
      .where('created_at', '>=', startDate)
      .orderBy('created_at', 'desc');
  }

  /**
   * Clean up old audit logs (for data retention)
   */
  async cleanup(retentionDays: number): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await db('audit_log')
      .where('created_at', '<', cutoffDate)
      .where('severity', '!=', AuditSeverity.CRITICAL) // Keep critical events longer
      .delete();

    logger.info(`Cleaned up ${result} old audit log entries`, {
      cutoffDate,
      retentionDays,
    });

    return result;
  }
}

export const auditLogService = new AuditLogService();
