import { BatchOperationsService } from '../../../src/services/batch-operations.service';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';
import { getPool } from '../../../src/config/database.config';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/utils/logger');

describe('BatchOperationsService', () => {
  let batchOperationsService: BatchOperationsService;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };
    (getPool as jest.Mock).mockReturnValue(mockPool);

    batchOperationsService = new BatchOperationsService();
  });

  describe('batchDelete', () => {
    it('should delete multiple files successfully', async () => {
      const fileIds = ['file1', 'file2', 'file3'];
      const tenantId = 'tenant-123';

      const mockFile = {
        id: 'file1',
        storagePath: '/storage/file.pdf'
      };

      (fileModel.findById as jest.Mock).mockResolvedValue(mockFile);
      (storageService.delete as jest.Mock).mockResolvedValue(undefined);
      (fileModel.softDelete as jest.Mock).mockResolvedValue(undefined);

      const result = await batchOperationsService.batchDelete(fileIds, tenantId);

      expect(result.deleted).toBe(3);
      expect(result.failed).toBe(0);
      expect(fileModel.findById).toHaveBeenCalledTimes(3);
      expect(storageService.delete).toHaveBeenCalledTimes(3);
      expect(fileModel.softDelete).toHaveBeenCalledTimes(3);
    });

    it('should handle file not found', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock)
        .mockResolvedValueOnce({ id: 'file1', storagePath: '/storage/file1.pdf' })
        .mockResolvedValueOnce(null);

      (storageService.delete as jest.Mock).mockResolvedValue(undefined);
      (fileModel.softDelete as jest.Mock).mockResolvedValue(undefined);

      const result = await batchOperationsService.batchDelete(fileIds, tenantId);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should continue on individual file errors', async () => {
      const fileIds = ['file1', 'file2', 'file3'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1', storagePath: '/storage/file.pdf' });
      (storageService.delete as jest.Mock).mockResolvedValue(undefined);
      (fileModel.softDelete as jest.Mock)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Delete failed'))
        .mockResolvedValueOnce(undefined);

      const result = await batchOperationsService.batchDelete(fileIds, tenantId);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle storage deletion errors gracefully', async () => {
      const fileIds = ['file1'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1', storagePath: '/storage/file.pdf' });
      (storageService.delete as jest.Mock).mockRejectedValue(new Error('Storage error'));
      (fileModel.softDelete as jest.Mock).mockResolvedValue(undefined);

      const result = await batchOperationsService.batchDelete(fileIds, tenantId);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should throw error when database not available', async () => {
      (getPool as jest.Mock).mockReturnValue(null);

      await expect(
        batchOperationsService.batchDelete(['file1'], 'tenant-123')
      ).rejects.toThrow('Database not available');
    });
  });

  describe('batchMove', () => {
    it('should move multiple files successfully', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';
      const newEntityType = 'event';
      const newEntityId = 'event-456';

      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1' });
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await batchOperationsService.batchMove(
        fileIds,
        tenantId,
        newEntityType,
        newEntityId
      );

      expect(result.moved).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should skip files that do not exist', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock)
        .mockResolvedValueOnce({ id: 'file1' })
        .mockResolvedValueOnce(null);

      const result = await batchOperationsService.batchMove(
        fileIds,
        tenantId,
        'event',
        'event-456'
      );

      expect(result.moved).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle database errors', async () => {
      const fileIds = ['file1'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1' });
      mockPool.query.mockRejectedValue(new Error('DB error'));

      const result = await batchOperationsService.batchMove(
        fileIds,
        tenantId,
        'event',
        'event-456'
      );

      expect(result.moved).toBe(0);
      expect(result.failed).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('batchTag', () => {
    it('should tag multiple files successfully', async () => {
      const fileIds = ['file1', 'file2', 'file3'];
      const tenantId = 'tenant-123';
      const tags = ['important', 'archived'];

      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1' });
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await batchOperationsService.batchTag(fileIds, tenantId, tags);

      expect(result.tagged).toBe(3);
      expect(result.failed).toBe(0);
      expect(mockPool.query).toHaveBeenCalledTimes(3);
    });

    it('should skip non-existent files', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';
      const tags = ['tag1'];

      (fileModel.findById as jest.Mock)
        .mockResolvedValueOnce({ id: 'file1' })
        .mockResolvedValueOnce(null);

      const result = await batchOperationsService.batchTag(fileIds, tenantId, tags);

      expect(result.tagged).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should handle tagging errors', async () => {
      const fileIds = ['file1'];
      const tenantId = 'tenant-123';
      const tags = ['tag1'];

      (fileModel.findById as jest.Mock).mockResolvedValue({ id: 'file1' });
      mockPool.query.mockRejectedValue(new Error('Tag error'));

      const result = await batchOperationsService.batchTag(fileIds, tenantId, tags);

      expect(result.tagged).toBe(0);
      expect(result.failed).toBe(1);
    });
  });

  describe('batchDownload', () => {
    it('should create zip archive of multiple files', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';

      const mockFile1 = {
        id: 'file1',
        filename: 'file1.pdf',
        storagePath: '/storage/file1.pdf'
      };

      const mockFile2 = {
        id: 'file2',
        filename: 'file2.pdf',
        storagePath: '/storage/file2.pdf'
      };

      (fileModel.findById as jest.Mock)
        .mockResolvedValueOnce(mockFile1)
        .mockResolvedValueOnce(mockFile2);

      (storageService.download as jest.Mock)
        .mockResolvedValueOnce(Buffer.from('content1'))
        .mockResolvedValueOnce(Buffer.from('content2'));

      const result = await batchOperationsService.batchDownload(fileIds, tenantId);

      expect(result).toBeInstanceOf(Buffer);
      expect(fileModel.findById).toHaveBeenCalledTimes(2);
      expect(storageService.download).toHaveBeenCalledTimes(2);
    });

    it('should skip files without storage path', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock)
        .mockResolvedValueOnce({ id: 'file1', filename: 'file1.pdf', storagePath: '/storage/file1.pdf' })
        .mockResolvedValueOnce({ id: 'file2', filename: 'file2.pdf', storagePath: null });

      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('content'));

      const result = await batchOperationsService.batchDownload(fileIds, tenantId);

      expect(result).toBeInstanceOf(Buffer);
      expect(storageService.download).toHaveBeenCalledTimes(1);
    });

    it('should handle archiving errors', async () => {
      const fileIds = ['file1'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock).mockRejectedValue(new Error('DB error'));

      await expect(
        batchOperationsService.batchDownload(fileIds, tenantId)
      ).rejects.toThrow();
    });
  });

  describe('batchCopy', () => {
    it('should copy multiple files successfully', async () => {
      const fileIds = ['file1', 'file2'];
      const tenantId = 'tenant-123';
      const targetEntityType = 'event';
      const targetEntityId = 'event-789';

      const mockFile = {
        id: 'file1',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        storagePath: '/storage/test.pdf',
        uploadedBy: 'user-123',
        metadata: {},
        tags: []
      };

      (fileModel.findById as jest.Mock).mockResolvedValue(mockFile);
      (storageService.download as jest.Mock).mockResolvedValue(Buffer.from('content'));

      // Mock dynamic import of uploadService
      const mockUploadFile = jest.fn().mockResolvedValue({ id: 'new-file' });
      jest.doMock('../../../src/services/upload.service', () => ({
        uploadService: {
          uploadFile: mockUploadFile
        }
      }));

      const result = await batchOperationsService.batchCopy(
        fileIds,
        tenantId,
        targetEntityType,
        targetEntityId
      );

      expect(result.copied).toBe(2);
      expect(result.failed).toBe(0);
      expect(fileModel.findById).toHaveBeenCalledTimes(2);
      expect(storageService.download).toHaveBeenCalledTimes(2);
    });

    it('should skip files without storage path', async () => {
      const fileIds = ['file1'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock).mockResolvedValue({
        id: 'file1',
        filename: 'test.pdf',
        storagePath: null
      });

      const result = await batchOperationsService.batchCopy(
        fileIds,
        tenantId,
        'event',
        'event-789'
      );

      expect(result.copied).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should handle copy errors', async () => {
      const fileIds = ['file1'];
      const tenantId = 'tenant-123';

      (fileModel.findById as jest.Mock).mockRejectedValue(new Error('Copy error'));

      const result = await batchOperationsService.batchCopy(
        fileIds,
        tenantId,
        'event',
        'event-789'
      );

      expect(result.copied).toBe(0);
      expect(result.failed).toBe(1);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
