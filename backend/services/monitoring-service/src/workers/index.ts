import { logger } from '../logger';
import cron from 'node-cron';

export async function startWorkers() {
  logger.info('Starting background workers...');

  // Alert evaluation worker - every 60 seconds
  cron.schedule('*/60 * * * * *', async () => {
    try {
      logger.debug('Running alert evaluation...');
    } catch (error) {
      logger.error('Alert evaluation error:', error);
    }
  });

  // Metric aggregation worker - every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      logger.debug('Running metric aggregation...');
    } catch (error) {
      logger.error('Metric aggregation error:', error);
    }
  });

  // Cleanup worker - every hour
  cron.schedule('0 * * * *', async () => {
    try {
      logger.debug('Running cleanup...');
    } catch (error) {
      logger.error('Cleanup error:', error);
    }
  });

  logger.info('Background workers started');
}

export function stopWorkers() {
  logger.info('Stopping background workers...');
}
