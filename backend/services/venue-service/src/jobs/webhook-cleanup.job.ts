import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { WebhookService } from '../services/webhook.service';
import { db } from '../config/database';
import Redis from 'ioredis';

const log = logger.child({ component: 'WebhookCleanupJob' });

/**
 * Webhook Cleanup Cron Job
 *
 * Runs daily at 3 AM to clean up old webhook events
 * Deletes completed/failed events older than 30 days
 */
export class WebhookCleanupJob {
  private task: ScheduledTask | null = null;
  private webhookService: WebhookService;

  // FIXED: Accept Redis via constructor instead of calling getRedis()
  constructor(redis: Redis) {
    this.webhookService = new WebhookService(db, redis);
  }

  /**
   * Start the cron job
   */
  start(): void {
    // Run daily at 3 AM
    this.task = cron.schedule('0 3 * * *', async () => {
      log.info('Starting scheduled webhook cleanup');

      try {
        const deletedCount = await this.webhookService.cleanupOldEvents(30);
        log.info({ deletedCount }, 'Webhook cleanup completed successfully');
      } catch (error) {
        log.error({ error }, 'Webhook cleanup failed');
      }
    });

    log.info('Webhook cleanup cron job started (runs daily at 3 AM)');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      log.info('Webhook cleanup cron job stopped');
    }
  }

  /**
   * Run cleanup manually (for testing)
   */
  async runNow(): Promise<number> {
    log.info('Running webhook cleanup manually');

    try {
      const deletedCount = await this.webhookService.cleanupOldEvents(30);
      log.info({ deletedCount }, 'Manual webhook cleanup completed');
      return deletedCount;
    } catch (error) {
      log.error({ error }, 'Manual webhook cleanup failed');
      throw error;
    }
  }
}
