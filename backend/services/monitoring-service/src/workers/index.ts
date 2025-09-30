import { logger } from '../utils/logger';
import cron from 'node-cron';

export async function startWorkers() {
  logger.info('Starting background workers...');
  
  // Alert evaluation worker - every 60 seconds
  cron.schedule('*/60 * * * * *', async () => {
    try {
      // TODO: Implement alert evaluation
      logger.debug('Running alert evaluation...');
    } catch (error) {
      logger.error('Alert evaluation error:', error);
    }
  });

  // Metric aggregation worker - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      // TODO: Implement metric aggregation
      logger.debug('Running metric aggregation...');
    } catch (error) {
      logger.error('Metric aggregation error:', error);
    }
  });

  // Cleanup worker - every hour
  cron.schedule('0 * * * *', async () => {
    try {
      // TODO: Implement cleanup
      logger.debug('Running cleanup...');
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  });

  logger.info('Background workers started');
}

export function stopWorkers() {
  // Stop all cron jobs
  logger.info('Stopping background workers...');
}

// Import ML worker
import { startMLWorker } from './ml-analysis.worker';

// Add to startWorkers function
export async function startMLWorkers() {
  await startMLWorker();
}
