// Mock dependencies BEFORE imports
jest.mock('../../../src/services/upload.service');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/middleware/tenant-context');
jest.mock('../../../src/utils/logger');

import { FastifyRequest, FastifyReply } from 'fastify';
import { DownloadController, downloadController } from '../../../src/controllers/download.controller';
import { uploadService } from '../../../src/services/upload.service';
import { storageService } from '../../../src/storage/storage.service';
import { getTenantId } from '../../../src/middleware/tenant-context';

describe('controllers/download.controller', () => {
  let controller: DownloadController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockUploadService: jest.Mocked<typeof uploadService>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockGetTenantId: jest.MockedFunction<typeof getTenantId>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new DownloadController();

    mockRequest = {
      params: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    mockUploadService = uploadService as jest.Mocked<typeof uploadService>;
    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockGetTenantId = getTenantId as jest.MockedFunction<typeof getTenantId>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('downloadFile', () => {
    it('should download file with attachment headers', async () => {
      // Arrange
      const fileBuffer = Buffer.from('file content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/file.pdf',
        sizeBytes: 1024,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockGetTenantId).toHaveBeenCalledWith(mockRequest);
      expect(mockUploadService.getFile).toHaveBeenCalledWith('file-123', 'tenant-456');
      expect(mockStorageService.download).toHaveBeenCalledWith('/path/to/file.pdf');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="document.pdf"');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Length', '1024');
      expect(mockReply.send).toHaveBeenCalledWith(fileBuffer);
    });

    it('should use buffer length when sizeBytes is missing', async () => {
      // Arrange
      const fileBuffer = Buffer.from('file content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        storagePath: '/path/to/test.txt',
        sizeBytes: null,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.header).toHaveBeenCalledWith('Content-Length', fileBuffer.length.toString());
    });

    it('should use default mime type when not specified', async () => {
      // Arrange
      const fileBuffer = Buffer.from('file content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'unknown.bin',
        mimeType: null,
        storagePath: '/path/to/file.bin',
        sizeBytes: 512,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('should return 404 when file not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockUploadService.getFile = jest.fn().mockResolvedValue(null);

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 400 when file has no storage path', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        storagePath: null,
        sizeBytes: 100,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File has no storage path' });
    });

    it('should return 500 on storage download error', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'test.txt',
        mimeType: 'text/plain',
        storagePath: '/path/to/test.txt',
        sizeBytes: 100,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockRejectedValue(new Error('Storage error'));

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to download file' });
    });

    it('should handle special characters in filename', async () => {
      // Arrange
      const fileBuffer = Buffer.from('content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'file with spaces & special.pdf',
        mimeType: 'application/pdf',
        storagePath: '/path/to/file.pdf',
        sizeBytes: 1024,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.downloadFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="file with spaces & special.pdf"'
      );
    });
  });

  describe('streamFile', () => {
    it('should stream file with inline headers', async () => {
      // Arrange
      const fileBuffer = Buffer.from('file content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        storagePath: '/path/to/image.jpg',
        sizeBytes: 2048,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.streamFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockGetTenantId).toHaveBeenCalledWith(mockRequest);
      expect(mockUploadService.getFile).toHaveBeenCalledWith('file-123', 'tenant-456');
      expect(mockStorageService.download).toHaveBeenCalledWith('/path/to/image.jpg');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(mockReply.header).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="image.jpg"');
      expect(mockReply.send).toHaveBeenCalledWith(fileBuffer);
    });

    it('should use default mime type for streaming', async () => {
      // Arrange
      const fileBuffer = Buffer.from('content');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'video.mp4',
        mimeType: null,
        storagePath: '/path/to/video.mp4',
        sizeBytes: 1024,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      // Act
      await controller.streamFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.header).toHaveBeenCalledWith('Content-Type', 'application/octet-stream');
    });

    it('should return 404 when file not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockUploadService.getFile = jest.fn().mockResolvedValue(null);

      // Act
      await controller.streamFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 400 when file has no storage path', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'test.mp4',
        mimeType: 'video/mp4',
        storagePath: null,
        sizeBytes: 100,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);

      // Act
      await controller.streamFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File has no storage path' });
    });

    it('should return 500 on storage stream error', async () => {
      // Arrange
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'video.mp4',
        mimeType: 'video/mp4',
        storagePath: '/path/to/video.mp4',
        sizeBytes: 100,
      };

      mockUploadService.getFile = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockRejectedValue(new Error('Stream error'));

      // Act
      await controller.streamFile(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Failed to stream file' });
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(downloadController).toBeInstanceOf(DownloadController);
    });

    it('should be the same instance across imports', () => {
      expect(downloadController).toBe(downloadController);
    });
  });
});
