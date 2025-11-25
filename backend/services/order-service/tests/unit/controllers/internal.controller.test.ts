import { FastifyRequest, FastifyReply } from 'fastify';
import { InternalController } from '../../../src/controllers/internal.controller';
import { OrderService } from '../../../src/services/order.service';
import { OrderStatus } from '../../../src/types/order.types';

// Mock dependencies
jest.mock('../../../src/services/order.service');
jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({})),
}));

describe('InternalController', () => {
  let controller: InternalController;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockOrderService = {
      confirmOrder: jest.fn(),
      expireReservation: jest.fn(),
      getExpiringReservations: jest.fn(),
      findOrdersByEvent: jest.fn(),
      cancelOrder: jest.fn(),
    } as any;

    (OrderService as jest.Mock).mockImplementation(() => mockOrderService);

    controller = new InternalController();

    mockRequest = {
      params: {},
      body: {},
      query: {},
    };

    mockReply = {
      send: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('confirmOrder', () => {
    it('should confirm order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { paymentIntentId: 'pi_123' };

      const confirmedOrder = {
        id: 'order-123',
        status: OrderStatus.CONFIRMED,
        confirmedAt: new Date(),
      };

      mockOrderService.confirmOrder.mockResolvedValue(confirmedOrder as any);

      await controller.confirmOrder(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.confirmOrder).toHaveBeenCalledWith({
        orderId: 'order-123',
        paymentIntentId: 'pi_123',
      });

      expect(mockReply.send).toHaveBeenCalledWith({
        orderId: 'order-123',
        status: OrderStatus.CONFIRMED,
        confirmedAt: confirmedOrder.confirmedAt,
      });
    });

    it('should handle confirmation error', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { paymentIntentId: 'pi_123' };

      mockOrderService.confirmOrder.mockRejectedValue(new Error('Confirmation failed'));

      await controller.confirmOrder(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to confirm order',
      });
    });
  });

  describe('expireOrder', () => {
    it('should expire order successfully', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { reason: 'Payment timeout' };

      mockOrderService.expireReservation.mockResolvedValue(undefined);

      await controller.expireOrder(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.expireReservation).toHaveBeenCalledWith(
        'order-123',
        'Payment timeout'
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Order expired successfully',
      });
    });

    it('should handle expiration error', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.body = { reason: 'Payment timeout' };

      mockOrderService.expireReservation.mockRejectedValue(new Error('Expiration failed'));

      await controller.expireOrder(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to expire order',
      });
    });
  });

  describe('getExpiringOrders', () => {
    it('should get expiring orders with default params', async () => {
      mockRequest.query = {};

      const expiringOrders = [
        { id: 'order-1', expiresAt: new Date() },
        { id: 'order-2', expiresAt: new Date() },
      ];

      mockOrderService.getExpiringReservations.mockResolvedValue(expiringOrders as any);

      await controller.getExpiringOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.getExpiringReservations).toHaveBeenCalledWith(5, 100);
      expect(mockReply.send).toHaveBeenCalledWith({ orders: expiringOrders });
    });

    it('should get expiring orders with custom params', async () => {
      mockRequest.query = { minutes: '10', limit: '50' };

      const expiringOrders = [{ id: 'order-1', expiresAt: new Date() }];

      mockOrderService.getExpiringReservations.mockResolvedValue(expiringOrders as any);

      await controller.getExpiringOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.getExpiringReservations).toHaveBeenCalledWith(10, 50);
      expect(mockReply.send).toHaveBeenCalledWith({ orders: expiringOrders });
    });

    it('should handle fetch error', async () => {
      mockRequest.query = {};

      mockOrderService.getExpiringReservations.mockRejectedValue(
        new Error('Database error')
      );

      await controller.getExpiringOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to fetch expiring orders',
      });
    });
  });

  describe('bulkCancelOrders', () => {
    it('should return 400 if eventId is missing', async () => {
      mockRequest.body = { reason: 'Event cancelled' };

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'eventId and reason are required',
      });
    });

    it('should return 400 if reason is missing', async () => {
      mockRequest.body = { eventId: 'event-123' };

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'eventId and reason are required',
      });
    });

    it('should return success if no active orders found', async () => {
      mockRequest.body = { eventId: 'event-123', reason: 'Venue closed' };

      mockOrderService.findOrdersByEvent.mockResolvedValue([]);

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'No active orders found for event',
        results: {
          total: 0,
          succeeded: 0,
          failed: 0,
          errors: [],
        },
      });
    });

    it('should successfully cancel all orders', async () => {
      mockRequest.body = { eventId: 'event-123', reason: 'Venue closed' };

      const orders = [
        { id: 'order-1', orderNumber: 'ORD-001' },
        { id: 'order-2', orderNumber: 'ORD-002' },
        { id: 'order-3', orderNumber: 'ORD-003' },
      ];

      mockOrderService.findOrdersByEvent.mockResolvedValue(orders as any);
      mockOrderService.cancelOrder.mockResolvedValue(undefined);

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.findOrdersByEvent).toHaveBeenCalledWith(
        'event-123',
        [OrderStatus.PENDING, OrderStatus.RESERVED, OrderStatus.CONFIRMED]
      );

      expect(mockOrderService.cancelOrder).toHaveBeenCalledTimes(3);

      expect(mockReply.status).toHaveBeenCalledWith(200);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Bulk cancellation completed: 3 succeeded, 0 failed',
        results: {
          total: 3,
          succeeded: 3,
          failed: 0,
          errors: [],
        },
      });
    });

    it('should handle partial failures (207 status)', async () => {
      mockRequest.body = { eventId: 'event-123', reason: 'Venue closed' };

      const orders = [
        { id: 'order-1', orderNumber: 'ORD-001' },
        { id: 'order-2', orderNumber: 'ORD-002' },
        { id: 'order-3', orderNumber: 'ORD-003' },
      ];

      mockOrderService.findOrdersByEvent.mockResolvedValue(orders as any);
      
      mockOrderService.cancelOrder
        .mockResolvedValueOnce(undefined) // First order succeeds
        .mockRejectedValueOnce(new Error('Lock timeout')) // Second order fails
        .mockResolvedValueOnce(undefined); // Third order succeeds

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(207); // Multi-Status
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Bulk cancellation completed: 2 succeeded, 1 failed',
        results: {
          total: 3,
          succeeded: 2,
          failed: 1,
          errors: [
            {
              orderId: 'order-2',
              orderNumber: 'ORD-002',
              error: 'Lock timeout',
            },
          ],
        },
      });
    });

    it('should handle all failures (500 status)', async () => {
      mockRequest.body = { eventId: 'event-123', reason: 'Venue closed' };

      const orders = [
        { id: 'order-1', orderNumber: 'ORD-001' },
        { id: 'order-2', orderNumber: 'ORD-002' },
      ];

      mockOrderService.findOrdersByEvent.mockResolvedValue(orders as any);
      mockOrderService.cancelOrder.mockRejectedValue(new Error('Database error'));

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        message: 'Bulk cancellation completed: 0 succeeded, 2 failed',
        results: {
          total: 2,
          succeeded: 0,
          failed: 2,
          errors: expect.arrayContaining([
            expect.objectContaining({
              orderId: 'order-1',
              error: 'Database error',
            }),
            expect.objectContaining({
              orderId: 'order-2',
              error: 'Database error',
            }),
          ]),
        },
      });
    });

    it('should handle unexpected error during bulk operation', async () => {
      mockRequest.body = { eventId: 'event-123', reason: 'Venue closed' };

      mockOrderService.findOrdersByEvent.mockRejectedValue(
        new Error('Database connection lost')
      );

      await controller.bulkCancelOrders(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Failed to bulk cancel orders',
        message: 'Database connection lost',
      });
    });
  });
});
