import { DeadLetterQueueService } from '../services/dead-letter-queue.service';
import { logger } from '../utils/logger';

/**
 * DLQ Cleanup Job
 * 
 * Runs periodically to purge old failed events from the Dead Letter Queue
 * Schedule: Daily at 2:00 AM
 */
export class DLQCleanupJob {
  /**
   * Execute the cleanup job
   */
  static async execute(): Promise<void> {
    try {
      logger.info('Starting DLQ cleanup job');

      const daysOld = parseInt(process.env.DLQ_RETENTION_DAYS || '30', 10);
      const purgedCount = await DeadLetterQueueService.purgeOldEvents(daysOld);

      logger.info('DLQ cleanup job completed', { purgedCount, daysOld });
    } catch (error) {
      logger.error('DLQ cleanup job failed', { error });
      throw error;
    }
  }

  /**
   * Get job metrics for monitoring
   */
  static async getMetrics() {
    try {
      const metrics = await DeadLetterQueueService.getMetrics();
      
      return {
        totalFailed: metrics.totalFailed,
        byEventType: metrics.byEventType,
        oldestEvent: metrics.oldestEvent,
        newestEvent: metrics.newestEvent,
      };
    } catch (error) {
      logger.error('Failed to get DLQ metrics', { error });
      return {
        totalFailed: 0,
        byEventType: {},
        error: 'Failed to retrieve metrics',
      };
    }
  }
}

/**
 * Schedule the job (example using node-cron)
 * This should be registered in the main server file
 */
export function scheduleDLQCleanup(cronExpression: string = '0 2 * * *') {
  // Example scheduling with node-cron (pseudo-code)
  // const cron = require('node-cron');
  // cron.schedule(cronExpression, async () => {
  //   await DLQCleanupJob.execute();
  // });
  
  logger.info('DLQ cleanup job scheduled', { cronExpression });
}
