import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { CustomerAnalyticsService } from '../services/customer-analytics.service';

export class CustomerAnalyticsJob {
  private intervalId: NodeJS.Timeout | null = null;
  private analyticsService: CustomerAnalyticsService;

  constructor() {
    this.analyticsService = new CustomerAnalyticsService(getDatabase());
  }

  async execute(): Promise<void> {
    try {
      logger.info('Starting customer analytics job');

      const usersResult = await getDatabase().query(`
        SELECT DISTINCT tenant_id, user_id 
        FROM orders 
        WHERE status IN ('CONFIRMED', 'COMPLETED')
      `);

      logger.info(`Updating analytics for ${usersResult.rows.length} customers`);

      for (const row of usersResult.rows) {
        try {
          await this.analyticsService.updateCustomerAnalytics(row.tenant_id, row.user_id);
          await this.analyticsService.assignCustomerSegment(row.tenant_id, row.user_id);
        } catch (error) {
          logger.error('Failed to update customer analytics', { error, userId: row.user_id });
        }
      }

      logger.info('Completed customer analytics job');
    } catch (error) {
      logger.error('Error in customer analytics job', { error });
    }
  }

  start(): void {
    const runAt = new Date();
    runAt.setHours(3, 0, 0, 0);
    
    const now = new Date();
    let delay = runAt.getTime() - now.getTime();
    
    if (delay < 0) {
      delay += 24 * 60 * 60 * 1000;
    }

    setTimeout(() => {
      this.execute();
      this.intervalId = setInterval(() => this.execute(), 24 * 60 * 60 * 1000);
    }, delay);

    logger.info('Customer analytics job scheduled', { nextRun: new Date(now.getTime() + delay) });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Customer analytics job stopped');
    }
  }
}
