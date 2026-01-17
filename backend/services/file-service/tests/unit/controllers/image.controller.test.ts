// Mock dependencies BEFORE imports
jest.mock('../../../src/models/file.model');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/middleware/tenant-context');
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/database.config');
jest.mock('sharp');

import { FastifyRequest, FastifyReply } from 'fastify';
import { ImageController, imageController } from '../../../src/controllers/image.controller';
import { fileModel } from '../../../src/models/file.model';
import { storageService } from '../../../src/storage/storage.service';
import { getTenantId } from '../../../src/middleware/tenant-context';
import sharp from 'sharp';

describe('controllers/image.controller', () => {
  let controller: ImageController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockFileModel: jest.Mocked<typeof fileModel>;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockGetTenantId: jest.MockedFunction<typeof getTenantId>;
  let mockSharp: jest.MockedFunction<typeof sharp>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new ImageController();

    mockRequest = {
      params: {},
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockFileModel = fileModel as jest.Mocked<typeof fileModel>;
    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockGetTenantId = getTenantId as jest.MockedFunction<typeof getTenantId>;
    mockSharp = sharp as jest.MockedFunction<typeof sharp>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('resize', () => {
    it('should resize image with cover fit', async () => {
      const fileBuffer = Buffer.from('image data');
      const resizedBuffer = Buffer.from('resized image');
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { width: 800, height: 600, fit: 'cover' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        filename: 'image.jpg',
        mimeType: 'image/jpeg',
        storagePath: '/path/to/image.jpg',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/resized.jpg' });

      const mockSharpInstance = {
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(resizedBuffer),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.resize(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharp).toHaveBeenCalledWith(fileBuffer);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(800, 600, {
        fit: 'cover',
        position: 'center',
      });
      expect(mockStorageService.upload).toHaveBeenCalledWith(resizedBuffer, expect.stringContaining('800x600.jpg'));
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        url: 'https://cdn.example.com/resized.jpg',
        width: 800,
        height: 600,
      });
    });

    it('should use default fit mode when not specified', async () => {
      const fileBuffer = Buffer.from('image data');
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { width: 400, height: 300 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        storagePath: '/path/to/image.jpg',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/resized.jpg' });

      const mockSharpInstance = {
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized')),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.resize(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharpInstance.resize).toHaveBeenCalledWith(400, 300, {
        fit: 'cover',
        position: 'center',
      });
    });

    it('should return 404 when file not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { width: 800, height: 600 };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      await controller.resize(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('should return 400 when file has no storage path', async () => {
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { width: 800, height: 600 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: null };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);

      await controller.resize(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'File has no storage path' });
    });

    it('should handle Sharp processing errors', async () => {
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { width: 800, height: 600 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('corrupt'));

      mockSharp.mockImplementation(() => {
        throw new Error('Invalid image format');
      });

      await controller.resize(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Invalid image format' });
    });
  });

  describe('crop', () => {
    it('should crop image with valid coordinates', async () => {
      const fileBuffer = Buffer.from('image data');
      const croppedBuffer = Buffer.from('cropped image');
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { x: 100, y: 50, width: 400, height: 300 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = {
        id: 'file-123',
        storagePath: '/path/to/image.jpg',
      };

      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/cropped.jpg' });

      const mockSharpInstance = {
        extract: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(croppedBuffer),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.crop(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharpInstance.extract).toHaveBeenCalledWith({
        left: 100,
        top: 50,
        width: 400,
        height: 300,
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        url: 'https://cdn.example.com/cropped.jpg',
      });
    });

    it('should return 404 when file not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { x: 0, y: 0, width: 100, height: 100 };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      await controller.crop(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should handle crop errors', async () => {
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { x: -100, y: 0, width: 400, height: 300 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('data'));

      const mockSharpInstance = {
        extract: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockRejectedValue(new Error('Invalid extract region')),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.crop(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('rotate', () => {
    it('should rotate image at specified angle', async () => {
      const fileBuffer = Buffer.from('image data');
      const rotatedBuffer = Buffer.from('rotated image');
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { angle: 90 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/rotated.jpg' });

      const mockSharpInstance = {
        rotate: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(rotatedBuffer),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.rotate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharpInstance.rotate).toHaveBeenCalledWith(90);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        url: 'https://cdn.example.com/rotated.jpg',
        angle: 90,
      });
    });

    it('should handle negative rotation angles', async () => {
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { angle: -90 };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('data'));
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/rotated.jpg' });

      const mockSharpInstance = {
        rotate: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('rotated')),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.rotate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharpInstance.rotate).toHaveBeenCalledWith(-90);
    });

    it('should return 404 when file not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { angle: 180 };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      await controller.rotate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('watermark', () => {
    it('should apply SVG watermark to image', async () => {
      const fileBuffer = Buffer.from('image data');
      const watermarkedBuffer = Buffer.from('watermarked image');
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = { text: 'COPYRIGHT', position: 'center' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/watermarked.jpg' });

      const mockSharpInstance = {
        metadata: jest.fn().mockResolvedValue({ width: 1000, height: 800 }),
        composite: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(watermarkedBuffer),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.watermark(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(mockSharpInstance.composite).toHaveBeenCalledWith([
        expect.objectContaining({
          input: expect.any(Buffer),
          blend: 'over',
        }),
      ]);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        url: 'https://cdn.example.com/watermarked.jpg',
      });
    });

    it('should use default watermark text when not provided', async () => {
      mockRequest.params = { id: 'file-123' };
      mockRequest.body = {};
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('data'));
      mockStorageService.upload = jest.fn().mockResolvedValue({ publicUrl: 'https://cdn.example.com/watermarked.jpg' });

      const mockSharpInstance = {
        metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
        composite: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('watermarked')),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.watermark(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('should return 404 when file not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { text: 'TEST' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      await controller.watermark(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getMetadata', () => {
    it('should extract image metadata from Sharp', async () => {
      const fileBuffer = Buffer.from('image data');
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(fileBuffer);

      const mockSharpMetadata = {
        width: 1920,
        height: 1080,
        format: 'jpeg',
        space: 'srgb',
        channels: 3,
        depth: 'uchar',
        density: 72,
      };

      const mockSharpInstance = {
        metadata: jest.fn().mockResolvedValue(mockSharpMetadata),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ file_id: 'file-123', exif_data: { camera: 'Canon' } }],
        }),
      };
      jest.spyOn(require('../../../src/config/database.config'), 'getPool').mockReturnValue(mockPool as any);

      await controller.getMetadata(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSharpInstance.metadata).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        file: mockSharpMetadata,
        stored: expect.any(Object),
      });
    });

    it('should handle missing database metadata', async () => {
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('data'));

      const mockSharpInstance = {
        metadata: jest.fn().mockResolvedValue({ width: 800, height: 600 }),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      const mockPool = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
      };
      jest.spyOn(require('../../../src/config/database.config'), 'getPool').mockReturnValue(mockPool as any);

      await controller.getMetadata(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        file: expect.any(Object),
        stored: null,
      });
    });

    it('should return 404 when file not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockGetTenantId.mockReturnValue('tenant-456');
      mockFileModel.findById = jest.fn().mockResolvedValue(null);

      await controller.getMetadata(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should handle metadata extraction errors', async () => {
      mockRequest.params = { id: 'file-123' };
      mockGetTenantId.mockReturnValue('tenant-456');

      const mockFile = { id: 'file-123', storagePath: '/path/to/image.jpg' };
      mockFileModel.findById = jest.fn().mockResolvedValue(mockFile);
      mockStorageService.download = jest.fn().mockResolvedValue(Buffer.from('corrupt'));

      const mockSharpInstance = {
        metadata: jest.fn().mockRejectedValue(new Error('Cannot read metadata')),
      };
      mockSharp.mockReturnValue(mockSharpInstance as any);

      await controller.getMetadata(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(imageController).toBeInstanceOf(ImageController);
    });

    it('should be the same instance across imports', () => {
      expect(imageController).toBe(imageController);
    });
  });
});
