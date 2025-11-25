/**
 * Audit Log Cleanup Job
 * 
 * Automatically removes expired audit logs based on retention policies.
 * Compliance logs are retained for 7 years, operational logs for shorter periods.
 */

import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { AuditLogService } from '../services/audit-log.service';

export class AuditLogCleanupJob {
  private intervalId?: NodeJS.Timeout;
  
  constructor(
    private db: Pool,
    private auditLogService: AuditLogService,
    private intervalMs: number = 24 * 60 * 60 * 1000 // Daily by default
  ) {}

  /**
   * Start the cleanup job
   */
  async start(): Promise<void> {
    logger.info('Starting audit log cleanup job', {
      interval_ms: this.intervalMs,
      interval_hours: this.intervalMs / (60 * 60 * 1000)
    });

    // Run immediately on start
    await this.execute();

    // Schedule recurring execution
    this.intervalId = setInterval(async () => {
      try {
        await this.execute();
      } catch (error) {
        logger.error('Audit log cleanup job failed', { error });
      }
    }, this.intervalMs);
  }

  /**
   * Stop the cleanup job
   */
  async stop(): Promise<void> {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
      logger.info('Audit log cleanup job stopped');
    }
  }

  /**
   * Execute the cleanup
   */
  async execute(): Promise<void> {
    const startTime = Date.now();
    
    logger.info('Executing audit log cleanup job');

    try {
      // Clean up expired logs using the service method
      const deletedCount = await this.auditLogService.cleanupExpiredLogs();
      
      const duration = Date.now() - startTime;
      
      logger.info('Audit log cleanup job completed', {
        deleted_count: deletedCount,
        duration_ms: duration
      });

      // Record metrics
      await this.recordMetrics(deletedCount, duration, 'success');
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Audit log cleanup job failed', {
        error,
        duration_ms: duration
      });

      await this.recordMetrics(0, duration, 'failed');
      throw error;
    }
  }

  /**
   * Record job execution metrics
   */
  private async recordMetrics(
    deletedCount: number,
    durationMs: number,
    status: 'success' | 'failed'
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO job_execution_history (
          job_name, started_at, completed_at, duration_ms, status, result_data
        ) VALUES ($1, NOW() - INTERVAL '1 millisecond' * $2, NOW(), $3, $4, $5)`,
        [
          'audit-log-cleanup',
          durationMs,
          durationMs,
          status,
          JSON.stringify({
            deleted_count: deletedCount,
            timestamp: new Date().toISOString()
          })
        ]
      );
    } catch (error) {
      logger.error('Failed to record audit log cleanup metrics', { error });
      // Don't throw - metrics failure shouldn't break the job
    }
  }

  /**
   * Get cleanup statistics
   */
  async getStatistics(tenantId?: string): Promise<{
    total_logs: number;
    expired_logs: number;
    by_type: Record<string, number>;
    oldest_log_date: Date | null;
  }> {
    const conditions = tenantId ? 'WHERE tenant_id = $1' : '';
    const params = tenantId ? [tenantId] : [];

    const result = await this.db.query(
      `SELECT
        COUNT(*) as total_logs,
        COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW()) as expired_logs,
        MIN(created_at) as oldest_log_date
      FROM audit_logs
      ${conditions}`,
      params
    );

    const typeResult = await this.db.query(
      `SELECT log_type, COUNT(*) as count
       FROM audit_logs
       ${conditions}
       GROUP BY log_type`,
      params
    );

    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.log_type] = parseInt(row.count, 10);
    }

    return {
      total_logs: parseInt(result.rows[0].total_logs, 10),
      expired_logs: parseInt(result.rows[0].expired_logs, 10),
      by_type: byType,
      oldest_log_date: result.rows[0].oldest_log_date
    };
  }
}
