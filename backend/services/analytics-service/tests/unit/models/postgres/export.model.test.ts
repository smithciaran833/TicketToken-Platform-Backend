/**
 * Export Model Unit Tests
 */

const mockFirst = jest.fn();
const mockWhere = jest.fn().mockReturnThis();
const mockInsert = jest.fn().mockReturnThis();
const mockUpdate = jest.fn().mockReturnThis();
const mockReturning = jest.fn();
const mockDelete = jest.fn();
const mockOrderBy = jest.fn().mockReturnThis();
const mockLimit = jest.fn();
const mockOffset = jest.fn();

const mockDb = jest.fn(() => ({
  where: mockWhere,
  first: mockFirst,
  insert: mockInsert,
  update: mockUpdate,
  returning: mockReturning,
  delete: mockDelete,
  orderBy: mockOrderBy,
  limit: mockLimit,
  offset: mockOffset,
}));

jest.mock('../../../../src/config/database', () => ({
  getDb: () => mockDb,
}));

import { ExportModel, Export } from '../../../../src/models/postgres/export.model';

describe('ExportModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWhere.mockReturnThis();
    mockInsert.mockReturnThis();
    mockUpdate.mockReturnThis();
    mockOrderBy.mockReturnThis();
    mockLimit.mockReturnThis();
  });

  describe('create', () => {
    it('should create export and return it', async () => {
      const exportData = {
        tenant_id: 'tenant-1',
        export_type: 'report',
        format: 'csv',
        status: 'pending',
        parameters: { startDate: '2024-01-01' },
        requested_by: 'user-1',
      };
      const created = { id: 'export-1', ...exportData };
      mockReturning.mockResolvedValue([created]);

      const result = await ExportModel.create(exportData as any);

      expect(result).toEqual(created);
      expect(mockDb).toHaveBeenCalledWith('analytics_exports');
      expect(mockInsert).toHaveBeenCalledWith(exportData);
    });
  });

  describe('createExport (legacy)', () => {
    it('should create export with legacy field names', async () => {
      const legacyData = {
        venueId: 'venue-1',
        type: 'analytics',
        format: 'xlsx',
        userId: 'user-1',
        filters: { metric: 'revenue' },
      };
      mockReturning.mockResolvedValue([{ id: 'export-1' }]);

      await ExportModel.createExport(legacyData);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: 'venue-1',
          export_type: 'analytics',
          format: 'xlsx',
          requested_by: 'user-1',
          parameters: { metric: 'revenue' },
        })
      );
    });
  });

  describe('updateExportStatus (legacy)', () => {
    it('should update export status with file info', async () => {
      const updates = {
        filePath: '/exports/file.csv',
        fileUrl: 'https://example.com/file.csv',
        fileSize: 1024,
      };
      mockReturning.mockResolvedValue([{ id: 'export-1', status: 'completed' }]);

      const result = await ExportModel.updateExportStatus('export-1', 'completed', updates);

      expect(result?.status).toBe('completed');
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          file_path: '/exports/file.csv',
          file_url: 'https://example.com/file.csv',
          file_size: 1024,
        })
      );
    });

    it('should update with error message on failure', async () => {
      mockReturning.mockResolvedValue([{ id: 'export-1', status: 'failed' }]);

      await ExportModel.updateExportStatus('export-1', 'failed', {
        errorMessage: 'Export failed',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error_message: 'Export failed',
        })
      );
    });
  });

  describe('getExportsByUser (legacy)', () => {
    it('should get exports for user', async () => {
      const exports = [{ id: 'export-1' }, { id: 'export-2' }];
      mockLimit.mockResolvedValue(exports);

      const result = await ExportModel.getExportsByUser('user-1', 'venue-1');

      expect(result).toEqual(exports);
      expect(mockWhere).toHaveBeenCalledWith({
        requested_by: 'user-1',
        tenant_id: 'venue-1',
      });
      expect(mockLimit).toHaveBeenCalledWith(10);
    });

    it('should use custom limit', async () => {
      mockLimit.mockResolvedValue([]);

      await ExportModel.getExportsByUser('user-1', 'venue-1', 25);

      expect(mockLimit).toHaveBeenCalledWith(25);
    });
  });

  describe('findById', () => {
    it('should find export by id', async () => {
      const exportRecord = { id: 'export-1', tenant_id: 'tenant-1' };
      mockFirst.mockResolvedValue(exportRecord);

      const result = await ExportModel.findById('export-1');

      expect(result).toEqual(exportRecord);
      expect(mockWhere).toHaveBeenCalledWith({ id: 'export-1' });
    });

    it('should filter by tenant if provided', async () => {
      mockFirst.mockResolvedValue(null);

      await ExportModel.findById('export-1', 'tenant-1');

      expect(mockWhere).toHaveBeenCalledWith({ tenant_id: 'tenant-1' });
    });

    it('should return null if not found', async () => {
      mockFirst.mockResolvedValue(undefined);

      const result = await ExportModel.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByStatus', () => {
    it('should find exports by status', async () => {
      const exports = [{ id: 'export-1', status: 'pending' }];
      // When no pagination, orderBy is terminal
      mockOrderBy.mockResolvedValue(exports);

      const result = await ExportModel.findByStatus('pending', 'tenant-1');

      expect(result).toEqual(exports);
      expect(mockWhere).toHaveBeenCalledWith({ status: 'pending', tenant_id: 'tenant-1' });
    });

    it('should apply pagination', async () => {
      mockOffset.mockResolvedValue([]);

      await ExportModel.findByStatus('pending', 'tenant-1', { limit: 10, offset: 20 });

      expect(mockLimit).toHaveBeenCalledWith(10);
      expect(mockOffset).toHaveBeenCalledWith(20);
    });
  });

  describe('findByUser', () => {
    it('should find exports by user', async () => {
      const exports = [{ id: 'export-1' }];
      mockOrderBy.mockResolvedValue(exports);

      const result = await ExportModel.findByUser('user-1', 'tenant-1');

      expect(result).toEqual(exports);
      expect(mockWhere).toHaveBeenCalledWith({ requested_by: 'user-1', tenant_id: 'tenant-1' });
    });
  });

  describe('update', () => {
    it('should update export', async () => {
      const updates = { status: 'completed' };
      mockReturning.mockResolvedValue([{ id: 'export-1', status: 'completed' }]);

      const result = await ExportModel.update('export-1', 'tenant-1', updates);

      expect(result?.status).toBe('completed');
    });

    it('should return null if not found', async () => {
      mockReturning.mockResolvedValue([]);

      const result = await ExportModel.update('non-existent', 'tenant-1', {});

      expect(result).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete export', async () => {
      mockDelete.mockResolvedValue(1);

      const result = await ExportModel.delete('export-1', 'tenant-1');

      expect(result).toBe(true);
    });
  });

  describe('deleteExpired', () => {
    it('should delete expired exports', async () => {
      mockDelete.mockResolvedValue(5);

      const result = await ExportModel.deleteExpired();

      expect(result).toBe(5);
      expect(mockWhere).toHaveBeenCalledWith('expires_at', '<', expect.any(Date));
    });
  });

  describe('findExpired', () => {
    it('should find expired exports', async () => {
      const expired = [{ id: 'export-1' }];
      mockOrderBy.mockResolvedValue(expired);

      const result = await ExportModel.findExpired();

      expect(result).toEqual(expired);
      expect(mockWhere).toHaveBeenCalledWith('expires_at', '<', expect.any(Date));
      expect(mockOrderBy).toHaveBeenCalledWith('expires_at', 'asc');
    });
  });
});
