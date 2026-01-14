// =============================================================================
// TEST SUITE - qrController
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { QRController } from '../../../src/controllers/qrController';
import { qrService } from '../../../src/services/qrService';
import { ticketService } from '../../../src/services/ticketService';
import { ForbiddenError } from '../../../src/utils/errors';

jest.mock('../../../src/services/qrService');
jest.mock('../../../src/services/ticketService');

describe('QRController', () => {
  let controller: QRController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    controller = new QRController();
    
    mockRequest = {
      body: {},
      params: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('generateQR()', () => {
    it('should generate QR code for ticket owner', async () => {
      const mockTicket = { userId: 'user-123', id: 'ticket-123' };
      const mockQR = {
        qrCode: 'QR123',
        qrImage: 'data:image/png;base64,...',
      };

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { ticketId: 'ticket-123' };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue(mockQR);

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(ticketService.getTicket).toHaveBeenCalledWith('ticket-123');
      expect(qrService.generateRotatingQR).toHaveBeenCalledWith('ticket-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'QR123',
          qrImage: 'data:image/png;base64,...',
          expiresIn: 30,
        },
      });
    });

    it('should generate QR code for admin', async () => {
      const mockTicket = { userId: 'user-123', id: 'ticket-123' };
      const mockQR = { qrCode: 'QR123', qrImage: 'image' };

      (mockRequest as any).user = { id: 'admin-user', role: 'admin' };
      mockRequest.params = { ticketId: 'ticket-123' };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue(mockQR);

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should throw ForbiddenError if user does not own ticket', async () => {
      const mockTicket = { userId: 'user-123', id: 'ticket-123' };

      (mockRequest as any).user = { id: 'different-user' };
      mockRequest.params = { ticketId: 'ticket-123' };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await expect(
        controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('validateQR()', () => {
    it('should validate QR code', async () => {
      const mockValidation = {
        isValid: true,
        ticketId: 'ticket-123',
        eventId: 'event-123',
      };

      (mockRequest as any).user = { id: 'validator-123' };
      mockRequest.body = {
        qrCode: 'QR123',
        eventId: 'event-123',
        entrance: 'Gate A',
        deviceId: 'device-1',
      };

      (qrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(qrService.validateQR).toHaveBeenCalledWith('QR123', {
        eventId: 'event-123',
        entrance: 'Gate A',
        deviceId: 'device-1',
        validatorId: 'validator-123',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockValidation,
      });
    });

    it('should handle invalid QR code', async () => {
      const mockValidation = {
        isValid: false,
        message: 'Invalid QR code',
      };

      (mockRequest as any).user = { id: 'validator-123' };
      mockRequest.body = {
        qrCode: 'INVALID',
        eventId: 'event-123',
      };

      (qrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: false,
        data: mockValidation,
      });
    });

    it('should handle validation without optional fields', async () => {
      const mockValidation = { isValid: true };

      (mockRequest as any).user = { id: 'validator-123' };
      mockRequest.body = {
        qrCode: 'QR123',
        eventId: 'event-123',
      };

      (qrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(qrService.validateQR).toHaveBeenCalledWith('QR123', {
        eventId: 'event-123',
        entrance: undefined,
        deviceId: undefined,
        validatorId: 'validator-123',
      });
    });
  });

  describe('refreshQR()', () => {
    it('should refresh QR code for ticket owner', async () => {
      const mockTicket = { userId: 'user-123', id: 'ticket-123' };
      const mockQR = {
        qrCode: 'NEW-QR123',
        qrImage: 'new-image',
      };

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.body = { ticketId: 'ticket-123' };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue(mockQR);

      await controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(ticketService.getTicket).toHaveBeenCalledWith('ticket-123');
      expect(qrService.generateRotatingQR).toHaveBeenCalledWith('ticket-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'NEW-QR123',
          qrImage: 'new-image',
          expiresIn: 30,
        },
      });
    });

    it('should refresh QR code for admin', async () => {
      const mockTicket = { userId: 'user-123', id: 'ticket-123' };
      const mockQR = { qrCode: 'QR', qrImage: 'image' };

      (mockRequest as any).user = { id: 'admin', role: 'admin' };
      mockRequest.body = { ticketId: 'ticket-123' };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (qrService.generateRotatingQR as jest.Mock).mockResolvedValue(mockQR);

      await controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should throw ForbiddenError if user does not own ticket', async () => {
      const mockTicket = { userId: 'user-123', id: 'ticket-123' };

      (mockRequest as any).user = { id: 'different-user' };
      mockRequest.body = { ticketId: 'ticket-123' };

      (ticketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await expect(
        controller.refreshQR(mockRequest as FastifyRequest, mockReply as FastifyReply)
      ).rejects.toThrow(ForbiddenError);
    });
  });
});
