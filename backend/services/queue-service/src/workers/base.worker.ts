import { Job } from 'bull';
import { logger } from '../utils/logger';

export abstract class BaseWorker<T = any, R = any> {
  protected abstract name: string;
  
  async process(job: Job<T>): Promise<R> {
    const startTime = Date.now();
    
    try {
      logger.info(`Processing job ${this.name}:`, {
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        maxAttempts: job.opts.attempts
      });
      
      const result = await this.execute(job);
      
      const duration = Date.now() - startTime;
      logger.info(`Job ${this.name} completed:`, {
        jobId: job.id,
        duration
      });
      
      return result;
    } catch (error) {
      logger.error(`Job ${this.name} failed:`, {
        jobId: job.id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }
  
  protected abstract execute(job: Job<T>): Promise<R>;
}
