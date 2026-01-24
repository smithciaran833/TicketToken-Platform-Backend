import { FastifyRequest, FastifyReply } from 'fastify';
import { TicketController, ticketController } from '../../../src/controllers/ticketController';
import { container } from '../../../src/bootstrap/container';
import { cache } from '../../../src/services/cache-integration';

// Mock dependencies
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
        updateTicketType: jest.fn()
      },
      qrService: {
        generateRotatingQR: jest.fn(),
        validateQR: jest.fn()
      }
    }
  }
}));

jest.mock('../../../src/services/cache-integration', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn()
  }
}));

describe('TicketController', () => {
  let controller: TicketController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHeader: jest.Mock;

  const mockTicketService = container.services.ticketService;
  const mockQrService = container.services.qrService;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new TicketController();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });
    mockHeader = jest.fn().mockReturnThis();

    mockReply = {
      send: mockSend,
      status: mockStatus,
      header: mockHeader
    };

    mockRequest = {
      params: {},
      body: {},
      query: {},
      headers: {}
    } as any;
  });

  describe('createTicketType', () => {
    it('should create ticket type successfully', async () => {
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.body = {
        eventId: 'event-123',
        name: 'VIP',
        price: 100,
        quantity: 50
      };

      const mockTicketType = {
        id: 'tt-123',
        event_id: 'event-123',
        name: 'VIP',
        price: 100,
        quantity: 50,
        available_quantity: 50,
        is_active: true,
        tenant_id: 'tenant-456',
        created_at: new Date(),
        updated_at: new Date()
      };

      (mockTicketService.createTicketType as jest.Mock).mockResolvedValue(mockTicketType);
      (cache.delete as jest.Mock).mockResolvedValue(true);

      await controller.createTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.createTicketType).toHaveBeenCalledWith({
        eventId: 'event-123',
        name: 'VIP',
        price: 100,
        quantity: 50,
        tenant_id: 'tenant-456'
      });
      expect(cache.delete).toHaveBeenCalledWith([
        'ticket-types:event-123',
        'event:event-123:availability'
      ]);
      expect(mockStatus).toHaveBeenCalledWith(201);
      // Serializer transforms snake_case to camelCase and strips tenant_id
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'tt-123',
          eventId: 'event-123',
          name: 'VIP',
          price: 100,
          quantity: 50
        })
      });
      // Verify sensitive data is NOT in response
      const sentData = mockSend.mock.calls[0][0].data;
      expect(sentData.tenant_id).toBeUndefined();
      expect(sentData.tenantId).toBeUndefined();
    });
  });

  describe('getTicketTypes', () => {
    it('should return cached ticket types with cache HIT', async () => {
      mockRequest.params = { eventId: 'event-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      const cachedData = [{ id: 'tt-1', name: 'GA' }];
      (cache.get as jest.Mock).mockResolvedValue(cachedData);

      await controller.getTicketTypes(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(cache.get).toHaveBeenCalledWith('ticket-types:event-123:tenant-456');
      expect(mockHeader).toHaveBeenCalledWith('X-Cache', 'HIT');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: cachedData
      });
      expect(mockTicketService.getTicketTypes).not.toHaveBeenCalled();
    });

    it('should fetch and cache ticket types on cache MISS', async () => {
      mockRequest.params = { eventId: 'event-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      (cache.get as jest.Mock).mockResolvedValue(null);

      // Mock raw data from service (snake_case)
      const ticketTypes = [
        { id: 'tt-1', name: 'GA', event_id: 'event-123', price: 50, quantity: 100, available_quantity: 100, is_active: true },
        { id: 'tt-2', name: 'VIP', event_id: 'event-123', price: 100, quantity: 50, available_quantity: 50, is_active: true }
      ];
      (mockTicketService.getTicketTypes as jest.Mock).mockResolvedValue(ticketTypes);
      (cache.set as jest.Mock).mockResolvedValue(true);

      await controller.getTicketTypes(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.getTicketTypes).toHaveBeenCalledWith('event-123', 'tenant-456');
      // Cache stores serialized data (camelCase)
      expect(cache.set).toHaveBeenCalledWith(
        'ticket-types:event-123:tenant-456',
        expect.arrayContaining([
          expect.objectContaining({ id: 'tt-1', name: 'GA', eventId: 'event-123' }),
          expect.objectContaining({ id: 'tt-2', name: 'VIP', eventId: 'event-123' })
        ]),
        { ttl: 300 }
      );
      expect(mockHeader).toHaveBeenCalledWith('X-Cache', 'MISS');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'tt-1', name: 'GA' }),
          expect.objectContaining({ id: 'tt-2', name: 'VIP' })
        ])
      });
    });
  });

  describe('createReservation', () => {
    it('should create reservation successfully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.body = {
        eventId: 'event-123',
        ticketTypeId: 'tt-1',
        quantity: 2
      };

      const mockResult = {
        id: 'res-123',
        user_id: 'user-123',
        event_id: 'event-123',
        ticket_type_id: 'tt-1',
        quantity: 2,
        total_quantity: 2,
        tickets: ['ticket-1', 'ticket-2'],  // This should be stripped by serializer
        expires_at: new Date('2024-01-01T01:00:00'),
        status: 'RESERVED',
        type_name: 'GA',
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01')
      };

      (mockTicketService.createReservation as jest.Mock).mockResolvedValue(mockResult);

      await controller.createReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.createReservation).toHaveBeenCalledWith({
        eventId: 'event-123',
        ticketTypeId: 'tt-1',
        quantity: 2,
        userId: 'user-123',
        tenantId: 'tenant-456'
      });
      // Serializer transforms to camelCase and includes userId for owner
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'res-123',
          userId: 'user-123',
          eventId: 'event-123',
          ticketTypeId: 'tt-1',
          status: 'RESERVED'
        })
      });
      // Verify internal tickets array is stripped
      const sentData = mockSend.mock.calls[0][0].data;
      expect(sentData.tickets).toBeUndefined();
    });

    it('should return 401 if user not authenticated', async () => {
      (mockRequest as any).user = null;

      await controller.createReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });

    it('should return 401 if user.id is missing', async () => {
      (mockRequest as any).user = { role: 'user' };

      await controller.createReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('confirmPurchase', () => {
    it('should confirm purchase successfully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { reservationId: 'res-123' };

      // Mock raw tickets array from service
      const mockResult = [
        { id: 'ticket-1', event_id: 'event-123', ticket_type_id: 'tt-1', user_id: 'user-123', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 'ticket-2', event_id: 'event-123', ticket_type_id: 'tt-1', user_id: 'user-123', status: 'active', created_at: new Date(), updated_at: new Date() }
      ];

      (mockTicketService.confirmPurchase as jest.Mock).mockResolvedValue(mockResult);

      await controller.confirmPurchase(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.confirmPurchase).toHaveBeenCalledWith('res-123', 'user-123');
      // Serialized tickets for owner
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'ticket-1', userId: 'user-123' }),
          expect.objectContaining({ id: 'ticket-2', userId: 'user-123' })
        ])
      });
    });

    it('should return 401 if user not authenticated', async () => {
      (mockRequest as any).user = null;
      mockRequest.params = { reservationId: 'res-123' };

      await controller.confirmPurchase(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('getUserTickets', () => {
    it('should return tickets for authenticated user requesting own tickets', async () => {
      mockRequest.params = { userId: 'user-123' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTickets = [
        { id: 'ticket-1', user_id: 'user-123', event_id: 'event-1', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 'ticket-2', user_id: 'user-123', event_id: 'event-1', status: 'active', created_at: new Date(), updated_at: new Date() }
      ];
      (mockTicketService.getUserTickets as jest.Mock).mockResolvedValue(mockTickets);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.getUserTickets).toHaveBeenCalledWith('user-123', 'tenant-456');
      // Serialized for owner includes userId
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'ticket-1', userId: 'user-123' }),
          expect.objectContaining({ id: 'ticket-2', userId: 'user-123' })
        ])
      });
    });

    it('should return tickets for admin requesting any user tickets', async () => {
      mockRequest.params = { userId: 'other-user' };
      (mockRequest as any).user = { id: 'admin-123', role: 'admin' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTickets = [
        { id: 'ticket-1', user_id: 'other-user', event_id: 'event-1', status: 'active', created_at: new Date(), updated_at: new Date() }
      ];
      (mockTicketService.getUserTickets as jest.Mock).mockResolvedValue(mockTickets);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.getUserTickets).toHaveBeenCalledWith('other-user', 'tenant-456');
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'ticket-1', userId: 'other-user' })
        ])
      });
    });

    it('should return 403 when user tries to view other user tickets', async () => {
      mockRequest.params = { userId: 'other-user' };
      (mockRequest as any).user = { id: 'user-123', role: 'user' };

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'You can only view your own tickets'
      });
      expect(mockTicketService.getUserTickets).not.toHaveBeenCalled();
    });
  });

  describe('releaseReservation', () => {
    it('should release reservation successfully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.params = { reservationId: 'res-123' };

      const mockResult = { released: true };
      (mockTicketService.releaseReservation as jest.Mock).mockResolvedValue(mockResult);
      (cache.delete as jest.Mock).mockResolvedValue(true);

      await controller.releaseReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.releaseReservation).toHaveBeenCalledWith('res-123', 'user-123');
      expect(cache.delete).toHaveBeenCalledWith([
        'reservation:res-123',
        'user:user-123:reservations'
      ]);
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        message: 'Reservation released',
        data: mockResult
      });
    });

    it('should return 401 if user not authenticated', async () => {
      (mockRequest as any).user = null;
      mockRequest.params = { reservationId: 'res-123' };

      await controller.releaseReservation(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('getTicketById', () => {
    it('should return ticket for owner', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      (mockRequest as any).user = { id: 'user-123', role: 'user' };

      const mockTicket = {
        id: 'ticket-123',
        user_id: 'user-123',
        event_id: 'event-1',
        status: 'ACTIVE',
        created_at: new Date(),
        updated_at: new Date()
      };

      (mockTicketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await controller.getTicketById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.getTicket).toHaveBeenCalledWith('ticket-123', 'tenant-456');
      // Serialized for owner includes userId
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'ticket-123',
          userId: 'user-123',
          status: 'ACTIVE'
        })
      });
    });

    it('should return 404 if ticket not found', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      (mockRequest as any).user = { id: 'user-123' };

      (mockTicketService.getTicket as jest.Mock).mockResolvedValue(null);

      await controller.getTicketById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'NOT_FOUND',
        message: 'Ticket not found'
      });
    });

    it('should return 403 when non-owner non-admin tries to view ticket', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      (mockRequest as any).user = { id: 'other-user', role: 'user' };

      const mockTicket = {
        id: 'ticket-123',
        user_id: 'user-123',
        status: 'ACTIVE'
      };

      (mockTicketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await controller.getTicketById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'You do not own this ticket'
      });
    });

    it('should allow admin to view any ticket', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      (mockRequest as any).user = { id: 'admin-user', role: 'admin' };

      const mockTicket = {
        id: 'ticket-123',
        user_id: 'other-user',
        event_id: 'event-1',
        status: 'ACTIVE',
        created_at: new Date(),
        updated_at: new Date()
      };

      (mockTicketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await controller.getTicketById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // Admin viewing ticket also gets serialized owner view
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'ticket-123',
          userId: 'other-user',
          status: 'ACTIVE'
        })
      });
    });
  });

  describe('generateQR', () => {
    it('should generate QR for ticket owner', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      (mockRequest as any).user = { id: 'user-123', role: 'user' };

      const mockTicket = { id: 'ticket-123', user_id: 'user-123' };
      (mockTicketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);
      (mockQrService.generateRotatingQR as jest.Mock).mockResolvedValue({
        qrCode: 'qr-data',
        qrImage: 'base64-image'
      });

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: {
          qrCode: 'qr-data',
          qrImage: 'base64-image',
          expiresIn: 30
        }
      });
    });

    it('should return 403 for non-owner', async () => {
      mockRequest.params = { ticketId: 'ticket-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      (mockRequest as any).user = { id: 'other-user', role: 'user' };

      const mockTicket = { id: 'ticket-123', user_id: 'user-123' };
      (mockTicketService.getTicket as jest.Mock).mockResolvedValue(mockTicket);

      await controller.generateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(403);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'FORBIDDEN',
        message: 'You do not own this ticket'
      });
    });
  });

  describe('validateQR', () => {
    it('should validate QR successfully', async () => {
      mockRequest.body = {
        qrData: 'qr-data',
        eventId: 'event-123',
        entrance: 'main',
        deviceId: 'device-1'
      };
      (mockRequest as any).user = { id: 'validator-123' };

      const mockValidation = {
        isValid: true,
        ticketId: 'ticket-123',
        eventId: 'event-123',
        validatedAt: new Date('2024-01-01')
      };

      (mockQrService.validateQR as jest.Mock).mockResolvedValue(mockValidation);

      await controller.validateQR(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockQrService.validateQR).toHaveBeenCalledWith('qr-data', {
        eventId: 'event-123',
        entrance: 'main',
        deviceId: 'device-1',
        validatorId: 'validator-123'
      });
      expect(mockSend).toHaveBeenCalledWith({
        valid: true,
        data: {
          ticketId: 'ticket-123',
          eventId: 'event-123',
          validatedAt: mockValidation.validatedAt
        }
      });
    });
  });

  describe('getTicketType', () => {
    it('should return ticket type', async () => {
      mockRequest.params = { id: 'tt-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicketType = {
        id: 'tt-123',
        name: 'VIP',
        event_id: 'event-1',
        price: 100,
        quantity: 50,
        available_quantity: 50,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      (mockTicketService.getTicketType as jest.Mock).mockResolvedValue(mockTicketType);

      await controller.getTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.getTicketType).toHaveBeenCalledWith('tt-123', 'tenant-456');
      // Serialized to camelCase
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'tt-123',
          name: 'VIP',
          eventId: 'event-1'
        })
      });
    });

    it('should return 404 if ticket type not found', async () => {
      mockRequest.params = { id: 'tt-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      (mockTicketService.getTicketType as jest.Mock).mockResolvedValue(null);

      await controller.getTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Ticket type not found' });
    });
  });

  describe('updateTicketType', () => {
    it('should update ticket type and invalidate cache', async () => {
      mockRequest.params = { id: 'tt-123' };
      mockRequest.body = { name: 'Updated VIP', price: 150 };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTicketType = {
        id: 'tt-123',
        event_id: 'event-123',
        name: 'Updated VIP',
        price: 150,
        quantity: 50,
        available_quantity: 50,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      (mockTicketService.updateTicketType as jest.Mock).mockResolvedValue(mockTicketType);
      (cache.delete as jest.Mock).mockResolvedValue(true);

      await controller.updateTicketType(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.updateTicketType).toHaveBeenCalledWith(
        'tt-123',
        { name: 'Updated VIP', price: 150 },
        'tenant-456'
      );
      expect(cache.delete).toHaveBeenCalledWith([
        'ticket-types:event-123:tenant-456',
        'event:event-123:availability'
      ]);
      // Serialized to camelCase
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 'tt-123',
          eventId: 'event-123',
          name: 'Updated VIP',
          price: 150
        })
      });
    });
  });

  describe('getCurrentUserTickets', () => {
    it('should return current user tickets', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      const mockTickets = [
        { id: 'ticket-1', user_id: 'user-123', event_id: 'event-1', status: 'active', created_at: new Date(), updated_at: new Date() },
        { id: 'ticket-2', user_id: 'user-123', event_id: 'event-1', status: 'active', created_at: new Date(), updated_at: new Date() }
      ];
      (mockTicketService.getUserTickets as jest.Mock).mockResolvedValue(mockTickets);

      await controller.getCurrentUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockTicketService.getUserTickets).toHaveBeenCalledWith('user-123', 'tenant-456');
      // Serialized for owner includes userId
      expect(mockSend).toHaveBeenCalledWith({
        success: true,
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'ticket-1', userId: 'user-123' }),
          expect.objectContaining({ id: 'ticket-2', userId: 'user-123' })
        ])
      });
    });

    it('should return 401 if user not authenticated', async () => {
      (mockRequest as any).user = null;

      await controller.getCurrentUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'User not authenticated' });
    });
  });

  describe('ticketController singleton', () => {
    it('should export a singleton instance', () => {
      expect(ticketController).toBeInstanceOf(TicketController);
    });
  });
});
