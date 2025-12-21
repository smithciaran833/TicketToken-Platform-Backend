import { BullJobData } from '../adapters/bull-job-adapter';
import { BullQueueAdapter } from '../adapters/bull-queue-adapter';
import { logger } from '../utils/logger';
import { metricsService } from './metrics.service';

/**
 * Dead Letter Queue (DLQ) Service
 * Handles permanently failed jobs that have exhausted all retry attempts
 */

export interface DeadLetterJob {
  id: string;
  queueName: string;
  data: any;
  failedReason: string;
  attemptsMade: number;
  timestamp: Date;
  stackTrace?: string;
  metadata: {
    processedBy?: string;
    firstFailedAt?: Date;
    lastFailedAt?: Date;
  };
}

export class DeadLetterQueueService {
  private dlqQueue: BullQueueAdapter;
  private dlqStorage: Map<string, DeadLetterJob> = new Map();

  constructor(dlqQueue: BullQueueAdapter) {
    this.dlqQueue = dlqQueue;
    this.setupEventHandlers();
  }

  /**
   * Move job to dead letter queue
   */
  async moveToDeadLetterQueue(job: BullJobData, error: Error): Promise<void> {
    try {
      const deadLetterJob: DeadLetterJob = {
        id: job.id as string,
        queueName: job.name || 'unknown',
        data: job.data,
        failedReason: error.message,
        attemptsMade: job.attemptsMade || 0,
        timestamp: new Date(),
        stackTrace: error.stack,
        metadata: {
          processedBy: undefined,
          firstFailedAt: undefined,
          lastFailedAt: new Date(),
        },
      };

      // Store in DLQ
      this.dlqStorage.set(job.id as string, deadLetterJob);

      // Add to DLQ queue for processing
      await this.dlqQueue.add('failed-job', deadLetterJob, {
        removeOnComplete: false, // Keep completed DLQ jobs for audit
        removeOnFail: false,
      });

      // Record metrics
      metricsService.recordJobFailed(job.name || 'unknown', 'moved_to_dlq');

      logger.error('Job moved to dead letter queue', {
        jobId: job.id,
        queueName: job.name,
        attemptsMade: job.attemptsMade,
        error: error.message,
      });

      // Send alert for critical jobs
      if (this.isCriticalJob(job)) {
        await this.sendCriticalJobAlert(deadLetterJob);
      }
    } catch (err: any) {
      logger.error('Failed to move job to DLQ', {
        jobId: job.id,
        error: err.message,
      });
    }
  }

  /**
   * Retrieve jobs from dead letter queue
   */
  async getDeadLetterJobs(limit: number = 100): Promise<DeadLetterJob[]> {
    const jobs = Array.from(this.dlqStorage.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);

    return jobs;
  }

  /**
   * Get a specific dead letter job
   */
  async getDeadLetterJob(jobId: string): Promise<DeadLetterJob | null> {
    return this.dlqStorage.get(jobId) || null;
  }

  /**
   * Retry a job from dead letter queue
   */
  async retryDeadLetterJob(jobId: string, originalQueue: BullQueueAdapter): Promise<boolean> {
    try {
      const dlJob = this.dlqStorage.get(jobId);
      if (!dlJob) {
        logger.warn('Dead letter job not found', { jobId });
        return false;
      }

      // Add job back to original queue
      await originalQueue.add(dlJob.data, {
        attempts: 3, // Give it 3 fresh attempts
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      });

      // Remove from DLQ
      this.dlqStorage.delete(jobId);

      logger.info('Job retried from dead letter queue', {
        jobId,
        queueName: dlJob.queueName,
      });

      return true;
    } catch (error: any) {
      logger.error('Failed to retry dead letter job', {
        jobId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Bulk retry jobs from DLQ
   */
  async retryMultipleJobs(
    jobIds: string[],
    queues: Map<string, BullQueueAdapter>
  ): Promise<{ succeeded: number; failed: number }> {
    let succeeded = 0;
    let failed = 0;

    for (const jobId of jobIds) {
      const dlJob = this.dlqStorage.get(jobId);
      if (!dlJob) {
        failed++;
        continue;
      }

      const queue = queues.get(dlJob.queueName);
      if (!queue) {
        logger.warn('Queue not found for DLQ job', {
          jobId,
          queueName: dlJob.queueName,
        });
        failed++;
        continue;
      }

      const success = await this.retryDeadLetterJob(jobId, queue);
      if (success) {
        succeeded++;
      } else {
        failed++;
      }
    }

    logger.info('Bulk retry completed', { succeeded, failed, total: jobIds.length });
    return { succeeded, failed };
  }

  /**
   * Delete job from dead letter queue
   */
  async deleteDeadLetterJob(jobId: string): Promise<boolean> {
    try {
      const deleted = this.dlqStorage.delete(jobId);
      if (deleted) {
        logger.info('Dead letter job deleted', { jobId });
      }
      return deleted;
    } catch (error: any) {
      logger.error('Failed to delete dead letter job', {
        jobId,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Clear old jobs from DLQ (older than retention period)
   */
  async clearOldJobs(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    let clearedCount = 0;

    for (const [jobId, job] of this.dlqStorage.entries()) {
      if (job.timestamp < cutoffDate) {
        this.dlqStorage.delete(jobId);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      logger.info('Cleared old DLQ jobs', {
        count: clearedCount,
        retentionDays,
      });
    }

    return clearedCount;
  }

  /**
   * Get DLQ statistics
   */
  getStatistics(): {
    totalJobs: number;
    byQueue: Record<string, number>;
    oldestJob?: Date;
    newestJob?: Date;
  } {
    const jobs = Array.from(this.dlqStorage.values());
    const byQueue: Record<string, number> = {};

    jobs.forEach(job => {
      byQueue[job.queueName] = (byQueue[job.queueName] || 0) + 1;
    });

    const timestamps = jobs.map(j => j.timestamp);

    return {
      totalJobs: jobs.length,
      byQueue,
      oldestJob: timestamps.length > 0 ? new Date(Math.min(...timestamps.map(t => t.getTime()))) : undefined,
      newestJob: timestamps.length > 0 ? new Date(Math.max(...timestamps.map(t => t.getTime()))) : undefined,
    };
  }

  /**
   * Check if job is critical (requires immediate attention)
   */
  private isCriticalJob(job: BullJobData): boolean {
    const criticalQueues = ['payment', 'refund'];
    return criticalQueues.includes(job.name || '');
  }

  /**
   * Send alert for critical job failure
   */
  private async sendCriticalJobAlert(dlJob: DeadLetterJob): Promise<void> {
    // This would integrate with your alerting system
    logger.error('CRITICAL: Job permanently failed', {
      jobId: dlJob.id,
      queueName: dlJob.queueName,
      failedReason: dlJob.failedReason,
      attemptsMade: dlJob.attemptsMade,
    });

    // You could send to:
    // - PagerDuty
    // - Slack
    // - Email
    // - SMS
  }

  /**
   * Setup event handlers for DLQ queue
   */
  private setupEventHandlers(): void {
    // Event handlers for pg-boss would be set up differently
    // pg-boss uses polling rather than events
    logger.info('DLQ event handlers initialized');
  }

  /**
   * Export DLQ jobs for analysis
   */
  async exportJobs(): Promise<DeadLetterJob[]> {
    return Array.from(this.dlqStorage.values());
  }

  /**
   * Get failures grouped by error type
   */
  getFailuresByErrorType(): Record<string, number> {
    const errorTypes: Record<string, number> = {};

    for (const job of this.dlqStorage.values()) {
      const errorType = job.failedReason.split(':')[0].trim();
      errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
    }

    return errorTypes;
  }
}

// Singleton instance
let dlqServiceInstance: DeadLetterQueueService | null = null;

export function initializeDeadLetterQueueService(dlqQueue: BullQueueAdapter): DeadLetterQueueService {
  if (!dlqServiceInstance) {
    dlqServiceInstance = new DeadLetterQueueService(dlqQueue);
    logger.info('Dead Letter Queue Service initialized');
  }
  return dlqServiceInstance;
}

export function getDeadLetterQueueService(): DeadLetterQueueService {
  if (!dlqServiceInstance) {
    throw new Error('Dead Letter Queue Service not initialized');
  }
  return dlqServiceInstance;
}
