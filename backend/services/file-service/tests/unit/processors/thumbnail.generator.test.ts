// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger');
jest.mock('sharp');

import { ThumbnailGenerator, thumbnailGenerator } from '../../../src/processors/image/thumbnail.generator';
import sharp from 'sharp';

describe('processors/image/thumbnail.generator', () => {
  let generator: ThumbnailGenerator;
  let mockSharp: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock sharp chain
    mockSharp = {
      resize: jest.fn().mockReturnThis(),
      jpeg: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      webp: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('thumbnail'))
    };

    (sharp as unknown as jest.Mock).mockReturnValue(mockSharp);

    generator = new ThumbnailGenerator();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generate', () => {
    it('should generate thumbnail with default options (JPEG, quality 85)', async () => {
      // Arrange
      const input = Buffer.from('image');
      const options = { width: 300, height: 300 };

      // Act
      const result = await generator.generate(input, options);

      // Assert
      expect(sharp).toHaveBeenCalledWith(input);
      expect(mockSharp.resize).toHaveBeenCalledWith(300, 300, {
        fit: 'cover',
        position: 'centre',
        withoutEnlargement: true
      });
      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 85,
        progressive: true
      });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should generate PNG thumbnail when format is specified', async () => {
      // Arrange
      const input = Buffer.from('image');
      const options = {
        width: 200,
        height: 200,
        format: 'png' as const,
        quality: 90
      };

      // Act
      await generator.generate(input, options);

      // Assert
      expect(mockSharp.png).toHaveBeenCalledWith({
        quality: 90,
        compressionLevel: 9
      });
    });

    it('should generate WebP thumbnail when format is specified', async () => {
      // Arrange
      const input = Buffer.from('image');
      const options = {
        width: 400,
        height: 400,
        format: 'webp' as const,
        quality: 80
      };

      // Act
      await generator.generate(input, options);

      // Assert
      expect(mockSharp.webp).toHaveBeenCalledWith({
        quality: 80
      });
    });

    it('should respect custom quality setting', async () => {
      // Arrange
      const input = Buffer.from('image');
      const options = {
        width: 150,
        height: 150,
        quality: 95
      };

      // Act
      await generator.generate(input, options);

      // Assert
      expect(mockSharp.jpeg).toHaveBeenCalledWith({
        quality: 95,
        progressive: true
      });
    });

    it('should use different fit options (contain)', async () => {
      // Arrange
      const input = Buffer.from('image');
      const options = {
        width: 500,
        height: 500,
        fit: 'contain' as const
      };

      // Act
      await generator.generate(input, options);

      // Assert
      expect(mockSharp.resize).toHaveBeenCalledWith(500, 500, {
        fit: 'contain',
        position: 'centre',
        withoutEnlargement: true
      });
    });

    it('should handle different fit options (fill, inside, outside)', async () => {
      // Arrange
      const input = Buffer.from('image');

      // Test 'fill'
      await generator.generate(input, { width: 100, height: 100, fit: 'fill' });
      expect(mockSharp.resize).toHaveBeenCalledWith(100, 100, expect.objectContaining({ fit: 'fill' }));

      jest.clearAllMocks();
      mockSharp.resize.mockReturnThis();

      // Test 'inside'
      await generator.generate(input, { width: 100, height: 100, fit: 'inside' });
      expect(mockSharp.resize).toHaveBeenCalledWith(100, 100, expect.objectContaining({ fit: 'inside' }));

      jest.clearAllMocks();
      mockSharp.resize.mockReturnThis();

      // Test 'outside'
      await generator.generate(input, { width: 100, height: 100, fit: 'outside' });
      expect(mockSharp.resize).toHaveBeenCalledWith(100, 100, expect.objectContaining({ fit: 'outside' }));
    });

    it('should not enlarge images (withoutEnlargement: true)', async () => {
      // Arrange
      const input = Buffer.from('small image');
      const options = { width: 1000, height: 1000 };

      // Act
      await generator.generate(input, options);

      // Assert
      expect(mockSharp.resize).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        expect.objectContaining({ withoutEnlargement: true })
      );
    });

    it('should handle sharp errors', async () => {
      // Arrange
      const input = Buffer.from('corrupt image');
      const options = { width: 200, height: 200 };
      const error = new Error('Sharp processing failed');

      mockSharp.toBuffer.mockRejectedValue(error);

      // Act & Assert
      await expect(generator.generate(input, options)).rejects.toThrow('Sharp processing failed');
    });
  });

  describe('generateSet', () => {
    it('should generate multiple thumbnails', async () => {
      // Arrange
      const input = Buffer.from('image');
      const sizes = {
        small: { width: 150, height: 150 },
        medium: { width: 300, height: 300 },
        large: { width: 600, height: 600 }
      };

      // Act
      const results = await generator.generateSet(input, sizes);

      // Assert
      expect(results).toHaveProperty('small');
      expect(results).toHaveProperty('medium');
      expect(results).toHaveProperty('large');
      expect(results.small).toBeInstanceOf(Buffer);
      expect(results.medium).toBeInstanceOf(Buffer);
      expect(results.large).toBeInstanceOf(Buffer);
      expect(mockSharp.resize).toHaveBeenCalledTimes(3);
    });

    it('should generate thumbnails with different formats', async () => {
      // Arrange
      const input = Buffer.from('image');
      const sizes = {
        jpegThumb: { width: 200, height: 200, format: 'jpeg' as const },
        pngThumb: { width: 200, height: 200, format: 'png' as const },
        webpThumb: { width: 200, height: 200, format: 'webp' as const }
      };

      // Act
      const results = await generator.generateSet(input, sizes);

      // Assert
      expect(results).toHaveProperty('jpegThumb');
      expect(results).toHaveProperty('pngThumb');
      expect(results).toHaveProperty('webpThumb');
      expect(mockSharp.jpeg).toHaveBeenCalled();
      expect(mockSharp.png).toHaveBeenCalled();
      expect(mockSharp.webp).toHaveBeenCalled();
    });

    it('should handle empty size configuration', async () => {
      // Arrange
      const input = Buffer.from('image');
      const sizes = {};

      // Act
      const results = await generator.generateSet(input, sizes);

      // Assert
      expect(Object.keys(results)).toHaveLength(0);
      expect(mockSharp.resize).not.toHaveBeenCalled();
    });

    it('should handle single size configuration', async () => {
      // Arrange
      const input = Buffer.from('image');
      const sizes = {
        icon: { width: 64, height: 64 }
      };

      // Act
      const results = await generator.generateSet(input, sizes);

      // Assert
      expect(Object.keys(results)).toHaveLength(1);
      expect(results.icon).toBeInstanceOf(Buffer);
    });

    it('should propagate errors from individual thumbnail generation', async () => {
      // Arrange
      const input = Buffer.from('image');
      const sizes = {
        thumb1: { width: 100, height: 100 },
        thumb2: { width: 200, height: 200 }
      };
      const error = new Error('Thumbnail generation failed');

      mockSharp.toBuffer.mockRejectedValueOnce(error);

      // Act & Assert
      await expect(generator.generateSet(input, sizes)).rejects.toThrow('Thumbnail generation failed');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(thumbnailGenerator).toBeInstanceOf(ThumbnailGenerator);
    });

    it('should be the same instance across imports', () => {
      const instance1 = thumbnailGenerator;
      const instance2 = thumbnailGenerator;
      expect(instance1).toBe(instance2);
    });
  });
});
