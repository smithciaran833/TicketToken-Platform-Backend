/**
 * Data Access Log Service
 * 
 * Logs all access to sensitive data (PII, payment info, health data) for GDPR/HIPAA compliance.
 * Tracks who accessed what data, when, why, and from where.
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { DataAccessLogEntry } from '../types/audit.types';

export class DataAccessLogService {
  constructor(private db: Pool) {}

  /**
   * Log data access
   */
  async logDataAccess(params: {
    tenant_id: string;
    user_id: string;
    user_role: string;
    access_type: 'READ' | 'WRITE' | 'DELETE' | 'EXPORT' | 'SEARCH';
    resource_type: string;
    resource_id?: string;
    query_params?: Record<string, any>;
    filters_applied?: Record<string, any>;
    records_accessed?: number;
    records_modified?: number;
    accessed_pii: boolean;
    accessed_payment_data: boolean;
    accessed_health_data?: boolean;
    pii_fields?: string[];
    ip_address: string;
    user_agent?: string;
    request_id?: string;
    session_id?: string;
    endpoint?: string;
    method?: string;
    purpose?: string;
    ticket_reference?: string;
    is_automated?: boolean;
    requires_review?: boolean;
    is_suspicious?: boolean;
    suspicious_reason?: string;
  }): Promise<DataAccessLogEntry> {
    try {
      const result = await this.db.query<DataAccessLogEntry>(
        `INSERT INTO data_access_logs (
          tenant_id, user_id, user_role, access_type, resource_type, resource_id,
          query_params, filters_applied, records_accessed, records_modified,
          accessed_pii, accessed_payment_data, accessed_health_data, pii_fields,
          ip_address, user_agent, request_id, session_id, endpoint, method,
          purpose, ticket_reference, is_automated,
          requires_review, is_suspicious, suspicious_reason, accessed_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, NOW()
        ) RETURNING *`,
        [
          params.tenant_id, params.user_id, params.user_role, params.access_type, params.resource_type, params.resource_id,
          params.query_params ? JSON.stringify(params.query_params) : null,
          params.filters_applied ? JSON.stringify(params.filters_applied) : null,
          params.records_accessed || 0, params.records_modified || 0,
          params.accessed_pii, params.accessed_payment_data, params.accessed_health_data || false,
          params.pii_fields ? JSON.stringify(params.pii_fields) : null,
          params.ip_address, params.user_agent, params.request_id, params.session_id, params.endpoint, params.method,
          params.purpose, params.ticket_reference, params.is_automated || false,
          params.requires_review || false, params.is_suspicious || false, params.suspicious_reason
        ]
      );

      logger.info('Data access logged', {
        user_id: params.user_id,
        access_type: params.access_type,
        resource_type: params.resource_type,
        accessed_pii: params.accessed_pii,
        accessed_payment_data: params.accessed_payment_data
      });

      return result.rows[0];
    } catch (error) {
      logger.error('Failed to log data access', { error, params });
      throw error;
    }
  }

  /**
   * Get access logs for a user
   */
  async getUserAccessLogs(
    tenant_id: string,
    user_id: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<{ logs: DataAccessLogEntry[]; total: number }> {
    const countResult = await this.db.query(
      `SELECT COUNT(*) FROM data_access_logs WHERE tenant_id = $1 AND user_id = $2`,
      [tenant_id, user_id]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await this.db.query<DataAccessLogEntry>(
      `SELECT * FROM data_access_logs
       WHERE tenant_id = $1 AND user_id = $2
       ORDER BY accessed_at DESC LIMIT $3 OFFSET $4`,
      [tenant_id, user_id, limit, offset]
    );

    return { logs: result.rows, total };
  }

  /**
   * Get PII access logs
   */
  async getPIIAccessLogs(
    tenant_id: string,
    start_date?: Date,
    end_date?: Date,
    limit: number = 100
  ): Promise<DataAccessLogEntry[]> {
    const conditions = ['tenant_id = $1', 'accessed_pii = true'];
    const values: any[] = [tenant_id];
    let paramCount = 2;

    if (start_date) {
      conditions.push(`accessed_at >= $${paramCount++}`);
      values.push(start_date);
    }
    if (end_date) {
      conditions.push(`accessed_at <= $${paramCount++}`);
      values.push(end_date);
    }

    const result = await this.db.query<DataAccessLogEntry>(
      `SELECT * FROM data_access_logs WHERE ${conditions.join(' AND ')} ORDER BY accessed_at DESC LIMIT $${paramCount++}`,
      [...values, limit]
    );

    return result.rows;
  }

  /**
   * Get suspicious access logs
   */
  async getSuspiciousAccessLogs(
    tenant_id: string,
    limit: number = 50
  ): Promise<DataAccessLogEntry[]> {
    const result = await this.db.query<DataAccessLogEntry>(
      `SELECT * FROM data_access_logs WHERE tenant_id = $1 AND is_suspicious = true ORDER BY accessed_at DESC LIMIT $2`,
      [tenant_id, limit]
    );

    return result.rows;
  }
}
