import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';

export enum AlertSeverity {
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export enum AlertType {
  JOB_FAILURE = 'JOB_FAILURE',
  CONSECUTIVE_FAILURES = 'CONSECUTIVE_FAILURES',
  SLOW_EXECUTION = 'SLOW_EXECUTION',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
  JOB_STALE = 'JOB_STALE'
}

export interface JobAlert {
  id: string;
  jobName: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  metadata: Record<string, any>;
  createdAt: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
}

/**
 * Job Alerting Service
 * Manages alerts for job failures and performance issues
 */
export class JobAlertingService {
  private readonly CONSECUTIVE_FAILURE_THRESHOLD = 3;
  private readonly SLOW_EXECUTION_THRESHOLD = 0.8; // 80% of timeout

  /**
   * Alert on job failure
   */
  async alertJobFailure(
    jobName: string,
    errorMessage: string,
    consecutiveFailures: number
  ): Promise<void> {
    try {
      const severity = consecutiveFailures >= this.CONSECUTIVE_FAILURE_THRESHOLD 
        ? AlertSeverity.CRITICAL 
        : AlertSeverity.ERROR;

      const alertType = consecutiveFailures >= this.CONSECUTIVE_FAILURE_THRESHOLD
        ? AlertType.CONSECUTIVE_FAILURES
        : AlertType.JOB_FAILURE;

      await this.createAlert({
        jobName,
        alertType,
        severity,
        message: `Job failed: ${errorMessage}`,
        metadata: {
          errorMessage,
          consecutiveFailures,
        },
      });

      // Log critical failures
      if (severity === AlertSeverity.CRITICAL) {
        logger.error('CRITICAL: Job has consecutive failures', {
          jobName,
          consecutiveFailures,
          errorMessage,
        });
      }
    } catch (error) {
      logger.error('Failed to create job failure alert', { error, jobName });
    }
  }

  /**
   * Alert on slow execution
   */
  async alertSlowExecution(
    jobName: string,
    duration: number,
    timeout: number
  ): Promise<void> {
    try {
      await this.createAlert({
        jobName,
        alertType: AlertType.SLOW_EXECUTION,
        severity: AlertSeverity.WARNING,
        message: `Job execution slow: ${duration}ms (timeout: ${timeout}ms)`,
        metadata: {
          duration,
          timeout,
          percentage: Math.round((duration / timeout) * 100),
        },
      });

      logger.warn('Job execution slow', {
        jobName,
        duration: `${duration}ms`,
        timeout: `${timeout}ms`,
      });
    } catch (error) {
      logger.error('Failed to create slow execution alert', { error, jobName });
    }
  }

  /**
   * Alert on circuit breaker open
   */
  async alertCircuitOpen(jobName: string): Promise<void> {
    try {
      await this.createAlert({
        jobName,
        alertType: AlertType.CIRCUIT_OPEN,
        severity: AlertSeverity.ERROR,
        message: 'Job circuit breaker opened due to repeated failures',
        metadata: {},
      });

      logger.error('Job circuit breaker opened', { jobName });
    } catch (error) {
      logger.error('Failed to create circuit open alert', { error, jobName });
    }
  }

  /**
   * Alert on stale job (hasn't run in expected window)
   */
  async alertStaleJob(
    jobName: string,
    lastExecutionAt: Date,
    expectedIntervalSeconds: number
  ): Promise<void> {
    try {
      const staleDuration = Date.now() - lastExecutionAt.getTime();

      await this.createAlert({
        jobName,
        alertType: AlertType.JOB_STALE,
        severity: AlertSeverity.WARNING,
        message: `Job hasn't run in ${Math.round(staleDuration / 1000)}s (expected: ${expectedIntervalSeconds}s)`,
        metadata: {
          lastExecutionAt,
          staleDurationSeconds: Math.round(staleDuration / 1000),
          expectedIntervalSeconds,
        },
      });

      logger.warn('Job is stale', {
        jobName,
        lastExecutionAt,
        staleDurationSeconds: Math.round(staleDuration / 1000),
      });
    } catch (error) {
      logger.error('Failed to create stale job alert', { error, jobName });
    }
  }

  /**
   * Create an alert in the database
   */
  private async createAlert(params: {
    jobName: string;
    alertType: AlertType;
    severity: AlertSeverity;
    message: string;
    metadata: Record<string, any>;
  }): Promise<string> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `
        INSERT INTO job_alerts (
          job_name, alert_type, severity, message, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
        RETURNING id
        `,
        [
          params.jobName,
          params.alertType,
          params.severity,
          params.message,
          JSON.stringify(params.metadata),
        ]
      );

      return result.rows[0].id;
    } catch (error) {
      // If table doesn't exist, just log the alert
      logger.warn('Job alerts table not ready, logging alert only', {
        ...params,
        error: error instanceof Error ? error.message : error,
      });
      return 'logged-only';
    }
  }

  /**
   * Get recent alerts for a job
   */
  async getAlerts(jobName: string, limit: number = 50): Promise<JobAlert[]> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `
        SELECT 
          id, job_name, alert_type, severity, message, metadata,
          created_at, acknowledged, acknowledged_at, acknowledged_by
        FROM job_alerts
        WHERE job_name = $1
        ORDER BY created_at DESC
        LIMIT $2
        `,
        [jobName, limit]
      );

      return result.rows.map(row => ({
        id: row.id,
        jobName: row.job_name,
        alertType: row.alert_type,
        severity: row.severity,
        message: row.message,
        metadata: row.metadata,
        createdAt: row.created_at,
        acknowledged: row.acknowledged,
        acknowledgedAt: row.acknowledged_at,
        acknowledgedBy: row.acknowledged_by,
      }));
    } catch (error) {
      logger.error('Failed to get job alerts', { error, jobName });
      return [];
    }
  }

  /**
   * Get all unacknowledged alerts
   */
  async getUnacknowledgedAlerts(): Promise<JobAlert[]> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `
        SELECT 
          id, job_name, alert_type, severity, message, metadata,
          created_at, acknowledged, acknowledged_at, acknowledged_by
        FROM job_alerts
        WHERE acknowledged = false
        ORDER BY severity DESC, created_at DESC
        LIMIT 100
        `
      );

      return result.rows.map(row => ({
        id: row.id,
        jobName: row.job_name,
        alertType: row.alert_type,
        severity: row.severity,
        message: row.message,
        metadata: row.metadata,
        createdAt: row.created_at,
        acknowledged: row.acknowledged,
        acknowledgedAt: row.acknowledged_at,
        acknowledgedBy: row.acknowledged_by,
      }));
    } catch (error) {
      logger.error('Failed to get unacknowledged alerts', { error });
      return [];
    }
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    const db = getDatabase();

    try {
      await db.query(
        `
        UPDATE job_alerts
        SET acknowledged = true,
            acknowledged_at = NOW(),
            acknowledged_by = $2
        WHERE id = $1
        `,
        [alertId, acknowledgedBy]
      );

      logger.info('Job alert acknowledged', { alertId, acknowledgedBy });
    } catch (error) {
      logger.error('Failed to acknowledge alert', { error, alertId });
      throw error;
    }
  }

  /**
   * Clean up old alerts (retention: 30 days)
   */
  async cleanupOldAlerts(retentionDays: number = 30): Promise<number> {
    const db = getDatabase();

    try {
      const result = await db.query(
        `
        DELETE FROM job_alerts
        WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
        `
      );

      const deleted = result.rowCount || 0;
      
      if (deleted > 0) {
        logger.info('Cleaned up old job alerts', { deleted, retentionDays });
      }

      return deleted;
    } catch (error) {
      logger.error('Failed to cleanup old alerts', { error });
      return 0;
    }
  }
}

export const jobAlertingService = new JobAlertingService();
