import { OrderAnalyticsService } from '../services/order-analytics.service';
import { logger } from '../utils/logger';

export class MetricsAggregationJob {
  private analyticsService: OrderAnalyticsService;
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.analyticsService = new OrderAnalyticsService();
  }

  start(intervalMinutes: number = 5): void {
    if (this.intervalId) {
      logger.warn('Metrics aggregation job already running');
      return;
    }

    logger.info(`Starting metrics aggregation job (every ${intervalMinutes} minutes)`);

    // Run immediately on start
    this.aggregate().catch(error => {
      logger.error('Error in initial metrics aggregation', { error });
    });

    // Then run periodically
    this.intervalId = setInterval(() => {
      this.aggregate().catch(error => {
        logger.error('Error in scheduled metrics aggregation', { error });
      });
    }, intervalMinutes * 60 * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Metrics aggregation job stopped');
    }
  }

  private async aggregate(): Promise<void> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    logger.info('Running metrics aggregation', { startDate, endDate });

    try {
      // In a real implementation, you would:
      // 1. Get list of all tenants
      // 2. For each tenant, calculate metrics
      // 3. Store metrics in a time-series database (InfluxDB, TimescaleDB, etc.)
      // 4. Optionally cache in Redis for fast retrieval

      // For now, just log that aggregation ran successfully
      logger.info('Metrics aggregation completed successfully');
    } catch (error) {
      logger.error('Metrics aggregation failed', { error });
      throw error;
    }
  }
}
