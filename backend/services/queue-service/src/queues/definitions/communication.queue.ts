import PgBoss from 'pg-boss';
import { QueueFactory } from '../factories/queue.factory';
import { EmailProcessor } from '../../workers/communication/email.processor';
import { JOB_TYPES } from '../../config/constants';
import { QUEUE_CONFIGS } from '../../config/queues.config';
import { logger } from '../../utils/logger';

export class CommunicationQueue {
  private boss: PgBoss;
  private emailProcessor: EmailProcessor;
  private config = QUEUE_CONFIGS.COMMUNICATION_QUEUE;
  
  constructor() {
    this.boss = QueueFactory.getBoss();
    this.emailProcessor = new EmailProcessor();
    this.setupProcessors();
  }
  
  private setupProcessors(): void {
    this.boss.work(JOB_TYPES.EMAIL_SEND, async (job: any) => {
      try {
        const result = await this.emailProcessor.process({ data: job.data } as any);
        return result;
      } catch (error) {
        logger.error('Email job failed:', error);
        throw error;
      }
    });
    
    logger.info('Communication queue processors initialized');
  }
  
  async addJob(jobType: string, data: any, options: any = {}): Promise<string | null> {
    try {
      const jobId = await this.boss.send(
        jobType,
        data,
        {
          retryLimit: this.config.retryLimit,
          retryDelay: this.config.retryDelay,
          retryBackoff: this.config.retryBackoff,
          expireInSeconds: this.config.expireInSeconds,
          ...options
        }
      );
      
      logger.info(`Job added to communication queue: ${jobType} (${jobId})`);
      return jobId;
    } catch (error) {
      logger.error(`Failed to add job to communication queue: ${jobType}`, error);
      throw error;
    }
  }
  
  getBoss(): PgBoss {
    return this.boss;
  }
}
