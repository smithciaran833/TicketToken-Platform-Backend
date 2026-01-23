/**
 * Queue Service for Notification Service
 *
 * Decision #4 Standardization: Migrated from BullMQ to Bull
 * - Bull is the standard for internal background jobs
 * - Uses Redis for job storage
 */

import Bull, { Queue, Job, JobOptions } from 'bull';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { metricsService } from './metrics.service';

export interface NotificationJobData {
  notificationId: string;
  channel: string;
  recipient: string;
  type: string;
  priority?: number;
  scheduledFor?: Date;
  metadata?: Record<string, any>;
}

export interface BatchNotificationJobData {
  notifications: NotificationJobData[];
  batchId: string;
}

export enum QueueName {
  NOTIFICATIONS = 'notifications',
  BATCH_NOTIFICATIONS = 'batch-notifications',
  WEBHOOK_PROCESSING = 'webhook-processing',
  RETRY = 'retry-notifications',
  DEAD_LETTER = 'dead-letter',
}

// Default job options for Bull queues
const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

class QueueService {
  private queues: Map<string, Queue> = new Map();

  async initialize(): Promise<void> {
    logger.info('Initializing queue service (Bull)');

    // Get Redis connection options
    const redisOptions = this.getRedisOptions();

    this.createQueue(QueueName.NOTIFICATIONS, redisOptions);
    this.createQueue(QueueName.BATCH_NOTIFICATIONS, redisOptions);
    this.createQueue(QueueName.WEBHOOK_PROCESSING, redisOptions);
    this.createQueue(QueueName.RETRY, redisOptions);
    this.createQueue(QueueName.DEAD_LETTER, redisOptions);

    this.startMetricsTracking();

    logger.info('Queue service initialized (Bull)');
  }

  private getRedisOptions(): Bull.QueueOptions['redis'] {
    // Extract Redis connection info
    const redisHost = process.env.REDIS_HOST || 'redis';
    const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
    const redisPassword = process.env.REDIS_PASSWORD;
    const redisDb = parseInt(process.env.REDIS_DB || '0', 10);

    return {
      host: redisHost,
      port: redisPort,
      password: redisPassword,
      db: redisDb,
    };
  }

  private createQueue(name: string, redisOptions: Bull.QueueOptions['redis']): Queue {
    const queue = new Bull(name, {
      redis: redisOptions,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    // Set up event listeners
    queue.on('completed', (job: Job) => {
      logger.debug(`Job ${job.id} completed in queue ${name}`);
      metricsService.incrementCounter('queue_jobs_completed_total', { queue: name });
    });

    queue.on('failed', (job: Job, err: Error) => {
      logger.error(`Job ${job.id} failed in queue ${name}`, { reason: err.message });
      metricsService.incrementCounter('queue_jobs_failed_total', { queue: name });
    });

    queue.on('stalled', (job: Job) => {
      logger.warn(`Job ${job.id} stalled in queue ${name}`);
      metricsService.incrementCounter('queue_jobs_stalled_total', { queue: name });
    });

    queue.on('error', (err: Error) => {
      logger.error(`Queue ${name} error`, { error: err.message });
    });

    this.queues.set(name, queue);

    logger.info(`Queue '${name}' created (Bull)`);
    return queue;
  }

  getQueue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      throw new Error(`Queue '${name}' not found`);
    }
    return queue;
  }

  async addNotificationJob(
    data: NotificationJobData,
    options: { priority?: number; delay?: number; jobId?: string } = {}
  ): Promise<Job> {
    const queue = this.getQueue(QueueName.NOTIFICATIONS);
    const job = await queue.add('send-notification', data, {
      priority: options.priority || data.priority || 5,
      delay: options.delay,
      jobId: options.jobId,
    });

    logger.info('Notification job added to queue', {
      jobId: job.id,
      notificationId: data.notificationId,
      channel: data.channel,
    });

    metricsService.incrementCounter('queue_jobs_added_total', {
      queue: QueueName.NOTIFICATIONS,
      type: 'notification',
    });

    return job;
  }

  async addBatchNotificationJob(
    data: BatchNotificationJobData,
    options: { priority?: number; delay?: number } = {}
  ): Promise<Job> {
    const queue = this.getQueue(QueueName.BATCH_NOTIFICATIONS);
    const job = await queue.add('send-batch-notification', data, {
      priority: options.priority || 5,
      delay: options.delay,
    });

    logger.info('Batch notification job added to queue', {
      jobId: job.id,
      batchId: data.batchId,
      count: data.notifications.length,
    });

    metricsService.incrementCounter('queue_jobs_added_total', {
      queue: QueueName.BATCH_NOTIFICATIONS,
      type: 'batch',
    });

    return job;
  }

  async addWebhookJob(
    data: any,
    options: { priority?: number; delay?: number } = {}
  ): Promise<Job> {
    const queue = this.getQueue(QueueName.WEBHOOK_PROCESSING);
    const job = await queue.add('process-webhook', data, {
      priority: options.priority || 5,
      delay: options.delay,
    });

    logger.info('Webhook job added to queue', {
      jobId: job.id,
    });

    metricsService.incrementCounter('queue_jobs_added_total', {
      queue: QueueName.WEBHOOK_PROCESSING,
      type: 'webhook',
    });

    return job;
  }

  async addRetryJob(
    data: NotificationJobData,
    options: { delay?: number; attempts?: number } = {}
  ): Promise<Job> {
    const queue = this.getQueue(QueueName.RETRY);
    const job = await queue.add('retry-notification', data, {
      delay: options.delay || 60000, // Default 1 minute delay
      attempts: options.attempts || 3,
    });

    logger.info('Retry job added to queue', {
      jobId: job.id,
      notificationId: data.notificationId,
    });

    metricsService.incrementCounter('queue_jobs_added_total', {
      queue: QueueName.RETRY,
      type: 'retry',
    });

    return job;
  }

  async addToDeadLetter(
    data: any,
    reason: string
  ): Promise<Job> {
    const queue = this.getQueue(QueueName.DEAD_LETTER);
    const job = await queue.add('dead-letter', {
      ...data,
      failureReason: reason,
      movedAt: new Date().toISOString(),
    });

    logger.warn('Job added to dead letter queue', {
      jobId: job.id,
      reason,
    });

    metricsService.incrementCounter('queue_jobs_dead_letter_total', {
      queue: QueueName.DEAD_LETTER,
    });

    return job;
  }

  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async getJob(queueName: string, jobId: string): Promise<Job | null> {
    const queue = this.getQueue(queueName);
    return queue.getJob(jobId);
  }

  async removeJob(queueName: string, jobId: string): Promise<void> {
    const job = await this.getJob(queueName, jobId);
    if (job) {
      await job.remove();
      logger.info('Job removed from queue', { queueName, jobId });
    }
  }

  async pauseQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    logger.info(`Queue '${queueName}' paused`);
  }

  async resumeQueue(queueName: string): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    logger.info(`Queue '${queueName}' resumed`);
  }

  async cleanQueue(queueName: string, grace: number = 1000): Promise<void> {
    const queue = this.getQueue(queueName);
    await queue.clean(grace, 'completed');
    await queue.clean(grace, 'failed');
    logger.info(`Queue '${queueName}' cleaned`);
  }

  private startMetricsTracking(): void {
    setInterval(async () => {
      for (const [name] of this.queues) {
        try {
          const stats = await this.getQueueStats(name);
          metricsService.setGauge('queue_waiting_jobs', stats.waiting, { queue: name });
          metricsService.setGauge('queue_active_jobs', stats.active, { queue: name });
          metricsService.setGauge('queue_delayed_jobs', stats.delayed, { queue: name });
          metricsService.setGauge('queue_failed_jobs', stats.failed, { queue: name });
        } catch (error) {
          logger.error(`Failed to track metrics for queue ${name}`, { error });
        }
      }
    }, 10000);
  }

  async close(): Promise<void> {
    logger.info('Closing queue service');
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue '${name}' closed`);
    }
    this.queues.clear();
    logger.info('Queue service closed');
  }
}

export const queueService = new QueueService();
