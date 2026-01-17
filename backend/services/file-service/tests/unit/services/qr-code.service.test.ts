// Mock dependencies BEFORE imports
jest.mock('../../../src/utils/logger');
jest.mock('qrcode');

import * as QRCode from 'qrcode';
import { QRCodeService, qrCodeService } from '../../../src/services/qr-code.service';

describe('services/qr-code.service', () => {
  let service: QRCodeService;
  let mockToBuffer: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock QRCode.toBuffer
    mockToBuffer = QRCode.toBuffer as jest.Mock;

    service = new QRCodeService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateQRCode', () => {
    it('should generate QR code with default options', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-qr-code-data');
      const testData = 'https://example.com/test';
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.generateQRCode(testData);

      // Assert
      expect(result).toBe(mockBuffer);
      expect(mockToBuffer).toHaveBeenCalledWith(testData, {
        type: 'png',
        width: 400,
        margin: 1,
      });
    });

    it('should generate QR code with custom options', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-qr-code-data');
      const testData = 'https://example.com/test';
      const customOptions = {
        type: 'png' as const,
        width: 800,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      };
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.generateQRCode(testData, customOptions);

      // Assert
      expect(result).toBe(mockBuffer);
      expect(mockToBuffer).toHaveBeenCalledWith(testData, {
        type: 'png',
        width: 800,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });
    });

    it('should merge custom options with defaults', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-qr-code-data');
      const testData = 'test-data';
      const partialOptions = { width: 600 };
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      await service.generateQRCode(testData, partialOptions as any);

      // Assert
      expect(mockToBuffer).toHaveBeenCalledWith(testData, {
        type: 'png',
        width: 600,
        margin: 1,
      });
    });

    it('should handle QR code generation errors', async () => {
      // Arrange
      const testData = 'https://example.com/test';
      const error = new Error('QR generation failed');
      mockToBuffer.mockRejectedValue(error);

      // Act & Assert
      await expect(service.generateQRCode(testData)).rejects.toThrow('Failed to generate QR code');
      expect(mockToBuffer).toHaveBeenCalledWith(testData, expect.any(Object));
    });

    it('should handle empty data string', async () => {
      // Arrange
      const mockBuffer = Buffer.from('');
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.generateQRCode('');

      // Assert
      expect(result).toBe(mockBuffer);
      expect(mockToBuffer).toHaveBeenCalled();
    });

    it('should handle very long data strings', async () => {
      // Arrange
      const longData = 'a'.repeat(2000);
      const mockBuffer = Buffer.from('mock-large-qr');
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.generateQRCode(longData);

      // Assert
      expect(result).toBe(mockBuffer);
      expect(mockToBuffer).toHaveBeenCalledWith(longData, expect.any(Object));
    });
  });

  describe('generateTicketQR', () => {
    it('should generate ticket QR with correct data structure', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-ticket-qr');
      const ticketId = 'ticket-123';
      const eventId = 'event-456';
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.generateTicketQR(ticketId, eventId);

      // Assert
      expect(result).toBe(mockBuffer);

      // Verify the data structure
      const callArgs = mockToBuffer.mock.calls[0];
      const ticketData = JSON.parse(callArgs![0] as string);

      expect(ticketData.ticketId).toBe(ticketId);
      expect(ticketData.eventId).toBe(eventId);
      expect(ticketData.platform).toBe('TicketToken');
      expect(ticketData.timestamp).toBeGreaterThan(0);
    });

    it('should generate ticket QR with timestamp', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-ticket-qr');
      const ticketId = 'ticket-789';
      const eventId = 'event-012';
      const beforeTimestamp = Date.now();
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      await service.generateTicketQR(ticketId, eventId);

      // Assert
      const callArgs = mockToBuffer.mock.calls[0];
      const ticketData = JSON.parse(callArgs![0] as string);
      const afterTimestamp = Date.now();

      expect(ticketData.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(ticketData.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should handle ticket QR generation errors', async () => {
      // Arrange
      const ticketId = 'ticket-123';
      const eventId = 'event-456';
      const error = new Error('Ticket QR generation failed');
      mockToBuffer.mockRejectedValue(error);

      // Act & Assert
      await expect(service.generateTicketQR(ticketId, eventId)).rejects.toThrow('Failed to generate QR code');
    });

    it('should handle special characters in ticket/event IDs', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-ticket-qr');
      const ticketId = 'ticket-123-abc@xyz';
      const eventId = 'event-456_def#ghi';
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      const result = await service.generateTicketQR(ticketId, eventId);

      // Assert
      expect(result).toBe(mockBuffer);
      const callArgs = mockToBuffer.mock.calls[0];
      const ticketData = JSON.parse(callArgs![0] as string);
      expect(ticketData.ticketId).toBe(ticketId);
      expect(ticketData.eventId).toBe(eventId);
    });

    it('should use default QR code options from generateQRCode', async () => {
      // Arrange
      const mockBuffer = Buffer.from('mock-ticket-qr');
      mockToBuffer.mockResolvedValue(mockBuffer);

      // Act
      await service.generateTicketQR('ticket-123', 'event-456');

      // Assert
      expect(mockToBuffer).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          type: 'png',
          width: 400,
          margin: 1,
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(qrCodeService).toBeInstanceOf(QRCodeService);
    });

    it('should be the same instance across imports', () => {
      const instance1 = qrCodeService;
      const instance2 = qrCodeService;
      expect(instance1).toBe(instance2);
    });
  });
});
