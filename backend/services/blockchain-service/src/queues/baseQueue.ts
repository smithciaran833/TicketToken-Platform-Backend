import Bull, { Queue, Job, JobOptions } from 'bull';
import { EventEmitter } from 'events';
import queueConfig from '../config/queue';
import { logger } from '../utils/logger';

interface QueueMetrics {
  processed: number;
  failed: number;
  completed: number;
  active: number;
}

interface JobInfo {
  id: string | number | undefined;
  data: any;
  opts: JobOptions;
}

interface JobStatus {
  id: string | number | undefined;
  state: string;
  progress: number | object;
  data: any;
  failedReason: string | undefined;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
}

interface QueueStats {
  name: string;
  counts: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    total: number;
  };
  metrics: QueueMetrics;
}

export class BaseQueue extends EventEmitter {
  protected queueName: string;
  protected queue: Queue;
  protected metrics: QueueMetrics;

  constructor(queueName: string, options: any = {}) {
    super();
    this.queueName = queueName;
    this.queue = new Bull(queueName, {
      redis: queueConfig.redis,
      defaultJobOptions: {
        ...queueConfig.defaultJobOptions,
        ...options.defaultJobOptions
      }
    });

    this.setupEventHandlers();
    this.metrics = {
      processed: 0,
      failed: 0,
      completed: 0,
      active: 0
    };
  }

  setupEventHandlers(): void {
    this.queue.on('completed', (job: Job, result: any) => {
      this.metrics.completed++;
      logger.info('Queue job completed', { 
        queue: this.queueName, 
        jobId: job.id 
      });
      this.emit('job:completed', { job, result });
    });

    this.queue.on('failed', (job: Job, err: Error) => {
      this.metrics.failed++;
      logger.error('Queue job failed', { 
        queue: this.queueName, 
        jobId: job.id, 
        error: err.message 
      });
      this.emit('job:failed', { job, error: err });
    });

    this.queue.on('active', (job: Job) => {
      this.metrics.active++;
      logger.info('Queue job started', { 
        queue: this.queueName, 
        jobId: job.id 
      });
      this.emit('job:active', { job });
    });

    this.queue.on('stalled', (job: Job) => {
      logger.warn('Queue job stalled', { 
        queue: this.queueName, 
        jobId: job.id 
      });
      this.emit('job:stalled', { job });
    });

    this.queue.on('error', (error: Error) => {
      logger.error('Queue error', { 
        queue: this.queueName, 
        error: error.message 
      });
      this.emit('queue:error', error);
    });
  }

  async addJob(data: any, options: JobOptions = {}): Promise<JobInfo> {
    const job = await this.queue.add(data, options);
    return {
      id: job.id,
      data: job.data,
      opts: job.opts
    };
  }

  async getJob(jobId: string | number): Promise<Job | null> {
    return await this.queue.getJob(jobId);
  }

  async getJobStatus(jobId: string | number): Promise<JobStatus | null> {
    const job = await this.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    };
  }

  async retryJob(jobId: string | number): Promise<{ success: boolean; jobId: string | number }> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    await job.retry();
    return { success: true, jobId };
  }

  async removeJob(jobId: string | number): Promise<{ success: boolean; jobId: string | number }> {
    const job = await this.getJob(jobId);
    if (!job) throw new Error('Job not found');

    await job.remove();
    return { success: true, jobId };
  }

  async getQueueStats(): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
      this.queue.getPausedCount()
    ]);

    return {
      name: this.queueName,
      counts: {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
        total: waiting + active + completed + failed + delayed + paused
      },
      metrics: this.metrics
    };
  }

  async pause(): Promise<void> {
    await this.queue.pause();
    logger.info('Queue paused', { queue: this.queueName });
  }

  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info('Queue resumed', { queue: this.queueName });
  }

  async clean(grace: number = 0): Promise<Job[]> {
    // Clean jobs older than grace period (ms)
    const cleaned = await this.queue.clean(grace);
    logger.info('Queue cleaned', { 
      queue: this.queueName, 
      cleanedCount: cleaned.length 
    });
    return cleaned;
  }

  async close(): Promise<void> {
    await this.queue.close();
    logger.info('Queue closed', { queue: this.queueName });
  }
}

export default BaseQueue;
