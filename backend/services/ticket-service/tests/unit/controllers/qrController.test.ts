import { FastifyRequest, FastifyReply } from 'fastify';
import { QRController, qrController } from '../../../src/controllers/qrController';
import { qrService } from '../../../src/services/qrService';
import { ticketService } from '../../../src/services/ticketService';
import { ForbiddenError } from '../../../src/utils/errors';

// Mock dependencies
jest.mock('../../../src/services/qrService');
jest.mock('../../../src/services/ticketService');

describe('QRController', () => {
  let controller: QRController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new QRController();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus
    };

    mockRequest = {
      params: {},
      body: {},
      headers: {}
    } as any;
  });

  describe('generateQR', () => {
    it('should generate QR code for ticket owner', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'user-123',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue({
        qrCode: 'encoded-qr-data',
        qrImage: 'base64-image-data'
      });

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(ticketService.getTicket).toHaveBeenCalledWith('ticket-123', 'tenant-456');
      expect(qrService.generateRotatingQR).toHaveBeenCalledWith('ticket-123');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'encoded-qr-data',
          qrImage: 'base64-image-data',
          expiresIn: 30
        }
      });
    });

    it('should generate QR code for admin regardless of ownership', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'admin-user', role: 'admin' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'different-user',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue({
        qrCode: 'encoded-qr-data',
        qrImage: 'base64-image-data'
      });

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(qrService.generateRotatingQR).toHaveBeenCalledWith('ticket-123');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'encoded-qr-data',
          qrImage: 'base64-image-data',
          expiresIn: 30
        }
      });
    });

    it('should throw ForbiddenError when non-owner non-admin tries to generate QR', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-456', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'user-123',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await expect(
        controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      expect(qrService.generateRotatingQR).not.toHaveBeenCalled();
    });

    it('should propagate ticketService errors', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const error = new Error('Ticket not found');
      (ticketService.getTicket as jest.Mock).mockRejectedValue(error);

      await expect(
        controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Ticket not found');
    });

    it('should propagate qrService errors', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'user-123',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockRejectedValue(new Error('QR generation failed'));

      await expect(
        controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('QR generation failed');
    });
  });

  describe('validateQR', () => {
    it('should validate QR code successfully', async () => {
      mockRequest.body = {
        qrCode: 'encoded-qr-data',
        eventId: 'event-123',
        entrance: 'main-gate',
        deviceId: 'device-001'
      };
      (mockRequest as any).user = { id: 'validator-123' };

      const mockValidation = {
        isValid: true,
        ticketId: 'ticket-123',
        eventId: 'event-123',
        validatedAt: new Date()
      };

      (qrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(qrService.validateQR).toHaveBeenCalledWith('encoded-qr-data', {
        eventId: 'event-123',
        entrance: 'main-gate',
        deviceId: 'device-001',
        validatorId: 'validator-123'
      });
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: mockValidation
      });
    });

    it('should return invalid validation result', async () => {
      mockRequest.body = {
        qrCode: 'invalid-qr-data',
        eventId: 'event-123'
      };
      (mockRequest as any).user = { id: 'validator-123' };

      const mockValidation = {
        isValid: false,
        error: 'QR code expired'
      };

      (qrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        success: false,
        data: mockValidation
      });
    });

    it('should handle validation without user', async () => {
      mockRequest.body = {
        qrCode: 'encoded-qr-data',
        eventId: 'event-123'
      };
      (mockRequest as any).user = undefined;

      const mockValidation = { isValid: true };

      (qrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(qrService.validateQR).toHaveBeenCalledWith('encoded-qr-data', {
        eventId: 'event-123',
        entrance: undefined,
        deviceId: undefined,
        validatorId: undefined
      });
    });

    it('should propagate qrService validation errors', async () => {
      mockRequest.body = {
        qrCode: 'encoded-qr-data',
        eventId: 'event-123'
      };
      (mockRequest as any).user = { id: 'validator-123' };

      (qrService.validateQR as jest.Mock).mockRejectedValue(new Error('Validation service unavailable'));

      await expect(
        controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Validation service unavailable');
    });
  });

  describe('refreshQR', () => {
    it('should refresh QR code for ticket owner', async () => {
      mockRequest.body = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'user-123',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue({
        qrCode: 'new-encoded-qr-data',
        qrImage: 'new-base64-image-data'
      });

      await controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(ticketService.getTicket).toHaveBeenCalledWith('ticket-123', 'tenant-456');
      expect(qrService.generateRotatingQR).toHaveBeenCalledWith('ticket-123');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'new-encoded-qr-data',
          qrImage: 'new-base64-image-data',
          expiresIn: 30
        }
      });
    });

    it('should refresh QR code for admin', async () => {
      mockRequest.body = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'admin-user', role: 'admin' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'different-user',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue({
        qrCode: 'new-encoded-qr-data',
        qrImage: 'new-base64-image-data'
      });

      await controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'new-encoded-qr-data',
          qrImage: 'new-base64-image-data',
          expiresIn: 30
        }
      });
    });

    it('should throw ForbiddenError when non-owner non-admin tries to refresh QR', async () => {
      mockRequest.body = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-456', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicket = {
        id: 'ticket-123',
        userId: 'user-123',
        status: 'ACTIVE'
      };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await expect(
        controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);

      expect(qrService.generateRotatingQR).not.toHaveBeenCalled();
    });

    it('should propagate ticketService errors on refresh', async () => {
      mockRequest.body = { ticketId: 'ticket-123' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      (ticketService.getTicket as jest.Mock).mockRejectedValue(new Error('Database error'));

      await expect(
        controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow('Database error');
    });
  });

  describe('qrController singleton', () => {
    it('should export a singleton instance', () => {
      expect(qrController).toBeInstanceOf(QRController);
    });
  });
});
