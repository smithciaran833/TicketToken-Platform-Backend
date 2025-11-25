/**
 * Audit Log Service
 * 
 * Handles writing immutable audit logs for compliance and security monitoring.
 * All logs are write-only and cannot be modified or deleted once created.
 * 
 * Compliance: SOC 2, GDPR, PCI DSS, HIPAA
 * Retention: Automatic expiration based on log type (1-7 years)
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import {
  AuditLogEntry,
  CreateAuditLogParams,
  AuditLogFilters,
  AuditLogStats,
  AuditLogType,
  AuditLogSeverity
} from '../types/audit.types';

export class AuditLogService {
  constructor(private db: Pool) {}

  /**
   * Create an audit log entry (write-only operation)
   */
  async createAuditLog(params: CreateAuditLogParams): Promise<AuditLogEntry> {
    const {
      tenant_id,
      log_type,
      action,
      severity = 'INFO',
      user_id,
      username,
      user_role,
      user_email,
      description,
      before_state,
      after_state,
      metadata,
      resource_type,
      resource_id,
      resource_name,
      ip_address,
      user_agent,
      request_id,
      session_id,
      api_key_id,
      country_code,
      region,
      city,
      is_pii_access = false,
      is_payment_access = false,
      requires_review = false,
      is_suspicious = false
    } = params;

    try {
      const result = await this.db.query<AuditLogEntry>(
        `INSERT INTO audit_logs (
          tenant_id, log_type, severity, action, description,
          user_id, username, user_role, user_email,
          before_state, after_state, metadata,
          resource_type, resource_id, resource_name,
          ip_address, user_agent, request_id, session_id, api_key_id,
          country_code, region, city,
          is_pii_access, is_payment_access, requires_review, is_suspicious
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
        RETURNING *`,
        [
          tenant_id, log_type, severity, action, description,
          user_id, username, user_role, user_email,
          before_state ? JSON.stringify(before_state) : null,
          after_state ? JSON.stringify(after_state) : null,
          metadata ? JSON.stringify(metadata) : null,
          resource_type, resource_id, resource_name,
          ip_address, user_agent, request_id, session_id, api_key_id,
          country_code, region, city,
          is_pii_access, is_payment_access, requires_review, is_suspicious
        ]
      );

      logger.info('Audit log created', {
        audit_log_id: result.rows[0].id,
        tenant_id,
        log_type,
        severity,
        action
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to create audit log', { error, params });
      throw error;
    }
  }

  /**
   * Query audit logs with filters
   */
  async queryAuditLogs(
    filters: AuditLogFilters,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    // Build WHERE clauses
    if (filters.tenant_id) {
      conditions.push(`tenant_id = $${paramCount++}`);
      values.push(filters.tenant_id);
    }

    if (filters.user_id) {
      conditions.push(`user_id = $${paramCount++}`);
      values.push(filters.user_id);
    }

    if (filters.log_type) {
      conditions.push(`log_type = $${paramCount++}`);
      values.push(filters.log_type);
    }

    if (filters.severity) {
      conditions.push(`severity = $${paramCount++}`);
      values.push(filters.severity);
    }

    if (filters.resource_type) {
      conditions.push(`resource_type = $${paramCount++}`);
      values.push(filters.resource_type);
    }

    if (filters.resource_id) {
      conditions.push(`resource_id = $${paramCount++}`);
      values.push(filters.resource_id);
    }

    if (filters.is_pii_access !== undefined) {
      conditions.push(`is_pii_access = $${paramCount++}`);
      values.push(filters.is_pii_access);
    }

    if (filters.is_payment_access !== undefined) {
      conditions.push(`is_payment_access = $${paramCount++}`);
      values.push(filters.is_payment_access);
    }

    if (filters.requires_review !== undefined) {
      conditions.push(`requires_review = $${paramCount++}`);
      values.push(filters.requires_review);
    }

    if (filters.is_suspicious !== undefined) {
      conditions.push(`is_suspicious = $${paramCount++}`);
      values.push(filters.is_suspicious);
    }

    if (filters.start_date) {
      conditions.push(`created_at >= $${paramCount++}`);
      values.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`created_at <= $${paramCount++}`);
      values.push(filters.end_date);
    }

    if (filters.ip_address) {
      conditions.push(`ip_address = $${paramCount++}`);
      values.push(filters.ip_address);
    }

    if (filters.session_id) {
      conditions.push(`session_id = $${paramCount++}`);
      values.push(filters.session_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM audit_logs ${whereClause}`,
      values
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // Get paginated results
    const logsResult = await this.db.query<AuditLogEntry>(
      `SELECT * FROM audit_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount++}`,
      [...values, limit, offset]
    );

    return {
      logs: logsResult.rows,
      total
    };
  }

  /**
   * Get audit log statistics
   */
  async getAuditLogStats(
    tenant_id: string,
    start_date?: Date,
    end_date?: Date
  ): Promise<AuditLogStats> {
    const conditions = ['tenant_id = $1'];
    const values: any[] = [tenant_id];
    let paramCount = 2;

    if (start_date) {
      conditions.push(`created_at >= $${paramCount++}`);
      values.push(start_date);
    }

    if (end_date) {
      conditions.push(`created_at <= $${paramCount++}`);
      values.push(end_date);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get aggregated statistics
    const result = await this.db.query(
      `SELECT
        COUNT(*) as total_logs,
        COUNT(*) FILTER (WHERE is_pii_access = true) as pii_access_count,
        COUNT(*) FILTER (WHERE is_payment_access = true) as payment_access_count,
        COUNT(*) FILTER (WHERE requires_review = true) as requires_review_count,
        COUNT(*) FILTER (WHERE is_suspicious = true) as suspicious_count,
        jsonb_object_agg(log_type, log_type_count) FILTER (WHERE log_type IS NOT NULL) as by_type,
        jsonb_object_agg(severity, severity_count) FILTER (WHERE severity IS NOT NULL) as by_severity
      FROM (
        SELECT
          log_type,
          severity,
          is_pii_access,
          is_payment_access,
          requires_review,
          is_suspicious,
          COUNT(*) as log_type_count,
          COUNT(*) as severity_count
        FROM audit_logs
        ${whereClause}
        GROUP BY log_type, severity, is_pii_access, is_payment_access, requires_review, is_suspicious
      ) sub`,
      values
    );

    const row = result.rows[0];

    return {
      total_logs: parseInt(row.total_logs, 10),
      by_type: row.by_type || {},
      by_severity: row.by_severity || {},
      pii_access_count: parseInt(row.pii_access_count, 10),
      payment_access_count: parseInt(row.payment_access_count, 10),
      requires_review_count: parseInt(row.requires_review_count, 10),
      suspicious_count: parseInt(row.suspicious_count, 10)
    };
  }

  /**
   * Get logs that require review
   */
  async getLogsRequiringReview(
    tenant_id: string,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    const result = await this.db.query<AuditLogEntry>(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1 AND requires_review = true
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenant_id, limit]
    );

    return result.rows;
  }

  /**
   * Get suspicious activity logs
   */
  async getSuspiciousActivity(
    tenant_id: string,
    limit: number = 50
  ): Promise<AuditLogEntry[]> {
    const result = await this.db.query<AuditLogEntry>(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1 AND is_suspicious = true
       ORDER BY created_at DESC
       LIMIT $2`,
      [tenant_id, limit]
    );

    return result.rows;
  }

  /**
   * Get audit logs for a specific user
   */
  async getUserAuditLogs(
    tenant_id: string,
    user_id: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM audit_logs
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenant_id, user_id]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const logsResult = await this.db.query<AuditLogEntry>(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenant_id, user_id, limit, offset]
    );

    return {
      logs: logsResult.rows,
      total
    };
  }

  /**
   * Get audit logs for a specific resource
   */
  async getResourceAuditLogs(
    tenant_id: string,
    resource_type: string,
    resource_id: string,
    limit: number = 100
  ): Promise<AuditLogEntry[]> {
    const result = await this.db.query<AuditLogEntry>(
      `SELECT * FROM audit_logs
       WHERE tenant_id = $1 
         AND resource_type = $2 
         AND resource_id = $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [tenant_id, resource_type, resource_id, limit]
    );

    return result.rows;
  }

  /**
   * Clean up expired audit logs (automated job)
   */
  async cleanupExpiredLogs(): Promise<number> {
    try {
      const result = await this.db.query(
        `DELETE FROM audit_logs
         WHERE expires_at IS NOT NULL 
           AND expires_at < NOW()
         RETURNING id`
      );

      const deletedCount = result.rowCount || 0;

      logger.info('Cleaned up expired audit logs', {
        deleted_count: deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired audit logs', { error });
      throw error;
    }
  }

  /**
   * Helper: Log admin action
   */
  async logAdminAction(params: {
    tenant_id: string;
    user_id: string;
    username: string;
    user_role: string;
    action: string;
    description?: string;
    resource_type?: string;
    resource_id?: string;
    before_state?: Record<string, any>;
    after_state?: Record<string, any>;
    ip_address?: string;
    user_agent?: string;
    request_id?: string;
    session_id?: string;
  }): Promise<AuditLogEntry> {
    return this.createAuditLog({
      ...params,
      log_type: 'ADMIN_ACTION',
      severity: 'INFO'
    });
  }

  /**
   * Helper: Log data access
   */
  async logDataAccess(params: {
    tenant_id: string;
    user_id: string;
    username: string;
    user_role: string;
    action: string;
    resource_type: string;
    resource_id?: string;
    is_pii_access?: boolean;
    is_payment_access?: boolean;
    ip_address: string;
    user_agent?: string;
    request_id?: string;
    session_id?: string;
  }): Promise<AuditLogEntry> {
    return this.createAuditLog({
      ...params,
      log_type: 'DATA_ACCESS',
      severity: 'INFO'
    });
  }

  /**
   * Helper: Log security event
   */
  async logSecurityEvent(params: {
    tenant_id: string;
    action: string;
    description: string;
    severity?: AuditLogSeverity;
    user_id?: string;
    ip_address?: string;
    metadata?: Record<string, any>;
    is_suspicious?: boolean;
  }): Promise<AuditLogEntry> {
    return this.createAuditLog({
      ...params,
      log_type: 'SECURITY_EVENT',
      severity: params.severity || 'WARNING',
      is_suspicious: params.is_suspicious || true
    });
  }

  /**
   * Helper: Log payment access
   */
  async logPaymentAccess(params: {
    tenant_id: string;
    user_id: string;
    username: string;
    user_role: string;
    action: string;
    resource_id: string;
    ip_address: string;
    request_id?: string;
    session_id?: string;
  }): Promise<AuditLogEntry> {
    return this.createAuditLog({
      ...params,
      log_type: 'PAYMENT_ACCESS',
      resource_type: 'ORDER',
      severity: 'INFO',
      is_payment_access: true
    });
  }
}
