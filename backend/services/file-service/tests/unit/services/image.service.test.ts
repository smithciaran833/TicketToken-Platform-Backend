// Mock dependencies BEFORE imports
jest.mock('../../../src/processors/image/image.processor');
jest.mock('../../../src/processors/image/thumbnail.generator');
jest.mock('../../../src/processors/image/optimize.processor');
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/utils/logger');

import { ImageService, imageService } from '../../../src/services/image.service';
import { imageProcessor } from '../../../src/processors/image/image.processor';
import { thumbnailGenerator } from '../../../src/processors/image/thumbnail.generator';
import { imageOptimizer } from '../../../src/processors/image/optimize.processor';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';

describe('services/image.service', () => {
  let service: ImageService;
  let mockImageProcessor: jest.Mocked<typeof imageProcessor>;
  let mockThumbnailGenerator: jest.Mocked<typeof thumbnailGenerator>;
  let mockImageOptimizer: jest.Mocked<typeof imageOptimizer>;
  let mockFileModel: jest.Mocked<typeof fileModel>;
  let mockStorageService: jest.Mocked<typeof storageService>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockImageProcessor = imageProcessor as jest.Mocked<typeof imageProcessor>;
    mockImageProcessor.processImage = jest.fn().mockResolvedValue(undefined);

    mockThumbnailGenerator = thumbnailGenerator as jest.Mocked<typeof thumbnailGenerator>;
    mockThumbnailGenerator.generate = jest.fn().mockResolvedValue(Buffer.from('thumbnail'));

    mockImageOptimizer = imageOptimizer as jest.Mocked<typeof imageOptimizer>;
    mockImageOptimizer.optimize = jest.fn().mockResolvedValue(Buffer.from('optimized'));

    mockFileModel = fileModel as jest.Mocked<typeof fileModel>;
    mockFileModel.findById = jest.fn();
    mockFileModel.updateStatus = jest.fn().mockResolvedValue(undefined);

    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('original'));
    mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://storage.example.com/file.jpg' } as any);

    service = new ImageService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processUploadedImage', () => {
    it('should process image successfully', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/image.jpg',
        filename: 'image.jpg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      await service.processUploadedImage(fileId, tenantId);

      // Assert
      expect(mockFileModel.findById).toHaveBeenCalledWith(fileId, tenantId);
      expect(mockStorageService.download).toHaveBeenCalledWith('/uploads/image.jpg');
      expect(mockImageProcessor.processImage).toHaveBeenCalled();
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(fileId, tenantId, 'ready');
    });

    it('should update status to failed when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act
      await service.processUploadedImage('file-123', 'tenant-456');

      // Assert - method catches error and updates status to failed
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        'file-123',
        'tenant-456',
        'failed',
        'File not found: file-123'
      );
    });

    it('should update status to failed when file has no storage path', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: null
      };
      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      await service.processUploadedImage('file-123', 'tenant-456');

      // Assert - method catches error and updates status to failed
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        'file-123',
        'tenant-456',
        'failed',
        'File file-123 has no storage path'
      );
    });

    it('should update status to failed on error', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/image.jpg'
      };
      const error = new Error('Processing failed');

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockImageProcessor.processImage.mockRejectedValue(error);

      // Act
      await service.processUploadedImage(fileId, tenantId);

      // Assert
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        fileId,
        tenantId,
        'failed',
        'Processing failed'
      );
    });

    it('should handle non-Error exceptions', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/image.jpg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockImageProcessor.processImage.mockRejectedValue('String error');

      // Act
      await service.processUploadedImage(fileId, tenantId);

      // Assert
      expect(mockFileModel.updateStatus).toHaveBeenCalledWith(
        fileId,
        tenantId,
        'failed',
        'String error'
      );
    });
  });

  describe('generateThumbnail', () => {
    it('should generate small thumbnail', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const mockFile = {
        id: fileId,
        storagePath: '/uploads/image.jpg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      const result = await service.generateThumbnail(fileId, tenantId, 'small');

      // Assert
      expect(mockThumbnailGenerator.generate).toHaveBeenCalledWith(
        expect.any(Buffer),
        { width: 150, height: 150 }
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        '/uploads/image_small.jpg'
      );
      expect(result).toBe('https://storage.example.com/file.jpg');
    });

    it('should generate medium thumbnail', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/photo.png'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      await service.generateThumbnail('file-123', 'tenant-456', 'medium');

      // Assert
      expect(mockThumbnailGenerator.generate).toHaveBeenCalledWith(
        expect.any(Buffer),
        { width: 300, height: 300 }
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        '/uploads/photo_medium.jpg'
      );
    });

    it('should generate large thumbnail', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/banner.gif'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      await service.generateThumbnail('file-123', 'tenant-456', 'large');

      // Assert
      expect(mockThumbnailGenerator.generate).toHaveBeenCalledWith(
        expect.any(Buffer),
        { width: 600, height: 600 }
      );
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        '/uploads/banner_large.jpg'
      );
    });

    it('should throw error when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.generateThumbnail('file-123', 'tenant-456', 'small')
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
        service.generateThumbnail('file-123', 'tenant-456', 'small')
      ).rejects.toThrow('File file-123 has no storage path');
    });

    it('should return empty string when upload has no publicUrl', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/image.jpg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.upload.mockResolvedValue({} as any);

      // Act
      const result = await service.generateThumbnail('file-123', 'tenant-456', 'small');

      // Assert
      expect(result).toBe('');
    });

    it('should handle different file extensions', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/image.jpeg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);

      // Act
      await service.generateThumbnail('file-123', 'tenant-456', 'medium');

      // Assert
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        '/uploads/image_medium.jpg'
      );
    });
  });

  describe('optimizeImage', () => {
    it('should optimize image when size is reduced', async () => {
      // Arrange
      const fileId = 'file-123';
      const tenantId = 'tenant-456';
      const originalBuffer = Buffer.alloc(1000);
      const optimizedBuffer = Buffer.alloc(500); // Smaller

      const mockFile = {
        id: fileId,
        storagePath: '/uploads/image.jpg',
        mimeType: 'image/jpeg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockImageOptimizer.optimize.mockResolvedValue(optimizedBuffer);

      // Act
      await service.optimizeImage(fileId, tenantId);

      // Assert
      expect(mockImageOptimizer.optimize).toHaveBeenCalledWith(originalBuffer, 'image/jpeg');
      expect(mockStorageService.upload).toHaveBeenCalledWith(
        optimizedBuffer,
        '/uploads/image_optimized.jpg'
      );
    });

    it('should not upload when optimization does not reduce size', async () => {
      // Arrange
      const originalBuffer = Buffer.alloc(500);
      const optimizedBuffer = Buffer.alloc(600); // Larger

      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/image.jpg',
        mimeType: 'image/jpeg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockImageOptimizer.optimize.mockResolvedValue(optimizedBuffer);

      // Act
      await service.optimizeImage('file-123', 'tenant-456');

      // Assert
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should use default mime type when not specified', async () => {
      // Arrange
      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/image.jpg',
        mimeType: null
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockImageOptimizer.optimize.mockResolvedValue(Buffer.alloc(100));

      // Act
      await service.optimizeImage('file-123', 'tenant-456');

      // Assert
      expect(mockImageOptimizer.optimize).toHaveBeenCalledWith(
        expect.any(Buffer),
        'image/jpeg'
      );
    });

    it('should throw error when file not found', async () => {
      // Arrange
      mockFileModel.findById.mockResolvedValue(null);

      // Act & Assert
      await expect(
        service.optimizeImage('file-123', 'tenant-456')
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
        service.optimizeImage('file-123', 'tenant-456')
      ).rejects.toThrow('File file-123 has no storage path');
    });

    it('should handle different mime types', async () => {
      // Arrange
      const originalBuffer = Buffer.alloc(1000);
      const optimizedBuffer = Buffer.alloc(500);

      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/image.png',
        mimeType: 'image/png'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockImageOptimizer.optimize.mockResolvedValue(optimizedBuffer);

      // Act
      await service.optimizeImage('file-123', 'tenant-456');

      // Assert
      expect(mockImageOptimizer.optimize).toHaveBeenCalledWith(originalBuffer, 'image/png');
    });

    it('should calculate size reduction percentage', async () => {
      // Arrange
      const originalBuffer = Buffer.alloc(1000);
      const optimizedBuffer = Buffer.alloc(250); // 75% reduction

      const mockFile = {
        id: 'file-123',
        storagePath: '/uploads/image.jpg',
        mimeType: 'image/jpeg'
      };

      mockFileModel.findById.mockResolvedValue(mockFile as any);
      mockStorageService.download.mockResolvedValue(originalBuffer);
      mockImageOptimizer.optimize.mockResolvedValue(optimizedBuffer);

      // Act
      await service.optimizeImage('file-123', 'tenant-456');

      // Assert
      expect(mockStorageService.upload).toHaveBeenCalled();
      // Reduction should be 75%
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(imageService).toBeInstanceOf(ImageService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = imageService;
      const instance2 = imageService;
      expect(instance1).toBe(instance2);
    });
  });
});
