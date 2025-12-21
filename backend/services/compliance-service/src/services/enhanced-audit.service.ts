import { db } from './database.service';
import { logger } from '../utils/logger';

/**
 * ENHANCED AUDIT TRAIL SERVICE
 * 
 * Comprehensive audit logging for compliance operations
 * Phase 6: Advanced Compliance Features
 */

export interface AuditEntry {
  id: string;
  tenantId: string;
  venueId?: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  changes?: Record<string, any>;
  metadata: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export class EnhancedAuditService {
  /**
   * Log audit event
   */
  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    await db.query(
      `INSERT INTO compliance_audit_log (
        tenant_id, venue_id, user_id, action, resource, resource_id,
        changes, metadata, ip_address, user_agent, severity, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        entry.tenantId,
        entry.venueId,
        entry.userId,
        entry.action,
        entry.resource,
        entry.resourceId,
        JSON.stringify(entry.changes || {}),
        JSON.stringify(entry.metadata),
        entry.ipAddress,
        entry.userAgent,
        entry.severity,
      ]
    );

    logger.info({ entry }, `Audit log: ${entry.action} on ${entry.resource}`);
  }

  /**
   * Get audit trail for resource
   */
  async getAuditTrail(
    resourceType: string,
    resourceId: string,
    tenantId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<AuditEntry[]> {
    const limit = options.limit || 100;
    const offset = options.offset || 0;

    const result = await db.query(
      `SELECT * FROM compliance_audit_log
       WHERE resource = $1 AND resource_id = $2 AND tenant_id = $3
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [resourceType, resourceId, tenantId, limit, offset]
    );

    return result.rows.map(row => this.mapRowToAuditEntry(row));
  }

  /**
   * Get security events
   */
  async getSecurityEvents(
    tenantId: string,
    severity: AuditEntry['severity'][],
    options: { limit?: number; since?: Date } = {}
  ): Promise<AuditEntry[]> {
    const limit = options.limit || 100;
    const since = options.since || new Date(Date.now() - 24 * 60 * 60 * 1000);

    const result = await db.query(
      `SELECT * FROM compliance_audit_log
       WHERE tenant_id = $1 
         AND severity = ANY($2)
         AND created_at >= $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [tenantId, severity, since, limit]
    );

    return result.rows.map(row => this.mapRowToAuditEntry(row));
  }

  /**
   * Search audit logs
   */
  async searchAuditLogs(
    tenantId: string,
    filters: {
      action?: string;
      resource?: string;
      userId?: string;
      venueId?: string;
      startDate?: Date;
      endDate?: Date;
    },
    options: { limit?: number; offset?: number } = {}
  ): Promise<{ entries: AuditEntry[]; total: number }> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters.resource) {
      conditions.push(`resource = $${paramIndex++}`);
      params.push(filters.resource);
    }

    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filters.userId);
    }

    if (filters.venueId) {
      conditions.push(`venue_id = $${paramIndex++}`);
      params.push(filters.venueId);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.query(
      `SELECT COUNT(*) as total FROM compliance_audit_log WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total);

    // Get entries
    const limit = options.limit || 100;
    const offset = options.offset || 0;
    params.push(limit, offset);

    const result = await db.query(
      `SELECT * FROM compliance_audit_log 
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    return {
      entries: result.rows.map(row => this.mapRowToAuditEntry(row)),
      total,
    };
  }

  /**
   * Generate audit report
   */
  async generateAuditReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    summary: any;
    topActions: Array<{ action: string; count: number }>;
    topUsers: Array<{ userId: string; count: number }>;
    securityEvents: number;
  }> {
    // Summary stats
    const summaryResult = await db.query(
      `SELECT 
        COUNT(*) as total_events,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT venue_id) as unique_venues,
        COUNT(*) FILTER (WHERE severity IN ('high', 'critical')) as high_severity_events
       FROM compliance_audit_log
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
      [tenantId, startDate, endDate]
    );

    // Top actions
    const actionsResult = await db.query(
      `SELECT action, COUNT(*) as count
       FROM compliance_audit_log
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
       GROUP BY action
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId, startDate, endDate]
    );

    // Top users
    const usersResult = await db.query(
      `SELECT user_id, COUNT(*) as count
       FROM compliance_audit_log
       WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3 AND user_id IS NOT NULL
       GROUP BY user_id
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId, startDate, endDate]
    );

    return {
      summary: summaryResult.rows[0],
      topActions: actionsResult.rows.map(r => ({
        action: r.action,
        count: parseInt(r.count),
      })),
      topUsers: usersResult.rows.map(r => ({
        userId: r.user_id,
        count: parseInt(r.count),
      })),
      securityEvents: parseInt(summaryResult.rows[0].high_severity_events),
    };
  }

  /**
   * Map database row to AuditEntry
   */
  private mapRowToAuditEntry(row: any): AuditEntry {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      venueId: row.venue_id,
      userId: row.user_id,
      action: row.action,
      resource: row.resource,
      resourceId: row.resource_id,
      changes: JSON.parse(row.changes || '{}'),
      metadata: JSON.parse(row.metadata || '{}'),
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      timestamp: row.created_at,
      severity: row.severity,
    };
  }
}

export const enhancedAudit = new EnhancedAuditService();
