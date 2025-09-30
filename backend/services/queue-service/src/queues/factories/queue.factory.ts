import Bull, { Queue } from 'bull';
import { logger } from '../../utils/logger';
import { QUEUE_CONFIGS } from '../../config/queues.config';
import { QueueType } from '../../types/queue.types';
import { PersistenceService } from '../../services/persistence.service';
import { PERSISTENCE_TIERS } from '../../config/constants';

export class QueueFactory {
  private static queues: Map<string, Queue> = new Map();
  private static persistenceServices: Map<string, PersistenceService> = new Map();
  private static initialized = false;

  static async initialize(): Promise<void> {
    if (this.initialized) return;
    
    logger.info('Initializing queues with persistence...');
    
    // Create money queue with Tier 1 persistence
    const moneyQueue = await this.createQueue('money');
    const moneyPersistence = new PersistenceService(PERSISTENCE_TIERS.TIER_1);
    this.persistenceServices.set('money', moneyPersistence);
    this.setupPersistenceHandlers(moneyQueue, moneyPersistence);
    
    // Create communication queue with Tier 2 persistence
    const commQueue = await this.createQueue('communication');
    const commPersistence = new PersistenceService(PERSISTENCE_TIERS.TIER_2);
    this.persistenceServices.set('communication', commPersistence);
    this.setupPersistenceHandlers(commQueue, commPersistence);
    
    // Create background queue with Tier 3 (no persistence)
    const bgQueue = await this.createQueue('background');
    const bgPersistence = new PersistenceService(PERSISTENCE_TIERS.TIER_3);
    this.persistenceServices.set('background', bgPersistence);
    
    this.initialized = true;
    logger.info('All queues initialized with persistence');
  }

  static async createQueue(type: QueueType): Promise<Queue> {
    const configKey = `${type.toUpperCase()}_QUEUE`;
    const config = QUEUE_CONFIGS[configKey];
    
    if (!config) {
      throw new Error(`No configuration found for queue type: ${type}`);
    }
    
    const queue = new Bull(config.name, {
      redis: config.redis,
      defaultJobOptions: config.defaultJobOptions
    });
    
    this.setupEventHandlers(queue, type);
    this.queues.set(type, queue);
    
    logger.info(`Queue created: ${config.name} (${config.persistenceTier})`);
    return queue;
  }

  private static setupPersistenceHandlers(queue: Queue, persistence: PersistenceService): void {
    // Save job when it enters the queue
    queue.on('waiting', async (jobId) => {
      try {
        const job = await queue.getJob(jobId);
        if (job) {
          await persistence.saveJob(job);
        }
      } catch (error) {
        logger.error(`Failed to persist job ${jobId}:`, error);
      }
    });

    // Mark job as complete
    queue.on('completed', async (job, result) => {
      try {
        await persistence.markComplete(job.id, result);
      } catch (error) {
        logger.error(`Failed to mark job ${job.id} as complete:`, error);
      }
    });

    // Mark job as failed
    queue.on('failed', async (job, error) => {
      try {
        await persistence.markFailed(job.id, error);
      } catch (error) {
        logger.error(`Failed to mark job ${job.id} as failed:`, error);
      }
    });
  }

  static getQueue(type: QueueType): Queue {
    const queue = this.queues.get(type);
    if (!queue) {
      throw new Error(`Queue not initialized: ${type}`);
    }
    return queue;
  }

  private static setupEventHandlers(queue: Queue, type: QueueType): void {
    queue.on('completed', (job, result) => {
      logger.info(`Job completed in ${type} queue:`, {
        jobId: job.id,
        jobName: job.name,
        duration: Date.now() - job.timestamp
      });
    });

    queue.on('failed', (job, error) => {
      logger.error(`Job failed in ${type} queue:`, {
        jobId: job.id,
        jobName: job.name,
        error: error.message,
        attempts: job.attemptsMade
      });
    });

    queue.on('stalled', (job) => {
      logger.warn(`Job stalled in ${type} queue:`, {
        jobId: job.id,
        jobName: job.name
      });
    });
  }

  static async shutdown(): Promise<void> {
    logger.info('Shutting down queues...');
    
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue closed: ${name}`);
    }
    
    this.queues.clear();
    this.persistenceServices.clear();
    this.initialized = false;
  }

  static async getQueueMetrics(type: QueueType) {
    const queue = this.getQueue(type);
    const counts = await queue.getJobCounts();
    
    return {
      name: queue.name,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed
    };
  }
}
