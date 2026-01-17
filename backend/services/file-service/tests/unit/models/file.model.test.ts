// Mock dependencies BEFORE imports
jest.mock('../../../src/config/database.config');
jest.mock('../../../src/utils/logger');

import { FileModel, fileModel } from '../../../src/models/file.model';
import { getPool } from '../../../src/config/database.config';
import { TenantRequiredError, FileNotFoundError } from '../../../src/errors';
import { FileStatus } from '../../../src/types/file.types';

describe('models/file.model', () => {
  let model: FileModel;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = {
      query: jest.fn()
    };

    (getPool as jest.Mock).mockReturnValue(mockPool);
    model = new FileModel();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('create', () => {
    it('should create file with required fields and tenant_id', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const fileData = {
        filename: 'test.jpg',
        original_filename: 'original-test.jpg',
        mime_type: 'image/jpeg',
        extension: 'jpg',
        storage_provider: 's3',
        bucket_name: 'my-bucket',
        storage_path: '/uploads/test.jpg',
        cdn_url: 'https://cdn.example.com/test.jpg',
        size_bytes: 1024,
        hash_sha256: 'abcd1234',
        uploaded_by: 'user-456',
        entity_type: 'event',
        entity_id: 'event-789',
        is_public: true,
        access_level: 'public',
        status: 'uploading' as FileStatus,
        metadata: { width: 800, height: 600 },
        tags: ['photo', 'event']
      };

      const mockResult = {
        rows: [{
          id: 'file-123',
          tenant_id: tenantId,
          ...fileData,
          created_at: new Date(),
          updated_at: new Date(),
          deleted_at: null,
          processing_error: null
        }]
      };

      mockPool.query.mockResolvedValue(mockResult);

      // Act
      const result = await model.create(fileData, tenantId);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO files'),
        expect.arrayContaining([
          tenantId,
          fileData.filename,
          fileData.original_filename,
          fileData.mime_type,
          fileData.extension,
          fileData.storage_provider,
          fileData.bucket_name,
          fileData.storage_path,
          fileData.cdn_url,
          fileData.size_bytes,
          fileData.hash_sha256,
          fileData.uploaded_by,
          fileData.entity_type,
          fileData.entity_id,
          fileData.is_public,
          fileData.access_level,
          fileData.status,
          JSON.stringify(fileData.metadata),
          fileData.tags
        ])
      );
      expect(result.id).toBe('file-123');
      expect(result.filename).toBe('test.jpg');
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Arrange
      const fileData = {
        filename: 'test.jpg',
        original_filename: 'test.jpg'
      };

      // Act & Assert
      await expect(model.create(fileData, '')).rejects.toThrow(TenantRequiredError);
      await expect(model.create(fileData, '')).rejects.toThrow('Tenant ID is required to create a file');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle camelCase properties and convert to snake_case', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const fileData = {
        filename: 'test.jpg', // filename takes precedence over file_name
        originalFilename: 'camelCase.jpg', // Should convert
        mimeType: 'image/png', // Should convert
        storagePath: '/camel/path.png', // Should convert
        cdnUrl: 'https://cdn.example.com/camel.png', // Should convert
        sizeBytes: 2048, // Should convert
        hashSha256: 'hash123', // Should convert
        uploadedBy: 'user-789', // Should convert
        entityType: 'ticket', // Should convert
        entityId: 'ticket-456', // Should convert
        isPublic: false, // Should convert
        accessLevel: 'private' // Should convert
      };

      mockPool.query.mockResolvedValue({
        rows: [{ id: 'file-123', tenant_id: tenantId }]
      });

      // Act
      await model.create(fileData, tenantId);

      // Assert
      const callArgs = mockPool.query.mock.calls[0][1];
      expect(callArgs[1]).toBe('test.jpg'); // filename
      expect(callArgs[2]).toBe('camelCase.jpg'); // originalFilename converted
      expect(callArgs[3]).toBe('image/png'); // mimeType converted
    });

    it('should use default values when not provided', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const minimalData = {
        filename: 'minimal.jpg'
      };

      mockPool.query.mockResolvedValue({
        rows: [{ id: 'file-123', tenant_id: tenantId }]
      });

      // Act
      await model.create(minimalData, tenantId);

      // Assert
      const callArgs = mockPool.query.mock.calls[0][1];
      expect(callArgs[5]).toBe('local'); // default storage_provider
      expect(callArgs[14]).toBe(false); // default is_public
      expect(callArgs[15]).toBe('private'); // default access_level
      expect(callArgs[16]).toBe('uploading'); // default status
      expect(callArgs[17]).toBe('{}'); // default metadata
    });

    it('should handle database errors', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const fileData = { filename: 'error.jpg' };
      const dbError = new Error('Database connection failed');

      mockPool.query.mockRejectedValue(dbError);

      // Act & Assert
      await expect(model.create(fileData, tenantId)).rejects.toThrow('Database connection failed');
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);
      const tenantId = 'tenant-123';
      const fileData = { filename: 'test.jpg' };

      // Act & Assert
      await expect(model.create(fileData, tenantId)).rejects.toThrow('Database not available');
    });
  });

  describe('findById', () => {
    it('should find file by id and tenant_id', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockRow = {
        id: fileId,
        tenant_id: tenantId,
        filename: 'found.jpg',
        original_filename: 'original.jpg',
        mime_type: 'image/jpeg',
        extension: 'jpg',
        storage_provider: 's3',
        bucket_name: 'bucket',
        storage_path: '/path/file.jpg',
        cdn_url: 'https://cdn.example.com/file.jpg',
        size_bytes: 1024,
        hash_sha256: 'hash123',
        uploaded_by: 'user-123',
        entity_type: 'event',
        entity_id: 'event-456',
        is_public: true,
        access_level: 'public',
        status: 'ready',
        processing_error: null,
        metadata: { width: 800 },
        tags: ['tag1'],
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      // Act
      const result = await model.findById(fileId, tenantId);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM files WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [fileId, tenantId]
      );
      expect(result).not.toBeNull();
      expect(result!.id).toBe(fileId);
      expect(result!.filename).toBe('found.jpg');
      // Check camelCase aliases
      expect(result!.originalFilename).toBe('original.jpg');
      expect(result!.mimeType).toBe('image/jpeg');
      expect(result!.sizeBytes).toBe(1024);
    });

    it('should return null when file not found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await model.findById('nonexistent', 'tenant-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(model.findById('file-123', '')).rejects.toThrow(TenantRequiredError);
      await expect(model.findById('file-123', '')).rejects.toThrow('Tenant ID is required to query files');
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should exclude soft-deleted files', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await model.findById('file-123', 'tenant-456');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(model.findById('file-123', 'tenant-456')).rejects.toThrow('Database not available');
    });
  });

  describe('updateStatus', () => {
    it('should update file status successfully', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const newStatus: FileStatus = 'ready';

      mockPool.query.mockResolvedValue({ rowCount: 1 });

      // Act
      await model.updateStatus(fileId, tenantId, newStatus);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE files'),
        [fileId, tenantId, newStatus, undefined]
      );
    });

    it('should update status with error message', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const status: FileStatus = 'failed';
      const errorMsg = 'Processing failed';

      mockPool.query.mockResolvedValue({ rowCount: 1 });

      // Act
      await model.updateStatus(fileId, tenantId, status, errorMsg);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        [fileId, tenantId, status, errorMsg]
      );
    });

    it('should throw FileNotFoundError when file not found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      // Act & Assert
      await expect(
        model.updateStatus('file-123', 'tenant-456', 'ready')
      ).rejects.toThrow(FileNotFoundError);
      await expect(
        model.updateStatus('file-123', 'tenant-456', 'ready')
      ).rejects.toThrow('File file-123 not found or access denied');
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(model.updateStatus('file-123', '', 'ready')).rejects.toThrow(TenantRequiredError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(model.updateStatus('file-123', 'tenant-456', 'ready')).rejects.toThrow('Database not available');
    });
  });

  describe('updateCdnUrl', () => {
    it('should update CDN URL successfully', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const cdnUrl = 'https://cdn.example.com/updated.jpg';

      mockPool.query.mockResolvedValue({ rowCount: 1 });

      // Act
      await model.updateCdnUrl(fileId, tenantId, cdnUrl);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE files'),
        [fileId, tenantId, cdnUrl]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('cdn_url = $3'),
        expect.any(Array)
      );
    });

    it('should throw FileNotFoundError when file not found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      // Act & Assert
      await expect(
        model.updateCdnUrl('file-123', 'tenant-456', 'https://cdn.example.com/test.jpg')
      ).rejects.toThrow(FileNotFoundError);
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(
        model.updateCdnUrl('file-123', '', 'https://cdn.example.com/test.jpg')
      ).rejects.toThrow(TenantRequiredError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(
        model.updateCdnUrl('file-123', 'tenant-456', 'https://cdn.example.com/test.jpg')
      ).rejects.toThrow('Database not available');
    });
  });

  describe('findByEntity', () => {
    it('should find all files for entity with tenant filtering', async () => {
      // Arrange
      const entityType = 'event';
      const entityId = 'event-123';
      const tenantId = 'tenant-456';

      const mockRows = [
        { id: 'file-1', filename: 'photo1.jpg', tenant_id: tenantId, size_bytes: 1024 },
        { id: 'file-2', filename: 'photo2.jpg', tenant_id: tenantId, size_bytes: 2048 }
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      // Act
      const result = await model.findByEntity(entityType, entityId, tenantId);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE entity_type = $1 AND entity_id = $2 AND tenant_id = $3'),
        [entityType, entityId, tenantId]
      );
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('file-1');
      expect(result[1]!.id).toBe('file-2');
    });

    it('should return empty array when no files found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      const result = await model.findByEntity('event', 'event-123', 'tenant-456');

      // Assert
      expect(result).toEqual([]);
    });

    it('should order by created_at DESC', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await model.findByEntity('event', 'event-123', 'tenant-456');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(model.findByEntity('event', 'event-123', '')).rejects.toThrow(TenantRequiredError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(model.findByEntity('event', 'event-123', 'tenant-456')).rejects.toThrow('Database not available');
    });
  });

  describe('softDelete', () => {
    it('should soft delete file successfully', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';

      mockPool.query.mockResolvedValue({ rowCount: 1 });

      // Act
      await model.softDelete(fileId, tenantId);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE files'),
        [fileId, tenantId]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = CURRENT_TIMESTAMP'),
        expect.any(Array)
      );
    });

    it('should only delete files that are not already deleted', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rowCount: 1 });

      // Act
      await model.softDelete('file-123', 'tenant-456');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should throw FileNotFoundError when file not found', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rowCount: 0 });

      // Act & Assert
      await expect(
        model.softDelete('file-123', 'tenant-456')
      ).rejects.toThrow(FileNotFoundError);
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(model.softDelete('file-123', '')).rejects.toThrow(TenantRequiredError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(model.softDelete('file-123', 'tenant-456')).rejects.toThrow('Database not available');
    });
  });

  describe('findByUser', () => {
    it('should find all files for user within tenant', async () => {
      // Arrange
      const userId = 'user-123';
      const tenantId = 'tenant-456';
      const limit = 50;

      const mockRows = [
        { id: 'file-1', filename: 'user-file1.jpg', uploaded_by: userId, size_bytes: 1024 },
        { id: 'file-2', filename: 'user-file2.jpg', uploaded_by: userId, size_bytes: 2048 }
      ];

      mockPool.query.mockResolvedValue({ rows: mockRows });

      // Act
      const result = await model.findByUser(userId, tenantId, limit);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE uploaded_by = $1 AND tenant_id = $2'),
        [userId, tenantId, limit]
      );
      expect(result).toHaveLength(2);
    });

    it('should use default limit of 100', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await model.findByUser('user-123', 'tenant-456');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        ['user-123', 'tenant-456', 100]
      );
    });

    it('should order by created_at DESC', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({ rows: [] });

      // Act
      await model.findByUser('user-123', 'tenant-456');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(model.findByUser('user-123', '')).rejects.toThrow(TenantRequiredError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(model.findByUser('user-123', 'tenant-456')).rejects.toThrow('Database not available');
    });
  });

  describe('countByTenant', () => {
    it('should return correct count and total bytes', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const mockResult = {
        rows: [{
          count: '42',
          total_bytes: '1048576'
        }]
      };

      mockPool.query.mockResolvedValue(mockResult);

      // Act
      const result = await model.countByTenant(tenantId);

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('COUNT(*) as count'),
        [tenantId]
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('SUM(size_bytes)'),
        [tenantId]
      );
      expect(result.count).toBe(42);
      expect(result.totalBytes).toBe(1048576);
    });

    it('should exclude soft-deleted files from count', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({
        rows: [{ count: '10', total_bytes: '10240' }]
      });

      // Act
      await model.countByTenant('tenant-123');

      // Assert
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should handle zero files', async () => {
      // Arrange
      mockPool.query.mockResolvedValue({
        rows: [{ count: '0', total_bytes: '0' }]
      });

      // Act
      const result = await model.countByTenant('tenant-123');

      // Assert
      expect(result.count).toBe(0);
      expect(result.totalBytes).toBe(0);
    });

    it('should throw TenantRequiredError when tenantId is missing', async () => {
      // Act & Assert
      await expect(model.countByTenant('')).rejects.toThrow(TenantRequiredError);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should throw error when pool is not available', async () => {
      // Arrange
      (getPool as jest.Mock).mockReturnValue(null);

      // Act & Assert
      await expect(model.countByTenant('tenant-123')).rejects.toThrow('Database not available');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(fileModel).toBeInstanceOf(FileModel);
    });

    it('should be the same instance across imports', () => {
      const instance1 = fileModel;
      const instance2 = fileModel;
      expect(instance1).toBe(instance2);
    });
  });

  describe('mapRowToFile', () => {
    it('should map database row to FileRecord with both snake_case and camelCase properties', async () => {
      // Arrange
      const mockRow = {
        id: 'file-123',
        tenant_id: 'tenant-456',
        filename: 'test.jpg',
        original_filename: 'original.jpg',
        mime_type: 'image/jpeg',
        extension: 'jpg',
        storage_provider: 's3',
        bucket_name: 'bucket',
        storage_path: '/path/file.jpg',
        cdn_url: 'https://cdn.example.com/file.jpg',
        size_bytes: '1024',
        hash_sha256: 'hash123',
        uploaded_by: 'user-123',
        entity_type: 'event',
        entity_id: 'event-456',
        is_public: true,
        access_level: 'public',
        status: 'ready',
        processing_error: null,
        metadata: { width: 800 },
        tags: ['tag1'],
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null
      };

      mockPool.query.mockResolvedValue({ rows: [mockRow] });

      // Act
      const result = await model.findById('file-123', 'tenant-456');

      // Assert - snake_case properties
      expect(result!.original_filename).toBe('original.jpg');
      expect(result!.mime_type).toBe('image/jpeg');
      expect(result!.storage_path).toBe('/path/file.jpg');
      expect(result!.cdn_url).toBe('https://cdn.example.com/file.jpg');
      expect(result!.size_bytes).toBe(1024);
      expect(result!.hash_sha256).toBe('hash123');
      expect(result!.uploaded_by).toBe('user-123');
      expect(result!.entity_type).toBe('event');
      expect(result!.entity_id).toBe('event-456');
      expect(result!.is_public).toBe(true);
      expect(result!.access_level).toBe('public');

      // Assert - camelCase aliases
      expect(result!.originalFilename).toBe('original.jpg');
      expect(result!.mimeType).toBe('image/jpeg');
      expect(result!.storagePath).toBe('/path/file.jpg');
      expect(result!.cdnUrl).toBe('https://cdn.example.com/file.jpg');
      expect(result!.sizeBytes).toBe(1024);
      expect(result!.hashSha256).toBe('hash123');
      expect(result!.uploadedBy).toBe('user-123');
      expect(result!.entityType).toBe('event');
      expect(result!.entityId).toBe('event-456');
      expect(result!.isPublic).toBe(true);
      expect(result!.accessLevel).toBe('public');

      // Assert - backward compatibility aliases
      expect(result!.file_name).toBe('test.jpg');
      expect(result!.file_key).toBe('/path/file.jpg');
      expect(result!.content_type).toBe('image/jpeg');
      expect(result!.file_size).toBe(1024);
      expect(result!.user_id).toBe('user-123');
    });
  });
});
