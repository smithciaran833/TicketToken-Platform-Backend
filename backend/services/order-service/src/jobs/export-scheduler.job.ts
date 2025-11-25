import { getDatabase } from '../config/database';
import { logger } from '../utils/logger';
import { ScheduledExportService } from '../services/scheduled-export.service';

export class ExportSchedulerJob {
  private intervalId: NodeJS.Timeout | null = null;
  private exportService: ScheduledExportService;

  constructor() {
    this.exportService = new ScheduledExportService(getDatabase());
  }

  async execute(): Promise<void> {
    try {
      logger.info('Starting export scheduler job');

      const result = await getDatabase().query(`
        SELECT * FROM scheduled_exports
        WHERE is_active = true
          AND next_execution_at <= NOW()
      `);

      logger.info(`Found ${result.rows.length} scheduled exports to process`);

      for (const row of result.rows) {
        try {
          await this.exportService.executeScheduledExport(row.id);
          
          await getDatabase().query(`
            UPDATE scheduled_exports
            SET last_executed_at = NOW(),
                next_execution_at = NOW() + INTERVAL '1 day',
                updated_at = NOW()
            WHERE id = $1
          `, [row.id]);
        } catch (error) {
          logger.error('Failed to execute scheduled export', { error, exportId: row.id });
        }
      }

      logger.info('Completed export scheduler job');
    } catch (error) {
      logger.error('Error in export scheduler job', { error });
    }
  }

  start(): void {
    this.intervalId = setInterval(() => this.execute(), 60 * 60 * 1000); // Run every hour
    logger.info('Export scheduler job started (runs hourly)');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Export scheduler job stopped');
    }
  }
}
