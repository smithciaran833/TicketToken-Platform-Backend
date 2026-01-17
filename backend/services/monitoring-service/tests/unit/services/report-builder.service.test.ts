// Mock dependencies BEFORE imports
const mockDbRaw = jest.fn();

jest.mock('../../../src/config/database', () => ({
  db: { raw: mockDbRaw },
}));

jest.mock('../../../src/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

import { ReportBuilderService, reportBuilderService, Report, ReportHistory } from '../../../src/services/report-builder.service';
import { logger } from '../../../src/logger';

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReportBuilderService();
    mockDbRaw.mockResolvedValue({ rows: [] });
  });

  describe('createReport', () => {
    it('should create report with all fields', async () => {
      const reportData: Report = {
        user_id: 'user-123',
        name: 'Monthly Sales Report',
        description: 'Sales metrics for the month',
        query: { metrics: ['revenue', 'tickets_sold'], filters: { period: '30d' } },
        format: 'pdf',
        schedule: '0 9 * * 1',
        is_public: false,
      };
      const createdRow = {
        id: 'report-456',
        ...reportData,
        query: JSON.stringify(reportData.query),
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbRaw.mockResolvedValue({ rows: [createdRow] });

      const result = await service.createReport(reportData);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO reports'),
        [
          'user-123',
          'Monthly Sales Report',
          'Sales metrics for the month',
          JSON.stringify({ metrics: ['revenue', 'tickets_sold'], filters: { period: '30d' } }),
          'pdf',
          '0 9 * * 1',
          false,
        ]
      );
      expect(result.id).toBe('report-456');
      expect(result.name).toBe('Monthly Sales Report');
    });

    it('should use empty string for missing description', async () => {
      const reportData: Report = {
        user_id: 'user-123',
        name: 'No Description Report',
        query: { select: '*' },
        format: 'csv',
        is_public: true,
      };
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', ...reportData }] });

      await service.createReport(reportData);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([''])
      );
    });

    it('should use null for missing schedule', async () => {
      const reportData: Report = {
        user_id: 'user-123',
        name: 'One-time Report',
        query: {},
        format: 'json',
        is_public: false,
      };
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', ...reportData }] });

      await service.createReport(reportData);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([null])
      );
    });

    it('should log report creation', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-new', query: '{}' }] });

      await service.createReport({
        user_id: 'user-1',
        name: 'Test',
        query: {},
        format: 'pdf',
        is_public: false,
      });

      expect(logger.info).toHaveBeenCalledWith('Report created', { id: 'report-new' });
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Insert failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(
        service.createReport({
          user_id: 'user-1',
          name: 'Test',
          query: {},
          format: 'pdf',
          is_public: false,
        })
      ).rejects.toThrow('Insert failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to create report:', dbError);
    });

    it('should handle all format types', async () => {
      const formats: Array<'pdf' | 'csv' | 'json' | 'xlsx'> = ['pdf', 'csv', 'json', 'xlsx'];

      for (const format of formats) {
        mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', format, query: '{}' }] });

        const result = await service.createReport({
          user_id: 'user-1',
          name: 'Test',
          query: {},
          format,
          is_public: false,
        });

        expect(result.format).toBe(format);
      }
    });
  });

  describe('getReport', () => {
    it('should return report when found', async () => {
      const mockRow = {
        id: 'report-123',
        user_id: 'user-1',
        name: 'Test Report',
        description: 'A test',
        query: JSON.stringify({ select: 'metrics' }),
        format: 'pdf',
        schedule: '0 0 * * *',
        is_public: true,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockDbRaw.mockResolvedValue({ rows: [mockRow] });

      const result = await service.getReport('report-123');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM reports WHERE id = ?'),
        ['report-123']
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe('report-123');
      expect(result!.query).toEqual({ select: 'metrics' });
    });

    it('should return null when report not found', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      const result = await service.getReport('nonexistent');

      expect(result).toBeNull();
    });

    it('should parse JSON query from string', async () => {
      const query = { metrics: ['cpu', 'memory'], filters: {} };
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'report-1', query: JSON.stringify(query) }],
      });

      const result = await service.getReport('report-1');

      expect(result!.query).toEqual(query);
    });

    it('should handle already parsed query object', async () => {
      const query = { metrics: [] };
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'report-1', query: query }],
      });

      const result = await service.getReport('report-1');

      expect(result!.query).toEqual(query);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Query failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.getReport('report-1')).rejects.toThrow('Query failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to get report:', dbError);
    });
  });

  describe('listReports', () => {
    it('should return user reports and public reports by default', async () => {
      const mockRows = [
        { id: 'report-1', user_id: 'user-1', name: 'My Report', query: '{}' },
        { id: 'report-2', user_id: 'user-2', name: 'Public Report', is_public: true, query: '{}' },
      ];
      mockDbRaw.mockResolvedValue({ rows: mockRows });

      const result = await service.listReports('user-1');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('user_id = ?'),
        ['user-1']
      );
      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('OR is_public = TRUE'),
        expect.any(Array)
      );
      expect(result).toHaveLength(2);
    });

    it('should exclude public reports when includePublic is false', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.listReports('user-1', false);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.not.stringContaining('is_public'),
        ['user-1']
      );
    });

    it('should order by created_at DESC', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.listReports('user-1');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no reports found', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      const result = await service.listReports('user-1');

      expect(result).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('List query failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.listReports('user-1')).rejects.toThrow('List query failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to list reports:', dbError);
    });
  });

  describe('updateReport', () => {
    it('should update report with provided fields', async () => {
      const updates = {
        name: 'Updated Report',
        description: 'New description',
        query: { metrics: ['new_metric'] },
        format: 'xlsx' as const,
        is_public: true,
      };
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'report-1', ...updates, query: JSON.stringify(updates.query) }],
      });

      const result = await service.updateReport('report-1', updates);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE reports'),
        expect.arrayContaining(['Updated Report', 'New description', JSON.stringify({ metrics: ['new_metric'] }), 'xlsx', true, 'report-1'])
      );
      expect(result.name).toBe('Updated Report');
    });

    it('should only update provided fields', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', name: 'Only Name', query: '{}' }] });

      await service.updateReport('report-1', { name: 'Only Name' });

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('name = ?'),
        expect.arrayContaining(['Only Name', 'report-1'])
      );
    });

    it('should update schedule when provided', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', schedule: '0 0 * * *', query: '{}' }] });

      await service.updateReport('report-1', { schedule: '0 0 * * *' });

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('schedule = ?'),
        expect.arrayContaining(['0 0 * * *'])
      );
    });

    it('should always update updated_at', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', query: '{}' }] });

      await service.updateReport('report-1', { name: 'Test' });

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should log report update', async () => {
      mockDbRaw.mockResolvedValue({ rows: [{ id: 'report-1', query: '{}' }] });

      await service.updateReport('report-1', { name: 'Updated' });

      expect(logger.info).toHaveBeenCalledWith('Report updated', { id: 'report-1' });
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Update failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.updateReport('report-1', { name: 'Test' })).rejects.toThrow('Update failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to update report:', dbError);
    });
  });

  describe('deleteReport', () => {
    it('should delete report by id', async () => {
      mockDbRaw.mockResolvedValue({ rowCount: 1 });

      await service.deleteReport('report-to-delete');

      expect(mockDbRaw).toHaveBeenCalledWith(
        'DELETE FROM reports WHERE id = ?',
        ['report-to-delete']
      );
    });

    it('should log report deletion', async () => {
      mockDbRaw.mockResolvedValue({ rowCount: 1 });

      await service.deleteReport('report-123');

      expect(logger.info).toHaveBeenCalledWith('Report deleted', { id: 'report-123' });
    });

    it('should not throw when report does not exist', async () => {
      mockDbRaw.mockResolvedValue({ rowCount: 0 });

      await expect(service.deleteReport('nonexistent')).resolves.toBeUndefined();
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Delete failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.deleteReport('report-1')).rejects.toThrow('Delete failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to delete report:', dbError);
    });
  });

  describe('generateReport', () => {
    const mockReport: Report = {
      id: 'report-123',
      user_id: 'user-1',
      name: 'Test Report',
      query: { metrics: ['revenue'] },
      format: 'pdf',
      is_public: false,
    };

    it('should create pending history record', async () => {
      mockDbRaw
        .mockResolvedValueOnce({ rows: [{ id: 'history-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'history-1', status: 'success', file_url: '/reports/report-123/output.pdf' }] });

      await service.generateReport(mockReport);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO report_history"),
        expect.arrayContaining(['report-123'])
      );
    });

    it('should update history to success on completion', async () => {
      mockDbRaw
        .mockResolvedValueOnce({ rows: [{ id: 'history-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'history-1', status: 'success', file_url: '/reports/report-123/output.pdf' }] });

      const result = await service.generateReport(mockReport);

      expect(result.status).toBe('success');
      expect(result.file_url).toContain('/reports/report-123/output.pdf');
    });

    it('should generate correct file URL based on format', async () => {
      const formats: Array<'pdf' | 'csv' | 'json' | 'xlsx'> = ['pdf', 'csv', 'json', 'xlsx'];

      for (const format of formats) {
        mockDbRaw
          .mockResolvedValueOnce({ rows: [{ id: 'history-1' }] })
          .mockResolvedValueOnce({ rows: [{ id: 'history-1', status: 'success', file_url: `/reports/report-123/output.${format}` }] });

        const result = await service.generateReport({ ...mockReport, format });

        expect(result.file_url).toContain(`output.${format}`);
      }
    });

    it('should log generation info', async () => {
      mockDbRaw
        .mockResolvedValueOnce({ rows: [{ id: 'history-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'history-1', status: 'success' }] });

      await service.generateReport(mockReport);

      expect(logger.info).toHaveBeenCalledWith('Generating report', expect.objectContaining({
        report_id: 'report-123',
        format: 'pdf',
      }));
    });

    it('should log success with duration', async () => {
      mockDbRaw
        .mockResolvedValueOnce({ rows: [{ id: 'history-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'history-1', status: 'success' }] });

      await service.generateReport(mockReport);

      expect(logger.info).toHaveBeenCalledWith('Report generated successfully', expect.objectContaining({
        report_id: 'report-123',
      }));
    });

    it('should update history to failed on error', async () => {
      const genError = new Error('Generation failed');
      mockDbRaw
        .mockResolvedValueOnce({ rows: [{ id: 'history-1' }] })
        .mockRejectedValueOnce(genError)
        .mockResolvedValueOnce({ rows: [] });

      await expect(service.generateReport(mockReport)).rejects.toThrow();

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'failed'"),
        expect.arrayContaining(['Generation failed'])
      );
    });

    it('should throw and log error on failure', async () => {
      const dbError = new Error('Database error');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.generateReport(mockReport)).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalledWith('Report generation failed:', dbError);
    });
  });

  describe('getReportHistory', () => {
    it('should return report history with default limit', async () => {
      const mockHistory = [
        { id: 'h1', report_id: 'report-1', status: 'success', generated_at: new Date() },
        { id: 'h2', report_id: 'report-1', status: 'failed', generated_at: new Date() },
      ];
      mockDbRaw.mockResolvedValue({ rows: mockHistory });

      const result = await service.getReportHistory('report-1');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM report_history'),
        ['report-1', 50]
      );
      expect(result).toHaveLength(2);
    });

    it('should use custom limit', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.getReportHistory('report-1', 10);

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.any(String),
        ['report-1', 10]
      );
    });

    it('should order by generated_at DESC', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.getReportHistory('report-1');

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY generated_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no history', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      const result = await service.getReportHistory('report-1');

      expect(result).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('History query failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.getReportHistory('report-1')).rejects.toThrow('History query failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to get report history:', dbError);
    });
  });

  describe('getScheduledReports', () => {
    it('should return reports with schedules', async () => {
      const mockReports = [
        { id: 'r1', name: 'Daily Report', schedule: '0 9 * * *', query: '{}' },
        { id: 'r2', name: 'Weekly Report', schedule: '0 9 * * 1', query: '{}' },
      ];
      mockDbRaw.mockResolvedValue({ rows: mockReports });

      const result = await service.getScheduledReports();

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('WHERE schedule IS NOT NULL')
      );
      expect(result).toHaveLength(2);
    });

    it('should order by created_at DESC', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      await service.getScheduledReports();

      expect(mockDbRaw).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC')
      );
    });

    it('should return empty array when no scheduled reports', async () => {
      mockDbRaw.mockResolvedValue({ rows: [] });

      const result = await service.getScheduledReports();

      expect(result).toEqual([]);
    });

    it('should throw and log error on database failure', async () => {
      const dbError = new Error('Scheduled query failed');
      mockDbRaw.mockRejectedValue(dbError);

      await expect(service.getScheduledReports()).rejects.toThrow('Scheduled query failed');
      expect(logger.error).toHaveBeenCalledWith('Failed to get scheduled reports:', dbError);
    });
  });

  describe('mapRowToReport', () => {
    it('should handle null is_public as false', async () => {
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'report-1', is_public: null, query: '{}' }],
      });

      const result = await service.getReport('report-1');

      expect(result!.is_public).toBe(false);
    });

    it('should handle undefined is_public as false', async () => {
      mockDbRaw.mockResolvedValue({
        rows: [{ id: 'report-1', query: '{}' }],
      });

      const result = await service.getReport('report-1');

      expect(result!.is_public).toBe(false);
    });
  });

  describe('exported instance', () => {
    it('should export reportBuilderService as singleton', () => {
      const { reportBuilderService: exported1 } = require('../../../src/services/report-builder.service');
      const { reportBuilderService: exported2 } = require('../../../src/services/report-builder.service');
      expect(exported1).toBe(exported2);
    });
  });
});
