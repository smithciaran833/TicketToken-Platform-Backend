import { logger } from '../utils/logger';
import { getPool } from '../config/database.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { JOB_TYPES, QUEUE_NAMES } from '../config/constants';

export class RecoveryService {
  private pool = getPool();

  async recoverPendingJobs(): Promise<void> {
    try {
      logger.info('Starting job recovery process...');

      // Recover critical jobs from PostgreSQL
      const result = await this.pool.query(
        `SELECT * FROM critical_jobs 
         WHERE status IN ('pending', 'processing')
         AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY priority DESC, created_at ASC`
      );

      if (result.rows.length === 0) {
        logger.info('No jobs to recover');
        return;
      }

      logger.info(`Found ${result.rows.length} jobs to recover`);

      for (const row of result.rows) {
        try {
          await this.recoverJob(row);
        } catch (error) {
          logger.error(`Failed to recover job ${row.id}:`, error);
        }
      }

      logger.info('Job recovery completed');
    } catch (error) {
      logger.error('Recovery process failed:', error);
    }
  }

  private async recoverJob(jobData: any): Promise<void> {
    const queue = this.determineQueue(jobData.queue_name);
    
    if (!queue) {
      logger.warn(`Unknown queue for job ${jobData.id}: ${jobData.queue_name}`);
      return;
    }

    // Re-add the job to the queue
    const job = await queue.add(
      jobData.job_type,
      jobData.data,
      {
        jobId: jobData.id, // Use same ID
        priority: jobData.priority,
        attempts: 10 - jobData.attempts // Remaining attempts
      }
    );

    logger.info(`Recovered job ${job.id} to ${jobData.queue_name}`);
  }

  private determineQueue(queueName: string) {
    if (queueName === QUEUE_NAMES.MONEY) {
      return QueueFactory.getQueue('money');
    } else if (queueName === QUEUE_NAMES.COMMUNICATION) {
      return QueueFactory.getQueue('communication');
    } else if (queueName === QUEUE_NAMES.BACKGROUND) {
      return QueueFactory.getQueue('background');
    }
    return null;
  }
}
