import cron, { ScheduledTask } from 'node-cron';
import { logger } from '../utils/logger';
import { ComplianceService } from '../services/compliance.service';
import { db } from '../config/database';
import { CacheIntegration } from '../services/cache-integration';

const log = logger.child({ component: 'ComplianceReviewJob' });

/**
 * Compliance Review Cron Job
 *
 * Runs daily at 2 AM to process pending compliance reviews
 * - Queries venue_compliance_reviews for pending reviews
 * - Generates compliance reports
 * - Updates review status and schedules next review
 */
export class ComplianceReviewJob {
  private task: ScheduledTask | null = null;
  private complianceService: ComplianceService;

  constructor(cache?: CacheIntegration) {
    this.complianceService = new ComplianceService(cache);
  }

  /**
   * Start the cron job
   */
  start(): void {
    // Run daily at 2 AM
    this.task = cron.schedule('0 2 * * *', async () => {
      log.info('Starting scheduled compliance review processing');

      try {
        const results = await this.processPendingReviews();
        log.info({
          processed: results.processed,
          failed: results.failed
        }, 'Compliance review processing completed');
      } catch (error) {
        log.error({ error }, 'Compliance review processing failed');
      }
    });

    log.info('Compliance review cron job started (runs daily at 2 AM)');
  }

  /**
   * Stop the cron job
   */
  stop(): void {
    if (this.task) {
      this.task.stop();
      log.info('Compliance review cron job stopped');
    }
  }

  /**
   * Process pending compliance reviews
   */
  private async processPendingReviews(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      // Get all pending reviews scheduled for today or earlier
      const pendingReviews = await db('venue_compliance_reviews')
        .where('status', 'pending')
        .where('scheduled_date', '<=', new Date())
        .select('id', 'venue_id');

      log.info({ count: pendingReviews.length }, 'Found pending compliance reviews');

      // Process each review
      for (const review of pendingReviews) {
        try {
          await this.processReview(review.id, review.venue_id);
          processed++;
        } catch (error) {
          log.error({
            reviewId: review.id,
            venueId: review.venue_id,
            error
          }, 'Failed to process compliance review');
          failed++;
        }
      }

      return { processed, failed };
    } catch (error) {
      log.error({ error }, 'Error fetching pending reviews');
      throw error;
    }
  }

  /**
   * Process a single compliance review
   */
  private async processReview(reviewId: string, venueId: string): Promise<void> {
    // Update status to in_progress
    await db('venue_compliance_reviews')
      .where('id', reviewId)
      .update({
        status: 'in_progress',
        processing_started_at: new Date(),
      });

    try {
      // Get venue to extract tenant_id
      const venue = await db('venues')
        .where('id', venueId)
        .first('tenant_id');

      if (!venue) {
        throw new Error(`Venue ${venueId} not found`);
      }

      // Generate compliance report
      const report = await this.complianceService.generateComplianceReport(
        venueId,
        venue.tenant_id
      );

      // Update review status to completed
      await db('venue_compliance_reviews')
        .where('id', reviewId)
        .update({
          status: 'completed',
          processing_completed_at: new Date(),
          completed_at: new Date(),
          report_id: report.id,
        });

      // Schedule next review (+90 days)
      const nextReviewDate = new Date();
      nextReviewDate.setDate(nextReviewDate.getDate() + 90);

      await this.complianceService.scheduleComplianceReview(
        venueId,
        nextReviewDate,
        venue.tenant_id
      );

      log.info({
        reviewId,
        venueId,
        status: report.overallStatus,
        nextReviewDate
      }, 'Compliance review processed successfully');
    } catch (error) {
      // Update review status to failed
      await db('venue_compliance_reviews')
        .where('id', reviewId)
        .update({
          status: 'failed',
          processing_completed_at: new Date(),
          completed_at: new Date(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
        });

      throw error;
    }
  }

  /**
   * Run processing manually (for testing)
   */
  async runNow(): Promise<{ processed: number; failed: number }> {
    log.info('Running compliance review processing manually');

    try {
      const results = await this.processPendingReviews();
      log.info(results, 'Manual compliance review processing completed');
      return results;
    } catch (error) {
      log.error({ error }, 'Manual compliance review processing failed');
      throw error;
    }
  }
}
