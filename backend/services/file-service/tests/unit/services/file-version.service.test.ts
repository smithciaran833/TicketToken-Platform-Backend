// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/utils/file-helpers');
jest.mock('../../../src/utils/logger');

import { Pool } from 'pg';
import { FileVersionService, fileVersionService } from '../../../src/services/file-version.service';
import * as databaseConfig from '../../../src/config/database.config';
import { storageService } from '../../../src/storage/storage.service';
import { fileModel } from '../../../src/models/file.model';
import * as fileHelpers from '../../../src/utils/file-helpers';

describe('services/file-version.service', () => {
  let service: FileVersionService;
  let mockPool: {
    query: jest.Mock;
    connect: jest.Mock;
    end: jest.Mock;
    on: jest.Mock;
  };
  let mockGetPool: jest.MockedFunction<typeof databaseConfig.getPool>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockFileModel: jest.Mocked<typeof fileModel>;
  let mockGenerateFileHash: jest.MockedFunction<typeof fileHelpers.generateFileHash>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mock pool
    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };

    // Mock getPool function
    mockGetPool = databaseConfig.getPool as jest.MockedFunction<typeof databaseConfig.getPool>;
    mockGetPool.mockReturnValue(mockPool as unknown as Pool);

    // Mock storage service
    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockStorageService.upload = jest.fn().mockResolvedValue(undefined);
    mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('test'));
    mockStorageService.delete = jest.fn().mockResolvedValue(undefined);

    // Mock file model
    mockFileModel = fileModel as jest.Mocked<typeof fileModel>;
    mockFileModel.findById = jest.fn();

    // Mock file hash generation
    mockGenerateFileHash = fileHelpers.generateFileHash as jest.MockedFunction<typeof fileHelpers.generateFileHash>;
    mockGenerateFileHash.mockReturnValue('mock-hash-sha256');

    service = new FileVersionService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createVersion', () => {
    it('should create a new version for a file', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const buffer = Buffer.from('file content');
      const changeDescription = 'Updated content';
      const userId = 'user-789';

      const mockFile = {
        id: fileId,
        storagePath: '/uploads/file.pdf',
        filename: 'file.pdf'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_version: 2 }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      const result = await service.createVersion(fileId, tenantId, buffer, changeDescription, userId);

      // Assert
      expect(result).toBe(3);
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId, tenantId);
      expect(mockStorageService.upload).toHaveBeenCalledWith(buffer, '/uploads/file_v3.pdf');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO file_versions'),
        [fileId, 3, '/uploads/file_v3.pdf', buffer.length, 'mock-hash-sha256', changeDescription, userId]
      );
    });

    it('should create first version when no previous versions exist', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const buffer = Buffer.from('file content');

      const mockFile = {
        id: fileId,
        storagePath: '/uploads/document.txt',
        filename: 'document.txt'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_version: null }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      const result = await service.createVersion(fileId, tenantId, buffer);

      // Assert
      expect(result).toBe(1);
    });

    it('should throw error when database is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null as unknown as Pool);

      // Act & Assert
      await expect(
        service.createVersion('file-123', 'tenant-456', Buffer.from('test'))
      ).rejects.toThrow('Database not available');
    });

    it('should throw error when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.createVersion('file-123', 'tenant-456', Buffer.from('test'))
      ).rejects.toThrow('File not found');
    });

    it('should throw error when file has no storage path', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: null
      };
      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act & Assert
      await expect(
        service.createVersion('file-123', 'tenant-456', Buffer.from('test'))
      ).rejects.toThrow('File has no storage path');
    });

    it('should handle different file extensions correctly', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const buffer = Buffer.from('content');

      const mockFile = {
        id: fileId,
        storagePath: '/uploads/image.jpeg',
        filename: 'image.jpeg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_version: 5 }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await service.createVersion(fileId, tenantId, buffer);

      // Assert
      expect(mockStorageService.upload).toHaveBeenCalledWith(buffer, '/uploads/image_v6.jpeg');
    });

    it('should generate hash for the buffer', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const buffer = Buffer.from('test content');

      const mockFile = {
        id: fileId,
        storagePath: '/uploads/file.txt'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValueOnce({ rows: [{ max_version: 0 }], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await service.createVersion(fileId, tenantId, buffer);

      // Assert
      expect(mockGenerateFileHash).toHaveBeenCalledWith(buffer);
    });
  });

  describe('getVersions', () => {
    it('should retrieve all versions for a file', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';

      const mockFile = { id: fileId };
      const mockVersions = [
        { id: '1', file_id: fileId, version_number: 3, storage_path: '/v3.pdf' },
        { id: '2', file_id: fileId, version_number: 2, storage_path: '/v2.pdf' },
        { id: '3', file_id: fileId, version_number: 1, storage_path: '/v1.pdf' }
      ];

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValue({ rows: mockVersions, rowCount: 3 });

      // Act
      const result = await service.getVersions(fileId, tenantId);

      // Assert
      expect(result).toEqual(mockVersions);
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId, tenantId);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY version_number DESC'),
        [fileId]
      );
    });

    it('should throw error when database is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null as unknown as Pool);

      // Act & Assert
      await expect(
        service.getVersions('file-123', 'tenant-456')
      ).rejects.toThrow('Database not available');
    });

    it('should throw error when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.getVersions('file-123', 'tenant-456')
      ).rejects.toThrow('File not found');
    });

    it('should return empty array when no versions exist', async () => {
      // Arrange
      const mockFile = { id: 'file-123' };
      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act
      const result = await service.getVersions('file-123', 'tenant-456');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('restoreVersion', () => {
    it('should restore a file to a specific version', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const versionNumber = 2;

      const mockVersion = {
        id: 'version-1',
        file_id: fileId,
        version_number: versionNumber,
        storage_path: '/uploads/file_v2.pdf',
        size_bytes: 2048,
        hash_sha256: 'version-hash'
      };

      const mockFile = {
        id: fileId,
        storagePath: '/uploads/file.pdf'
      };

      const versionBuffer = Buffer.from('version content');

      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion], rowCount: 1 });
      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(versionBuffer);
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await service.restoreVersion(fileId, tenantId, versionNumber);

      // Assert
      expect(mockStorageService.download).toHaveBeenCalledWith('/uploads/file_v2.pdf');
      expect(mockStorageService.upload).toHaveBeenCalledWith(versionBuffer, '/uploads/file.pdf');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE files SET size_bytes'),
        [2048, 'version-hash', fileId, tenantId]
      );
    });

    it('should throw error when version not found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act & Assert
      await expect(
        service.restoreVersion('file-123', 'tenant-456', 2)
      ).rejects.toThrow('Version not found');
    });

    it('should throw error when file not found', async () => {
      // Arrange
      const mockVersion = {
        storage_path: '/v2.pdf',
        size_bytes: 1024,
        hash_sha256: 'hash'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion], rowCount: 1 });
      mockFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.restoreVersion('file-123', 'tenant-456', 2)
      ).rejects.toThrow('File not found');
    });

    it('should throw error when file has no storage path', async () => {
      // Arrange
      const mockVersion = {
        storage_path: '/v2.pdf',
        size_bytes: 1024,
        hash_sha256: 'hash'
      };

      const mockFile = {
        id: 'file-123',
        storagePath: null
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion], rowCount: 1 });
      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act & Assert
      await expect(
        service.restoreVersion('file-123', 'tenant-456', 2)
      ).rejects.toThrow('File has no storage path');
    });
  });

  describe('deleteVersion', () => {
    it('should delete a specific version', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const versionNumber = 2;

      const mockFile = { id: fileId };
      const mockVersion = {
        id: 'version-1',
        file_id: fileId,
        version_number: versionNumber,
        storage_path: '/uploads/file_v2.pdf'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await service.deleteVersion(fileId, tenantId, versionNumber);

      // Assert
      expect(mockStorageService.delete).toHaveBeenCalledWith('/uploads/file_v2.pdf');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM file_versions'),
        [fileId, versionNumber]
      );
    });

    it('should throw error when database is unavailable', async () => {
      // Arrange
      mockGetPool.mockReturnValue(null as unknown as Pool);

      // Act & Assert
      await expect(
        service.deleteVersion('file-123', 'tenant-456', 2)
      ).rejects.toThrow('Database not available');
    });

    it('should throw error when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.deleteVersion('file-123', 'tenant-456', 2)
      ).rejects.toThrow('File not found');
    });

    it('should throw error when version not found', async () => {
      // Arrange
      const mockFile = { id: 'file-123' };
      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });

      // Act & Assert
      await expect(
        service.deleteVersion('file-123', 'tenant-456', 2)
      ).rejects.toThrow('Version not found');
    });

    it('should delete version from both storage and database', async () => {
      // Arrange
      const mockFile = { id: 'file-123' };
      const mockVersion = {
        storage_path: '/uploads/file_v5.pdf'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockPool.query.mockResolvedValueOnce({ rows: [mockVersion], rowCount: 1 });
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

      // Act
      await service.deleteVersion('file-123', 'tenant-456', 5);

      // Assert
      expect(mockStorageService.delete).toHaveBeenCalledTimes(1);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(fileVersionService).toBeInstanceOf(FileVersionService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = fileVersionService;
      const instance2 = fileVersionService;
      expect(instance1).toBe(instance2);
    });
  });
});
