/**
 * Dead Letter Queue Service
 * 
 * Handles failed jobs that have exceeded retry limits
 * Provides visibility into failures and enables manual replay
 */

import { logger } from '../utils/logger';

export interface DeadLetterJob {
  id: string;
  originalJobId: string;
  operation: string;
  provider?: string;
  venueId?: string;
  payload: any;
  error: {
    message: string;
    stack?: string;
    timestamp: Date;
  };
  attempts: number;
  firstAttempt: Date;
  lastAttempt: Date;
  status: 'failed' | 'reviewing' | 'requeued' | 'discarded';
  metadata?: Record<string, any>;
}

export interface DLQStats {
  total: number;
  byStatus: Record<string, number>;
  byProvider: Record<string, number>;
  byOperation: Record<string, number>;
  oldestJob?: Date;
  recentFailures: number; // Last 24 hours
}

class DeadLetterQueueService {
  private deadLetterJobs: Map<string, DeadLetterJob> = new Map();
  private readonly MAX_DLQ_SIZE = 10000;
  private readonly AUTO_DISCARD_AFTER_DAYS = 30;

  /**
   * Add a job to the dead letter queue
   */
  async addJob(job: Omit<DeadLetterJob, 'id' | 'status'>): Promise<string> {
    const id = `dlq-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const deadLetterJob: DeadLetterJob = {
      ...job,
      id,
      status: 'failed',
    };

    this.deadLetterJobs.set(id, deadLetterJob);

    logger.error('Job added to dead letter queue', {
      id,
      originalJobId: job.originalJobId,
      operation: job.operation,
      provider: job.provider,
      error: job.error.message,
      attempts: job.attempts,
    });

    // Auto-cleanup if size exceeds limit
    if (this.deadLetterJobs.size > this.MAX_DLQ_SIZE) {
      this.cleanupOldJobs();
    }

    return id;
  }

  /**
   * Get a specific dead letter job
   */
  getJob(id: string): DeadLetterJob | undefined {
    return this.deadLetterJobs.get(id);
  }

  /**
   * Get all dead letter jobs
   */
  getAllJobs(): DeadLetterJob[] {
    return Array.from(this.deadLetterJobs.values());
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: DeadLetterJob['status']): DeadLetterJob[] {
    return this.getAllJobs().filter(job => job.status === status);
  }

  /**
   * Get jobs by provider
   */
  getJobsByProvider(provider: string): DeadLetterJob[] {
    return this.getAllJobs().filter(job => job.provider === provider);
  }

  /**
   * Get jobs by operation
   */
  getJobsByOperation(operation: string): DeadLetterJob[] {
    return this.getAllJobs().filter(job => job.operation === operation);
  }

  /**
   * Get jobs for a specific venue
   */
  getJobsByVenue(venueId: string): DeadLetterJob[] {
    return this.getAllJobs().filter(job => job.venueId === venueId);
  }

  /**
   * Mark job for review
   */
  markForReview(id: string): boolean {
    const job = this.deadLetterJobs.get(id);
    
    if (!job) {
      logger.warn(`Dead letter job not found: ${id}`);
      return false;
    }

    job.status = 'reviewing';
    this.deadLetterJobs.set(id, job);

    logger.info('Dead letter job marked for review', { id, operation: job.operation });
    
    return true;
  }

  /**
   * Requeue a job for retry
   */
  async requeueJob(id: string): Promise<boolean> {
    const job = this.deadLetterJobs.get(id);
    
    if (!job) {
      logger.warn(`Dead letter job not found: ${id}`);
      return false;
    }

    job.status = 'requeued';
    this.deadLetterJobs.set(id, job);

    logger.info('Dead letter job requeued', {
      id,
      originalJobId: job.originalJobId,
      operation: job.operation,
    });

    // Note: Actual requeuing logic would go here
    // This would typically involve adding the job back to the main queue
    
    return true;
  }

  /**
   * Discard a job permanently
   */
  discardJob(id: string, reason?: string): boolean {
    const job = this.deadLetterJobs.get(id);
    
    if (!job) {
      logger.warn(`Dead letter job not found: ${id}`);
      return false;
    }

    job.status = 'discarded';
    
    if (reason) {
      job.metadata = {
        ...job.metadata,
        discardReason: reason,
        discardedAt: new Date(),
      };
    }

    this.deadLetterJobs.set(id, job);

    logger.info('Dead letter job discarded', {
      id,
      operation: job.operation,
      reason,
    });
    
    return true;
  }

  /**
   * Get dead letter queue statistics
   */
  getStats(): DLQStats {
    const jobs = this.getAllJobs();
    
    const stats: DLQStats = {
      total: jobs.length,
      byStatus: {},
      byProvider: {},
      byOperation: {},
      recentFailures: 0,
    };

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    for (const job of jobs) {
      // By status
      stats.byStatus[job.status] = (stats.byStatus[job.status] || 0) + 1;

      // By provider
      if (job.provider) {
        stats.byProvider[job.provider] = (stats.byProvider[job.provider] || 0) + 1;
      }

      // By operation
      stats.byOperation[job.operation] = (stats.byOperation[job.operation] || 0) + 1;

      // Oldest job
      if (!stats.oldestJob || job.firstAttempt < stats.oldestJob) {
        stats.oldestJob = job.firstAttempt;
      }

      // Recent failures
      if (job.lastAttempt > oneDayAgo) {
        stats.recentFailures++;
      }
    }

    return stats;
  }

  /**
   * Clean up old jobs
   */
  cleanupOldJobs(): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.AUTO_DISCARD_AFTER_DAYS);

    let cleaned = 0;

    for (const [id, job] of this.deadLetterJobs.entries()) {
      if (job.status === 'discarded' && job.lastAttempt < cutoffDate) {
        this.deadLetterJobs.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} old dead letter jobs`);
    }

    return cleaned;
  }

  /**
   * Get jobs needing attention
   * (failed or reviewing, not too old)
   */
  getJobsNeedingAttention(): DeadLetterJob[] {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    return this.getAllJobs().filter(
      job =>
        (job.status === 'failed' || job.status === 'reviewing') &&
        job.lastAttempt > sevenDaysAgo
    );
  }

  /**
   * Export jobs for analysis
   */
  exportJobs(filters?: {
    status?: DeadLetterJob['status'];
    provider?: string;
    operation?: string;
    venueId?: string;
    startDate?: Date;
    endDate?: Date;
  }): DeadLetterJob[] {
    let jobs = this.getAllJobs();

    if (filters) {
      if (filters.status) {
        jobs = jobs.filter(j => j.status === filters.status);
      }
      if (filters.provider) {
        jobs = jobs.filter(j => j.provider === filters.provider);
      }
      if (filters.operation) {
        jobs = jobs.filter(j => j.operation === filters.operation);
      }
      if (filters.venueId) {
        jobs = jobs.filter(j => j.venueId === filters.venueId);
      }
      if (filters.startDate) {
        jobs = jobs.filter(j => j.lastAttempt >= filters.startDate!);
      }
      if (filters.endDate) {
        jobs = jobs.filter(j => j.lastAttempt <= filters.endDate!);
      }
    }

    return jobs;
  }

  /**
   * Bulk requeue jobs
   */
  async bulkRequeue(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const result = await this.requeueJob(id);
      if (result) {
        success++;
      } else {
        failed++;
      }
    }

    logger.info('Bulk requeue completed', { success, failed, total: ids.length });

    return { success, failed };
  }

  /**
   * Clear all discarded jobs
   */
  clearDiscarded(): number {
    let cleared = 0;

    for (const [id, job] of this.deadLetterJobs.entries()) {
      if (job.status === 'discarded') {
        this.deadLetterJobs.delete(id);
        cleared++;
      }
    }

    logger.info(`Cleared ${cleared} discarded jobs from DLQ`);

    return cleared;
  }

  /**
   * Get failure patterns
   * Useful for identifying systemic issues
   */
  getFailurePatterns(): {
    commonErrors: Array<{ error: string; count: number }>;
    providerIssues: Array<{ provider: string; failureRate: number }>;
    operationIssues: Array<{ operation: string; failureRate: number }>;
  } {
    const jobs = this.getAllJobs();
    const errorCounts = new Map<string, number>();

    // Count error messages
    for (const job of jobs) {
      const errorMsg = job.error.message;
      errorCounts.set(errorMsg, (errorCounts.get(errorMsg) || 0) + 1);
    }

    // Get top 10 common errors
    const commonErrors = Array.from(errorCounts.entries())
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Calculate provider failure rates
    const providerStats = new Map<string, { total: number; failed: number }>();
    for (const job of jobs) {
      if (job.provider) {
        const stats = providerStats.get(job.provider) || { total: 0, failed: 0 };
        stats.total++;
        if (job.status === 'failed') stats.failed++;
        providerStats.set(job.provider, stats);
      }
    }

    const providerIssues = Array.from(providerStats.entries())
      .map(([provider, stats]) => ({
        provider,
        failureRate: (stats.failed / stats.total) * 100,
      }))
      .sort((a, b) => b.failureRate - a.failureRate);

    // Calculate operation failure rates
    const operationStats = new Map<string, { total: number; failed: number }>();
    for (const job of jobs) {
      const stats = operationStats.get(job.operation) || { total: 0, failed: 0 };
      stats.total++;
      if (job.status === 'failed') stats.failed++;
      operationStats.set(job.operation, stats);
    }

    const operationIssues = Array.from(operationStats.entries())
      .map(([operation, stats]) => ({
        operation,
        failureRate: (stats.failed / stats.total) * 100,
      }))
      .sort((a, b) => b.failureRate - a.failureRate);

    return {
      commonErrors,
      providerIssues,
      operationIssues,
    };
  }
}

// Export singleton instance
export const deadLetterQueueService = new DeadLetterQueueService();
