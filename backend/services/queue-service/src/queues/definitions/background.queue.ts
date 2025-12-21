import PgBoss from 'pg-boss';
import { QueueFactory } from '../factories/queue.factory';
import { AnalyticsProcessor } from '../../workers/background/analytics.processor';
import { JOB_TYPES } from '../../config/constants';
import { QUEUE_CONFIGS } from '../../config/queues.config';
import { logger } from '../../utils/logger';

export class BackgroundQueue {
  private boss: PgBoss;
  private analyticsProcessor: AnalyticsProcessor;
  private config = QUEUE_CONFIGS.BACKGROUND_QUEUE;
  
  constructor() {
    this.boss = QueueFactory.getBoss();
    this.analyticsProcessor = new AnalyticsProcessor();
    this.setupProcessors();
  }
  
  private setupProcessors(): void {
    this.boss.work(JOB_TYPES.ANALYTICS_PROCESS, async (job: any) => {
      try {
        const result = await this.analyticsProcessor.process({ data: job.data } as any);
        return result;
      } catch (error) {
        logger.error('Analytics job failed:', error);
        throw error;
      }
    });
    
    logger.info('Background queue processors initialized');
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
      
      logger.info(`Job added to background queue: ${jobType} (${jobId})`);
      return jobId;
    } catch (error) {
      logger.error(`Failed to add job to background queue: ${jobType}`, error);
      throw error;
    }
  }
  
  getBoss(): PgBoss {
    return this.boss;
  }
}
