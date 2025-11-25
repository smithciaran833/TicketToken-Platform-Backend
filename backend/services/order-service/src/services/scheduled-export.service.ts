import { Pool } from 'pg';
import { logger } from '../utils/logger';
import { ScheduledExport, ExportFormat, ReportFilters } from '../types/report.types';

export class ScheduledExportService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  async createScheduledExport(tenantId: string, schedule: Partial<ScheduledExport>): Promise<ScheduledExport> {
    try {
      const query = `
        INSERT INTO scheduled_exports (
          tenant_id, report_type, format, schedule, filters, recipients,
          delivery_method, s3_bucket, s3_path, is_active, next_execution_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *
      `;

      const result = await this.pool.query(query, [
        tenantId,
        schedule.reportType,
        schedule.format,
        schedule.schedule,
        JSON.stringify(schedule.filters),
        JSON.stringify(schedule.recipients),
        schedule.deliveryMethod,
        schedule.s3Bucket,
        schedule.s3Path,
        true,
        schedule.nextExecutionAt || new Date(),
      ]);

      logger.info('Created scheduled export', { tenantId, reportType: schedule.reportType });
      return this.mapToScheduledExport(result.rows[0]);
    } catch (error) {
      logger.error('Error creating scheduled export', { error, tenantId });
      throw error;
    }
  }

  async getScheduledExports(tenantId: string): Promise<ScheduledExport[]> {
    try {
      const query = `
        SELECT * FROM scheduled_exports
        WHERE tenant_id = $1
        ORDER BY created_at DESC
      `;

      const result = await this.pool.query(query, [tenantId]);
      return result.rows.map(row => this.mapToScheduledExport(row));
    } catch (error) {
      logger.error('Error getting scheduled exports', { error, tenantId });
      throw error;
    }
  }

  async deleteScheduledExport(exportId: string): Promise<void> {
    try {
      await this.pool.query('DELETE FROM scheduled_exports WHERE id = $1', [exportId]);
      logger.info('Deleted scheduled export', { exportId });
    } catch (error) {
      logger.error('Error deleting scheduled export', { error, exportId });
      throw error;
    }
  }

  async executeScheduledExport(exportId: string): Promise<void> {
    logger.info('Execute scheduled export placeholder', { exportId });
    // Implementation would generate report and deliver via email/S3
  }

  async sendExportEmail(tenantId: string, exportData: Buffer, recipients: string[]): Promise<void> {
    logger.info('Send export email placeholder', { tenantId, recipients });
    // Implementation would use email service
  }

  async uploadExportToS3(tenantId: string, exportData: Buffer, path: string): Promise<string> {
    logger.info('Upload export to S3 placeholder', { tenantId, path });
    return `s3://${path}`;
  }

  private mapToScheduledExport(row: any): ScheduledExport {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      reportType: row.report_type,
      format: row.format as ExportFormat,
      schedule: row.schedule,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
      recipients: typeof row.recipients === 'string' ? JSON.parse(row.recipients) : row.recipients,
      deliveryMethod: row.delivery_method,
      s3Bucket: row.s3_bucket,
      s3Path: row.s3_path,
      isActive: row.is_active,
      lastExecutedAt: row.last_executed_at,
      nextExecutionAt: row.next_execution_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
