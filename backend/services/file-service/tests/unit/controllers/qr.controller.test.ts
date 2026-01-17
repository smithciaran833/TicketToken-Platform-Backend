// Mock dependencies BEFORE imports
jest.mock('../../../src/services/qr-code.service');
jest.mock('../../../src/utils/logger');

import { FastifyRequest, FastifyReply } from 'fastify';
import { QRController, qrController } from '../../../src/controllers/qr.controller';
import { qrCodeService } from '../../../src/services/qr-code.service';

describe('controllers/qr.controller', () => {
  let controller: QRController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockQrCodeService: jest.Mocked<typeof qrCodeService>;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new QRController();

    mockRequest = {
      body: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      type: jest.fn().mockReturnThis(),
    };

    mockQrCodeService = qrCodeService as jest.Mocked<typeof qrCodeService>;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateQRCode', () => {
    it('should generate QR code from data string', async () => {
      // Arrange
      const buffer = Buffer.from('fake-qr-image-data');
      mockRequest.body = { data: 'https://example.com' };
      mockQrCodeService.generateQRCode = jest.fn().mockResolvedValue(buffer);

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockQrCodeService.generateQRCode).toHaveBeenCalledWith('https://example.com');
      expect(mockReply.type).toHaveBeenCalledWith('image/png');
      expect(mockReply.send).toHaveBeenCalledWith(buffer);
    });

    it('should generate ticket QR code with ticketId and eventId', async () => {
      // Arrange
      const buffer = Buffer.from('fake-ticket-qr-data');
      mockRequest.body = { ticketId: 'ticket-123', eventId: 'event-456' };
      mockQrCodeService.generateTicketQR = jest.fn().mockResolvedValue(buffer);

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockQrCodeService.generateTicketQR).toHaveBeenCalledWith('ticket-123', 'event-456');
      expect(mockReply.type).toHaveBeenCalledWith('image/png');
      expect(mockReply.send).toHaveBeenCalledWith(buffer);
    });

    it('should return 400 when no data or ticket information provided', async () => {
      // Arrange
      mockRequest.body = {};

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Missing data or ticket information',
      });
    });

    it('should return 500 on QR generation error', async () => {
      // Arrange
      mockRequest.body = { data: 'test-data' };
      mockQrCodeService.generateQRCode = jest.fn().mockRejectedValue(new Error('QR generation failed'));

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'QR generation failed',
      });
    });

    it('should prioritize ticket QR over data when both provided', async () => {
      // Arrange
      const buffer = Buffer.from('ticket-qr');
      mockRequest.body = { data: 'https://example.com', ticketId: 'ticket-123', eventId: 'event-456' };
      mockQrCodeService.generateTicketQR = jest.fn().mockResolvedValue(buffer);

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockQrCodeService.generateTicketQR).toHaveBeenCalledWith('ticket-123', 'event-456');
      expect(mockQrCodeService.generateQRCode).not.toHaveBeenCalled();
    });

    it('should handle empty string data', async () => {
      // Arrange
      mockRequest.body = { data: '' };

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle partial ticket info (only ticketId)', async () => {
      // Arrange
      mockRequest.body = { ticketId: 'ticket-123' };

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
    });

    it('should handle partial ticket info (only eventId)', async () => {
      // Arrange
      mockRequest.body = { eventId: 'event-456' };

      // Act
      await controller.generateQRCode(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });

  describe('generateAndStore', () => {
    it('should generate and return QR code as base64 from data', async () => {
      // Arrange
      const buffer = Buffer.from('fake-qr-image-data');
      mockRequest.body = { data: 'https://example.com' };
      mockQrCodeService.generateQRCode = jest.fn().mockResolvedValue(buffer);

      // Act
      await controller.generateAndStore(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockQrCodeService.generateQRCode).toHaveBeenCalledWith('https://example.com');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        qrCodeBase64: buffer.toString('base64'),
        mimeType: 'image/png',
      });
    });

    it('should generate and return ticket QR code as base64', async () => {
      // Arrange
      const buffer = Buffer.from('fake-ticket-qr-data');
      mockRequest.body = { ticketId: 'ticket-123', eventId: 'event-456' };
      mockQrCodeService.generateTicketQR = jest.fn().mockResolvedValue(buffer);

      // Act
      await controller.generateAndStore(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockQrCodeService.generateTicketQR).toHaveBeenCalledWith('ticket-123', 'event-456');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        qrCodeBase64: buffer.toString('base64'),
        mimeType: 'image/png',
      });
    });

    it('should return 400 when no data or ticket information provided', async () => {
      // Arrange
      mockRequest.body = {};

      // Act
      await controller.generateAndStore(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Missing data or ticket information',
      });
    });

    it('should return 500 on QR generation error', async () => {
      // Arrange
      mockRequest.body = { data: 'test-data' };
      mockQrCodeService.generateQRCode = jest.fn().mockRejectedValue(new Error('Storage failed'));

      // Act
      await controller.generateAndStore(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Storage failed',
      });
    });

    it('should handle large data strings', async () => {
      // Arrange
      const largeData = 'x'.repeat(4000);
      const buffer = Buffer.from('qr-code-for-large-data');
      mockRequest.body = { data: largeData };
      mockQrCodeService.generateQRCode = jest.fn().mockResolvedValue(buffer);

      // Act
      await controller.generateAndStore(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Assert
      expect(mockQrCodeService.generateQRCode).toHaveBeenCalledWith(largeData);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          qrCodeBase64: expect.any(String),
        })
      );
    });
  });

  describe('singleton instance', () => {
    it('should export a singleton instance', () => {
      expect(qrController).toBeInstanceOf(QRController);
    });

    it('should be the same instance across imports', () => {
      expect(qrController).toBe(qrController);
    });
  });
});
