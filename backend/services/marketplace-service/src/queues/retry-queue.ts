/**
 * Async Retry Queue for Marketplace Service
 *
 * Issues Fixed:
 * - GD-H1: No async retry queue → BullMQ-based retry
 * - BIZ-H1: Validation before lock → Pre-validation in queue
 *
 * Features:
 * - BullMQ-based job processing
 * - Exponential backoff retry
 * - Dead letter queue for failed jobs
 * - Job prioritization
 */

import Bull from 'bull';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';
import { registry } from '../utils/metrics';

const log = logger.child({ component: 'RetryQueue' });

// Queue configuration
const QUEUE_NAME = 'marketplace-retry-queue';
const DLQ_NAME = 'marketplace-retry-dlq';

// Retry configuration
const DEFAULT_RETRY_ATTEMPTS = 5;
const DEFAULT_BACKOFF_TYPE = 'exponential';
const DEFAULT_BACKOFF_DELAY = 1000;

// Job types
export type RetryJobType =
  | 'transfer.retry'
  | 'refund.retry'
  | 'webhook.retry'
  | 'notification.retry'
  | 'sync.retry'
  | 'blockchain.confirm';

interface RetryJobData {
  type: RetryJobType;
  payload: any;
  originalId?: string;
  metadata: {
    correlationId?: string;
    tenantId?: string;
    userId?: string;
    createdAt: string;
    source: string;
    failedAt?: string;
    error?: string;
  };
}

interface RetryJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}

// Queues
let retryQueue: Bull.Queue<RetryJobData>;
let dlqQueue: Bull.Queue<RetryJobData>;
let isInitialized = false;

/**
 * AUDIT FIX GD-H1: Initialize retry queue
 */
export async function initRetryQueue(): Promise<void> {
  if (isInitialized) {
    log.warn('Retry queue already initialized');
    return;
  }

  const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  };

  retryQueue = new Bull<RetryJobData>(QUEUE_NAME, {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: DEFAULT_RETRY_ATTEMPTS,
      backoff: {
        type: DEFAULT_BACKOFF_TYPE,
        delay: DEFAULT_BACKOFF_DELAY
      },
      removeOnComplete: 100,
      removeOnFail: false
    }
  });

  dlqQueue = new Bull<RetryJobData>(DLQ_NAME, {
    redis: redisConfig,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: false,
      removeOnFail: false
    }
  });

  // Set up event handlers
  retryQueue.on('completed', (job) => {
    log.info('Retry job completed', {
      jobId: job.id,
      type: job.data.type,
      attempts: job.attemptsMade
    });
    registry.incrementCounter('marketplace_retry_jobs_total', {
      type: job.data.type,
      status: 'completed'
    });
  });

  retryQueue.on('failed', async (job, err) => {
    log.error('Retry job failed', {
      jobId: job.id,
      type: job.data.type,
      attempts: job.attemptsMade,
      error: err.message
    });

    // Move to DLQ if all retries exhausted
    if (job.attemptsMade >= (job.opts.attempts || DEFAULT_RETRY_ATTEMPTS)) {
      await moveToDLQ(job.data, err.message);
    }

    registry.incrementCounter('marketplace_retry_jobs_total', {
      type: job.data.type,
      status: 'failed'
    });
  });

  retryQueue.on('stalled', (job) => {
    log.warn('Retry job stalled', {
      jobId: job.id,
      type: job.data.type
    });
  });

  isInitialized = true;
  log.info('Retry queue initialized');
}

/**
 * AUDIT FIX GD-H1: Add job to retry queue
 */
export async function addRetryJob(
  type: RetryJobType,
  payload: any,
  options: RetryJobOptions = {}
): Promise<string> {
  if (!isInitialized) {
    await initRetryQueue();
  }

  const jobData: RetryJobData = {
    type,
    payload,
    originalId: payload.id || payload.originalId,
    metadata: {
      correlationId: payload.correlationId,
      tenantId: payload.tenantId,
      userId: payload.userId,
      createdAt: new Date().toISOString(),
      source: 'marketplace-service'
    }
  };

  const jobOptions: Bull.JobOptions = {
    priority: options.priority,
    delay: options.delay,
    attempts: options.attempts || DEFAULT_RETRY_ATTEMPTS,
    backoff: options.backoff || {
      type: DEFAULT_BACKOFF_TYPE,
      delay: DEFAULT_BACKOFF_DELAY
    }
  };

  const job = await retryQueue.add(type, jobData, jobOptions);

  log.debug('Retry job added', {
    jobId: job.id,
    type,
    priority: options.priority,
    delay: options.delay
  });

  return job.id.toString();
}

/**
 * AUDIT FIX BIZ-H1: Add job with pre-validation
 */
export async function addRetryJobWithValidation(
  type: RetryJobType,
  payload: any,
  validator: () => Promise<boolean>,
  options: RetryJobOptions = {}
): Promise<string | null> {
  // Validate before adding to queue
  try {
    const isValid = await validator();
    if (!isValid) {
      log.warn('Retry job validation failed, not adding to queue', { type });
      return null;
    }
  } catch (error: any) {
    log.error('Retry job validation error', {
      type,
      error: error.message
    });
    return null;
  }

  return addRetryJob(type, payload, options);
}

/**
 * Move failed job to DLQ
 */
async function moveToDLQ(jobData: RetryJobData, error: string): Promise<void> {
  try {
    await dlqQueue.add('dlq-entry', {
      ...jobData,
      metadata: {
        ...jobData.metadata,
        failedAt: new Date().toISOString(),
        error
      }
    });

    log.warn('Job moved to DLQ', {
      type: jobData.type,
      originalId: jobData.originalId
    });

    registry.incrementCounter('marketplace_dlq_jobs_total', {
      type: jobData.type
    });
  } catch (dlqError: any) {
    log.error('Failed to move job to DLQ', {
      type: jobData.type,
      error: dlqError.message
    });
  }
}

/**
 * Register job processor
 */
export function processRetryJobs(
  type: RetryJobType,
  processor: (job: Bull.Job<RetryJobData>) => Promise<void>
): void {
  if (!isInitialized) {
    throw new Error('Retry queue not initialized');
  }

  retryQueue.process(type, async (job) => {
    const startTime = Date.now();

    try {
      await processor(job);

      registry.observeHistogram('marketplace_retry_job_duration_seconds',
        (Date.now() - startTime) / 1000,
        { type }
      );
    } catch (error) {
      registry.observeHistogram('marketplace_retry_job_duration_seconds',
        (Date.now() - startTime) / 1000,
        { type }
      );
      throw error;
    }
  });

  log.info('Retry job processor registered', { type });
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}> {
  if (!isInitialized) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  }

  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    retryQueue.getWaitingCount(),
    retryQueue.getActiveCount(),
    retryQueue.getCompletedCount(),
    retryQueue.getFailedCount(),
    retryQueue.getDelayedCount(),
    retryQueue.getPausedCount()
  ]);

  return { waiting, active, completed, failed, delayed, paused };
}

/**
 * Get DLQ statistics
 */
export async function getDLQStats(): Promise<{
  waiting: number;
  failed: number;
}> {
  if (!isInitialized) {
    return { waiting: 0, failed: 0 };
  }

  const [waiting, failed] = await Promise.all([
    dlqQueue.getWaitingCount(),
    dlqQueue.getFailedCount()
  ]);

  return { waiting, failed };
}

/**
 * Get DLQ jobs
 */
export async function getDLQJobs(
  start: number = 0,
  end: number = 100
): Promise<Bull.Job<RetryJobData>[]> {
  if (!isInitialized) {
    return [];
  }

  return dlqQueue.getWaiting(start, end);
}

/**
 * Retry a DLQ job
 */
export async function retryDLQJob(jobId: string): Promise<boolean> {
  if (!isInitialized) {
    return false;
  }

  try {
    const job = await dlqQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    // Re-add to main queue
    await addRetryJob(job.data.type, job.data.payload);

    // Remove from DLQ
    await job.remove();

    log.info('DLQ job retried', { jobId });
    return true;
  } catch (error: any) {
    log.error('Failed to retry DLQ job', { jobId, error: error.message });
    return false;
  }
}

/**
 * Remove a DLQ job
 */
export async function removeDLQJob(jobId: string): Promise<boolean> {
  if (!isInitialized) {
    return false;
  }

  try {
    const job = await dlqQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    await job.remove();
    log.info('DLQ job removed', { jobId });
    return true;
  } catch (error: any) {
    log.error('Failed to remove DLQ job', { jobId, error: error.message });
    return false;
  }
}

/**
 * Pause queue
 */
export async function pauseQueue(): Promise<void> {
  if (isInitialized) {
    await retryQueue.pause();
    log.info('Retry queue paused');
  }
}

/**
 * Resume queue
 */
export async function resumeQueue(): Promise<void> {
  if (isInitialized) {
    await retryQueue.resume();
    log.info('Retry queue resumed');
  }
}

/**
 * Close queues
 */
export async function closeRetryQueue(): Promise<void> {
  if (!isInitialized) return;

  try {
    await retryQueue.close();
    await dlqQueue.close();
    isInitialized = false;
    log.info('Retry queues closed');
  } catch (error: any) {
    log.error('Failed to close retry queues', { error: error.message });
  }
}

// Export module
export const retryQueue_ = {
  init: initRetryQueue,
  add: addRetryJob,
  addWithValidation: addRetryJobWithValidation,
  process: processRetryJobs,
  getStats: getQueueStats,
  getDLQStats,
  getDLQJobs,
  retryDLQJob,
  removeDLQJob,
  pause: pauseQueue,
  resume: resumeQueue,
  close: closeRetryQueue
};
