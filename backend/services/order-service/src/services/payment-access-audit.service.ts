/**
 * Payment Access Audit Service
 * 
 * PCI-DSS Requirement: Log and monitor all access to payment data
 * 7-year retention requirement for compliance
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';

export type PaymentAccessAction =
  | 'VIEW_PAYMENT_DATA'
  | 'VIEW_PAYMENT_METHOD'
  | 'CREATE_PAYMENT_METHOD'
  | 'UPDATE_PAYMENT_METHOD'
  | 'DELETE_PAYMENT_METHOD'
  | 'PROCESS_REFUND'
  | 'VIEW_REFUND'
  | 'MANUAL_DISCOUNT'
  | 'ADMIN_OVERRIDE'
  | 'VIEW_FINANCIAL_REPORT'
  | 'EXPORT_PAYMENT_DATA';

export interface PaymentAccessAuditLog {
  id: string;
  tenantId: string;
  userId: string;
  action: PaymentAccessAction;
  resourceType: string;
  resourceId?: string;
  ipAddress: string;
  userAgent?: string;
  requestPath: string;
  requestMethod: string;
  responseStatus?: number;
  mfaVerified: boolean;
  success: boolean;
  errorMessage?: string;
  metadata?: Record<string, any>;
  accessedAt: Date;
}

export class PaymentAccessAuditService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Log payment access attempt
   */
  async logAccess(params: {
    tenantId: string;
    userId: string;
    action: PaymentAccessAction;
    resourceType: string;
    resourceId?: string;
    ipAddress: string;
    userAgent?: string;
    requestPath: string;
    requestMethod: string;
    responseStatus?: number;
    mfaVerified?: boolean;
    success: boolean;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO payment_access_audit_log 
         (tenant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, 
          request_path, request_method, response_status, mfa_verified, success, error_message, metadata, accessed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
        [
          params.tenantId,
          params.userId,
          params.action,
          params.resourceType,
          params.resourceId || null,
          params.ipAddress,
          params.userAgent || null,
          params.requestPath,
          params.requestMethod,
          params.responseStatus || null,
          params.mfaVerified || false,
          params.success,
          params.errorMessage || null,
          params.metadata ? JSON.stringify(params.metadata) : null,
        ]
      );

      logger.info('Payment access logged', {
        action: params.action,
        userId: params.userId,
        success: params.success,
      });
    } catch (error) {
      // Critical: Payment access logging should never fail silently
      logger.error('Failed to log payment access', { error, params });
      // Don't throw - we don't want logging failures to break the application
    }
  }

  /**
   * Get audit logs for a user
   */
  async getUserAuditLogs(
    userId: string,
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
      action?: PaymentAccessAction;
    } = {}
  ): Promise<PaymentAccessAuditLog[]> {
    try {
      const { limit = 100, offset = 0, startDate, endDate, action } = options;

      let query = `
        SELECT id, tenant_id, user_id, action, resource_type, resource_id,
               ip_address, user_agent, request_path, request_method, response_status,
               mfa_verified, success, error_message, metadata, accessed_at
        FROM payment_access_audit_log
        WHERE tenant_id = $1 AND user_id = $2
      `;
      const params: any[] = [tenantId, userId];
      let paramIndex = 3;

      if (startDate) {
        query += ` AND accessed_at >= $${paramIndex}`;
        params.push(startDate);
        paramIndex++;
      }

      if (endDate) {
        query += ` AND accessed_at <= $${paramIndex}`;
        params.push(endDate);
        paramIndex++;
      }

      if (action) {
        query += ` AND action = $${paramIndex}`;
        params.push(action);
        paramIndex++;
      }

      query += ` ORDER BY accessed_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const result = await this.pool.query(query, params);

      return result.rows.map(row => this.mapToAuditLog(row));
    } catch (error) {
      logger.error('Failed to get user audit logs', { error, userId });
      return [];
    }
  }

  /**
   * Get failed access attempts
   */
  async getFailedAccessAttempts(
    tenantId: string,
    options: {
      limit?: number;
      hours?: number;
      userId?: string;
    } = {}
  ): Promise<PaymentAccessAuditLog[]> {
    try {
      const { limit = 100, hours = 24, userId } = options;

      let query = `
        SELECT id, tenant_id, user_id, action, resource_type, resource_id,
               ip_address, user_agent, request_path, request_method, response_status,
               mfa_verified, success, error_message, metadata, accessed_at
        FROM payment_access_audit_log
        WHERE tenant_id = $1 
        AND success = FALSE
        AND accessed_at > NOW() - INTERVAL '${hours} hours'
      `;
      const params: any[] = [tenantId];

      if (userId) {
        query += ` AND user_id = $2`;
        params.push(userId);
      }

      query += ` ORDER BY accessed_at DESC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await this.pool.query(query, params);

      return result.rows.map(row => this.mapToAuditLog(row));
    } catch (error) {
      logger.error('Failed to get failed access attempts', { error });
      return [];
    }
  }

  /**
   * Get access statistics for a user
   */
  async getUserAccessStats(userId: string, tenantId: string, days: number = 30): Promise<{
    totalAccess: number;
    successfulAccess: number;
    failedAccess: number;
    actionBreakdown: Record<string, number>;
    recentIPs: string[];
  }> {
    try {
      // Total and success/failure counts
      const countResult = await this.pool.query(
        `SELECT 
           COUNT(*) as total_access,
           SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_access,
           SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_access
         FROM payment_access_audit_log
         WHERE tenant_id = $1 AND user_id = $2
         AND accessed_at > NOW() - INTERVAL '${days} days'`,
        [tenantId, userId]
      );

      // Action breakdown
      const actionResult = await this.pool.query(
        `SELECT action, COUNT(*) as count
         FROM payment_access_audit_log
         WHERE tenant_id = $1 AND user_id = $2
         AND accessed_at > NOW() - INTERVAL '${days} days'
         GROUP BY action
         ORDER BY count DESC`,
        [tenantId, userId]
      );

      // Recent IPs
      const ipResult = await this.pool.query(
        `SELECT DISTINCT ip_address
         FROM payment_access_audit_log
         WHERE tenant_id = $1 AND user_id = $2
         AND accessed_at > NOW() - INTERVAL '${days} days'
         ORDER BY MAX(accessed_at) DESC
         LIMIT 10`,
        [tenantId, userId]
      );

      const actionBreakdown: Record<string, number> = {};
      actionResult.rows.forEach(row => {
        actionBreakdown[row.action] = parseInt(row.count);
      });

      return {
        totalAccess: parseInt(countResult.rows[0]?.total_access || '0'),
        successfulAccess: parseInt(countResult.rows[0]?.successful_access || '0'),
        failedAccess: parseInt(countResult.rows[0]?.failed_access || '0'),
        actionBreakdown,
        recentIPs: ipResult.rows.map(row => row.ip_address),
      };
    } catch (error) {
      logger.error('Failed to get user access stats', { error, userId });
      return {
        totalAccess: 0,
        successfulAccess: 0,
        failedAccess: 0,
        actionBreakdown: {},
        recentIPs: [],
      };
    }
  }

  /**
   * Cleanup old audit logs (retention policy)
   * PCI-DSS requires 7 years minimum
   */
  async cleanupOldLogs(retentionYears: number = 7): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM payment_access_audit_log
         WHERE accessed_at < NOW() - INTERVAL '${retentionYears} years'`
      );

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        logger.info('Cleaned up old payment access logs', { deletedCount, retentionYears });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old logs', { error });
      return 0;
    }
  }

  /**
   * Map database row to AuditLog object
   */
  private mapToAuditLog(row: any): PaymentAccessAuditLog {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      requestPath: row.request_path,
      requestMethod: row.request_method,
      responseStatus: row.response_status,
      mfaVerified: row.mfa_verified,
      success: row.success,
      errorMessage: row.error_message,
      metadata: row.metadata,
      accessedAt: row.accessed_at,
    };
  }
}
