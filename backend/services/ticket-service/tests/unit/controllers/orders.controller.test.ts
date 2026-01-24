import { FastifyRequest, FastifyReply } from 'fastify';
import { OrdersController, ordersController } from '../../../src/controllers/orders.controller';
import { DatabaseService } from '../../../src/services/databaseService';
import { formatCents } from '@tickettoken/shared';
import { logger } from '../../../src/utils/logger';

// Mock dependencies
jest.mock('../../../src/services/databaseService');
jest.mock('@tickettoken/shared', () => ({
  formatCents: jest.fn((cents: number) => `$${(cents / 100).toFixed(2)}`)
}));
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn(() => ({
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

describe('OrdersController', () => {
  let controller: OrdersController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockSend: jest.Mock;
  let mockStatus: jest.Mock;
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new OrdersController();

    mockSend = jest.fn().mockReturnThis();
    mockStatus = jest.fn().mockReturnValue({ send: mockSend });

    mockReply = {
      send: mockSend,
      status: mockStatus
    };

    mockClient = {
      query: jest.fn()
    };

    mockRequest = {
      params: {},
      query: {},
      headers: { 'x-request-id': 'test-request-id' },
      user: { id: 'user-123', sub: 'user-123', tenant_id: 'tenant-456' }
    } as any;

    (DatabaseService.transaction as jest.Mock).mockImplementation(async (callback) => {
      return callback(mockClient);
    });
  });

  describe('getOrderById', () => {
    it('should return 400 if orderId is missing', async () => {
      mockRequest.params = {};
      (mockRequest as any).user = { id: 'user-123' };

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Order ID is required' });
    });

    it('should return 401 if user is not authenticated', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = null;

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 401 if user.id and user.sub are both missing', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { role: 'user' };

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return 404 if order is not found', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      (DatabaseService.transaction as jest.Mock).mockResolvedValue(null);

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Order not found' });
    });

    it('should return order with items successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      // Note: payment_intent_id is no longer selected from DB for security
      const mockOrder = {
        order_id: 'order-123',
        status: 'COMPLETED',
        user_id: 'user-123',
        total_cents: 5000,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        reservation_expires_at: new Date('2024-01-01T01:00:00')
      };

      const mockItems = [
        {
          id: 'item-1',
          order_id: 'order-123',
          ticket_type_id: 'tt-1',
          quantity: 2,
          unit_price_cents: 2000,
          total_price_cents: 4000
        },
        {
          id: 'item-2',
          order_id: 'order-123',
          ticket_type_id: 'tt-2',
          quantity: 1,
          unit_price_cents: 1000,
          total_price_cents: 1000
        }
      ];

      (DatabaseService.transaction as jest.Mock).mockResolvedValue({
        order: mockOrder,
        items: mockItems
      });

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // SECURITY: payment_intent_id is no longer exposed
      expect(mockSend).toHaveBeenCalledWith({
        orderId: 'order-123',
        status: 'COMPLETED',
        totalCents: 5000,
        totalFormatted: '$50.00',
        items: [
          {
            id: 'item-1',
            ticketTypeId: 'tt-1',
            quantity: 2,
            unitPriceCents: 2000,
            totalPriceCents: 4000,
            unitPriceFormatted: '$20.00',
            totalPriceFormatted: '$40.00'
          },
          {
            id: 'item-2',
            ticketTypeId: 'tt-2',
            quantity: 1,
            unitPriceCents: 1000,
            totalPriceCents: 1000,
            unitPriceFormatted: '$10.00',
            totalPriceFormatted: '$10.00'
          }
        ],
        createdAt: mockOrder.created_at,
        updatedAt: mockOrder.updated_at,
        expiresAt: mockOrder.reservation_expires_at
      });
    });

    it('should use user.sub when user.id is not available', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { sub: 'user-sub-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      (DatabaseService.transaction as jest.Mock).mockResolvedValue(null);

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(404);
    });

    it('should set tenant config when tenantId is provided', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';

      (DatabaseService.transaction as jest.Mock).mockImplementation(async (callback) => {
        const result = await callback(mockClient);
        return null;
      });

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        ['tenant-456']
      );
    });

    it('should handle database errors gracefully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };

      const dbError = new Error('Database connection failed');
      (DatabaseService.transaction as jest.Mock).mockRejectedValue(dbError);

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'test-request-id'
      });
    });

    it('should use tenant_id from user when tenantId is not on request', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123', tenant_id: 'user-tenant-789' };
      (mockRequest as any).tenantId = undefined;

      (DatabaseService.transaction as jest.Mock).mockImplementation(async (callback) => {
        await callback(mockClient);
        return null;
      });

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockClient.query).toHaveBeenCalledWith(
        `SELECT set_config('app.current_tenant_id', $1, true)`,
        ['user-tenant-789']
      );
    });
  });

  describe('getUserOrders', () => {
    it('should return 401 if user is not authenticated', async () => {
      (mockRequest as any).user = null;

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return user orders successfully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.query = { limit: '10', offset: '0' };

      const mockOrders = [
        {
          order_id: 'order-1',
          status: 'COMPLETED',
          total_cents: 5000,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-02'),
          event_name: 'Concert A',
          event_id: 'event-1'
        },
        {
          order_id: 'order-2',
          status: 'PENDING',
          total_cents: 3000,
          created_at: new Date('2024-01-03'),
          updated_at: new Date('2024-01-03'),
          event_name: 'Concert B',
          event_id: 'event-2'
        }
      ];

      (DatabaseService.transaction as jest.Mock).mockResolvedValue(mockOrders);

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        orders: [
          {
            orderId: 'order-1',
            status: 'COMPLETED',
            eventName: 'Concert A',
            eventId: 'event-1',
            totalCents: 5000,
            totalFormatted: '$50.00',
            createdAt: mockOrders[0].created_at,
            updatedAt: mockOrders[0].updated_at
          },
          {
            orderId: 'order-2',
            status: 'PENDING',
            eventName: 'Concert B',
            eventId: 'event-2',
            totalCents: 3000,
            totalFormatted: '$30.00',
            createdAt: mockOrders[1].created_at,
            updatedAt: mockOrders[1].updated_at
          }
        ],
        pagination: {
          limit: 10,
          offset: 0,
          total: 2
        }
      });
    });

    it('should filter orders by status when provided', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.query = { status: 'COMPLETED', limit: '10', offset: '0' };

      (DatabaseService.transaction as jest.Mock).mockResolvedValue([]);

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.transaction).toHaveBeenCalled();
    });

    it('should use default limit and offset values', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = {};

      (DatabaseService.transaction as jest.Mock).mockResolvedValue([]);

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        orders: [],
        pagination: {
          limit: 10,
          offset: 0,
          total: 0
        }
      });
    });

    it('should handle database errors gracefully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = {};

      const dbError = new Error('Database error');
      (DatabaseService.transaction as jest.Mock).mockRejectedValue(dbError);

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'test-request-id'
      });
    });
  });

  describe('getUserTickets', () => {
    it('should return 401 if user is not authenticated', async () => {
      (mockRequest as any).user = null;

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(401);
      expect(mockSend).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return user tickets successfully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.query = {};

      const mockTickets = [
        {
          id: 'ticket-1',
          status: 'ACTIVE',
          is_nft: 'mint-address-123',
          ticket_created_at: new Date('2024-01-01'),
          event_name: 'Concert A',
          event_id: 'event-1',
          event_date: new Date('2024-06-01'),
          ticket_type: 'VIP',
          price: 50.00
        }
      ];

      (DatabaseService.transaction as jest.Mock).mockResolvedValue(mockTickets);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockSend).toHaveBeenCalledWith({
        tickets: [
          {
            id: 'ticket-1',
            status: 'ACTIVE',
            mintAddress: 'mint-address-123',
            eventName: 'Concert A',
            eventId: 'event-1',
            eventDate: mockTickets[0].event_date,
            ticketType: 'VIP',
            priceCents: 5000,
            priceFormatted: '$50.00',
            createdAt: mockTickets[0].ticket_created_at
          }
        ]
      });
    });

    it('should filter tickets by eventId when provided', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.query = { eventId: 'event-123' };

      (DatabaseService.transaction as jest.Mock).mockResolvedValue([]);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.transaction).toHaveBeenCalled();
      expect(mockSend).toHaveBeenCalledWith({ tickets: [] });
    });

    it('should filter tickets by status when provided', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.query = { status: 'ACTIVE' };

      (DatabaseService.transaction as jest.Mock).mockResolvedValue([]);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.transaction).toHaveBeenCalled();
    });

    it('should filter by both eventId and status', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      (mockRequest as any).tenantId = 'tenant-456';
      mockRequest.query = { eventId: 'event-123', status: 'ACTIVE' };

      (DatabaseService.transaction as jest.Mock).mockResolvedValue([]);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(DatabaseService.transaction).toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = {};

      const dbError = new Error('Database error');
      (DatabaseService.transaction as jest.Mock).mockRejectedValue(dbError);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockStatus).toHaveBeenCalledWith(500);
      expect(mockSend).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'test-request-id'
      });
    });

    it('should handle decimal price conversion correctly', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = {};

      const mockTickets = [
        {
          id: 'ticket-1',
          status: 'ACTIVE',
          is_nft: null,
          ticket_created_at: new Date(),
          event_name: 'Event',
          event_id: 'event-1',
          event_date: new Date(),
          ticket_type: 'GA',
          price: 25.99
        }
      ];

      (DatabaseService.transaction as jest.Mock).mockResolvedValue(mockTickets);

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      const response = mockSend.mock.calls[0][0];
      expect(response.tickets[0].priceCents).toBe(2599);
    });
  });

  describe('ordersController singleton', () => {
    it('should export a singleton instance', () => {
      expect(ordersController).toBeInstanceOf(OrdersController);
    });
  });
});
