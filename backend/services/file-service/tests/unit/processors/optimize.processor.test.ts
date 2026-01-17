// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger');
jest.mock('sharp');

import { ImageOptimizer, imageOptimizer } from '../../../src/processors/image/optimize.processor';
import sharp from 'sharp';

describe('processors/image/optimize.processor', () => {
  let optimizer: ImageOptimizer;
  let mockSharp: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock sharp chain
    mockSharp = {
      metadata: jest.fn().mockResolvedValue({
        width: 1920,
        height: 1080,
        format: 'jpeg',
        hasAlpha: false,
        size: 500000
      }),
      rotate: jest.fn().mockReturnThis(),
      resize: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('optimized'))
    };

    (sharp as unknown as jest.Mock).mockReturnValue(mockSharp);

    optimizer = new ImageOptimizer();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('optimize', () => {
    it('should convert large JPEG to WebP', async () => {
      const buffer = Buffer.from('jpeg image');
      const mimeType = 'image/jpeg';

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500,
        format: 'jpeg',
        hasAlpha: false
      });

      const result = await optimizer.optimize(buffer, mimeType);

      expect(sharp).toHaveBeenCalledWith(buffer);
      expect(mockSharp.rotate).toHaveBeenCalled();
      expect(mockSharp.webp).toHaveBeenCalledWith({
        quality: 85,
        effort: 6
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should convert PNG without alpha to JPEG', async () => {
      const buffer = Buffer.from('png image');
      const mimeType = 'image/png';

      mockSharp.metadata.mockResolvedValue({
        width: 1200,
        height: 800,
        format: 'png',
        hasAlpha: false
      });

      const result = await optimizer.optimize(buffer, mimeType);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 85,
        progressive: true,
        mozjpeg: true,
        trellisQuantisation: true,
        overshootDeringing: true,
        optimizeScans: true
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should re-encode JPEG with better settings when small', async () => {
      const buffer = Buffer.from('jpeg image');
      const mimeType = 'image/jpeg';

      // Width <= 500 so it doesn't convert to WebP
      mockSharp.metadata.mockResolvedValue({
        width: 400,
        height: 300,
        format: 'jpeg',
        hasAlpha: false
      });

      await optimizer.optimize(buffer, mimeType);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 85,
        progressive: true,
        mozjpeg: true
      });
    });

    it('should return original buffer when no optimization needed', async () => {
      const buffer = Buffer.from('png with alpha');
      const mimeType = 'image/png';

      mockSharp.metadata.mockResolvedValue({
        width: 400,
        height: 300,
        format: 'png',
        hasAlpha: true
      });

      const result = await optimizer.optimize(buffer, mimeType);

      expect(result).toBe(buffer);
      expect(mockSharp.webp).not.toHaveBeenCalled();
      expect(mockSharp.jpeg).not.toHaveBeenCalled();
    });

    it('should apply auto-rotate based on EXIF', async () => {
      const buffer = Buffer.from('image');
      const mimeType = 'image/jpeg';

      await optimizer.optimize(buffer, mimeType);

      expect(mockSharp.rotate).toHaveBeenCalled();
    });

    it('should only convert to WebP for large images (>500px)', async () => {
      const buffer = Buffer.from('small jpeg');
      const mimeType = 'image/jpeg';

      mockSharp.metadata.mockResolvedValue({
        width: 400,
        height: 300,
        format: 'jpeg',
        hasAlpha: false
      });

      await optimizer.optimize(buffer, mimeType);

      expect(mockSharp.webp).not.toHaveBeenCalled();
      expect(mockSharp.jpeg).toHaveBeenCalled();
    });

    it('should not convert PNG with alpha channel', async () => {
      const buffer = Buffer.from('png with transparency');
      const mimeType = 'image/png';

      mockSharp.metadata.mockResolvedValue({
        width: 800,
        height: 600,
        format: 'png',
        hasAlpha: true
      });

      const result = await optimizer.optimize(buffer, mimeType);

      expect(mockSharp.jpeg).not.toHaveBeenCalled();
      expect(result).toBe(buffer);
    });
  });

  describe('generateResponsiveSet', () => {
    it('should generate multiple responsive sizes', async () => {
      const buffer = Buffer.from('large image');

      mockSharp.metadata.mockResolvedValue({
        width: 3000,
        height: 2000
      });

      const result = await optimizer.generateResponsiveSet(buffer);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBeGreaterThan(0);
      expect(mockSharp.resize).toHaveBeenCalled();
    });

    it('should not upscale images', async () => {
      const buffer = Buffer.from('small image');

      // Width < 320 (smallest size) so no sizes generated
      mockSharp.metadata.mockResolvedValue({
        width: 200,
        height: 150
      });

      const result = await optimizer.generateResponsiveSet(buffer);

      expect(result.size).toBe(0);
    });

    it('should stop at original width', async () => {
      const buffer = Buffer.from('medium image');

      mockSharp.metadata.mockResolvedValue({
        width: 1000,
        height: 800
      });

      const result = await optimizer.generateResponsiveSet(buffer);

      // 320, 640, 960 are all < 1000, so they get added
      // 1280 >= 1000, so it breaks
      expect(result.has(320)).toBe(true);
      expect(result.has(640)).toBe(true);
      expect(result.has(960)).toBe(true);
      expect(result.has(1280)).toBe(false);
    });

    it('should resize with withoutEnlargement option', async () => {
      const buffer = Buffer.from('image');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500
      });

      await optimizer.generateResponsiveSet(buffer);

      expect(mockSharp.resize).toHaveBeenCalledWith(
        expect.any(Number),
        null,
        expect.objectContaining({
          withoutEnlargement: true,
          fit: 'inside'
        })
      );
    });

    it('should use JPEG format with quality 85 for responsive images', async () => {
      const buffer = Buffer.from('image');

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500
      });

      await optimizer.generateResponsiveSet(buffer);

      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 85,
        progressive: true
      });
    });

    it('should return buffers for each generated size', async () => {
      const buffer = Buffer.from('large image');

      mockSharp.metadata.mockResolvedValue({
        width: 3000,
        height: 2000
      });

      mockSharp.toBuffer.mockResolvedValue(Buffer.from('resized'));

      const result = await optimizer.generateResponsiveSet(buffer);

      for (const [size, imageBuffer] of result) {
        expect(typeof size).toBe('number');
        expect(imageBuffer).toBeInstanceOf(Buffer);
      }
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(imageOptimizer).toBeInstanceOf(ImageOptimizer);
    });

    it('should be the same instance across imports', () => {
      const instance1 = imageOptimizer;
      const instance2 = imageOptimizer;
      expect(instance1).toBe(instance2);
    });
  });
});
