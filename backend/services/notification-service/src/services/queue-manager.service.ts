import Bull from 'bull';
import { env } from '../config/env';
import { logger } from '../config/logger';

export class QueueManager {
  private queues: Map<string, Bull.Queue> = new Map();
  private readonly QUEUE_CONFIGS = {
    CRITICAL: { 
      name: 'critical-notifications',
      concurrency: 10,
      maxDelay: 30000, // 30 seconds
      priority: 1
    },
    HIGH: { 
      name: 'high-notifications',
      concurrency: 5,
      maxDelay: 300000, // 5 minutes
      priority: 2
    },
    NORMAL: { 
      name: 'normal-notifications',
      concurrency: 3,
      maxDelay: 1800000, // 30 minutes
      priority: 3
    },
    BULK: { 
      name: 'bulk-notifications',
      concurrency: 1,
      maxDelay: 14400000, // 4 hours
      priority: 4
    }
  };

  constructor() {
    this.initializeQueues();
  }

  private initializeQueues() {
    Object.entries(this.QUEUE_CONFIGS).forEach(([priority, config]) => {
      const queue = new Bull(config.name, {
        redis: {
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          password: env.REDIS_PASSWORD,
        },
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
          attempts: env.MAX_RETRY_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: env.RETRY_DELAY_MS,
          },
        },
      });

      // Add queue event handlers
      queue.on('completed', (job) => {
        logger.info(`${priority} notification completed`, { jobId: job.id });
      });

      queue.on('failed', (job, err) => {
        logger.error(`${priority} notification failed`, { 
          jobId: job.id, 
          error: err.message 
        });
      });

      queue.on('stalled', (job) => {
        logger.warn(`${priority} notification stalled`, { jobId: job.id });
      });

      this.queues.set(priority, queue);
    });
  }

  async addToQueue(
    priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'BULK',
    data: any
  ): Promise<Bull.Job> {
    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`Queue for priority ${priority} not found`);
    }

    const config = this.QUEUE_CONFIGS[priority];
    return await queue.add(data, {
      priority: config.priority,
      delay: this.calculateDelay(priority),
    });
  }

  private calculateDelay(_priority: string): number {
    // Implement rate limiting logic here
    // For now, return 0 for immediate processing
    return 0;
  }

  async getQueueMetrics() {
    const metrics: any = {};
    
    for (const [priority, queue] of this.queues) {
      const jobCounts = await queue.getJobCounts();
      metrics[priority] = {
        waiting: jobCounts.waiting,
        active: jobCounts.active,
        completed: jobCounts.completed,
        failed: jobCounts.failed,
        delayed: jobCounts.delayed,
      };
    }
    
    return metrics;
  }

  async pauseQueue(priority: string) {
    const queue = this.queues.get(priority);
    if (queue) {
      await queue.pause();
      logger.info(`Queue ${priority} paused`);
    }
  }

  async resumeQueue(priority: string) {
    const queue = this.queues.get(priority);
    if (queue) {
      await queue.resume();
      logger.info(`Queue ${priority} resumed`);
    }
  }

  async drainQueue(priority: string) {
    const queue = this.queues.get(priority);
    if (queue) {
      await queue.empty();
      logger.info(`Queue ${priority} drained`);
    }
  }

  setupQueueProcessors(processor: (job: Bull.Job) => Promise<any>) {
    this.queues.forEach((queue, priority) => {
      const config = this.QUEUE_CONFIGS[priority as keyof typeof this.QUEUE_CONFIGS];
      queue.process(config.concurrency, processor);
    });
  }
}

export const queueManager = new QueueManager();
