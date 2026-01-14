// =============================================================================
// TEST SUITE - orders.controller
// =============================================================================

import { FastifyRequest, FastifyReply } from 'fastify';
import { OrdersController } from '../../../src/controllers/orders.controller';
import { DatabaseService } from '../../../src/services/databaseService';

jest.mock('../../../src/services/databaseService');

describe('OrdersController', () => {
  let controller: OrdersController;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let mockPool: any;

  beforeEach(() => {
    controller = new OrdersController();
    
    mockRequest = {
      params: {},
      query: {},
      headers: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };

    mockPool = {
      query: jest.fn(),
    };

    (DatabaseService.getPool as jest.Mock).mockReturnValue(mockPool);

    jest.clearAllMocks();
  });

  describe('getOrderById()', () => {
    it('should return 400 if orderId missing', async () => {
      mockRequest.params = {};
      (mockRequest as any).user = { id: 'user-123' };

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Order ID is required' });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.params = { orderId: 'order-123' };

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return order with items and tickets', async () => {
      const mockOrder = {
        order_id: 'order-123',
        status: 'PAID',
        user_id: 'user-123',
        total_cents: 10000,
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(),
        payment_intent_id: 'pi_123',
      };

      const mockItems = [
        {
          id: 'item-1',
          ticket_type_id: 'type-1',
          quantity: 2,
          unit_price_cents: 5000,
          total_price_cents: 10000,
        },
      ];

      const mockTickets = [
        { id: 'ticket-1', mint_address: 'addr1', status: 'SOLD', user_id: 'user-123' },
      ];

      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockOrder] })
        .mockResolvedValueOnce({ rows: mockItems })
        .mockResolvedValueOnce({ rows: mockTickets });

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        orderId: 'order-123',
        status: 'PAID',
        totalCents: 10000,
        totalFormatted: '$100.00',
        items: expect.arrayContaining([
          expect.objectContaining({
            ticketTypeId: 'type-1',
            quantity: 2,
          }),
        ]),
        payment_intent_id: 'pi_123',
        tickets: expect.arrayContaining([
          expect.objectContaining({
            id: 'ticket-1',
            mint_address: 'addr1',
          }),
        ]),
        created_at: mockOrder.created_at,
        updated_at: mockOrder.updated_at,
        expires_at: mockOrder.expires_at,
      });
    });

    it('should return 404 if order not found', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };

      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Order not found' });
    });

    it('should handle database errors', async () => {
      mockRequest.params = { orderId: 'order-123' };
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.headers = { 'x-request-id': 'req-123' };

      mockPool.query.mockRejectedValue(new Error('Database error'));

      await controller.getOrderById(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Internal server error',
        requestId: 'req-123',
      });
    });
  });

  describe('getUserOrders()', () => {
    it('should return 401 if user not authenticated', async () => {
      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Authentication required' });
    });

    it('should return user orders', async () => {
      const mockOrders = [
        {
          order_id: 'order-1',
          status: 'PAID',
          total_cents: 10000,
          created_at: new Date(),
          updated_at: new Date(),
          event_name: 'Concert',
          event_id: 'event-1',
        },
      ];

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = { limit: 10, offset: 0 };

      mockPool.query.mockResolvedValue({ rows: mockOrders });

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        orders: expect.arrayContaining([
          expect.objectContaining({
            orderId: 'order-1',
            status: 'PAID',
            eventName: 'Concert',
          }),
        ]),
        pagination: {
          limit: 10,
          offset: 0,
          total: 1,
        },
      });
    });

    it('should filter by status', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = { status: 'PAID', limit: 10, offset: 0 };

      mockPool.query.mockResolvedValue({ rows: [] });

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND o.status = $2'),
        expect.arrayContaining(['user-123', 'PAID'])
      );
    });

    it('should handle pagination', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = { limit: 20, offset: 10 };

      mockPool.query.mockResolvedValue({ rows: [] });

      await controller.getUserOrders(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([20, 10])
      );
    });
  });

  describe('getUserTickets()', () => {
    it('should return 401 if user not authenticated', async () => {
      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });

    it('should return user tickets', async () => {
      const mockTickets = [
        {
          id: 'ticket-1',
          status: 'SOLD',
          mint_address: 'addr1',
          created_at: new Date(),
          event_name: 'Concert',
          event_id: 'event-1',
          start_date: new Date(),
          ticket_type: 'VIP',
          price_cents: 10000,
        },
      ];

      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = {};

      mockPool.query.mockResolvedValue({ rows: mockTickets });

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        tickets: expect.arrayContaining([
          expect.objectContaining({
            id: 'ticket-1',
            status: 'SOLD',
            mintAddress: 'addr1',
            eventName: 'Concert',
            ticketType: 'VIP',
            priceFormatted: '$100.00',
          }),
        ]),
      });
    });

    it('should filter by eventId', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = { eventId: 'event-123' };

      mockPool.query.mockResolvedValue({ rows: [] });

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND t.event_id = $2'),
        expect.arrayContaining(['user-123', 'event-123'])
      );
    });

    it('should filter by status', async () => {
      (mockRequest as any).user = { id: 'user-123' };
      mockRequest.query = { status: 'SOLD' };

      mockPool.query.mockResolvedValue({ rows: [] });

      await controller.getUserTickets(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND t.status = $2'),
        expect.arrayContaining(['user-123', 'SOLD'])
      );
    });
  });
});
