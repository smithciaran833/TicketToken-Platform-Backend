import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { OrderReportService } from '../services/order-report.service';

export class ReportGenerationJob {
  private intervalId: NodeJS.Timeout | null = null;
  private orderReportService: OrderReportService;

  constructor() {
    this.orderReportService = new OrderReportService(getDatabase());
  }

  async execute(): Promise<void> {
    try {
      logger.info('Starting report generation job');

      // Get yesterday's date
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Get all tenants
      const tenantsResult = await getDatabase().query('SELECT DISTINCT tenant_id FROM orders');
      const tenants = tenantsResult.rows.map(row => row.tenant_id);

      logger.info(`Generating reports for ${tenants.length} tenants`);

      // Generate daily reports for each tenant
      for (const tenantId of tenants) {
        try {
          await this.orderReportService.generateDailySummary(tenantId, yesterday);
          logger.info('Generated daily report', { tenantId, date: yesterday });
        } catch (error) {
          logger.error('Failed to generate daily report', { error, tenantId });
        }
      }

      logger.info('Completed report generation job');
    } catch (error) {
      logger.error('Error in report generation job', { error });
    }
  }

  start(): void {
    // Run daily at 2:00 AM
    const runAt = new Date();
    runAt.setHours(2, 0, 0, 0);
    
    const now = new Date();
    let delay = runAt.getTime() - now.getTime();
    
    if (delay < 0) {
      delay += 24 * 60 * 60 * 1000; // Add 24 hours if time has passed today
    }

    setTimeout(() => {
      this.execute();
      this.intervalId = setInterval(() => this.execute(), 24 * 60 * 60 * 1000); // Run daily
    }, delay);

    logger.info('Report generation job scheduled', { nextRun: new Date(now.getTime() + delay) });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Report generation job stopped');
    }
  }
}
