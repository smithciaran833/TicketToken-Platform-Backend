import { logger } from '../utils/logger';
import { ExportFormat, Column } from '../types/report.types';
import { generateCSV } from '../utils/csv-generator';

export class ExportService {
  async exportOrderReport(reportData: any, format: ExportFormat): Promise<Buffer> {
    try {
      switch (format) {
        case ExportFormat.CSV:
          return Buffer.from(this.generateCSVFromData(reportData), 'utf-8');
        case ExportFormat.JSON:
          return Buffer.from(JSON.stringify(reportData, null, 2), 'utf-8');
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      logger.error('Error exporting order report', { error, format });
      throw error;
    }
  }

  async exportCustomerAnalytics(data: any[], format: ExportFormat): Promise<Buffer> {
    return this.exportOrderReport(data, format);
  }

  async exportReconciliationReport(report: any, format: ExportFormat): Promise<Buffer> {
    return this.exportOrderReport(report, format);
  }

  generateCSVFromData(data: any): string {
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return '';
    }

    const items = Array.isArray(data) ? data : [data];
    if (items.length === 0) return '';

    const columns: Column[] = Object.keys(items[0]).map(key => ({
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    }));

    return generateCSV(items, columns);
  }
}
