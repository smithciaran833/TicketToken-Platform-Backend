/**
 * Export Controller Unit Tests
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { ExportType, ExportFormat, ExportStatus } from '../../../src/types';

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

const mockExportModel = {
  updateExportStatus: jest.fn(),
};

jest.mock('../../../src/services/export.service', () => ({
  exportService: mockExportService,
}));

jest.mock('../../../src/models', () => ({
  ExportModel: mockExportModel,
}));

import { exportController } from '../../../src/controllers/export.controller';

describe('ExportController', () => {
  let mockRequest: any;
  let mockReply: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {},
      user: { id: 'user-123', tenantId: 'tenant-123' },
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      redirect: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();

    // Default mock responses
    mockExportService.getUserExports.mockResolvedValue([
      {
        id: 'export-1',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        status: ExportStatus.COMPLETED,
      },
    ]);

    mockExportService.getExportStatus.mockResolvedValue({
      id: 'export-1',
      status: ExportStatus.COMPLETED,
      fileUrl: 'https://example.com/exports/export-1.csv',
      venueId: 'venue-123',
      type: ExportType.ANALYTICS_REPORT,
      format: ExportFormat.CSV,
      filters: {},
      options: {},
    });

    mockExportService.createExport.mockResolvedValue({
      id: 'export-new',
      status: ExportStatus.PENDING,
    });

    mockExportModel.updateExportStatus.mockResolvedValue(true);
  });

  describe('getExports', () => {
    it('should get user exports with default limit', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = {};

      await exportController.getExports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith(
        'user-123',
        'venue-123',
        50
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          exports: expect.any(Array),
        },
      });
    });

    it('should get user exports with custom limit', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.query = { limit: 100 };

      await exportController.getExports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith(
        'user-123',
        'venue-123',
        100
      );
    });

    it('should use empty string if user not authenticated', async () => {
      mockRequest.params = { venueId: 'venue-123' };
      mockRequest.user = undefined;

      await exportController.getExports(mockRequest, mockReply);

      expect(mockExportService.getUserExports).toHaveBeenCalledWith(
        '',
        'venue-123',
        50
      );
    });
  });

  describe('getExportStatus', () => {
    it('should get export status', async () => {
      mockRequest.params = { exportId: 'export-1' };

      await exportController.getExportStatus(mockRequest, mockReply);

      expect(mockExportService.getExportStatus).toHaveBeenCalledWith('export-1');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          export: expect.objectContaining({
            id: 'export-1',
            status: ExportStatus.COMPLETED,
          }),
        },
      });
    });

    it('should return 404 if export not found', async () => {
      mockRequest.params = { exportId: 'nonexistent' };
      mockExportService.getExportStatus.mockResolvedValue(null);

      await exportController.getExportStatus(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });
  });

  describe('createExport', () => {
    it('should create export with all fields', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        type: 'analytics_report',
        format: 'csv',
        filters: { eventType: 'concert' },
        dateRange: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
      };

      await exportController.createExport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith({
        venueId: 'venue-123',
        userId: 'user-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: expect.objectContaining({
          dateRange: {
            start: new Date('2024-01-01'),
            end: new Date('2024-01-31'),
          },
          eventType: 'concert',
        }),
        options: {},
      });

      expect(mockReply.code).toHaveBeenCalledWith(202);
    });

    it('should use default date range if not provided', async () => {
      mockRequest.body = {
        venueId: 'venue-123',
        type: 'customer_list',
        format: 'xlsx',
      };

      await exportController.createExport(mockRequest, mockReply);

      const call = mockExportService.createExport.mock.calls[0][0];
      expect(call.filters.dateRange.start).toBeInstanceOf(Date);
      expect(call.filters.dateRange.end).toBeInstanceOf(Date);
    });

    it('should map export types correctly', async () => {
      const types = [
        { input: 'analytics_report', expected: ExportType.ANALYTICS_REPORT },
        { input: 'customer_list', expected: ExportType.CUSTOMER_LIST },
        { input: 'financial_report', expected: ExportType.FINANCIAL_REPORT },
        { input: 'custom', expected: ExportType.CUSTOM_REPORT },
      ];

      for (const { input, expected } of types) {
        jest.clearAllMocks();
        mockRequest.body = {
          venueId: 'venue-123',
          type: input,
          format: 'csv',
        };

        await exportController.createExport(mockRequest, mockReply);

        expect(mockExportService.createExport).toHaveBeenCalledWith(
          expect.objectContaining({
            type: expected,
          })
        );
      }
    });

    it('should map export formats correctly', async () => {
      const formats = [
        { input: 'csv', expected: ExportFormat.CSV },
        { input: 'xlsx', expected: ExportFormat.XLSX },
        { input: 'pdf', expected: ExportFormat.PDF },
        { input: 'json', expected: ExportFormat.JSON },
      ];

      for (const { input, expected } of formats) {
        jest.clearAllMocks();
        mockRequest.body = {
          venueId: 'venue-123',
          type: 'analytics_report',
          format: input,
        };

        await exportController.createExport(mockRequest, mockReply);

        expect(mockExportService.createExport).toHaveBeenCalledWith(
          expect.objectContaining({
            format: expected,
          })
        );
      }
    });

    it('should use system as default user', async () => {
      mockRequest.user = undefined;
      mockRequest.body = {
        venueId: 'venue-123',
        type: 'analytics_report',
        format: 'csv',
      };

      await exportController.createExport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
        })
      );
    });
  });

  describe('downloadExport', () => {
    it('should redirect to export file URL', async () => {
      mockRequest.params = { exportId: 'export-1' };

      await exportController.downloadExport(mockRequest, mockReply);

      expect(mockReply.redirect).toHaveBeenCalledWith(
        'https://example.com/exports/export-1.csv'
      );
    });

    it('should return 404 if export not found', async () => {
      mockRequest.params = { exportId: 'nonexistent' };
      mockExportService.getExportStatus.mockResolvedValue(null);

      await exportController.downloadExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Export not found',
          statusCode: 404,
        },
      });
    });

    it('should return 400 if export not completed', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        status: ExportStatus.PROCESSING,
      });

      await exportController.downloadExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Export not ready for download',
          statusCode: 400,
        },
      });
    });

    it('should return 404 if file URL not available', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        status: ExportStatus.COMPLETED,
        fileUrl: null,
      });

      await exportController.downloadExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Export file not found',
          statusCode: 404,
        },
      });
    });
  });

  describe('cancelExport', () => {
    it('should cancel pending export', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        status: ExportStatus.PENDING,
      });

      await exportController.cancelExport(mockRequest, mockReply);

      expect(mockExportModel.updateExportStatus).toHaveBeenCalledWith(
        'export-1',
        ExportStatus.FAILED,
        { error: 'Cancelled by user' }
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          message: 'Export cancelled',
        },
      });
    });

    it('should cancel processing export', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        status: ExportStatus.PROCESSING,
      });

      await exportController.cancelExport(mockRequest, mockReply);

      expect(mockExportModel.updateExportStatus).toHaveBeenCalled();
    });

    it('should return 404 if export not found', async () => {
      mockRequest.params = { exportId: 'nonexistent' };
      mockExportService.getExportStatus.mockResolvedValue(null);

      await exportController.cancelExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('should return 400 if export already completed', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        status: ExportStatus.COMPLETED,
      });

      await exportController.cancelExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        error: {
          message: 'Cannot cancel export in current status',
          statusCode: 400,
        },
      });
    });

    it('should return 400 if export already failed', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        status: ExportStatus.FAILED,
      });

      await exportController.cancelExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('retryExport', () => {
    it('should create new export with same parameters', async () => {
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        venueId: 'venue-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: { dateRange: { start: new Date(), end: new Date() } },
        options: {},
        status: ExportStatus.FAILED,
      });

      mockExportService.createExport.mockResolvedValue({
        id: 'export-retry',
        status: ExportStatus.PENDING,
      });

      await exportController.retryExport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith({
        venueId: 'venue-123',
        userId: 'user-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: expect.any(Object),
        options: {},
      });

      expect(mockReply.code).toHaveBeenCalledWith(202);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          exportId: 'export-retry',
        },
      });
    });

    it('should return 404 if original export not found', async () => {
      mockRequest.params = { exportId: 'nonexistent' };
      mockExportService.getExportStatus.mockResolvedValue(null);

      await exportController.retryExport(mockRequest, mockReply);

      expect(mockReply.code).toHaveBeenCalledWith(404);
    });

    it('should use system as default user', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { exportId: 'export-1' };
      mockExportService.getExportStatus.mockResolvedValue({
        id: 'export-1',
        venueId: 'venue-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: {},
        options: {},
      });

      await exportController.retryExport(mockRequest, mockReply);

      expect(mockExportService.createExport).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
        })
      );
    });
  });
});
