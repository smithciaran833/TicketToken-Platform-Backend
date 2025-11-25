import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import { db } from '../config/database';
import { logger } from '../logger';
import { metricsCollector } from '../metrics.collector';

interface Report {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  scheduleCron?: string;
  recipients: string[];
  format: 'pdf' | 'csv' | 'json' | 'html';
  sections: string[];
  filters?: Record<string, any>;
  enabled: boolean;
  lastGenerated?: Date;
  nextGeneration?: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ReportHistory {
  id: string;
  reportId: string;
  format: string;
  filePath?: string;
  fileSize?: number;
  generatedAt: Date;
  generationDurationMs: number;
  status: 'success' | 'failed' | 'partial';
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export class ReportBuilderService {
  private reportStoragePath: string;

  constructor() {
    this.reportStoragePath = process.env.REPORT_STORAGE_PATH || '/var/reports';
  }

  async createReport(userId: string, data: Partial<Report>): Promise<Report> {
    try {
      const reportId = uuidv4();
      const now = new Date();

      const report: Report = {
        id: reportId,
        name: data.name || 'Untitled Report',
        description: data.description,
        templateId: data.templateId,
        scheduleCron: data.scheduleCron,
        recipients: data.recipients || [],
        format: data.format || 'pdf',
        sections: data.sections || [],
        filters: data.filters || {},
        enabled: data.enabled !== undefined ? data.enabled : true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now
      };

      // Calculate next generation if scheduled
      if (report.scheduleCron && report.enabled) {
        report.nextGeneration = this.calculateNextGeneration(report.scheduleCron);
      }

      await db.query(`
        INSERT INTO reports (
          id, name, description, template_id, schedule_cron, recipients, 
          format, sections, filters, enabled, next_generation, created_by, 
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        report.id,
        report.name,
        report.description,
        report.templateId,
        report.scheduleCron,
        report.recipients,
        report.format,
        JSON.stringify(report.sections),
        JSON.stringify(report.filters),
        report.enabled,
        report.nextGeneration,
        report.createdBy,
        report.createdAt,
        report.updatedAt
      ]);

      logger.info('Report configuration created', { reportId, userId });
      return report;
    } catch (error) {
      logger.error('Failed to create report configuration', { error, userId });
      throw error;
    }
  }

  async getReport(reportId: string): Promise<Report | null> {
    try {
      const result = await db.query('SELECT * FROM reports WHERE id = $1', [reportId]);
      
      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToReport(result.rows[0]);
    } catch (error) {
      logger.error('Failed to get report', { error, reportId });
      throw error;
    }
  }

  async listReports(userId?: string): Promise<Report[]> {
    try {
      const query = userId 
        ? 'SELECT * FROM reports WHERE created_by = $1 ORDER BY created_at DESC'
        : 'SELECT * FROM reports ORDER BY created_at DESC';
      
      const params = userId ? [userId] : [];
      const result = await db.query(query, params);

      return result.rows.map(row => this.mapRowToReport(row));
    } catch (error) {
      logger.error('Failed to list reports', { error });
      throw error;
    }
  }

  async updateReport(reportId: string, updates: Partial<Report>): Promise<Report> {
    try {
      const existing = await this.getReport(reportId);
      if (!existing) {
        throw new Error('Report not found');
      }

      const now = new Date();
      const updated = {
        ...existing,
        ...updates,
        updatedAt: now
      };

      // Recalculate next generation if schedule changed
      if (updates.scheduleCron || updates.enabled !== undefined) {
        if (updated.scheduleCron && updated.enabled) {
          updated.nextGeneration = this.calculateNextGeneration(updated.scheduleCron);
        } else {
          updated.nextGeneration = undefined;
        }
      }

      await db.query(`
        UPDATE reports 
        SET name = $1, description = $2, template_id = $3, schedule_cron = $4, 
            recipients = $5, format = $6, sections = $7, filters = $8, 
            enabled = $9, next_generation = $10, updated_at = $11
        WHERE id = $12
      `, [
        updated.name,
        updated.description,
        updated.templateId,
        updated.scheduleCron,
        updated.recipients,
        updated.format,
        JSON.stringify(updated.sections),
        JSON.stringify(updated.filters),
        updated.enabled,
        updated.nextGeneration,
        updated.updatedAt,
        reportId
      ]);

      logger.info('Report configuration updated', { reportId });
      return updated;
    } catch (error) {
      logger.error('Failed to update report', { error, reportId });
      throw error;
    }
  }

  async deleteReport(reportId: string): Promise<void> {
    try {
      await db.query('DELETE FROM reports WHERE id = $1', [reportId]);
      logger.info('Report configuration deleted', { reportId });
    } catch (error) {
      logger.error('Failed to delete report', { error, reportId });
      throw error;
    }
  }

  async generateReport(reportId: string): Promise<ReportHistory> {
    const startTime = Date.now();
    
    try {
      const report = await this.getReport(reportId);
      if (!report) {
        throw new Error('Report not found');
      }

      logger.info('Starting report generation', { reportId, format: report.format });

      // Gather data for each section
      const reportData = await this.gatherReportData(report);

      // Generate report in requested format
      let filePath: string | undefined;
      let fileSize: number = 0;

      switch (report.format) {
        case 'pdf':
          filePath = await this.generatePDF(reportId, reportData);
          break;
        case 'csv':
          filePath = await this.generateCSV(reportId, reportData);
          break;
        case 'json':
          filePath = await this.generateJSON(reportId, reportData);
          break;
        case 'html':
          filePath = await this.generateHTML(reportId, reportData);
          break;
      }

      if (filePath) {
        const stats = await fs.stat(filePath);
        fileSize = stats.size;
      }

      const duration = Date.now() - startTime;

      // Save to history
      const history: ReportHistory = {
        id: uuidv4(),
        reportId,
        format: report.format,
        filePath,
        fileSize,
        generatedAt: new Date(),
        generationDurationMs: duration,
        status: 'success',
        metadata: {}
      };

      await this.saveReportHistory(history);

      // Update last_generated timestamp
      await db.query(
        'UPDATE reports SET last_generated = $1 WHERE id = $2',
        [history.generatedAt, reportId]
      );

      // Send to recipients if configured
      if (report.recipients.length > 0 && filePath) {
        await this.sendReportToRecipients(report, filePath);
      }

      // Update metrics
      metricsCollector.reportsGeneratedTotal.inc({ format: report.format, status: 'success' });
      metricsCollector.reportsGenerationDurationMs.observe(duration);

      logger.info('Report generated successfully', { 
        reportId, 
        format: report.format, 
        duration,
        fileSize 
      });

      return history;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Save failure to history
      const history: ReportHistory = {
        id: uuidv4(),
        reportId,
        format: 'unknown',
        generatedAt: new Date(),
        generationDurationMs: duration,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      };

      await this.saveReportHistory(history);

      metricsCollector.reportsGeneratedTotal.inc({ format: 'unknown', status: 'failed' });

      logger.error('Report generation failed', { error, reportId, duration });
      throw error;
    }
  }

  async getReportHistory(reportId: string, limit: number = 50): Promise<ReportHistory[]> {
    try {
      const result = await db.query(`
        SELECT * FROM report_history 
        WHERE report_id = $1 
        ORDER BY generated_at DESC 
        LIMIT $2
      `, [reportId, limit]);

      return result.rows.map(row => this.mapRowToReportHistory(row));
    } catch (error) {
      logger.error('Failed to get report history', { error, reportId });
      throw error;
    }
  }

  async downloadReport(historyId: string): Promise<{ filePath: string; mimeType: string }> {
    try {
      const result = await db.query(
        'SELECT file_path, format FROM report_history WHERE id = $1',
        [historyId]
      );

      if (result.rows.length === 0 || !result.rows[0].file_path) {
        throw new Error('Report file not found');
      }

      const { file_path, format } = result.rows[0];
      
      const mimeTypes: Record<string, string> = {
        pdf: 'application/pdf',
        csv: 'text/csv',
        json: 'application/json',
        html: 'text/html'
      };

      return {
        filePath: file_path,
        mimeType: mimeTypes[format] || 'application/octet-stream'
      };
    } catch (error) {
      logger.error('Failed to download report', { error, historyId });
      throw error;
    }
  }

  private async gatherReportData(report: Report): Promise<Record<string, any>> {
    const data: Record<string, any> = {};

    for (const section of report.sections) {
      switch (section) {
        case 'executive_summary':
          data.executiveSummary = await this.gatherExecutiveSummary(report.filters);
          break;
        case 'system_health':
          data.systemHealth = await this.gatherSystemHealth(report.filters);
          break;
        case 'performance_metrics':
          data.performanceMetrics = await this.gatherPerformanceMetrics(report.filters);
          break;
        case 'alert_summary':
          data.alertSummary = await this.gatherAlertSummary(report.filters);
          break;
        case 'recommendations':
          data.recommendations = await this.generateRecommendations(data);
          break;
      }
    }

    return data;
  }

  private async gatherExecutiveSummary(filters?: Record<string, any>): Promise<any> {
    // Implement executive summary data gathering
    return {
      period: '24 hours',
      totalRequests: 1000000,
      successRate: 99.9,
      avgResponseTime: 45,
      incidentCount: 2
    };
  }

  private async gatherSystemHealth(filters?: Record<string, any>): Promise<any> {
    // Implement system health data gathering
    return {
      services: [],
      databases: [],
      cacheStatus: 'healthy'
    };
  }

  private async gatherPerformanceMetrics(filters?: Record<string, any>): Promise<any> {
    // Implement performance metrics gathering
    return {
      cpu: {},
      memory: {},
      network: {}
    };
  }

  private async gatherAlertSummary(filters?: Record<string, any>): Promise<any> {
    // Implement alert summary gathering
    return {
      critical: 0,
      warning: 2,
      info: 5
    };
  }

  private async generateRecommendations(data: Record<string, any>): Promise<any[]> {
    // Generate AI-powered recommendations based on data
    return [];
  }

  private async generatePDF(reportId: string, data: Record<string, any>): Promise<string> {
    // Implement PDF generation (would use pdfkit or similar)
    const filename = `report-${reportId}-${Date.now()}.pdf`;
    const filePath = path.join(this.reportStoragePath, filename);
    
    // Placeholder - actual PDF generation would go here
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    
    return filePath;
  }

  private async generateCSV(reportId: string, data: Record<string, any>): Promise<string> {
    const filename = `report-${reportId}-${Date.now()}.csv`;
    const filePath = path.join(this.reportStoragePath, filename);
    
    // Convert data to CSV format
    const csv = this.convertToCSV(data);
    await fs.writeFile(filePath, csv);
    
    return filePath;
  }

  private async generateJSON(reportId: string, data: Record<string, any>): Promise<string> {
    const filename = `report-${reportId}-${Date.now()}.json`;
    const filePath = path.join(this.reportStoragePath, filename);
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    
    return filePath;
  }

  private async generateHTML(reportId: string, data: Record<string, any>): Promise<string> {
    const filename = `report-${reportId}-${Date.now()}.html`;
    const filePath = path.join(this.reportStoragePath, filename);
    
    // Generate HTML report
    const html = this.convertToHTML(data);
    await fs.writeFile(filePath, html);
    
    return filePath;
  }

  private convertToCSV(data: Record<string, any>): string {
    // Simple CSV conversion
    let csv = '';
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'object') {
        csv += `${key}\n`;
        csv += Object.entries(value).map(([k, v]) => `${k},${v}`).join('\n');
        csv += '\n\n';
      }
    }
    return csv;
  }

  private convertToHTML(data: Record<string, any>): string {
    // Simple HTML template
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Monitoring Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
  </style>
</head>
<body>
  <h1>Monitoring Report</h1>
  <pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>
    `;
  }

  private async sendReportToRecipients(report: Report, filePath: string): Promise<void> {
    // Implement email sending logic
    logger.info('Sending report to recipients', { 
      reportId: report.id, 
      recipients: report.recipients 
    });
  }

  private async saveReportHistory(history: ReportHistory): Promise<void> {
    await db.query(`
      INSERT INTO report_history (
        id, report_id, format, file_path, file_size, generated_at, 
        generation_duration_ms, status, error_message, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      history.id,
      history.reportId,
      history.format,
      history.filePath,
      history.fileSize,
      history.generatedAt,
      history.generationDurationMs,
      history.status,
      history.errorMessage,
      JSON.stringify(history.metadata || {})
    ]);
  }

  private calculateNextGeneration(cronExpression: string): Date {
    // Simple cron parser - in production use a library like node-cron
    // For now, return 24 hours in the future
    const next = new Date();
    next.setHours(next.getHours() + 24);
    return next;
  }

  private mapRowToReport(row: any): Report {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      templateId: row.template_id,
      scheduleCron: row.schedule_cron,
      recipients: row.recipients,
      format: row.format,
      sections: typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections,
      filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
      enabled: row.enabled,
      lastGenerated: row.last_generated,
      nextGeneration: row.next_generation,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapRowToReportHistory(row: any): ReportHistory {
    return {
      id: row.id,
      reportId: row.report_id,
      format: row.format,
      filePath: row.file_path,
      fileSize: row.file_size,
      generatedAt: row.generated_at,
      generationDurationMs: row.generation_duration_ms,
      status: row.status,
      errorMessage: row.error_message,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    };
  }
}

export const reportBuilderService = new ReportBuilderService();
