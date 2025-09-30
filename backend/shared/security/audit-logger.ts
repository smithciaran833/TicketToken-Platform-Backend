import { Pool } from 'pg';
import winston from 'winston';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL ||
    'postgresql://tickettoken:4cVXNcP3zWIEmy8Ey1DfvWHYI@localhost:5432/tickettoken_db'
});

interface AuditEntry {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: any;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
}

export class AuditLogger {
  static async log(entry: AuditEntry) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (user_id, action, resource, resource_id, metadata, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          entry.userId,
          entry.action,
          entry.resource,
          entry.resourceId,
          JSON.stringify(entry.metadata || {}),
          entry.ipAddress,
          entry.userAgent,
          entry.timestamp || new Date()
        ]
      );
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
}
