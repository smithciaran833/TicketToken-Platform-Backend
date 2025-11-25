import { Queue, Worker, Job, QueueEvents } from 'bullmq';
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

class QueueService {
  private queues: Map<string, Queue> = new Map();
  private queueEvents: Map<string, QueueEvents> = new Map();

  async initialize(): Promise<void> {
    logger.info('Initializing queue service');

    this.createQueue(QueueName.NOTIFICATIONS);
    this.createQueue(QueueName.BATCH_NOTIFICATIONS);
    this.createQueue(QueueName.WEBHOOK_PROCESSING);
    this.createQueue(QueueName.RETRY);
    this.createQueue(QueueName.DEAD_LETTER);

    this.startMetricsTracking();

    logger.info('Queue service initialized');
  }

  private createQueue(name: string): Queue {
    const queue = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          count: 1000,
          age: 24 * 3600,
        },
        removeOnFail: {
          count: 5000,
          age: 7 * 24 * 3600,
        },
      },
    });

    const events = new QueueEvents(name, { connection: redis });

    events.on('completed', ({ jobId }: { jobId: string }) => {
      logger.debug(`Job ${jobId} completed in queue ${name}`);
      metricsService.incrementCounter('queue_jobs_completed_total', { queue: name });
    });

    events.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      logger.error(`Job ${jobId} failed in queue ${name}`, { reason: failedReason });
      metricsService.incrementCounter('queue_jobs_failed_total', { queue: name });
    });

    events.on('stalled', ({ jobId }: { jobId: string }) => {
      logger.warn(`Job ${jobId} stalled in queue ${name}`);
      metricsService.incrementCounter('queue_jobs_stalled_total', { queue: name });
    });

    this.queues.set(name, queue);
    this.queueEvents.set(name, events);

    logger.info(`Queue '${name}' created`);
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
    for (const [name, events] of this.queueEvents) {
      await events.close();
      logger.info(`Events for queue '${name}' closed`);
    }
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue '${name}' closed`);
    }
    this.queueEvents.clear();
    this.queues.clear();
    logger.info('Queue service closed');
  }
}

export const queueService = new QueueService();
