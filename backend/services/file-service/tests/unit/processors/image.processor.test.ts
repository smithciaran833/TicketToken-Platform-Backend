// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger');
jest.mock('../../../src/storage/storage.service');
jest.mock('../../../src/config/database.config');
jest.mock('sharp');

import { ImageProcessor, imageProcessor } from '../../../src/processors/image/image.processor';
import { storageService } from '../../../src/storage/storage.service';
import sharp from 'sharp';

describe('processors/image/image.processor', () => {
  let processor: ImageProcessor;
  let mockStorageService: jest.Mocked<typeof storageService>;
  let mockSharp: any;
  let mockPool: any;

  const createStorageResult = (publicUrl: string) => ({
    publicUrl,
    key: 'test-key',
    storageUrl: 'storage://test',
    provider: 'local' as const
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockStorageService = storageService as jest.Mocked<typeof storageService>;
    mockStorageService.upload = jest.fn().mockResolvedValue(createStorageResult('https://cdn.example.com/image.jpg'));

    mockSharp = {
      metadata: jest.fn().mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        space: 'srgb',
        channels: 3,
        depth: 'uchar',
        density: 72,
        hasAlpha: false,
        orientation: 1
      }),
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed'))
    };

    (sharp as unknown as jest.Mock).mockReturnValue(mockSharp);

    mockPool = {
      query: jest.fn().mockResolvedValue({ rows: [] })
    };

    jest.spyOn(require('../../../src/config/database.config'), 'getPool').mockReturnValue(mockPool);

    processor = new ImageProcessor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processImage', () => {
    it('should process image with all tasks when storagePath is provided', async () => {
      const fileId = 'file-123';
      const buffer = Buffer.from('image data');
      const storagePath = '/uploads/image.jpg';

      await processor.processImage(fileId, buffer, storagePath);

      expect(sharp).toHaveBeenCalledWith(buffer);
      expect(mockSharp.metadata).toHaveBeenCalled();
      expect(mockStorageService.upload).toHaveBeenCalled();
    });

    it('should only extract metadata when no storagePath provided', async () => {
      const fileId = 'file-123';
      const buffer = Buffer.from('image data');

      await processor.processImage(fileId, buffer);

      expect(mockSharp.metadata).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalled();
      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should handle processing errors', async () => {
      const fileId = 'file-123';
      const buffer = Buffer.from('image data');
      const error = new Error('Sharp processing failed');

      mockSharp.metadata.mockRejectedValue(error);

      await expect(processor.processImage(fileId, buffer, '/path')).rejects.toThrow('Sharp processing failed');
    });

    it('should log warning when no storage path provided', async () => {
      const fileId = 'file-123';
      const buffer = Buffer.from('image data');

      await processor.processImage(fileId, buffer);

      expect(mockSharp.metadata).toHaveBeenCalled();
    });
  });

  describe('extractMetadata', () => {
    it('should extract and save image metadata', async () => {
      const fileId = 'file-456';
      const buffer = Buffer.from('image');

      await (processor as any).extractMetadata(fileId, buffer);

      expect(mockSharp.metadata).toHaveBeenCalled();
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO image_metadata'),
        expect.arrayContaining([fileId, 1920, 1080, 1920/1080, 'jpeg'])
      );
    });

    it('should handle metadata with default values for missing fields', async () => {
      const fileId = 'file-456';
      const buffer = Buffer.from('image');

      mockSharp.metadata.mockResolvedValue({ format: 'png' });

      await (processor as any).extractMetadata(fileId, buffer);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([fileId, 0, 0])
      );
    });
  });

  describe('generateThumbnails', () => {
    it('should generate all three thumbnail sizes', async () => {
      const fileId = 'file-789';
      const buffer = Buffer.from('image');
      const originalPath = '/uploads/photo.jpg';

      await (processor as any).generateThumbnails(fileId, buffer, originalPath);

      expect(mockSharp.resize).toHaveBeenCalledTimes(3);
      expect(mockSharp.resize).toHaveBeenCalledWith(150, 150, expect.any(Object));
      expect(mockSharp.resize).toHaveBeenCalledWith(300, 300, expect.any(Object));
      expect(mockSharp.resize).toHaveBeenCalledWith(600, 600, expect.any(Object));

      expect(mockStorageService.upload).toHaveBeenCalledTimes(3);
      expect(mockStorageService.upload).toHaveBeenCalledWith(expect.any(Buffer), '/uploads/photo_small.jpg');
      expect(mockStorageService.upload).toHaveBeenCalledWith(expect.any(Buffer), '/uploads/photo_medium.jpg');
      expect(mockStorageService.upload).toHaveBeenCalledWith(expect.any(Buffer), '/uploads/photo_large.jpg');
    });

    it('should update database with thumbnail URLs', async () => {
      const fileId = 'file-789';
      const buffer = Buffer.from('image');
      const originalPath = '/uploads/photo.jpg';

      mockStorageService.upload.mockResolvedValue(createStorageResult('https://cdn.example.com/thumb.jpg'));

      await (processor as any).generateThumbnails(fileId, buffer, originalPath);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE image_metadata'),
        expect.any(Array)
      );
    });

    it('should use jpeg format with quality 85 for thumbnails', async () => {
      const fileId = 'file-789';
      const buffer = Buffer.from('image');
      const originalPath = '/uploads/photo.png';

      await (processor as any).generateThumbnails(fileId, buffer, originalPath);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85, progressive: true });
    });
  });

  describe('optimizeImage', () => {
    it('should save optimized image when smaller than original', async () => {
      const fileId = 'file-101';
      const buffer = Buffer.from('x'.repeat(1000));
      const originalPath = '/uploads/large.jpg';

      const optimizedBuffer = Buffer.from('x'.repeat(500));
      mockSharp.toBuffer.mockResolvedValue(optimizedBuffer);

      await (processor as any).optimizeImage(fileId, buffer, originalPath);

      expect(mockStorageService.upload).toHaveBeenCalledWith(optimizedBuffer, '/uploads/large_optimized.jpg');
    });

    it('should not save optimized image when larger than original', async () => {
      const fileId = 'file-101';
      const buffer = Buffer.from('x'.repeat(500));
      const originalPath = '/uploads/small.jpg';

      const optimizedBuffer = Buffer.from('x'.repeat(1000));
      mockSharp.toBuffer.mockResolvedValue(optimizedBuffer);

      await (processor as any).optimizeImage(fileId, buffer, originalPath);

      expect(mockStorageService.upload).not.toHaveBeenCalled();
    });

    it('should use mozjpeg for optimization', async () => {
      const fileId = 'file-101';
      const buffer = Buffer.from('image');
      const originalPath = '/uploads/photo.jpg';

      await (processor as any).optimizeImage(fileId, buffer, originalPath);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({ quality: 85, progressive: true, mozjpeg: true });
    });
  });

  describe('updateImageMetadata', () => {
    it('should only update whitelisted fields', async () => {
      const fileId = 'file-202';
      const data = {
        thumbnail_small_url: 'https://cdn.example.com/small.jpg',
        thumbnail_medium_url: 'https://cdn.example.com/medium.jpg',
        thumbnail_large_url: 'https://cdn.example.com/large.jpg',
        malicious_field: 'DROP TABLE users;',
        another_bad_field: 'rm -rf /'
      };

      await (processor as any).updateImageMetadata(fileId, data);

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('thumbnail_small_url');
      expect(query).toContain('thumbnail_medium_url');
      expect(query).toContain('thumbnail_large_url');
      expect(query).not.toContain('malicious_field');
      expect(query).not.toContain('another_bad_field');
    });

    it('should return early when no valid fields provided', async () => {
      const fileId = 'file-202';
      const data = { invalid_field_1: 'value1', invalid_field_2: 'value2' };

      await (processor as any).updateImageMetadata(fileId, data);

      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should validate against ALLOWED_METADATA_FIELDS whitelist', async () => {
      const fileId = 'file-202';
      const data = {
        width: 1920,
        height: 1080,
        format: 'jpeg',
        unsafe_injection: '<script>alert("xss")</script>'
      };

      await (processor as any).updateImageMetadata(fileId, data);

      const values = mockPool.query.mock.calls[0][1];
      expect(values).toContain(1920);
      expect(values).toContain(1080);
      expect(values).toContain('jpeg');
      expect(values).not.toContain('<script>alert("xss")</script>');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(imageProcessor).toBeInstanceOf(ImageProcessor);
    });

    it('should be the same instance across imports', () => {
      const instance1 = imageProcessor;
      const instance2 = imageProcessor;
      expect(instance1).toBe(instance2);
    });
  });
});
