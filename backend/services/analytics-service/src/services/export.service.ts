import { ExportModel, Export as DBExport } from '../models';
import {
  ExportRequest,
  ExportStatus,
  ExportFormat,
  ExportType,
  FinancialExportData,
  CustomerExportData
} from '../types';
import { logger } from '../utils/logger';
import { messageGatewayService } from './message-gateway.service';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import Excel from 'exceljs';
import { Parser } from 'json2csv';
import PDFDocument from 'pdfkit';

export class ExportService {
  private static instance: ExportService;
  private log = logger.child({ component: 'ExportService' });

  static getInstance(): ExportService {
    if (!this.instance) {
      this.instance = new ExportService();
    }
    return this.instance;
  }

  private mapDBExportToExportRequest(dbExport: DBExport): ExportRequest {
    const dateRange = dbExport.parameters?.dateRange || {
      start: new Date(),
      end: new Date()
    };

    return {
      id: dbExport.id,
      venueId: dbExport.tenant_id,
      userId: dbExport.requested_by,
      type: (dbExport.export_type as ExportType) || ExportType.ANALYTICS_REPORT,
      format: (dbExport.format as ExportFormat) || ExportFormat.CSV,
      status: (dbExport.status as ExportStatus) || ExportStatus.PENDING,
      filters: {
        dateRange: {
          start: new Date(dateRange.start),
          end: new Date(dateRange.end)
        },
        ...(dbExport.parameters || {})
      },
      options: dbExport.parameters?.options || {},
      fileUrl: dbExport.file_url,
      fileSize: dbExport.file_size,
      error: dbExport.error_message,
      createdAt: dbExport.created_at,
      completedAt: dbExport.updated_at
    };
  }

  async createExport(
    request: Omit<ExportRequest, 'id' | 'createdAt' | 'status'>
  ): Promise<ExportRequest> {
    try {
      const dbExport = await ExportModel.createExport({
        ...request,
        status: ExportStatus.PENDING
      });

      const exportRequest = this.mapDBExportToExportRequest(dbExport);

      // Queue export for processing
      this.processExportAsync(dbExport.id);

      return exportRequest;
    } catch (error) {
      this.log.error('Failed to create export', error);
      throw error;
    }
  }

  private async processExportAsync(exportId: string): Promise<void> {
    try {
      // Update status to processing
      await ExportModel.updateExportStatus(exportId, ExportStatus.PROCESSING);

      // Get export details
      const dbExport = await ExportModel.findById(exportId);
      if (!dbExport) {
        throw new Error('Export request not found');
      }

      const exportRequest = this.mapDBExportToExportRequest(dbExport);

      // Generate export based on type
      let filePath: string;
      switch (exportRequest.type) {
        case ExportType.ANALYTICS_REPORT:
          filePath = await this.generateAnalyticsReport(exportRequest);
          break;
        case ExportType.CUSTOMER_LIST:
          filePath = await this.generateCustomerList(exportRequest);
          break;
        case ExportType.FINANCIAL_REPORT:
          filePath = await this.generateFinancialReport(exportRequest);
          break;
        default:
          throw new Error(`Unsupported export type: ${exportRequest.type}`);
      }

      // Upload to storage (mock)
      const fileUrl = await this.uploadToStorage(filePath);
      const fileSize = (await fs.stat(filePath)).size;

      // Update export status
      await ExportModel.updateExportStatus(exportId, ExportStatus.COMPLETED, {
        fileUrl,
        fileSize,
        completedAt: new Date()
      });

      // Send notification
      await messageGatewayService.sendMessage(
        'email',
        exportRequest.userId,
        'report-ready-email',
        {
          reportName: exportRequest.type,
          generatedAt: new Date().toISOString(),
          fileSize: this.formatFileSize(fileSize),
          downloadUrl: fileUrl,
          expirationDays: 7
        }
      );

      // Clean up temp file
      await fs.unlink(filePath);
    } catch (error) {
      this.log.error('Failed to process export', error, { exportId });

      await ExportModel.updateExportStatus(exportId, ExportStatus.FAILED, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async generateAnalyticsReport(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchAnalyticsData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.CSV:
        return await this.generateCSV(data, 'analytics-report');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'analytics-report');
      case ExportFormat.PDF:
        return await this.generatePDF(data, 'analytics-report');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateCustomerList(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchCustomerData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.CSV:
        return await this.generateCSV(data.customers, 'customer-list');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'customer-list');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateFinancialReport(
    exportRequest: ExportRequest
  ): Promise<string> {
    const data = await this.fetchFinancialData(exportRequest);

    switch (exportRequest.format) {
      case ExportFormat.PDF:
        return await this.generatePDF(data, 'financial-report');
      case ExportFormat.XLSX:
        return await this.generateExcel(data, 'financial-report');
      default:
        throw new Error(`Unsupported format: ${exportRequest.format}`);
    }
  }

  private async generateCSV(data: any[], fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.csv`);

    const parser = new Parser();
    const csv = parser.parse(data);

    await fs.writeFile(filePath, csv);

    return filePath;
  }

  private async generateExcel(data: any, fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.xlsx`);

    const workbook = new Excel.Workbook();
    const worksheet = workbook.addWorksheet('Report');

    // Add data based on structure
    if (Array.isArray(data)) {
      // Simple array of objects
      if (data.length > 0) {
        worksheet.columns = Object.keys(data[0]).map(key => ({
          header: key,
          key: key,
          width: 15
        }));
        worksheet.addRows(data);
      }
    } else if (data.summary && data.customers) {
      // Customer report structure
      const summarySheet = workbook.addWorksheet('Summary');
      summarySheet.addRow(['Metric', 'Value']);
      Object.entries(data.summary).forEach(([key, value]) => {
        summarySheet.addRow([key, value]);
      });

      worksheet.columns = Object.keys(data.customers[0] || {}).map(key => ({
        header: key,
        key: key,
        width: 15
      }));
      worksheet.addRows(data.customers);
    }

    await workbook.xlsx.writeFile(filePath);

    return filePath;
  }

  private async generatePDF(data: any, fileName: string): Promise<string> {
    const filePath = path.join('/tmp', `${fileName}-${Date.now()}.pdf`);

    const doc = new PDFDocument();
    const stream = createWriteStream(filePath);
    doc.pipe(stream);

    // Add content based on report type
    doc.fontSize(20).text('Analytics Report', { align: 'center' });
    doc.moveDown();

    if (data.summary) {
      doc.fontSize(16).text('Summary', { underline: true });
      doc.moveDown();

      Object.entries(data.summary).forEach(([key, value]) => {
        doc.fontSize(12).text(`${key}: ${value}`);
      });
    }

    doc.end();

    return new Promise((resolve) => {
      stream.on('finish', () => resolve(filePath));
    });
  }

  private async fetchAnalyticsData(_exportRequest: ExportRequest): Promise<any> {
    // Mock data - in production, fetch from analytics database
    return [
      { date: '2024-01-01', sales: 100, revenue: 10000 },
      { date: '2024-01-02', sales: 120, revenue: 12000 },
      { date: '2024-01-03', sales: 90, revenue: 9000 }
    ];
  }

  private async fetchCustomerData(_exportRequest: ExportRequest): Promise<CustomerExportData> {
    // Mock data - in production, fetch from customer database
    return {
      summary: {
        totalCustomers: 1000,
        newCustomers: 150,
        activeCustomers: 800
      },
      customers: [
        {
          customerId: 'hash-1',
          firstPurchase: new Date('2023-01-01'),
          lastPurchase: new Date('2024-01-01'),
          totalSpent: 500,
          totalTickets: 5,
          segment: 'regular'
        }
      ]
    };
  }

  private async fetchFinancialData(_exportRequest: ExportRequest): Promise<FinancialExportData> {
    // Mock data - in production, fetch from financial database
    return {
      summary: {
        totalRevenue: 100000,
        totalTransactions: 1000,
        averageOrderValue: 100,
        refundAmount: 5000,
        netRevenue: 95000
      },
      byPeriod: [],
      byEventType: [],
      transactions: []
    };
  }

  private async uploadToStorage(filePath: string): Promise<string> {
    // In production, upload to S3 or similar
    // For now, return a mock URL
    return `https://storage.example.com/exports/${path.basename(filePath)}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  }

  async getExportStatus(exportId: string): Promise<ExportRequest | null> {
    const dbExport = await ExportModel.findById(exportId);
    return dbExport ? this.mapDBExportToExportRequest(dbExport) : null;
  }

  async getUserExports(
    userId: string,
    venueId: string,
    limit: number = 50
  ): Promise<ExportRequest[]> {
    const exports = await ExportModel.getExportsByUser(userId, venueId, limit);
    return exports.map(exp => this.mapDBExportToExportRequest(exp));
  }
}

export const exportService = ExportService.getInstance();
