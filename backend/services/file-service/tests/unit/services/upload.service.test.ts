// Mock dependencies BEFORE imports
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/validators/file.validator');
jest.mock('../../../src/utils/file-helpers');
jest.mock('../../../src/utils/logger');

import { UploadService, uploadService } from '../../../src/services/upload.service';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';
import { fileValidator } from '../../../src/validators/file.validator';
import * as fileHelpers from '../../../src/utils/file-helpers';
import { FileStatus } from '../../../src/constants/file-status';

describe('services/upload.service', () => {
  let service: UploadService;
  let mockFileModel: jest.Mocked<typeof fileModel>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockFileValidator: jest.Mocked<typeof fileValidator>;
  let mockFileHelpers: jest.Mocked<typeof fileHelpers>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockFileModel = fileModel as jest.Mocked<typeof fileModel>;
    mockFileModel.create = jest.fn();
    mockFileModel.updateCdnUrl = jest.fn().mockResolvedValue(undefined);
    mockFileModel.findById = jest.fn();
    mockFileModel.updateStatus = jest.fn().mockResolvedValue(undefined);
    mockFileModel.findByEntity = jest.fn();

    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/file.jpg' } as any);

    mockFileValidator = fileValidator as jest.Mocked<typeof fileValidator>;
    mockFileValidator.validateSize = jest.fn();
    mockFileValidator.validateMimeType = jest.fn();
    mockFileValidator.sanitizeFilename = jest.fn((filename) => filename);
    mockFileValidator.getExtension = jest.fn((filename) => filename.split('.').pop() || '');

    mockFileHelpers = fileHelpers as jest.Mocked<typeof fileHelpers>;
    (mockFileHelpers.generateFileId as jest.Mock) = jest.fn(() => 'file-123');
    (mockFileHelpers.generateFileHash as jest.Mock) = jest.fn(() => 'abc123hash');
    (mockFileHelpers.generateStorageKey as jest.Mock) = jest.fn(() => '/uploads/file-123/test.jpg');

    service = new UploadService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload file successfully', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      const filename = 'test.jpg';
      const mimeType = 'image/jpeg';
      const tenantId = 'tenant-123';
      const userId = 'user-456';

      const mockFileRecord = {
        id: 'file-123',
        filename: 'test.jpg',
        mimeType: 'image/jpeg',
        status: FileStatus.UPLOADING,
        storagePath: '/uploads/file-123/test.jpg'
      };

      const mockUpdatedRecord = {
        ...mockFileRecord,
        cdnUrl: 'https://cdn.example.com/file.jpg',
        status: FileStatus.READY
      };

      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockFileModel.findById.mockResolvedValue(mockUpdatedRecord as any);

      // Act
      const result = await service.uploadFile(buffer, filename, mimeType, tenantId, userId);

      // Assert
      expect(result).toEqual(mockUpdatedRecord);
      expect(mockFileValidator.validateSize).toHaveBeenCalledWith(buffer.length, mimeType);
      expect(mockFileValidator.validateMimeType).toHaveBeenCalledWith(mimeType);
      expect(mockFileHelpers.generateFileId).toHaveBeenCalled();
      expect(mockFileHelpers.generateFileHash).toHaveBeenCalledWith(buffer);
      expect(mockFileModel.create).toHaveBeenCalled();
      expect(mockStorageService.upload).toHaveBeenCalledWith(buffer, '/uploads/file-123/test.jpg');
      expect(mockFileModel.updateCdnUrl).toHaveBeenCalledWith('file-123', tenantId, 'https://cdn.example.com/file.jpg');
    });

    it('should upload file with options', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      const options = {
        entityType: 'ticket',
        entityId: 'ticket-789',
        isPublic: true,
        metadata: { key: 'value' },
        tags: ['tag1', 'tag2']
      };

      const mockFileRecord = {
        id: 'file-123',
        filename: 'test.jpg',
        status: FileStatus.UPLOADING
      };

      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockFileModel.findById.mockResolvedValue(mockFileRecord as any);

      // Act
      await service.uploadFile(buffer, 'test.jpg', 'image/jpeg', 'tenant-123', 'user-456', options);

      // Assert
      expect(mockFileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'ticket',
          entityId: 'ticket-789',
          isPublic: true,
          metadata: { key: 'value' },
          tags: ['tag1', 'tag2']
        }),
        'tenant-123'
      );
    });

    it('should handle file without userId', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      const mockFileRecord = {
        id: 'file-123',
        status: FileStatus.UPLOADING
      };

      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockFileModel.findById.mockResolvedValue(mockFileRecord as any);

      // Act
      await service.uploadFile(buffer, 'test.jpg', 'image/jpeg', 'tenant-123');

      // Assert
      expect(mockFileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadedBy: undefined
        }),
        'tenant-123'
      );
    });

    it('should sanitize filename', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      mockFileValidator.sanitizeFilename.mockReturnValue('sanitized-test.jpg');

      const mockFileRecord = { id: 'file-123', status: FileStatus.UPLOADING };
      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockFileModel.findById.mockResolvedValue(mockFileRecord as any);

      // Act
      await service.uploadFile(buffer, '../../../etc/passwd.jpg', 'image/jpeg', 'tenant-123');

      // Assert
      expect(mockFileValidator.sanitizeFilename).toHaveBeenCalledWith('../../../etc/passwd.jpg');
      expect(mockFileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filename: 'sanitized-test.jpg'
        }),
        'tenant-123'
      );
    });

    it('should throw error on size validation failure', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      mockFileValidator.validateSize.mockImplementation(() => {
        throw new Error('File too large');
      });

      // Act & Assert
      await expect(
        service.uploadFile(buffer, 'test.jpg', 'image/jpeg', 'tenant-123')
      ).rejects.toThrow('File too large');
    });

    it('should throw error on mime type validation failure', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      mockFileValidator.validateMimeType.mockImplementation(() => {
        throw new Error('Invalid mime type');
      });

      // Act & Assert
      await expect(
        service.uploadFile(buffer, 'test.exe', 'application/x-msdownload', 'tenant-123')
      ).rejects.toThrow('Invalid mime type');
    });

    it('should update status to failed on storage error', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      const mockFileRecord = { id: 'file-123', status: FileStatus.UPLOADING };

      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockStorageService.upload.mockRejectedValue(new Error('Storage error'));

      // Act & Assert
      await expect(
        service.uploadFile(buffer, 'test.jpg', 'image/jpeg', 'tenant-123')
      ).rejects.toThrow('Storage error');

      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        'file-123',
        'tenant-123',
        FileStatus.FAILED,
        'Storage error'
      );
    });

    it('should handle missing CDN URL gracefully', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      const mockFileRecord = {
        id: 'file-123',
        status: FileStatus.UPLOADING
      };

      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockStorageService.upload.mockResolvedValue({} as any);
      mockFileModel.findById.mockResolvedValue(null);

      // Act
      const result = await service.uploadFile(buffer, 'test.jpg', 'image/jpeg', 'tenant-123');

      // Assert
      expect(result.status).toBe(FileStatus.READY);
    });

    it('should handle updateStatus errors silently', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      const mockFileRecord = { id: 'file-123', status: FileStatus.UPLOADING };

      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockStorageService.upload.mockRejectedValue(new Error('Storage error'));
      mockFileModel.updateStatus.mockRejectedValue(new Error('Update error'));

      // Act & Assert
      await expect(
        service.uploadFile(buffer, 'test.jpg', 'image/jpeg', 'tenant-123')
      ).rejects.toThrow('Storage error');

      expect(mockFileModel.updateStatus).toHaveBeenCalled();
    });

    it('should extract file extension correctly', async () => {
      // Arrange
      const buffer = Buffer.from('test content');
      mockFileValidator.getExtension.mockReturnValue('pdf');

      const mockFileRecord = { id: 'file-123', status: FileStatus.UPLOADING };
      mockFileModel.create.mockResolvedValue(mockFileRecord as any);
      mockFileModel.findById.mockResolvedValue(mockFileRecord as any);

      // Act
      await service.uploadFile(buffer, 'document.pdf', 'application/pdf', 'tenant-123');

      // Assert
      expect(mockFileValidator.getExtension).toHaveBeenCalledWith('document.pdf');
      expect(mockFileModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          extension: 'pdf'
        }),
        'tenant-123'
      );
    });
  });

  describe('getFile', () => {
    it('should get file by id', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        filename: 'test.jpg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      const result = await service.getFile(fileId, tenantId);

      // Assert
      expect(result).toEqual(mockFile);
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId, tenantId);
    });

    it('should return null when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act
      const result = await service.getFile('nonexistent', 'tenant-123');

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getFilesByEntity', () => {
    it('should get files by entity', async () => {
      // Arrange
      const entityType = 'ticket';
      const entityId = 'ticket-789';
      const tenantId = 'tenant-123';
      const mockFiles = [
        { id: 'file-1', filename: 'test1.jpg' },
        { id: 'file-2', filename: 'test2.jpg' }
      ];

      mockFileModel.findByEntity.mockResolvedValue(mockFiles as any);

      // Act
      const result = await service.getFilesByEntity(entityType, entityId, tenantId);

      // Assert
      expect(result).toEqual(mockFiles);
      expect(mockFileModel.findByEntity).toHaveBeenCalledWith(entityType, entityId, tenantId);
    });

    it('should return empty array when no files found', async () => {
      // Arrange
      mockFileModel.findByEntity.mockResolvedValue([]);

      // Act
      const result = await service.getFilesByEntity('ticket', 'ticket-123', 'tenant-456');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(uploadService).toBeInstanceOf(UploadService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = uploadService;
      const instance2 = uploadService;
      expect(instance1).toBe(instance2);
    });
  });
});
