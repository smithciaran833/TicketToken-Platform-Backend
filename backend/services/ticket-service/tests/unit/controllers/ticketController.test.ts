// =============================================================================
// TEST SUITE - ticketController
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { TicketController } from '../../../src/controllers/ticketController';
import { container } from '../../../src/bootstrap/container';
import { cache } from '../../../src/services/cache-integration';

jest.mock('../../../src/bootstrap/container', () => ({
  container: {
    services: {
      ticketService: {
        createTicketType: jest.fn(),
        getTicketTypes: jest.fn(),
        createReservation: jest.fn(),
        confirmPurchase: jest.fn(),
        getUserTickets: jest.fn(),
        releaseReservation: jest.fn(),
        getTicket: jest.fn(),
        getTicketType: jest.fn(),
        updateTicketType: jest.fn(),
      },
      qrService: {
        generateRotatingQR: jest.fn(),
        validateQR: jest.fn(),
      },
    },
  },
}));

jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('TicketController', () => {
  let controller: TicketController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    controller = new TicketController();
    
    mockRequest = {
      body: {},
      params: {},
      query: {},
      headers: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      header: jest.fn().mockReturnThis(),
    };

    jest.clearAllMocks();
  });

  describe('createTicketType()', () => {
    it('should create a ticket type', async () => {
      const mockTicketType = {
        id: 'type-1',
        name: 'VIP',
        price_cents: 10000,
      };

      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.body = {
        eventId: 'event-123',
        name: 'VIP',
        price_cents: 10000,
      };

      container.services.ticketService.createTicketType = jest.fn().mockResolvedValue(mockTicketType);

      await controller.createTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.createTicketType).toHaveBeenCalledWith({
        eventId: 'event-123',
        name: 'VIP',
        price_cents: 10000,
        tenant_id: 'tenant-123',
      });
      expect(cache.delete).toHaveBeenCalled();
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTicketType,
      });
    });
  });

  describe('getTicketTypes()', () => {
    it('should return cached ticket types', async () => {
      const mockTicketTypes = [{ id: 'type-1', name: 'VIP' }];

      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.params = { eventId: 'event-123' };

      (cache.get as jest.Mock).mockResolvedValue(mockTicketTypes);

      await controller.getTicketTypes(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(cache.get).toHaveBeenCalledWith('ticket-types:event-123:tenant-123');
      expect(mockReply.header).toHaveBeenCalledWith('X-Cache', 'HIT');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTicketTypes,
      });
      expect(container.services.ticketService.getTicketTypes).not.toHaveBeenCalled();
    });

    it('should fetch and cache ticket types on cache miss', async () => {
      const mockTicketTypes = [{ id: 'type-1', name: 'VIP' }];

      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.params = { eventId: 'event-123' };

      (cache.get as jest.Mock).mockResolvedValue(null);
      container.services.ticketService.getTicketTypes = jest.fn().mockResolvedValue(mockTicketTypes);

      await controller.getTicketTypes(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.getTicketTypes).toHaveBeenCalledWith('event-123', 'tenant-123');
      expect(cache.set).toHaveBeenCalledWith('ticket-types:event-123:tenant-123', mockTicketTypes, { ttl: 300 });
      expect(mockReply.header).toHaveBeenCalledWith('X-Cache', 'MISS');
    });
  });

  describe('createReservation()', () => {
    it('should create a reservation', async () => {
      const mockReservation = {
        id: 'res-1',
        user_id: 'user-123',
        event_id: 'event-123',
        ticket_type_id: 'type-123',
        total_quantity: 2,
        tickets: [],
        expires_at: new Date(),
        status: 'active',
        type_name: 'VIP',
        created_at: new Date(),
      };

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.body = {
        eventId: 'event-123',
        ticketTypeId: 'type-123',
        quantity: 2,
      };

      container.services.ticketService.createReservation = jest.fn().mockResolvedValue(mockReservation);

      await controller.createReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.createReservation).toHaveBeenCalledWith({
        eventId: 'event-123',
        ticketTypeId: 'type-123',
        quantity: 2,
        userId: 'user-123',
      });
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'res-1',
          userId: 'user-123',
        }),
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.body = { eventId: 'event-123' };

      await controller.createReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('confirmPurchase()', () => {
    it('should confirm a purchase', async () => {
      const mockResult = { orderId: 'order-1', tickets: [] };

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { reservationId: 'res-1' };

      container.services.ticketService.confirmPurchase = jest.fn().mockResolvedValue(mockResult);

      await controller.confirmPurchase(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.confirmPurchase).toHaveBeenCalledWith('res-1', 'user-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockResult,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { reservationId: 'res-1' };

      await controller.confirmPurchase(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getUserTickets()', () => {
    it('should get user tickets', async () => {
      const mockTickets = [{ id: 'ticket-1' }, { id: 'ticket-2' }];

      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.params = { userId: 'user-123' };

      container.services.ticketService.getUserTickets = jest.fn().mockResolvedValue(mockTickets);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.getUserTickets).toHaveBeenCalledWith('user-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTickets,
      });
    });
  });

  describe('releaseReservation()', () => {
    it('should release a reservation', async () => {
      const mockResult = { released: true };

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { reservationId: 'res-1' };

      container.services.ticketService.releaseReservation = jest.fn().mockResolvedValue(mockResult);

      await controller.releaseReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.releaseReservation).toHaveBeenCalledWith('res-1', 'user-123');
      expect(cache.delete).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        message: 'Reservation released',
        data: mockResult,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { reservationId: 'res-1' };

      await controller.releaseReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('generateQR()', () => {
    it('should generate QR for ticket owner', async () => {
      const mockTicket = { user_id: 'user-123', id: 'ticket-123' };
      const mockQR = { qrCode: 'QR123', qrImage: 'image' };

      (mockRequest as any).tenantId = 'tenant-123';
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { ticketId: 'ticket-123' };

      container.services.ticketService.getTicket = jest.fn().mockResolvedValue(mockTicket);
      container.services.qrService.generateRotatingQR = jest.fn().mockResolvedValue(mockQR);

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'QR123',
          qrImage: 'image',
          expiresIn: 30,
        },
      });
    });

    it('should return 403 if user does not own ticket', async () => {
      const mockTicket = { user_id: 'user-123', id: 'ticket-123' };

      (mockRequest as any).tenantId = 'tenant-123';
      (mockRequest as any).user = { id: 'different-user' };
      mockRequest.params = { ticketId: 'ticket-123' };

      container.services.ticketService.getTicket = jest.fn().mockResolvedValue(mockTicket);

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('validateQR()', () => {
    it('should validate QR code', async () => {
      const mockValidation = {
        isValid: true,
        ticketId: 'ticket-123',
        eventId: 'event-123',
        validatedAt: new Date(),
      };

      (mockRequest as any).user = { id: 'validator-123' };
      mockRequest.body = {
        qrData: 'QR123',
        eventId: 'event-123',
      };

      container.services.qrService.validateQR = jest.fn().mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        valid: true,
        data: {
          ticketId: 'ticket-123',
          eventId: 'event-123',
          validatedAt: mockValidation.validatedAt,
        },
      });
    });
  });

  describe('getTicketType()', () => {
    it('should get ticket type by id', async () => {
      const mockTicketType = { id: 'type-1', name: 'VIP' };

      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.params = { id: 'type-1' };

      container.services.ticketService.getTicketType = jest.fn().mockResolvedValue(mockTicketType);

      await controller.getTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.getTicketType).toHaveBeenCalledWith('type-1', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTicketType,
      });
    });

    it('should return 404 if ticket type not found', async () => {
      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.params = { id: 'type-1' };

      container.services.ticketService.getTicketType = jest.fn().mockResolvedValue(null);

      await controller.getTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateTicketType()', () => {
    it('should update ticket type', async () => {
      const mockUpdated = { id: 'type-1', name: 'Updated VIP', event_id: 'event-123' };

      (mockRequest as any).tenantId = 'tenant-123';
      mockRequest.params = { id: 'type-1' };
      mockRequest.body = { name: 'Updated VIP' };

      container.services.ticketService.updateTicketType = jest.fn().mockResolvedValue(mockUpdated);

      await controller.updateTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.updateTicketType).toHaveBeenCalledWith(
        'type-1',
        { name: 'Updated VIP' },
        'tenant-123'
      );
      expect(cache.delete).toHaveBeenCalled();
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockUpdated,
      });
    });
  });

  describe('getCurrentUserTickets()', () => {
    it('should get current user tickets', async () => {
      const mockTickets = [{ id: 'ticket-1' }];

      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-123';

      container.services.ticketService.getUserTickets = jest.fn().mockResolvedValue(mockTickets);

      await controller.getCurrentUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(container.services.ticketService.getUserTickets).toHaveBeenCalledWith('user-123', 'tenant-123');
      expect(mockReply.send).toHaveBeenCalledWith({
        success: true,
        data: mockTickets,
      });
    });

    it('should return 401 if user not authenticated', async () => {
      (mockRequest as any).tenantId = 'tenant-123';

      await controller.getCurrentUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });
});
