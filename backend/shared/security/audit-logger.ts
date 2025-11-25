import { Pool } from 'pg';
// import winston from 'winston';

// SECURITY: Require DATABASE_URL environment variable - no fallback to hardcoded credentials
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL environment variable is required for audit logging. ' +
      'This is a critical security requirement and cannot use a default value.'
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Connection pool configuration
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
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
          entry.timestamp || new Date(),
        ]
      );
    } catch (error) {
      console.error('Failed to write audit log:', error);
      // Re-throw to signal audit failure - critical for compliance
      throw error;
    }
  }

  // Graceful shutdown
  static async close() {
    await pool.end();
  }
}
