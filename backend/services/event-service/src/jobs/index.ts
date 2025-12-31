/**
 * Job Queue Infrastructure
 * 
 * Bull-based job queue for scheduled and background tasks.
 * Uses Redis for distributed job processing with locking.
 */

import Bull, { Queue, Job, JobOptions } from 'bull';
import { logger } from '../utils/logger';
import { getRedis } from '../config/redis';

// Job queue names
export const QUEUE_NAMES = {
  EVENT_TRANSITIONS: 'event-transitions',
  EVENT_NOTIFICATIONS: 'event-notifications',
  EVENT_CLEANUP: 'event-cleanup',
} as const;

// Job queues
const queues: Map<string, Queue> = new Map();

// Redis connection config for Bull
function getRedisConfig(): Bull.QueueOptions['redis'] {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  const url = new URL(redisUrl);
  
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
    db: parseInt(url.pathname?.replace('/', '') || '0', 10),
  };
}

/**
 * Create or get a queue
 */
export function getQueue(queueName: string): Queue {
  if (queues.has(queueName)) {
    return queues.get(queueName)!;
  }

  const queue = new Bull(queueName, {
    redis: getRedisConfig(),
    defaultJobOptions: {
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: 500,     // Keep last 500 failed jobs
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
    settings: {
      lockDuration: 30000,      // 30 seconds lock
      lockRenewTime: 15000,     // Renew lock every 15 seconds
      stalledInterval: 30000,   // Check for stalled jobs every 30 seconds
      maxStalledCount: 1,       // Max stalled count before failing
    },
  });

  // Queue event handlers
  queue.on('error', (error: Error) => {
    logger.error({ error, queue: queueName }, 'Queue error');
  });

  queue.on('failed', (job: Job, error: Error) => {
    logger.error({
      jobId: job.id,
      jobName: job.name,
      queue: queueName,
      error: error.message,
      attempts: job.attemptsMade,
    }, 'Job failed');
  });

  queue.on('completed', (job: Job, _result: unknown) => {
    logger.info({
      jobId: job.id,
      jobName: job.name,
      queue: queueName,
      duration: Date.now() - job.timestamp,
    }, 'Job completed');
  });

  queue.on('stalled', (job: Job) => {
    logger.warn({
      jobId: job.id,
      jobName: job.name,
      queue: queueName,
    }, 'Job stalled');
  });

  queues.set(queueName, queue);
  logger.info({ queueName }, 'Job queue created');

  return queue;
}

/**
 * Add a job to a queue
 */
export async function addJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  options?: JobOptions
): Promise<Job<T>> {
  const queue = getQueue(queueName);
  const job = await queue.add(jobName, data, options);
  
  logger.debug({
    jobId: job.id,
    jobName,
    queue: queueName,
  }, 'Job added to queue');
  
  return job;
}

/**
 * Schedule a recurring job
 */
export async function scheduleRecurringJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  cronExpression: string,
  options?: Omit<JobOptions, 'repeat'>
): Promise<void> {
  const queue = getQueue(queueName);
  
  // Remove existing job with same name to prevent duplicates
  const existingJobs = await queue.getRepeatableJobs();
  for (const job of existingJobs) {
    if (job.name === jobName) {
      await queue.removeRepeatableByKey(job.key);
    }
  }
  
  await queue.add(jobName, data, {
    ...options,
    repeat: { cron: cronExpression },
    jobId: `${jobName}-recurring`,
  });
  
  logger.info({
    jobName,
    queue: queueName,
    cron: cronExpression,
  }, 'Recurring job scheduled');
}

/**
 * Schedule a delayed job
 */
export async function scheduleDelayedJob<T>(
  queueName: string,
  jobName: string,
  data: T,
  delayMs: number,
  options?: JobOptions
): Promise<Job<T>> {
  const queue = getQueue(queueName);
  
  return queue.add(jobName, data, {
    ...options,
    delay: delayMs,
  });
}

/**
 * Schedule a job to run at a specific time
 */
export async function scheduleJobAt<T>(
  queueName: string,
  jobName: string,
  data: T,
  runAt: Date,
  options?: JobOptions
): Promise<Job<T>> {
  const delay = runAt.getTime() - Date.now();
  
  if (delay <= 0) {
    // Run immediately if time has passed
    return addJob(queueName, jobName, data, options);
  }
  
  return scheduleDelayedJob(queueName, jobName, data, delay, options);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}> {
  const queue = getQueue(queueName);
  
  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.getPausedCount(),
  ]);
  
  return { waiting, active, completed, failed, delayed, paused };
}

/**
 * Close all queues gracefully
 */
export async function closeAllQueues(): Promise<void> {
  logger.info('Closing all job queues...');
  
  const closePromises = Array.from(queues.values()).map(async (queue) => {
    try {
      await queue.close();
    } catch (error) {
      logger.error({ error, queue: queue.name }, 'Error closing queue');
    }
  });
  
  await Promise.all(closePromises);
  queues.clear();
  
  logger.info('All job queues closed');
}

/**
 * Get all active queues
 */
export function getAllQueues(): Queue[] {
  return Array.from(queues.values());
}
