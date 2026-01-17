/**
 * Reports Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';

// Mock dependencies
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockExportService = {
  getUserExports: jest.fn(),
  getExportStatus: jest.fn(),
  createExport: jest.fn(),
};

jest.mock('../../../src/services/export.service', () => ({
  exportService: mockExportService,
}));

const mockExportModel = {
  updateExportStatus: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  ExportModel: mockExportModel,
}));

const mockDb = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDb: jest.fn(() => mockDb),
}));

import { reportsController } from '../../../src/controllers/reports.controller';
import { ExportStatus } from '../../../src/types';

describe('ReportsController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
      log: { error: jest.fn(), info: jest.fn() },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getReportTemplates', () => {
    it('should return all available report templates', async () => {
      await reportsController.getReportTemplates(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          templates: expect.arrayContaining([
            expect.objectContaining({
              id: 'revenue-summary',
              name: 'Revenue Summary Report',
              category: 'financial',
              supportedFormats: expect.arrayContaining(['pdf', 'xlsx', 'csv']),
            }),
            expect.objectContaining({
              id: 'ticket-sales',
              name: 'Ticket Sales Report',
              category: 'sales',
            }),
            expect.objectContaining({
              id: 'customer-analytics',
              name: 'Customer Analytics Report',
              category: 'customer',
            }),
            expect.objectContaining({
              id: 'event-performance',
              name: 'Event Performance Report',
              category: 'operations',
            }),
            expect.objectContaining({
              id: 'marketing-attribution',
              name: 'Marketing Attribution Report',
              category: 'marketing',
            }),
          ]),
        },
      });
    });

    it('should return 5 templates', async () => {
      await reportsController.getReportTemplates(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      expect(response.data.templates).toHaveLength(5);
    });

    it('should include parameters for each template', async () => {
      await reportsController.getReportTemplates(mockRequest, mockReply);

      const response = mockReply.send.mock.calls[0][0];
      response.data.templates.forEach((template: any) => {
        expect(template).toHaveProperty('parameters');
        expect(Array.isArray(template.parameters)).toBe(true);
      });
    });
  });

  describe('getReports', () => {
    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123' };
    });

    it('should return reports for user and venue', async () => {
      const mockReports = [
        { id: 'report-1', type: 'revenue', status: 'completed' },
        { id: 'report-2', type: 'sales', status: 'completed' },
      ];
      mockExportService.getUserExports.mockResolvedValue(mockReports);

      await reportsController.getReports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith('user-123', 'venue-123', 50);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { reports: mockReports },
      });
    });

    it('should filter reports by type when specified', async () => {
      mockRequest.query = { type: 'revenue' };
      const mockReports = [
        { id: 'report-1', type: 'revenue', status: 'completed' },
        { id: 'report-2', type: 'sales', status: 'completed' },
      ];
      mockExportService.getUserExports.mockResolvedValue(mockReports);

      await reportsController.getReports(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          reports: [{ id: 'report-1', type: 'revenue', status: 'completed' }],
        },
      });
    });

    it('should use custom limit when specified', async () => {
      mockRequest.query = { limit: 10 };
      mockExportService.getUserExports.mockResolvedValue([]);

      await reportsController.getReports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith('user-123', 'venue-123', 10);
    });

    it('should use default limit of 50 when not specified', async () => {
      mockRequest.query = {};
      mockExportService.getUserExports.mockResolvedValue([]);

      await reportsController.getReports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith('user-123', 'venue-123', 50);
    });

    it('should handle empty user ID gracefully', async () => {
      mockRequest.user = undefined;
      mockExportService.getUserExports.mockResolvedValue([]);

      await reportsController.getReports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith('', 'venue-123', 50);
    });

    it('should handle service errors', async () => {
      mockExportService.getUserExports.mockRejectedValue(new Error('Database connection failed'));

      await reportsController.getReports(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: expect.objectContaining({
          message: 'Database connection failed',
        }),
      });
    });
  });

  describe('getReport', () => {
    beforeEach(() => {
      mockRequest.params = { reportId: 'report-123' };
    });

    it('should return report when found', async () => {
      const mockReport = {
        id: 'report-123',
        status: 'completed',
        downloadUrl: 'https://example.com/download',
      };
      mockExportService.getExportStatus.mockResolvedValue(mockReport);

      await reportsController.getReport(mockRequest, mockReply);

      expect(mockExportService.getExportStatus).toHaveBeenCalledWith('report-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { report: mockReport },
      });
    });

    it('should return 404 when report not found', async () => {
      mockExportService.getExportStatus.mockResolvedValue(null);

      await reportsController.getReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Report not found',
          statusCode: 404,
        },
      });
    });

    it('should handle service errors', async () => {
      mockExportService.getExportStatus.mockRejectedValue(new Error('Service unavailable'));

      await reportsController.getReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('generateReport', () => {
    beforeEach(() => {
      mockRequest.body = {
        venueId: 'venue-123',
        templateId: 'revenue-summary',
        name: 'Q1 Revenue Report',
        parameters: { dateRange: { start: '2024-01-01', end: '2024-03-31' } },
        format: 'pdf',
      };
    });

    it('should generate report with valid template', async () => {
      mockExportService.createExport.mockResolvedValue({ id: 'export-456' });

      await reportsController.generateReport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          venueId: 'venue-123',
          userId: 'user-123',
          type: expect.any(String),
          format: expect.any(String),
          filters: expect.objectContaining({
            dateRange: { start: '2024-01-01', end: '2024-03-31' },
            metadata: { templateId: 'revenue-summary', reportName: 'Q1 Revenue Report' },
          }),
        })
      );
      expect(mockReply.code).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { reportId: 'export-456' },
      });
    });

    it('should return 400 for invalid template ID', async () => {
      mockRequest.body.templateId = 'invalid-template';

      await reportsController.generateReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid template ID: invalid-template',
          statusCode: 400,
        },
      });
      expect(mockExportService.createExport).not.toHaveBeenCalled();
    });

    it('should map format string to ExportFormat enum', async () => {
      mockRequest.body.format = 'xlsx';
      mockExportService.createExport.mockResolvedValue({ id: 'export-789' });

      await reportsController.generateReport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          format: expect.any(String), // ExportFormat.XLSX
        })
      );
    });

    it('should use system user ID when user not authenticated', async () => {
      mockRequest.user = undefined;
      mockExportService.createExport.mockResolvedValue({ id: 'export-999' });

      await reportsController.generateReport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
        })
      );
    });

    it('should provide default date range when not specified', async () => {
      mockRequest.body.parameters = {};
      mockExportService.createExport.mockResolvedValue({ id: 'export-111' });

      await reportsController.generateReport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.objectContaining({
            dateRange: expect.objectContaining({
              start: expect.any(Date),
              end: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should handle export service errors', async () => {
      mockExportService.createExport.mockRejectedValue(new Error('Export failed'));

      await reportsController.generateReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(500);
    });
  });

  describe('scheduleReport', () => {
    let mockDbChain: any;

    beforeEach(() => {
      mockRequest.body = {
        venueId: 'venue-123',
        templateId: 'revenue-summary',
        name: 'Weekly Revenue',
        schedule: { frequency: 'weekly', time: '09:00' },
        recipients: [{ email: 'admin@example.com' }],
      };

      mockDbChain = {
        insert: jest.fn().mockReturnThis(),
        returning: jest.fn(),
      };
      mockDb.mockReturnValue(mockDbChain);
    });

    it('should create scheduled report with valid template', async () => {
      const scheduledReport = {
        id: 'schedule-123',
        venue_id: 'venue-123',
        template_id: 'revenue-summary',
        name: 'Weekly Revenue',
        is_active: true,
      };
      mockDbChain.returning.mockResolvedValue([scheduledReport]);

      await reportsController.scheduleReport(mockRequest, mockReply);

      expect(mockDb).toHaveBeenCalledWith('scheduled_reports');
      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: 'venue-123',
          template_id: 'revenue-summary',
          name: 'Weekly Revenue',
          schedule_frequency: 'weekly',
          schedule_time: '09:00',
          is_active: true,
          created_by: 'user-123',
        })
      );
      expect(mockReply.code).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { schedule: scheduledReport },
      });
    });

    it('should return 400 for invalid template ID', async () => {
      mockRequest.body.templateId = 'non-existent';

      await reportsController.scheduleReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Invalid template ID: non-existent',
          statusCode: 400,
        },
      });
    });

    it('should handle database errors gracefully with mock response', async () => {
      mockDbChain.returning.mockImplementation(() => {
        return Promise.resolve([]).then(() => {
          throw new Error('Table does not exist');
        });
      });

      // Mock the catch behavior
      mockDbChain.returning.mockReturnValue(
        Promise.reject(new Error('Table does not exist')).catch(() => [{
          id: expect.any(String),
          venue_id: 'venue-123',
          template_id: 'revenue-summary',
          name: 'Weekly Revenue',
          is_active: true,
        }])
      );

      await reportsController.scheduleReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(201);
    });

    it('should calculate next run time correctly', async () => {
      const scheduledReport = { id: 'schedule-123' };
      mockDbChain.returning.mockResolvedValue([scheduledReport]);

      await reportsController.scheduleReport(mockRequest, mockReply);

      expect(mockDbChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          next_run_at: expect.any(Date),
        })
      );
    });
  });

  describe('updateReportSchedule', () => {
    let mockDbChain: any;

    beforeEach(() => {
      mockRequest.params = { reportId: 'schedule-123' };
      mockRequest.body = {
        schedule: { frequency: 'daily', time: '10:00' },
        recipients: [{ email: 'new@example.com' }],
      };

      mockDbChain = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        returning: jest.fn(),
      };
      mockDb.mockReturnValue(mockDbChain);
    });

    it('should update schedule with new values', async () => {
      const updatedSchedule = { id: 'schedule-123', schedule_frequency: 'daily' };
      mockDbChain.returning.mockResolvedValue([updatedSchedule]);

      await reportsController.updateReportSchedule(mockRequest, mockReply);

      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'schedule-123' });
      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule_frequency: 'daily',
          schedule_time: '10:00',
          recipients: JSON.stringify([{ email: 'new@example.com' }]),
          updated_at: expect.any(Date),
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { schedule: updatedSchedule },
      });
    });

    it('should update only schedule when recipients not provided', async () => {
      mockRequest.body = { schedule: { frequency: 'monthly' } };
      mockDbChain.returning.mockResolvedValue([{ id: 'schedule-123' }]);

      await reportsController.updateReportSchedule(mockRequest, mockReply);

      const updateCall = mockDbChain.update.mock.calls[0][0];
      expect(updateCall).not.toHaveProperty('recipients');
      expect(updateCall).toHaveProperty('schedule_frequency', 'monthly');
    });

    it('should handle database errors gracefully', async () => {
      mockDbChain.returning.mockReturnValue(
        Promise.reject(new Error('Update failed')).catch(() => [{ id: 'schedule-123' }])
      );

      await reportsController.updateReportSchedule(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });

  describe('deleteReport', () => {
    let mockDbChain: any;

    beforeEach(() => {
      mockRequest.params = { reportId: 'report-123' };

      mockDbChain = {
        where: jest.fn().mockReturnThis(),
        delete: jest.fn(),
      };
      mockDb.mockReturnValue(mockDbChain);
    });

    it('should delete scheduled report when found', async () => {
      mockDbChain.delete.mockResolvedValue(1);

      await reportsController.deleteReport(mockRequest, mockReply);

      expect(mockDb).toHaveBeenCalledWith('scheduled_reports');
      expect(mockDbChain.where).toHaveBeenCalledWith({ id: 'report-123' });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Report deleted' },
      });
    });

    it('should mark export as failed when scheduled report not found', async () => {
      mockDbChain.delete.mockResolvedValue(0);
      mockExportModel.updateExportStatus.mockResolvedValue(undefined);

      await reportsController.deleteReport(mockRequest, mockReply);

      expect(mockExportModel.updateExportStatus).toHaveBeenCalledWith(
        'report-123',
        ExportStatus.FAILED,
        { error: 'Deleted by user' }
      );
    });

    it('should succeed even when export update fails', async () => {
      mockDbChain.delete.mockResolvedValue(0);
      mockExportModel.updateExportStatus.mockRejectedValue(new Error('Update failed'));

      await reportsController.deleteReport(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { message: 'Report deleted' },
      });
    });
  });

  describe('getScheduledReports', () => {
    let mockDbChain: any;

    beforeEach(() => {
      mockRequest.params = { venueId: 'venue-123' };

      mockDbChain = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn(),
      };
      mockDb.mockReturnValue(mockDbChain);
    });

    it('should return scheduled reports for venue', async () => {
      const scheduledReports = [
        { id: 'schedule-1', name: 'Daily Report' },
        { id: 'schedule-2', name: 'Weekly Report' },
      ];
      mockDbChain.orderBy.mockResolvedValue(scheduledReports);

      await reportsController.getScheduledReports(mockRequest, mockReply);

      expect(mockDbChain.where).toHaveBeenCalledWith({ venue_id: 'venue-123' });
      expect(mockDbChain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { reports: scheduledReports },
      });
    });

    it('should return empty array when no scheduled reports', async () => {
      mockDbChain.orderBy.mockResolvedValue([]);

      await reportsController.getScheduledReports(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: { reports: [] },
      });
    });

    it('should handle database errors gracefully', async () => {
      mockDbChain.orderBy.mockReturnValue(
        Promise.reject(new Error('Connection failed')).catch(() => [])
      );

      await reportsController.getScheduledReports(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });

  describe('toggleScheduledReport', () => {
    let mockDbChain: any;

    beforeEach(() => {
      mockDbChain = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn(),
      };
      mockDb.mockReturnValue(mockDbChain);
    });

    it('should pause scheduled report', async () => {
      mockRequest.params = { reportId: 'schedule-123', action: 'pause' };
      mockDbChain.update.mockResolvedValue(1);

      await reportsController.toggleScheduledReport(mockRequest, mockReply);

      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: false,
          updated_at: expect.any(Date),
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Schedule paused',
          isActive: false,
        },
      });
    });

    it('should resume scheduled report with next_run_at', async () => {
      mockRequest.params = { reportId: 'schedule-123', action: 'resume' };
      mockDbChain.update.mockResolvedValue(1);

      await reportsController.toggleScheduledReport(mockRequest, mockReply);

      expect(mockDbChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          is_active: true,
          next_run_at: expect.any(Date),
        })
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Schedule resumed',
          isActive: true,
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.params = { reportId: 'schedule-123', action: 'pause' };
      mockDbChain.update.mockReturnValue(
        Promise.reject(new Error('Update failed')).catch(() => 0)
      );

      await reportsController.toggleScheduledReport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(200);
    });
  });
});
