import { buildApp } from './app';
import { FastifyInstance } from 'fastify';
import { logger } from './config/logger';
import { dataRetentionJob } from './jobs/data-retention.job';

export async function createServer(): Promise<FastifyInstance> {
  const app = await buildApp();
  
  // Start data retention cron job
  if (process.env.NODE_ENV === 'production') {
    dataRetentionJob.start();
    logger.info('Data retention cron job started');
  } else {
    logger.info('Data retention cron job not started (development mode)');
  }
  
  return app;
}

export default createServer;
