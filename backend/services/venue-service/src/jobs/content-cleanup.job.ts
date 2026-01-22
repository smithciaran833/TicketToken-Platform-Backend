import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { VenueContentModel } from '../models/mongodb/venue-content.model';

const log = logger.child({ component: 'ContentCleanupJob' });

/**
 * Content Cleanup Cron Job
 *
 * Runs daily at 4 AM to clean up old archived content from MongoDB
 * Deletes archived content older than 30 days
 *
 * NOTE: MongoDB TTL index should handle this automatically,
 * but this job provides a manual fallback and monitoring
 */
export class ContentCleanupJob {
  private task: ScheduledTask | null = null;

  /**
   * Start the cron job
   */
  start(): void {
    // Run daily at 4 AM
    this.task = cron.schedule('0 4 * * *', async () => {
      log.info('Starting scheduled content cleanup');

      try {
        const result = await this.cleanupArchivedContent();
        log.info({
          deletedCount: result.deletedCount
        }, 'Content cleanup completed successfully');
      } catch (error) {
        log.error({ error }, 'Content cleanup failed');
      }
    });

    log.info('Content cleanup cron job started (runs daily at 4 AM)');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      log.info('Content cleanup cron job stopped');
    }
  }

  /**
   * Clean up archived content older than 30 days
   */
  private async cleanupArchivedContent(): Promise<{ deletedCount: number }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    try {
      // Delete content that was archived more than 30 days ago
      const result = await VenueContentModel.deleteMany({
        archivedAt: { $lt: cutoffDate },
        status: 'archived',
      });

      log.info({
        deletedCount: result.deletedCount,
        cutoffDate
      }, 'Archived content cleaned up');

      return { deletedCount: result.deletedCount || 0 };
    } catch (error) {
      log.error({ error }, 'Error cleaning up archived content');
      throw error;
    }
  }

  /**
   * Verify MongoDB TTL index exists
   * This should be called on startup to ensure automatic cleanup works
   */
  async verifyTTLIndex(): Promise<boolean> {
    try {
      const indexes = await VenueContentModel.collection.getIndexes();

      // Check if TTL index on archivedAt exists
      const hasTTLIndex = Object.values(indexes).some((index: any) =>
        index.key?.archivedAt && index.expireAfterSeconds !== undefined
      );

      if (hasTTLIndex) {
        log.info('MongoDB TTL index verified on VenueContent.archivedAt');
      } else {
        log.warn('MongoDB TTL index NOT found on VenueContent.archivedAt - manual cleanup will be used');
      }

      return hasTTLIndex;
    } catch (error) {
      log.error({ error }, 'Error verifying TTL index');
      return false;
    }
  }

  /**
   * Create TTL index if it doesn't exist
   * TTL index automatically deletes documents 30 days after archivedAt timestamp
   */
  async ensureTTLIndex(): Promise<void> {
    try {
      await VenueContentModel.collection.createIndex(
        { archivedAt: 1 },
        {
          expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days in seconds
          name: 'archivedAt_ttl',
          partialFilterExpression: { archivedAt: { $exists: true } }
        }
      );

      log.info('MongoDB TTL index created on VenueContent.archivedAt (30 day expiry)');
    } catch (error: any) {
      // Index might already exist
      if (error.code === 85 || error.codeName === 'IndexOptionsConflict') {
        log.info('TTL index already exists on VenueContent.archivedAt');
      } else {
        log.error({ error }, 'Error creating TTL index');
        throw error;
      }
    }
  }

  /**
   * Run cleanup manually (for testing)
   */
  async runNow(): Promise<{ deletedCount: number }> {
    log.info('Running content cleanup manually');

    try {
      const result = await this.cleanupArchivedContent();
      log.info(result, 'Manual content cleanup completed');
      return result;
    } catch (error) {
      log.error({ error }, 'Manual content cleanup failed');
      throw error;
    }
  }
}

export const contentCleanupJob = new ContentCleanupJob();
