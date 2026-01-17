// Mock dependencies BEFORE imports
jest.mock('qrcode');
jest.mock('../../../src/utils/logger');

import QRCode from 'qrcode';
import { QRService, qrService } from '../../../src/services/qr.service';

describe('services/qr.service', () => {
  let service: QRService;
  let mockQRCode: {
    toBuffer: jest.Mock;
    toDataURL: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockQRCode = {
      toBuffer: QRCode.toBuffer as jest.Mock,
      toDataURL: QRCode.toDataURL as jest.Mock,
    };
    mockQRCode.toBuffer.mockResolvedValue(Buffer.from('qr-image'));
    mockQRCode.toDataURL.mockResolvedValue('data:image/png;base64,abc123');

    service = new QRService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateQR', () => {
    it('should generate QR code with default options', async () => {
      // Arrange
      const data = 'https://example.com';

      // Act
      const result = await service.generateQR(data);

      // Assert
      expect(result).toEqual(Buffer.from('qr-image'));
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(data, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    });

    it('should generate QR code with custom width', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = { width: 500 };

      // Act
      await service.generateQR(data, options);

      // Assert
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(data, expect.objectContaining({
        width: 500
      }));
    });

    it('should generate QR code with custom margin', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = { margin: 4 };

      // Act
      await service.generateQR(data, options);

      // Assert
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(data, expect.objectContaining({
        margin: 4
      }));
    });

    it('should generate QR code with custom error correction level', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = { errorCorrectionLevel: 'H' as const };

      // Act
      await service.generateQR(data, options);

      // Assert
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(data, expect.objectContaining({
        errorCorrectionLevel: 'H'
      }));
    });

    it('should generate QR code with custom colors', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = {
        color: {
          dark: '#FF0000',
          light: '#00FF00'
        }
      };

      // Act
      await service.generateQR(data, options);

      // Assert
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(data, expect.objectContaining({
        color: {
          dark: '#FF0000',
          light: '#00FF00'
        }
      }));
    });

    it('should handle all custom options together', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = {
        width: 600,
        margin: 5,
        errorCorrectionLevel: 'Q' as const,
        color: {
          dark: '#0000FF',
          light: '#FFFF00'
        }
      };

      // Act
      await service.generateQR(data, options);

      // Assert
      expect(mockQRCode.toBuffer).toHaveBeenCalledWith(data, {
        width: 600,
        margin: 5,
        errorCorrectionLevel: 'Q',
        color: {
          dark: '#0000FF',
          light: '#FFFF00'
        }
      });
    });

    it('should handle long data strings', async () => {
      // Arrange
      const data = 'a'.repeat(1000);

      // Act
      const result = await service.generateQR(data);

      // Assert
      expect(result).toEqual(Buffer.from('qr-image'));
    });

    it('should handle special characters in data', async () => {
      // Arrange
      const data = 'Test™ ©2024 @#$%^&*()';

      // Act
      const result = await service.generateQR(data);

      // Assert
      expect(result).toEqual(Buffer.from('qr-image'));
    });

    it('should throw error when QR generation fails', async () => {
      // Arrange
      mockQRCode.toBuffer.mockRejectedValue(new Error('QR generation failed'));

      // Act & Assert
      await expect(service.generateQR('test')).rejects.toThrow('Failed to generate QR code');
    });

    it('should handle non-Error rejections', async () => {
      // Arrange
      mockQRCode.toBuffer.mockRejectedValue('String error');

      // Act & Assert
      await expect(service.generateQR('test')).rejects.toThrow('Failed to generate QR code');
    });
  });

  describe('generateQRDataURL', () => {
    it('should generate QR code as data URL with default options', async () => {
      // Arrange
      const data = 'https://example.com';

      // Act
      const result = await service.generateQRDataURL(data);

      // Assert
      expect(result).toBe('data:image/png;base64,abc123');
      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(data, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });
    });

    it('should generate data URL with custom options', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = {
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L' as const
      };

      // Act
      await service.generateQRDataURL(data, options);

      // Assert
      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(data, expect.objectContaining({
        width: 400,
        margin: 3,
        errorCorrectionLevel: 'L'
      }));
    });

    it('should handle custom colors for data URL', async () => {
      // Arrange
      const data = 'https://example.com';
      const options = {
        color: {
          dark: '#123456',
          light: '#ABCDEF'
        }
      };

      // Act
      await service.generateQRDataURL(data, options);

      // Assert
      expect(mockQRCode.toDataURL).toHaveBeenCalledWith(data, expect.objectContaining({
        color: {
          dark: '#123456',
          light: '#ABCDEF'
        }
      }));
    });

    it('should throw error when data URL generation fails', async () => {
      // Arrange
      mockQRCode.toDataURL.mockRejectedValue(new Error('Data URL generation failed'));

      // Act & Assert
      await expect(service.generateQRDataURL('test')).rejects.toThrow('Failed to generate QR code');
    });

    it('should handle non-Error rejections for data URL', async () => {
      // Arrange
      mockQRCode.toDataURL.mockRejectedValue('String error');

      // Act & Assert
      await expect(service.generateQRDataURL('test')).rejects.toThrow('Failed to generate QR code');
    });

    it('should handle empty data string', async () => {
      // Arrange
      const data = '';

      // Act
      const result = await service.generateQRDataURL(data);

      // Assert
      expect(result).toBe('data:image/png;base64,abc123');
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(qrService).toBeInstanceOf(QRService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = qrService;
      const instance2 = qrService;
      expect(instance1).toBe(instance2);
    });
  });
});
