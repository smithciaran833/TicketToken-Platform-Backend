import cron from 'node-cron';
import { logger } from '../config/logger';
import { dataRetentionService } from '../services/data-retention.service';

/**
 * Data Retention Cron Job
 * 
 * Runs daily at 2 AM to clean up old data according to retention policies
 */
export class DataRetentionJob {
  private task: cron.ScheduledTask | null = null;

  /**
   * Start the cron job
   */
  start(): void {
    // Run daily at 2 AM
    this.task = cron.schedule('0 2 * * *', async () => {
      logger.info('Starting scheduled data retention cleanup');
      
      try {
        const results = await dataRetentionService.runCleanup();
        
        logger.info('Data retention cleanup completed successfully', results);
      } catch (error) {
        logger.error('Data retention cleanup failed', { error });
      }
    });

    logger.info('Data retention cron job started (runs daily at 2 AM)');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      logger.info('Data retention cron job stopped');
    }
  }

  /**
   * Run cleanup manually (for testing)
   */
  async runNow(): Promise<void> {
    logger.info('Running data retention cleanup manually');
    
    try {
      const results = await dataRetentionService.runCleanup();
      logger.info('Manual data retention cleanup completed', results);
    } catch (error) {
      logger.error('Manual data retention cleanup failed', { error });
      throw error;
    }
  }
}

export const dataRetentionJob = new DataRetentionJob();
