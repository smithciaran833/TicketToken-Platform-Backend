/**
 * In-Flight Job Tracker
 * 
 * AUDIT FIX: BG-3 - In-flight jobs not tracked on shutdown
 * AUDIT FIX: BG-5 - No dead letter handling for failed jobs
 * 
 * Tracks active jobs to ensure graceful shutdown and prevent data loss.
 */

import { EventEmitter } from 'events';
import logger, { createJobLogger } from './logger';
import { JobMetrics } from './metrics';

// =============================================================================
// TYPES
// =============================================================================

export enum JobState {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  TIMED_OUT = 'TIMED_OUT'
}

export interface Job {
  id: string;
  type: string;
  state: JobState;
  startedAt: number;
  data: any;
  timeout?: number;
  retries: number;
  maxRetries: number;
  error?: string;
}

export interface JobTrackerOptions {
  /** Default job timeout (ms) */
  defaultTimeout?: number;
  /** Default max retries */
  defaultMaxRetries?: number;
  /** Shutdown grace period (ms) */
  shutdownGracePeriod?: number;
  /** Check interval for timed out jobs (ms) */
  timeoutCheckInterval?: number;
}

export interface JobTrackerMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  timedOutJobs: number;
  cancelledJobs: number;
  averageJobDuration: number;
  jobsByType: Record<string, number>;
}

// =============================================================================
// JOB TRACKER
// =============================================================================

export class JobTracker extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private completedDurations: number[] = [];
  private isShuttingDown: boolean = false;
  private timeoutChecker: NodeJS.Timeout | null = null;
  
  // Counters
  private totalJobs: number = 0;
  private completedCount: number = 0;
  private failedCount: number = 0;
  private timedOutCount: number = 0;
  private cancelledCount: number = 0;
  private jobsByType: Record<string, number> = {};

  private readonly options: Required<JobTrackerOptions>;

  constructor(options: JobTrackerOptions = {}) {
    super();
    
    this.options = {
      defaultTimeout: options.defaultTimeout || 60000, // 1 minute
      defaultMaxRetries: options.defaultMaxRetries || 3,
      shutdownGracePeriod: options.shutdownGracePeriod || 30000, // 30 seconds
      timeoutCheckInterval: options.timeoutCheckInterval || 5000 // 5 seconds
    };

    // Start timeout checker
    this.startTimeoutChecker();

    logger.info({ options: this.options }, 'Job tracker initialized');
  }

  /**
   * Register a new job
   * AUDIT FIX: BG-7 - Enhanced job logging
   */
  registerJob(
    id: string,
    type: string,
    data: any,
    options: { timeout?: number; maxRetries?: number } = {}
  ): Job {
    if (this.isShuttingDown) {
      throw new Error('Cannot register new jobs during shutdown');
    }

    if (this.jobs.has(id)) {
      logger.warn({ jobId: id, jobType: type }, 'Job already registered');
      return this.jobs.get(id)!;
    }

    const job: Job = {
      id,
      type,
      state: JobState.RUNNING,
      startedAt: Date.now(),
      data,
      timeout: options.timeout || this.options.defaultTimeout,
      retries: 0,
      maxRetries: options.maxRetries ?? this.options.defaultMaxRetries
    };

    this.jobs.set(id, job);
    this.totalJobs++;
    this.jobsByType[type] = (this.jobsByType[type] || 0) + 1;

    // AUDIT FIX: BG-6 & BG-7 - Record metrics and enhanced logging
    JobMetrics.recordJobStart(type);
    
    const jobLog = createJobLogger(type, id);
    jobLog.info({
      timeout: job.timeout,
      maxRetries: job.maxRetries,
      activeJobs: this.jobs.size
    }, 'Job started');

    this.emit('jobRegistered', job);

    return job;
  }

  /**
   * Mark job as completed
   * AUDIT FIX: BG-6 & BG-7 - Enhanced logging and metrics
   */
  completeJob(id: string, result?: any): void {
    const job = this.jobs.get(id);
    if (!job) {
      logger.warn({ jobId: id }, 'Job not found for completion');
      return;
    }

    const duration = Date.now() - job.startedAt;
    this.completedDurations.push(duration);
    
    // Keep only last 1000 durations for average calculation
    if (this.completedDurations.length > 1000) {
      this.completedDurations.shift();
    }

    job.state = JobState.COMPLETED;
    this.jobs.delete(id);
    this.completedCount++;

    // AUDIT FIX: BG-6 & BG-7 - Record metrics and enhanced logging
    JobMetrics.recordJobComplete(job.type, true, duration);
    
    const jobLog = createJobLogger(job.type, id);
    jobLog.info({
      durationMs: duration,
      durationSec: (duration / 1000).toFixed(2),
      retries: job.retries,
      activeJobs: this.jobs.size
    }, 'Job completed successfully');

    this.emit('jobCompleted', { job, result, duration });
  }

  /**
   * Mark job as failed
   * AUDIT FIX: BG-6 & BG-7 - Enhanced logging and metrics
   */
  failJob(id: string, error: Error | string): void {
    const job = this.jobs.get(id);
    if (!job) {
      logger.warn({ jobId: id }, 'Job not found for failure');
      return;
    }

    const duration = Date.now() - job.startedAt;
    job.error = typeof error === 'string' ? error : error.message;
    job.retries++;
    
    const jobLog = createJobLogger(job.type, id);

    // Check if should retry
    if (job.retries < job.maxRetries) {
      job.state = JobState.PENDING;
      
      // AUDIT FIX: BG-6 - Record retry metric
      JobMetrics.recordJobRetry(job.type);
      
      jobLog.warn({ 
        retries: job.retries, 
        maxRetries: job.maxRetries,
        error: job.error,
        durationMs: duration
      }, 'Job failed, will retry');
      
      this.emit('jobRetry', job);
    } else {
      job.state = JobState.FAILED;
      this.jobs.delete(id);
      this.failedCount++;
      
      // AUDIT FIX: BG-6 - Record failure and DLQ metrics
      JobMetrics.recordJobComplete(job.type, false, duration);
      JobMetrics.recordJobDLQ(job.type, 'max_retries_exceeded');
      
      jobLog.error({ 
        error: job.error,
        retries: job.retries,
        durationMs: duration,
        activeJobs: this.jobs.size
      }, 'Job failed permanently - sent to DLQ');
      
      // Emit for dead letter queue handling
      this.emit('jobFailed', job);
      this.emit('deadLetter', job);
    }
  }

  /**
   * Cancel a job
   */
  cancelJob(id: string, reason?: string): void {
    const job = this.jobs.get(id);
    if (!job) {
      logger.warn({ id }, 'Job not found for cancellation');
      return;
    }

    job.state = JobState.CANCELLED;
    job.error = reason || 'Cancelled';
    this.jobs.delete(id);
    this.cancelledCount++;

    logger.info({ jobId: id, reason }, 'Job cancelled');
    this.emit('jobCancelled', job);
  }

  /**
   * Get job by ID
   */
  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get all active jobs
   */
  getActiveJobs(): Job[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get jobs by type
   */
  getJobsByType(type: string): Job[] {
    return Array.from(this.jobs.values()).filter(j => j.type === type);
  }

  /**
   * Get job count
   */
  getActiveJobCount(): number {
    return this.jobs.size;
  }

  /**
   * Check if there are active jobs
   */
  hasActiveJobs(): boolean {
    return this.jobs.size > 0;
  }

  /**
   * Get metrics
   */
  getMetrics(): JobTrackerMetrics {
    const avgDuration = this.completedDurations.length > 0
      ? this.completedDurations.reduce((a, b) => a + b, 0) / this.completedDurations.length
      : 0;

    return {
      totalJobs: this.totalJobs,
      activeJobs: this.jobs.size,
      completedJobs: this.completedCount,
      failedJobs: this.failedCount,
      timedOutJobs: this.timedOutCount,
      cancelledJobs: this.cancelledCount,
      averageJobDuration: Math.round(avgDuration),
      jobsByType: { ...this.jobsByType }
    };
  }

  /**
   * Graceful shutdown
   * AUDIT FIX: BG-3 - Wait for in-flight jobs to complete
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.stopTimeoutChecker();

    if (this.jobs.size === 0) {
      logger.info('No active jobs, shutdown complete');
      return;
    }

    logger.info({ 
      activeJobs: this.jobs.size, 
      gracePeriod: this.options.shutdownGracePeriod 
    }, 'Waiting for in-flight jobs to complete');

    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        
        if (this.jobs.size === 0) {
          clearInterval(checkInterval);
          logger.info('All jobs completed, shutdown complete');
          resolve();
          return;
        }

        if (elapsed >= this.options.shutdownGracePeriod) {
          clearInterval(checkInterval);
          
          // Cancel remaining jobs
          const remainingJobs = Array.from(this.jobs.values());
          logger.warn({ 
            count: remainingJobs.length 
          }, 'Grace period expired, cancelling remaining jobs');
          
          for (const job of remainingJobs) {
            this.cancelJob(job.id, 'Shutdown timeout');
          }
          
          resolve();
          return;
        }

        logger.debug({ 
          activeJobs: this.jobs.size, 
          elapsed,
          remaining: this.options.shutdownGracePeriod - elapsed
        }, 'Waiting for jobs to complete');
      }, 1000);
    });
  }

  /**
   * Start timeout checker
   */
  private startTimeoutChecker(): void {
    this.timeoutChecker = setInterval(() => {
      const now = Date.now();
      
      for (const [id, job] of this.jobs) {
        if (job.state === JobState.RUNNING && job.timeout) {
          const elapsed = now - job.startedAt;
          
          if (elapsed > job.timeout) {
            logger.warn({ 
              jobId: id, 
              elapsed, 
              timeout: job.timeout 
            }, 'Job timed out');
            
            job.state = JobState.TIMED_OUT;
            job.error = `Job timed out after ${elapsed}ms`;
            this.jobs.delete(id);
            this.timedOutCount++;
            
            this.emit('jobTimedOut', job);
            this.emit('deadLetter', job);
          }
        }
      }
    }, this.options.timeoutCheckInterval);
  }

  /**
   * Stop timeout checker
   */
  private stopTimeoutChecker(): void {
    if (this.timeoutChecker) {
      clearInterval(this.timeoutChecker);
      this.timeoutChecker = null;
    }
  }

  /**
   * Reset tracker (for testing)
   */
  reset(): void {
    this.jobs.clear();
    this.completedDurations = [];
    this.totalJobs = 0;
    this.completedCount = 0;
    this.failedCount = 0;
    this.timedOutCount = 0;
    this.cancelledCount = 0;
    this.jobsByType = {};
    this.isShuttingDown = false;
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let trackerInstance: JobTracker | null = null;

/**
 * Initialize job tracker
 */
export function initializeJobTracker(options?: JobTrackerOptions): JobTracker {
  if (!trackerInstance) {
    trackerInstance = new JobTracker(options);
  }
  return trackerInstance;
}

/**
 * Get job tracker instance
 */
export function getJobTracker(): JobTracker {
  if (!trackerInstance) {
    trackerInstance = new JobTracker();
  }
  return trackerInstance;
}

/**
 * Shutdown job tracker gracefully
 */
export async function shutdownJobTracker(): Promise<void> {
  if (trackerInstance) {
    await trackerInstance.shutdown();
    trackerInstance = null;
  }
}
