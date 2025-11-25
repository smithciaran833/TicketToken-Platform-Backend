import { RedisService } from './redis.service';
import { logger } from '../utils/logger';

export interface JobMetrics {
  jobName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  circuitOpenCount: number;
  averageDurationMs: number;
  lastExecutionAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  consecutiveFailures: number;
  successRate: number;
}

export interface JobExecutionRecord {
  success: boolean;
  duration: number;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Job Metrics Service
 * Tracks execution metrics for all background jobs
 */
export class JobMetricsService {
  private readonly METRICS_PREFIX = 'job:metrics:';
  private readonly METRICS_TTL = 86400 * 7; // 7 days

  /**
   * Record a job execution
   */
  async recordExecution(jobName: string, record: JobExecutionRecord): Promise<void> {
    const client = RedisService.getClient();
    const timestamp = Date.now();

    try {
      // Increment total executions
      await client.incr(`${this.METRICS_PREFIX}${jobName}:total`);
      await client.expire(`${this.METRICS_PREFIX}${jobName}:total`, this.METRICS_TTL);

      if (record.success) {
        // Increment success count
        await client.incr(`${this.METRICS_PREFIX}${jobName}:success`);
        await client.expire(`${this.METRICS_PREFIX}${jobName}:success`, this.METRICS_TTL);

        // Reset consecutive failures
        await client.del(`${this.METRICS_PREFIX}${jobName}:consecutive_failures`);

        // Update last success timestamp
        await client.set(`${this.METRICS_PREFIX}${jobName}:last_success`, timestamp.toString());
        await client.expire(`${this.METRICS_PREFIX}${jobName}:last_success`, this.METRICS_TTL);
      } else {
        // Increment failure count
        await client.incr(`${this.METRICS_PREFIX}${jobName}:failure`);
        await client.expire(`${this.METRICS_PREFIX}${jobName}:failure`, this.METRICS_TTL);

        // Increment consecutive failures
        await client.incr(`${this.METRICS_PREFIX}${jobName}:consecutive_failures`);
        await client.expire(`${this.METRICS_PREFIX}${jobName}:consecutive_failures`, this.METRICS_TTL);

        // Update last failure timestamp
        await client.set(`${this.METRICS_PREFIX}${jobName}:last_failure`, timestamp.toString());
        await client.expire(`${this.METRICS_PREFIX}${jobName}:last_failure`, this.METRICS_TTL);
      }

      // Update last execution timestamp
      await client.set(`${this.METRICS_PREFIX}${jobName}:last_execution`, timestamp.toString());
      await client.expire(`${this.METRICS_PREFIX}${jobName}:last_execution`, this.METRICS_TTL);

      // Track execution duration (sorted set for average calculation)
      await client.zadd(`${this.METRICS_PREFIX}${jobName}:durations`, timestamp, record.duration.toString());
      await client.expire(`${this.METRICS_PREFIX}${jobName}:durations`, this.METRICS_TTL);

      // Keep only last 1000 samples
      await client.zremrangebyrank(`${this.METRICS_PREFIX}${jobName}:durations`, 0, -1001);

    } catch (error) {
      logger.warn('Failed to record job execution metric', { error, jobName });
    }
  }

  /**
   * Record a skipped execution
   */
  async recordSkipped(jobName: string): Promise<void> {
    try {
      const client = RedisService.getClient();
      await client.incr(`${this.METRICS_PREFIX}${jobName}:skipped`);
      await client.expire(`${this.METRICS_PREFIX}${jobName}:skipped`, this.METRICS_TTL);
    } catch (error) {
      logger.warn('Failed to record skipped job metric', { error, jobName });
    }
  }

  /**
   * Record circuit breaker open
   */
  async recordCircuitOpen(jobName: string): Promise<void> {
    try {
      const client = RedisService.getClient();
      await client.incr(`${this.METRICS_PREFIX}${jobName}:circuit_open`);
      await client.expire(`${this.METRICS_PREFIX}${jobName}:circuit_open`, this.METRICS_TTL);
    } catch (error) {
      logger.warn('Failed to record circuit open metric', { error, jobName });
    }
  }

  /**
   * Get metrics for a specific job
   */
  async getMetrics(jobName: string): Promise<JobMetrics> {
    const client = RedisService.getClient();

    try {
      const [
        total,
        success,
        failure,
        skipped,
        circuitOpen,
        lastExecution,
        lastSuccess,
        lastFailure,
        consecutiveFailures,
        durations
      ] = await Promise.all([
        client.get(`${this.METRICS_PREFIX}${jobName}:total`),
        client.get(`${this.METRICS_PREFIX}${jobName}:success`),
        client.get(`${this.METRICS_PREFIX}${jobName}:failure`),
        client.get(`${this.METRICS_PREFIX}${jobName}:skipped`),
        client.get(`${this.METRICS_PREFIX}${jobName}:circuit_open`),
        client.get(`${this.METRICS_PREFIX}${jobName}:last_execution`),
        client.get(`${this.METRICS_PREFIX}${jobName}:last_success`),
        client.get(`${this.METRICS_PREFIX}${jobName}:last_failure`),
        client.get(`${this.METRICS_PREFIX}${jobName}:consecutive_failures`),
        client.zrange(`${this.METRICS_PREFIX}${jobName}:durations`, 0, -1),
      ]);

      const totalExecutions = total ? parseInt(total, 10) : 0;
      const successCount = success ? parseInt(success, 10) : 0;
      const failureCount = failure ? parseInt(failure, 10) : 0;

      // Calculate average duration
      let averageDurationMs = 0;
      if (durations && durations.length > 0) {
        const sum = durations.reduce((acc, d) => acc + parseInt(d, 10), 0);
        averageDurationMs = Math.round(sum / durations.length);
      }

      // Calculate success rate
      const successRate = totalExecutions > 0 ? (successCount / totalExecutions) * 100 : 100;

      return {
        jobName,
        totalExecutions,
        successCount,
        failureCount,
        skippedCount: skipped ? parseInt(skipped, 10) : 0,
        circuitOpenCount: circuitOpen ? parseInt(circuitOpen, 10) : 0,
        averageDurationMs,
        lastExecutionAt: lastExecution ? new Date(parseInt(lastExecution, 10)) : null,
        lastSuccessAt: lastSuccess ? new Date(parseInt(lastSuccess, 10)) : null,
        lastFailureAt: lastFailure ? new Date(parseInt(lastFailure, 10)) : null,
        consecutiveFailures: consecutiveFailures ? parseInt(consecutiveFailures, 10) : 0,
        successRate: Math.round(successRate * 100) / 100,
      };
    } catch (error) {
      logger.error('Failed to get job metrics', { error, jobName });
      return {
        jobName,
        totalExecutions: 0,
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        circuitOpenCount: 0,
        averageDurationMs: 0,
        lastExecutionAt: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        consecutiveFailures: 0,
        successRate: 100,
      };
    }
  }

  /**
   * Get consecutive failure count
   */
  async getConsecutiveFailures(jobName: string): Promise<number> {
    try {
      const count = await RedisService.get(`${this.METRICS_PREFIX}${jobName}:consecutive_failures`);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      logger.error('Failed to get consecutive failures', { error, jobName });
      return 0;
    }
  }

  /**
   * Get metrics for all jobs
   */
  async getAllJobNames(): Promise<string[]> {
    try {
      const client = RedisService.getClient();
      const keys = await client.keys(`${this.METRICS_PREFIX}*:total`);
      return keys.map(key => key.replace(`${this.METRICS_PREFIX}`, '').replace(':total', ''));
    } catch (error) {
      logger.error('Failed to get all job names', { error });
      return [];
    }
  }

  /**
   * Reset metrics for a job
   */
  async resetMetrics(jobName: string): Promise<void> {
    const client = RedisService.getClient();

    try {
      await Promise.all([
        client.del(`${this.METRICS_PREFIX}${jobName}:total`),
        client.del(`${this.METRICS_PREFIX}${jobName}:success`),
        client.del(`${this.METRICS_PREFIX}${jobName}:failure`),
        client.del(`${this.METRICS_PREFIX}${jobName}:skipped`),
        client.del(`${this.METRICS_PREFIX}${jobName}:circuit_open`),
        client.del(`${this.METRICS_PREFIX}${jobName}:last_execution`),
        client.del(`${this.METRICS_PREFIX}${jobName}:last_success`),
        client.del(`${this.METRICS_PREFIX}${jobName}:last_failure`),
        client.del(`${this.METRICS_PREFIX}${jobName}:consecutive_failures`),
        client.del(`${this.METRICS_PREFIX}${jobName}:durations`),
      ]);

      logger.info('Job metrics reset', { jobName });
    } catch (error)  {
      logger.error('Failed to reset job metrics', { error, jobName });
      throw error;
    }
  }
}

export const jobMetricsService = new JobMetricsService();
