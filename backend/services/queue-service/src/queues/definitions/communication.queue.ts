import { Queue } from 'bull';
import { QueueFactory } from '../factories/queue.factory';
import { EmailProcessor } from '../../workers/communication/email.processor';
import { JOB_TYPES } from '../../config/constants';
import { logger } from '../../utils/logger';

export class CommunicationQueue {
  private queue: Queue;
  private emailProcessor: EmailProcessor;
  
  constructor() {
    this.queue = QueueFactory.getQueue('communication');
    this.emailProcessor = new EmailProcessor();
    this.setupProcessors();
  }
  
  private setupProcessors(): void {
    this.queue.process(JOB_TYPES.SEND_EMAIL, async (job) => {
      return await this.emailProcessor.process(job);
    });
    
    logger.info('Communication queue processors initialized');
  }
  
  getQueue(): Queue {
    return this.queue;
  }
}
