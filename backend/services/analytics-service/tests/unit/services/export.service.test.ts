/**
 * Export Service Unit Tests
 */

import { ExportType, ExportFormat, ExportStatus } from '../../../src/types';

const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  child: jest.fn().mockReturnThis(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

const mockExportModel = {
  createExport: jest.fn(),
  findById: jest.fn(),
  updateExportStatus: jest.fn(),
  getExportsByUser: jest.fn(),
};

jest.mock('../../../src/models', () => ({
  ExportModel: mockExportModel,
}));

const mockMessageGatewayService = {
  sendMessage: jest.fn(),
};

jest.mock('../../../src/services/message-gateway.service', () => ({
  messageGatewayService: mockMessageGatewayService,
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1024 }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('fs', () => ({
  createWriteStream: jest.fn().mockReturnValue({
    pipe: jest.fn(),
    on: jest.fn((event, cb) => { if (event === 'finish') setTimeout(cb, 0); return this; }),
  }),
}));

jest.mock('exceljs', () => ({
  Workbook: jest.fn().mockImplementation(() => ({
    addWorksheet: jest.fn().mockReturnValue({ columns: [], addRow: jest.fn(), addRows: jest.fn() }),
    xlsx: { writeFile: jest.fn().mockResolvedValue(undefined) },
  })),
}));

jest.mock('json2csv', () => ({
  Parser: jest.fn().mockImplementation(() => ({ parse: jest.fn().mockReturnValue('csv,data') })),
}));

jest.mock('pdfkit', () => jest.fn().mockImplementation(() => ({
  pipe: jest.fn(),
  fontSize: jest.fn().mockReturnThis(),
  text: jest.fn().mockReturnThis(),
  moveDown: jest.fn().mockReturnThis(),
  end: jest.fn(),
})));

import { ExportService, exportService } from '../../../src/services/export.service';

describe('ExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = ExportService.getInstance();
      const instance2 = ExportService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('createExport', () => {
    it('should create export request and queue processing', async () => {
      const dbExport = {
        id: 'export-123',
        tenant_id: 'venue-123',
        requested_by: 'user-123',
        export_type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        status: ExportStatus.PENDING,
        parameters: { dateRange: { start: '2024-01-01', end: '2024-01-31' } },
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockExportModel.createExport.mockResolvedValue(dbExport);

      const result = await exportService.createExport({
        venueId: 'venue-123',
        userId: 'user-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: { dateRange: { start: new Date(), end: new Date() } },
        options: {},
      });

      expect(result.id).toBe('export-123');
      expect(result.status).toBe(ExportStatus.PENDING);
      expect(mockExportModel.createExport).toHaveBeenCalled();
    });

    it('should handle export creation errors', async () => {
      mockExportModel.createExport.mockRejectedValue(new Error('Database error'));

      await expect(exportService.createExport({
        venueId: 'venue-123',
        userId: 'user-123',
        type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        filters: {},
        options: {},
      })).rejects.toThrow('Database error');
    });
  });

  describe('getExportStatus', () => {
    it('should return mapped export when found', async () => {
      const dbExport = {
        id: 'export-123',
        tenant_id: 'venue-123',
        requested_by: 'user-123',
        export_type: ExportType.ANALYTICS_REPORT,
        format: ExportFormat.CSV,
        status: ExportStatus.COMPLETED,
        file_url: 'https://example.com/file.csv',
        file_size: 2048,
        parameters: { dateRange: { start: '2024-01-01', end: '2024-01-31' } },
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockExportModel.findById.mockResolvedValue(dbExport);

      const result = await exportService.getExportStatus('export-123');

      expect(result).toEqual(expect.objectContaining({
        id: 'export-123',
        venueId: 'venue-123',
        status: ExportStatus.COMPLETED,
        fileUrl: 'https://example.com/file.csv',
      }));
    });

    it('should return null when export not found', async () => {
      mockExportModel.findById.mockResolvedValue(null);

      const result = await exportService.getExportStatus('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getUserExports', () => {
    it('should return mapped exports for user', async () => {
      const dbExports = [
        { id: 'exp-1', tenant_id: 'venue-123', requested_by: 'user-123', export_type: ExportType.ANALYTICS_REPORT, format: ExportFormat.CSV, status: ExportStatus.COMPLETED, parameters: {}, created_at: new Date(), updated_at: new Date() },
        { id: 'exp-2', tenant_id: 'venue-123', requested_by: 'user-123', export_type: ExportType.CUSTOMER_LIST, format: ExportFormat.XLSX, status: ExportStatus.PROCESSING, parameters: {}, created_at: new Date(), updated_at: new Date() },
      ];
      mockExportModel.getExportsByUser.mockResolvedValue(dbExports);

      const result = await exportService.getUserExports('user-123', 'venue-123', 10);

      expect(result).toHaveLength(2);
      expect(mockExportModel.getExportsByUser).toHaveBeenCalledWith('user-123', 'venue-123', 10);
    });

    it('should use default limit of 50', async () => {
      mockExportModel.getExportsByUser.mockResolvedValue([]);

      await exportService.getUserExports('user-123', 'venue-123');

      expect(mockExportModel.getExportsByUser).toHaveBeenCalledWith('user-123', 'venue-123', 50);
    });
  });
});
