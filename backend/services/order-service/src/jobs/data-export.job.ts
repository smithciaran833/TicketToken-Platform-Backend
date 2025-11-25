/**
 * Data Export Job
 * 
 * Background job to process pending data access requests
 * Runs every 5 minutes to check for and process pending export requests
 */

import { getDatabase } from '../config/database';
import { DataAccessService } from '../services/data-access.service';
import { DataAccessRequestStatus } from '../types/privacy.types';
import { logger } from '../utils/logger';
import { withLock } from '../utils/distributed-lock';

export class DataExportJob {
  private dataAccessService: DataAccessService;
  private isRunning: boolean = false;

  constructor() {
    const pool = getDatabase();
    this.dataAccessService = new DataAccessService(pool);
  }

  /**
   * Process pending data export requests
   */
  async execute(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Data export job is already running, skipping this execution');
      return;
    }

    this.isRunning = true;

    try {
      await withLock('data-export-job', async () => {
        logger.info('Starting data export job');

        const pool = getDatabase();

        // Get all pending requests
        const result = await pool.query(
          `SELECT id FROM data_access_requests 
           WHERE status = $1 
           ORDER BY requested_at ASC 
           LIMIT 10`,
          [DataAccessRequestStatus.PENDING]
        );

        if (result.rows.length === 0) {
          logger.info('No pending data export requests');
          return;
        }

        logger.info(`Processing ${result.rows.length} pending data export requests`);

        // Process each request
        for (const request of result.rows) {
          try {
            await this.dataAccessService.processAccessRequest(request.id);
            logger.info(`Successfully processed data export request: ${request.id}`);
          } catch (error) {
            logger.error(`Failed to process data export request: ${request.id}`, { error });
            // Continue with next request
          }
        }

        logger.info('Data export job completed');
      }, { ttl: 300000 }); // 5 minute lock

    } catch (error) {
      logger.error('Data export job failed', { error });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Cleanup expired exports
   */
  async cleanupExpired(): Promise<void> {
    try {
      await withLock('data-export-cleanup-job', async () => {
        logger.info('Starting cleanup of expired data exports');

        const deletedCount = await this.dataAccessService.cleanupExpiredExports();

        logger.info(`Cleaned up ${deletedCount} expired data exports`);
      }, { ttl: 300000 }); // 5 minute lock

    } catch (error) {
      logger.error('Failed to cleanup expired exports', { error });
    }
  }
}

/**
 * Create and export job instance
 */
export const dataExportJob = new DataExportJob();

/**
 * Job execution function for scheduler
 */
export async function executeDataExportJob(): Promise<void> {
  await dataExportJob.execute();
}

/**
 * Cleanup execution function for scheduler
 */
export async function executeDataExportCleanup(): Promise<void> {
  await dataExportJob.cleanupExpired();
}
