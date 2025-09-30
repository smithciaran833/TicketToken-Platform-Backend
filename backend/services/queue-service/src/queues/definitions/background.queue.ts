import { Queue } from 'bull';
import { QueueFactory } from '../factories/queue.factory';
import { AnalyticsProcessor } from '../../workers/background/analytics.processor';
import { JOB_TYPES } from '../../config/constants';
import { logger } from '../../utils/logger';

export class BackgroundQueue {
  private queue: Queue;
  private analyticsProcessor: AnalyticsProcessor;
  
  constructor() {
    this.queue = QueueFactory.getQueue('background');
    this.analyticsProcessor = new AnalyticsProcessor();
    this.setupProcessors();
  }
  
  private setupProcessors(): void {
    this.queue.process(JOB_TYPES.ANALYTICS_TRACK, async (job) => {
      return await this.analyticsProcessor.process(job);
    });
    
    logger.info('Background queue processors initialized');
  }
  
  getQueue(): Queue {
    return this.queue;
  }
}
