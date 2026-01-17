// Mock dependencies BEFORE imports
jest.mock('sharp');

import { WatermarkProcessor, watermarkProcessor } from '../../../src/processors/image/watermark.processor';
import sharp from 'sharp';

describe('processors/image/watermark.processor', () => {
  let processor: WatermarkProcessor;
  let mockSharp: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock sharp chain
    mockSharp = {
      metadata: jest.fn().mockResolvedValue({
        width: 1920,
        height: 1080
      }),
      composite: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('watermarked'))
    };

    (sharp as unknown as jest.Mock).mockReturnValue(mockSharp);

    processor = new WatermarkProcessor();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('addTextWatermark', () => {
    it('should add centered text watermark with default options', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'Copyright 2026'
      };

      // Act
      const result = await processor.addTextWatermark(imageBuffer, options);

      // Assert
      expect(sharp).toHaveBeenCalledWith(imageBuffer);
      expect(mockSharp.metadata).toHaveBeenCalled();
      expect(mockSharp.composite).toHaveBeenCalledWith([
        expect.objectContaining({
          input: expect.any(Buffer),
          blend: 'over'
        })
      ]);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should position watermark at top-left', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'TOP LEFT',
        position: 'top-left' as const
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const compositeCall = mockSharp.composite.mock.calls[0][0][0];
      const svgBuffer = compositeCall.input;
      const svgContent = svgBuffer.toString();
      
      // Check SVG contains the text
      expect(svgContent).toContain('TOP LEFT');
      expect(svgContent).toContain('text-anchor="start"');
    });

    it('should position watermark at top-right', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'TOP RIGHT',
        position: 'top-right' as const
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('TOP RIGHT');
      expect(svgContent).toContain('text-anchor="end"');
    });

    it('should position watermark at bottom-left', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'BOTTOM LEFT',
        position: 'bottom-left' as const
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('BOTTOM LEFT');
    });

    it('should position watermark at bottom-right', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'BOTTOM RIGHT',
        position: 'bottom-right' as const
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('BOTTOM RIGHT');
    });

    it('should apply custom opacity', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'WATERMARK',
        opacity: 0.5
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('fill-opacity: 0.5');
    });

    it('should apply custom font size', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'BIG TEXT',
        fontSize: 100
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('font-size: 100px');
    });

    it('should apply custom rotation', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const options = {
        text: 'ROTATED',
        rotate: -30
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('rotate(-30');
    });

    it('should scale font size based on image dimensions', async () => {
      // Arrange
      const imageBuffer = Buffer.from('small image');
      
      mockSharp.metadata.mockResolvedValue({
        width: 400,
        height: 300
      });

      const options = {
        text: 'AUTO SIZE'
      };

      // Act
      await processor.addTextWatermark(imageBuffer, options);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      // Font size should be Math.min(400, 300) / 10 = 30px
      expect(svgContent).toContain('font-size: 30px');
    });
  });

  describe('addImageWatermark', () => {
    it('should add image watermark at center', async () => {
      // Arrange
      const imageBuffer = Buffer.from('main image');
      const watermarkBuffer = Buffer.from('watermark image');
      const options = {
        position: 'center' as const
      };

      const resizedWatermarkBuffer = Buffer.from('resized watermark');
      const mockResizedSharp = {
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(resizedWatermarkBuffer)
      };

      // Mock both sharp calls (main image and watermark)
      (sharp as unknown as jest.Mock)
        .mockReturnValueOnce(mockSharp) // Main image
        .mockReturnValueOnce({ metadata: jest.fn().mockResolvedValue({ width: 200, height: 150 }) }) // Watermark metadata
        .mockReturnValueOnce(mockResizedSharp); // Watermark resize

      // Act
      const result = await processor.addImageWatermark(imageBuffer, watermarkBuffer, options);

      // Assert
      expect(mockSharp.composite).toHaveBeenCalledWith([
        expect.objectContaining({
          input: resizedWatermarkBuffer,
          blend: 'over'
        })
      ]);
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should resize watermark to 20% of main image width', async () => {
      // Arrange
      const imageBuffer = Buffer.from('main image');
      const watermarkBuffer = Buffer.from('watermark');
      const options = {};

      const mockResizedSharp = {
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized'))
      };

      (sharp as unknown as jest.Mock)
        .mockReturnValueOnce(mockSharp)
        .mockReturnValueOnce({ metadata: jest.fn().mockResolvedValue({ width: 500, height: 400 }) })
        .mockReturnValueOnce(mockResizedSharp);

      // Act
      await processor.addImageWatermark(imageBuffer, watermarkBuffer, options);

      // Assert
      // 20% of 1920 = 384
      expect(mockResizedSharp.resize).toHaveBeenCalledWith(384, null, { withoutEnlargement: true });
    });

    it('should position image watermark at top-left', async () => {
      // Arrange
      const imageBuffer = Buffer.from('main image');
      const watermarkBuffer = Buffer.from('watermark');
      const options = {
        position: 'top-left' as const
      };

      const mockResizedSharp = {
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized'))
      };

      (sharp as unknown as jest.Mock)
        .mockReturnValueOnce(mockSharp)
        .mockReturnValueOnce({ metadata: jest.fn().mockResolvedValue({ width: 200, height: 150 }) })
        .mockReturnValueOnce(mockResizedSharp);

      // Act
      await processor.addImageWatermark(imageBuffer, watermarkBuffer, options);

      // Assert
      expect(mockSharp.composite).toHaveBeenCalledWith([
        expect.objectContaining({
          left: 20,
          top: 20
        })
      ]);
    });

    it('should position image watermark at bottom-right', async () => {
      // Arrange
      const imageBuffer = Buffer.from('main image');
      const watermarkBuffer = Buffer.from('watermark');
      const options = {
        position: 'bottom-right' as const
      };

      const mockResizedSharp = {
        resize: jest.fn().mockReturnThis(),
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('resized'))
      };

      (sharp as unknown as jest.Mock)
        .mockReturnValueOnce(mockSharp)
        .mockReturnValueOnce({ metadata: jest.fn().mockResolvedValue({ width: 200, height: 150 }) })
        .mockReturnValueOnce(mockResizedSharp);

      // Act
      await processor.addImageWatermark(imageBuffer, watermarkBuffer, options);

      // Assert
      const compositeCall = mockSharp.composite.mock.calls[0][0][0];
      // bottom-right: left = 1920 - watermarkWidth - 20, top = 1080 - height - 20
      expect(compositeCall.left).toBeGreaterThan(0);
      expect(compositeCall.top).toBeGreaterThan(0);
    });
  });

  describe('addPattern', () => {
    it('should add repeating pattern watermark', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const pattern = 'CONFIDENTIAL';

      // Act
      const result = await processor.addPattern(imageBuffer, pattern);

      // Assert
      expect(sharp).toHaveBeenCalledWith(imageBuffer);
      expect(mockSharp.metadata).toHaveBeenCalled();
      expect(mockSharp.composite).toHaveBeenCalledWith([
        expect.objectContaining({
          input: expect.any(Buffer),
          blend: 'over'
        })
      ]);
      
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('CONFIDENTIAL');
      expect(svgContent).toContain('<pattern');
      expect(result).toBeInstanceOf(Buffer);
    });

    it('should create repeating pattern with correct dimensions', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const pattern = 'DRAFT';

      mockSharp.metadata.mockResolvedValue({
        width: 2000,
        height: 1500
      });

      // Act
      await processor.addPattern(imageBuffer, pattern);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('width="2000"');
      expect(svgContent).toContain('height="1500"');
      expect(svgContent).toContain('patternUnits="userSpaceOnUse"');
    });

    it('should apply rotation to pattern text', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const pattern = 'SAMPLE';

      // Act
      await processor.addPattern(imageBuffer, pattern);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('rotate(-45');
    });

    it('should use low opacity for pattern', async () => {
      // Arrange
      const imageBuffer = Buffer.from('image');
      const pattern = 'BACKGROUND';

      // Act
      await processor.addPattern(imageBuffer, pattern);

      // Assert
      const svgBuffer = mockSharp.composite.mock.calls[0][0][0].input;
      const svgContent = svgBuffer.toString();
      
      expect(svgContent).toContain('fill-opacity="0.1"');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(watermarkProcessor).toBeInstanceOf(WatermarkProcessor);
    });

    it('should be the same instance across imports', () => {
      const instance1 = watermarkProcessor;
      const instance2 = watermarkProcessor;
      expect(instance1).toBe(instance2);
    });
  });
});
