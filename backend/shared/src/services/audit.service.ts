import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export interface AuditLog {
  id?: string;
  service: string;
  action: string;
  actionType: 'CREATE' | 'UPDATE' | 'DELETE' | 'ACCESS' | 'CONFIG';
  userId: string;
  userRole?: string;
  resourceType: string;
  resourceId?: string;
  previousValue?: any;
  newValue?: any;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  created_at?: Date;
  success: boolean;
  errorMessage?: string;
}

export class AuditService {
  private static instance: AuditService;
  private pool: Pool;

  constructor(databaseUrl?: string) {
    this.pool = new Pool({
      connectionString: databaseUrl || process.env.DATABASE_URL,
    });
    // Table initialization is now handled by migration:
    // database/postgresql/migrations/shared/001_create_canonical_audit_logs.sql
    // this.initializeTable(); // REMOVED - use migration instead
  }

  static getInstance(databaseUrl?: string): AuditService {
    if (!this.instance) {
      this.instance = new AuditService(databaseUrl);
    }
    return this.instance;
  }

  private async initializeTable(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          service VARCHAR(100) NOT NULL,
          action VARCHAR(200) NOT NULL,
          action_type VARCHAR(50) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          user_role VARCHAR(100),
          resource_type VARCHAR(100) NOT NULL,
          resource_id VARCHAR(255),
          previous_value JSONB,
          new_value JSONB,
          metadata JSONB,
          ip_address INET,
          user_agent TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          success BOOLEAN NOT NULL DEFAULT true,
          error_message TEXT
        );

        -- Create indexes separately (PostgreSQL syntax)
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_logs (resource_type, resource_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs (action, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_service ON audit_logs (service, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at DESC);
      `);
    } catch (error) {
      // Table might already exist with proper structure
      console.error('Audit table initialization:', error);
    }
  }

  async logAction(audit: AuditLog): Promise<void> {
    try {
      const query = `
        INSERT INTO audit_logs (
          id, service, action, action_type, user_id, user_role,
          resource_type, resource_id, previous_value, new_value,
          metadata, ip_address, user_agent, created_at, success, error_message
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )
      `;

      const values = [
        audit.id || uuidv4(),
        audit.service,
        audit.action,
        audit.actionType,
        audit.userId,
        audit.userRole || null,
        audit.resourceType,
        audit.resourceId || null,
        audit.previousValue ? JSON.stringify(audit.previousValue) : null,
        audit.newValue ? JSON.stringify(audit.newValue) : null,
        audit.metadata ? JSON.stringify(audit.metadata) : null,
        audit.ipAddress || null,
        audit.userAgent || null,
        audit.created_at || new Date(),
        audit.success,
        audit.errorMessage || null,
      ];

      await this.pool.query(query, values);
    } catch (error) {
      // Don't throw - audit failures shouldn't break the main operation
      console.error('Failed to write audit log:', error, audit);
    }
  }

  async logAdminAction(
    service: string,
    action: string,
    userId: string,
    resourceType: string,
    details: Partial<AuditLog> = {}
  ): Promise<void> {
    await this.logAction({
      service,
      action,
      actionType: details.actionType || 'UPDATE',
      userId,
      resourceType,
      success: true,
      ...details,
    });
  }

  async getAuditLogs(filters: {
    service?: string;
    userId?: string;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AuditLog[]> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const values: any[] = [];
    let paramCount = 0;

    if (filters.service) {
      query += ` AND service = $${++paramCount}`;
      values.push(filters.service);
    }

    if (filters.userId) {
      query += ` AND user_id = $${++paramCount}`;
      values.push(filters.userId);
    }

    if (filters.resourceType) {
      query += ` AND resource_type = $${++paramCount}`;
      values.push(filters.resourceType);
    }

    if (filters.resourceId) {
      query += ` AND resource_id = $${++paramCount}`;
      values.push(filters.resourceId);
    }

    if (filters.action) {
      query += ` AND action ILIKE $${++paramCount}`;
      values.push(`%${filters.action}%`);
    }

    if (filters.startDate) {
      query += ` AND created_at >= $${++paramCount}`;
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      query += ` AND created_at <= $${++paramCount}`;
      values.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
      query += ` LIMIT $${++paramCount}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${++paramCount}`;
      values.push(filters.offset);
    }

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async getUserActivity(userId: string, days: number = 30): Promise<AuditLog[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.getAuditLogs({
      userId,
      startDate,
      limit: 100,
    });
  }

  async getResourceHistory(resourceType: string, resourceId: string): Promise<AuditLog[]> {
    return this.getAuditLogs({
      resourceType,
      resourceId,
      limit: 100,
    });
  }

  // Compliance and reporting methods
  async generateComplianceReport(startDate: Date, endDate: Date): Promise<any> {
    const query = `
      SELECT
        service,
        action_type,
        COUNT(*) as count,
        COUNT(DISTINCT user_id) as unique_users,
        SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failures
      FROM audit_logs
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY service, action_type
      ORDER BY count DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    return result.rows;
  }

  async detectSuspiciousActivity(): Promise<any[]> {
    const query = `
      WITH user_activity AS (
        SELECT
          user_id,
          COUNT(*) as action_count,
          COUNT(DISTINCT action) as unique_actions,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END) as failures
        FROM audit_logs
        WHERE created_at > NOW() - INTERVAL '1 hour'
        GROUP BY user_id
      )
      SELECT *
      FROM user_activity
      WHERE action_count > 100
        OR failures > 10
        OR (failures::float / action_count::float) > 0.5
    `;

    const result = await this.pool.query(query);
    return result.rows;
  }

  async cleanup(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.pool.query('DELETE FROM audit_logs WHERE created_at < $1', [
      cutoffDate,
    ]);

    return result.rowCount || 0;
  }
}

// Export singleton instance
export const auditService = AuditService.getInstance();

// Middleware helper for Express
export function auditMiddleware(service: string) {
  return async (req: any, res: any, next: any) => {
    const startTime = Date.now();
    const originalSend = res.send;
    const originalJson = res.json;
    let responseData: any;

    // Capture response
    res.send = function (data: any) {
      responseData = data;
      return originalSend.call(this, data);
    };

    res.json = function (data: any) {
      responseData = data;
      return originalJson.call(this, data);
    };

    res.on('finish', async () => {
      // Only audit admin and modification endpoints
      const shouldAudit =
        req.path.includes('/admin') ||
        req.method === 'POST' ||
        req.method === 'PUT' ||
        req.method === 'PATCH' ||
        req.method === 'DELETE';

      if (shouldAudit && req.user) {
        const duration = Date.now() - startTime;

        await auditService.logAction({
          service,
          action: `${req.method} ${req.path}`,
          actionType:
            req.method === 'DELETE'
              ? 'DELETE'
              : req.method === 'POST'
                ? 'CREATE'
                : req.method === 'GET'
                  ? 'ACCESS'
                  : 'UPDATE',
          userId: req.user.id || req.user.sub || 'unknown',
          userRole: req.user.role,
          resourceType: req.path.split('/')[1] || 'unknown',
          resourceId: req.params.id,
          newValue: req.body,
          metadata: {
            duration,
            statusCode: res.statusCode,
            query: req.query,
            params: req.params,
          },
          ipAddress: req.ip || req.connection?.remoteAddress,
          userAgent: req.headers['user-agent'],
          success: res.statusCode < 400,
          errorMessage: res.statusCode >= 400 ? responseData : undefined,
        });
      }
    });

    next();
  };
}
