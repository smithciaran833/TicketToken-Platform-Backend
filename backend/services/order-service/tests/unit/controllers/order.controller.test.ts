import { FastifyRequest, FastifyReply } from 'fastify';
import { OrderController } from '../../../src/controllers/order.controller';
import { OrderService } from '../../../src/services/order.service';
import { auditService } from '@tickettoken/shared';

// Mock dependencies
jest.mock('../../../src/services/order.service');
jest.mock('../../../src/config/database');
jest.mock('@tickettoken/shared');

describe('OrderController', () => {
  let controller: OrderController;
  let mockOrderService: jest.Mocked<OrderService>;
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;
  let statusMock: jest.Mock;
  let sendMock: jest.Mock;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup reply mocks
    sendMock = jest.fn().mockReturnThis();
    statusMock = jest.fn().mockReturnValue({ send: sendMock });

    mockReply = {
      status: statusMock,
      send: sendMock,
    };

    // Setup basic request mock
    mockRequest = {
      user: {
        id: 'user-123',
        role: 'customer',
      },
      tenantId: 'tenant-123',
      ip: '192.168.1.1',
      headers: {
        'user-agent': 'test-agent',
      },
      body: {},
      params: {},
      query: {},
    };

    // Create controller instance
    controller = new OrderController();
    mockOrderService = (controller as any).orderService as jest.Mocked<OrderService>;
  });

  describe('createOrder', () => {
    const validOrderData = {
      eventId: 'event-123',
      items: [
        {
          ticketTypeId: 'ticket-type-123',
          quantity: 2,
          pricePerTicketCents: 5000,
        },
      ],
    };

    describe('Success Cases', () => {
      it('should create order with valid data', async () => {
        const mockOrder = {
          id: 'order-123',
          orderNumber: 'ORD-001',
          status: 'pending',
          totalCents: 10000,
          currency: 'USD',
          createdAt: new Date(),
        };

        const mockItems = [
          {
            id: 'item-123',
            ticketTypeId: 'ticket-type-123',
            quantity: 2,
            pricePerTicketCents: 5000,
          },
        ];

        mockRequest.body = validOrderData;
        mockOrderService.createOrder = jest.fn().mockResolvedValue({
          order: mockOrder,
          items: mockItems,
        });

        await controller.createOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.createOrder).toHaveBeenCalledWith('tenant-123', {
          ...validOrderData,
          userId: 'user-123',
        });
        expect(statusMock).toHaveBeenCalledWith(201);
        expect(sendMock).toHaveBeenCalledWith({
          orderId: 'order-123',
          orderNumber: 'ORD-001',
          status: 'pending',
          totalCents: 10000,
          currency: 'USD',
          items: mockItems,
          createdAt: mockOrder.createdAt,
        });
        expect(auditService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'create_order',
            success: true,
          })
        );
      });

      it('should create order with multiple ticket types', async () => {
        const multiTicketData = {
          eventId: 'event-123',
          items: [
            {
              ticketTypeId: 'vip-123',
              quantity: 1,
              pricePerTicketCents: 10000,
            },
            {
              ticketTypeId: 'standard-123',
              quantity: 3,
              pricePerTicketCents: 5000,
            },
          ],
        };

        mockRequest.body = multiTicketData;
        mockOrderService.createOrder = jest.fn().mockResolvedValue({
          order: {
            id: 'order-123',
            orderNumber: 'ORD-002',
            status: 'pending',
            totalCents: 25000,
            currency: 'USD',
            createdAt: new Date(),
          },
          items: multiTicketData.items.map((item, idx) => ({
            id: `item-${idx}`,
            ...item,
          })),
        });

        await controller.createOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(201);
        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            totalCents: 25000,
            items: expect.arrayContaining([
              expect.objectContaining({ ticketTypeId: 'vip-123' }),
              expect.objectContaining({ ticketTypeId: 'standard-123' }),
            ]),
          })
        );
      });

      it('should create order with optional fields (address, discount)', async () => {
        const orderWithOptionals = {
          ...validOrderData,
          billingAddress: {
            line1: '123 Main St',
            city: 'New York',
            state: 'NY',
            postalCode: '10001',
            country: 'US',
          },
          discountCode: 'SAVE10',
        };

        mockRequest.body = orderWithOptionals;
        mockOrderService.createOrder = jest.fn().mockResolvedValue({
          order: {
            id: 'order-123',
            orderNumber: 'ORD-003',
            status: 'pending',
            totalCents: 9000,
            currency: 'USD',
            createdAt: new Date(),
          },
          items: [{ id: 'item-123', ...validOrderData.items[0] }],
        });

        await controller.createOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.createOrder).toHaveBeenCalledWith(
          'tenant-123',
          expect.objectContaining({
            billingAddress: orderWithOptionals.billingAddress,
            discountCode: 'SAVE10',
          })
        );
      });
    });

    describe('Validation Failures', () => {
      it('should reject order without user authentication', async () => {
        mockRequest.user = undefined;

        await controller.createOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
        expect(mockOrderService.createOrder).not.toHaveBeenCalled();
      });

      it('should reject order without tenant ID', async () => {
        mockRequest.tenantId = undefined;

        await controller.createOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(sendMock).toHaveBeenCalledWith({ error: 'Tenant ID required' });
      });

      it('should handle service errors gracefully', async () => {
        mockRequest.body = validOrderData;
        mockOrderService.createOrder = jest
          .fn()
          .mockRejectedValue(new Error('Service error'));

        await controller.createOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Failed to create order',
        });
      });
    });
  });

  describe('getOrder', () => {
    describe('Success Cases', () => {
      it('should return order for owner', async () => {
        const mockOrder = {
          id: 'order-123',
          userId: 'user-123',
          orderNumber: 'ORD-001',
          status: 'confirmed',
          totalCents: 10000,
        };

        const mockItems = [
          { id: 'item-123', ticketTypeId: 'ticket-123', quantity: 2 },
        ];

        mockRequest.params = { orderId: 'order-123' };
        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: mockOrder,
          items: mockItems,
        });

        await controller.getOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.getOrder).toHaveBeenCalledWith(
          'order-123',
          'tenant-123'
        );
        expect(sendMock).toHaveBeenCalledWith({
          ...mockOrder,
          items: mockItems,
        });
      });

      it('should return order for admin even if not owner', async () => {
        mockRequest.user = { id: 'admin-123', role: 'admin' };
        mockRequest.params = { orderId: 'order-123' };

        const mockOrder = {
          id: 'order-123',
          userId: 'different-user',
          orderNumber: 'ORD-001',
          status: 'confirmed',
          totalCents: 10000,
        };

        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: mockOrder,
          items: [],
        });

        await controller.getOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(sendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'order-123',
            userId: 'different-user',
          })
        );
      });
    });

    describe('Validation Failures', () => {
      it('should return 401 for unauthenticated requests', async () => {
        mockRequest.user = undefined;
        mockRequest.params = { orderId: 'order-123' };

        await controller.getOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
      });

      it('should return 404 for non-existent order', async () => {
        mockRequest.params = { orderId: 'non-existent' };
        mockOrderService.getOrder = jest.fn().mockResolvedValue(null);

        await controller.getOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(sendMock).toHaveBeenCalledWith({ error: 'Order not found' });
      });

      it('should return 403 when non-owner tries to access order', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.user = { id: 'different-user', role: 'customer' };

        const mockOrder = {
          id: 'order-123',
          userId: 'original-user',
          status: 'confirmed',
        };

        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: mockOrder,
          items: [],
        });

        await controller.getOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(sendMock).toHaveBeenCalledWith({ error: 'Forbidden' });
      });

      it('should handle service errors', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockOrderService.getOrder = jest
          .fn()
          .mockRejectedValue(new Error('Database error'));

        await controller.getOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Failed to get order',
        });
      });
    });
  });

  describe('listOrders', () => {
    describe('Success Cases', () => {
      it('should list orders for authenticated user', async () => {
        const mockOrders = [
          { id: 'order-1', orderNumber: 'ORD-001', status: 'confirmed' },
          { id: 'order-2', orderNumber: 'ORD-002', status: 'pending' },
        ];

        mockOrderService.getUserOrders = jest.fn().mockResolvedValue(mockOrders);

        await controller.listOrders(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.getUserOrders).toHaveBeenCalledWith(
          'user-123',
          'tenant-123',
          50,
          0
        );
        expect(sendMock).toHaveBeenCalledWith({
          orders: mockOrders,
          pagination: { limit: 50, offset: 0, total: 2 },
        });
      });

      it('should respect pagination parameters', async () => {
        mockRequest.query = { limit: 10, offset: 20 };
        mockOrderService.getUserOrders = jest.fn().mockResolvedValue([]);

        await controller.listOrders(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.getUserOrders).toHaveBeenCalledWith(
          'user-123',
          'tenant-123',
          10,
          20
        );
      });

      it('should use default pagination when not provided', async () => {
        mockRequest.query = {};
        mockOrderService.getUserOrders = jest.fn().mockResolvedValue([]);

        await controller.listOrders(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.getUserOrders).toHaveBeenCalledWith(
          'user-123',
          'tenant-123',
          50,
          0
        );
      });
    });

    describe('Validation Failures', () => {
      it('should reject unauthenticated requests', async () => {
        mockRequest.user = undefined;

        await controller.listOrders(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(sendMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
      });

      it('should reject requests without tenant ID', async () => {
        mockRequest.tenantId = undefined;

        await controller.listOrders(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(400);
      });

      it('should handle service errors', async () => {
        mockOrderService.getUserOrders = jest
          .fn()
          .mockRejectedValue(new Error('Database error'));

        await controller.listOrders(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Failed to list orders',
        });
      });
    });
  });

  describe('reserveOrder', () => {
    describe('Success Cases', () => {
      it('should reserve order successfully', async () => {
        mockRequest.params = { orderId: 'order-123' };

        const mockResult = {
          order: {
            id: 'order-123',
            status: 'reserved',
            expiresAt: new Date(),
            paymentIntentId: 'pi_123',
          },
          paymentIntent: {
            clientSecret: 'secret_123',
          },
        };

        mockOrderService.reserveOrder = jest.fn().mockResolvedValue(mockResult);

        await controller.reserveOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.reserveOrder).toHaveBeenCalledWith('tenant-123', {
          orderId: 'order-123',
          userId: 'user-123',
        });
        expect(sendMock).toHaveBeenCalledWith({
          orderId: 'order-123',
          status: 'reserved',
          expiresAt: mockResult.order.expiresAt,
          clientSecret: 'secret_123',
          paymentIntentId: 'pi_123',
        });
      });
    });

    describe('Validation Failures', () => {
      it('should reject unauthenticated requests', async () => {
        mockRequest.user = undefined;
        mockRequest.params = { orderId: 'order-123' };

        await controller.reserveOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(401);
      });

      it('should handle reservation failures', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockOrderService.reserveOrder = jest
          .fn()
          .mockRejectedValue(new Error('Tickets unavailable'));

        await controller.reserveOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(sendMock).toHaveBeenCalledWith({
          error: 'Failed to reserve order',
        });
      });
    });
  });

  describe('cancelOrder', () => {
    describe('Success Cases', () => {
      it('should cancel order with reason', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.body = { reason: 'Changed mind' };

        const beforeResult = {
          order: { id: 'order-123', status: 'reserved' },
          items: [],
        };

        const afterResult = {
          order: {
            id: 'order-123',
            status: 'cancelled',
            cancelledAt: new Date(),
          },
          refund: {
            id: 'refund-123',
            refundAmountCents: 10000,
          },
        };

        mockOrderService.getOrder = jest.fn().mockResolvedValue(beforeResult);
        mockOrderService.cancelOrder = jest.fn().mockResolvedValue(afterResult);

        await controller.cancelOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.cancelOrder).toHaveBeenCalledWith('tenant-123', {
          orderId: 'order-123',
          userId: 'user-123',
          reason: 'Changed mind',
        });
        expect(sendMock).toHaveBeenCalledWith({
          orderId: 'order-123',
          status: 'cancelled',
          cancelledAt: afterResult.order.cancelledAt,
          refund: afterResult.refund,
        });
        expect(auditService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'cancel_order',
            success: true,
          })
        );
      });

      it('should use default reason if not provided', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.body = {};

        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: { id: 'order-123', status: 'reserved' },
          items: [],
        });

        mockOrderService.cancelOrder = jest.fn().mockResolvedValue({
          order: { id: 'order-123', status: 'cancelled', cancelledAt: new Date() },
          refund: null,
        });

        await controller.cancelOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(mockOrderService.cancelOrder).toHaveBeenCalledWith(
          'tenant-123',
          expect.objectContaining({
            reason: 'User cancelled',
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should log failed cancellation attempts', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.body = { reason: 'Test' };

        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: { id: 'order-123', status: 'confirmed' },
          items: [],
        });

        mockOrderService.cancelOrder = jest
          .fn()
          .mockRejectedValue(new Error('Cannot cancel confirmed order'));

        await controller.cancelOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(auditService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'cancel_order',
            success: false,
            errorMessage: 'Cannot cancel confirmed order',
          })
        );
      });
    });
  });

  describe('refundOrder', () => {
    describe('Success Cases', () => {
      it('should process full refund', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.body = { reason: 'Event cancelled' };

        const beforeResult = {
          order: {
            id: 'order-123',
            status: 'confirmed',
            totalCents: 10000,
          },
          items: [],
        };

        const afterResult = {
          order: {
            id: 'order-123',
            status: 'refunded',
          },
          refund: {
            id: 'refund-123',
            refundAmountCents: 10000,
          },
        };

        mockOrderService.getOrder = jest.fn().mockResolvedValue(beforeResult);
        mockOrderService.refundOrder = jest.fn().mockResolvedValue(afterResult);

        await controller.refundOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(sendMock).toHaveBeenCalledWith({
          orderId: 'order-123',
          status: 'refunded',
          refund: afterResult.refund,
        });
        expect(auditService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'refund_order',
            success: true,
            metadata: expect.objectContaining({
              refundAmount: 10000,
              refundPercentage: 100,
            }),
          })
        );
      });

      it('should process partial refund', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.body = {
          reason: 'Partial cancellation',
          amountCents: 5000,
        };

        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: { id: 'order-123', status: 'confirmed', totalCents: 10000 },
          items: [],
        });

        mockOrderService.refundOrder = jest.fn().mockResolvedValue({
          order: { id: 'order-123', status: 'partially_refunded' },
          refund: { id: 'refund-123', refundAmountCents: 5000 },
        });

        await controller.refundOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(auditService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            metadata: expect.objectContaining({
              partialRefund: true,
              refundPercentage: 50,
            }),
          })
        );
      });
    });

    describe('Error Handling', () => {
      it('should log failed refund attempts with critical flag', async () => {
        mockRequest.params = { orderId: 'order-123' };
        mockRequest.body = { reason: 'Test', amountCents: 5000 };

        mockOrderService.getOrder = jest.fn().mockResolvedValue({
          order: { id: 'order-123', status: 'confirmed', totalCents: 10000 },
          items: [],
        });

        mockOrderService.refundOrder = jest
          .fn()
          .mockRejectedValue(new Error('Payment provider error'));

        await controller.refundOrder(
          mockRequest as FastifyRequest,
          mockReply as FastifyReply
        );

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(auditService.logAction).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'refund_order',
            success: false,
            errorMessage: 'Payment provider error',
            metadata: expect.objectContaining({
              attemptedAmount: 5000,
            }),
          })
        );
      });
    });
  });

  describe('getOrderEvents', () => {
    it('should return events for order owner', async () => {
      mockRequest.params = { orderId: 'order-123' };

      const mockOrder = {
        id: 'order-123',
        userId: 'user-123',
      };

      const mockEvents = [
        { id: 'event-1', eventType: 'created', createdAt: new Date() },
        { id: 'event-2', eventType: 'reserved', createdAt: new Date() },
      ];

      mockOrderService.getOrder = jest.fn().mockResolvedValue({
        order: mockOrder,
        items: [],
      });

      mockOrderService.getOrderEvents = jest.fn().mockResolvedValue(mockEvents);

      await controller.getOrderEvents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.getOrderEvents).toHaveBeenCalledWith(
        'order-123',
        'tenant-123'
      );
      expect(sendMock).toHaveBeenCalledWith({ events: mockEvents });
    });

    it('should allow admin to view any order events', async () => {
      mockRequest.user = { id: 'admin-123', role: 'admin' };
      mockRequest.params = { orderId: 'order-123' };

      mockOrderService.getOrder = jest.fn().mockResolvedValue({
        order: { id: 'order-123', userId: 'different-user' },
        items: [],
      });

      mockOrderService.getOrderEvents = jest.fn().mockResolvedValue([]);

      await controller.getOrderEvents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(mockOrderService.getOrderEvents).toHaveBeenCalled();
    });

    it('should deny non-owner access to order events', async () => {
      mockRequest.params = { orderId: 'order-123' };
      mockRequest.user = { id: 'different-user', role: 'customer' };

      mockOrderService.getOrder = jest.fn().mockResolvedValue({
        order: { id: 'order-123', userId: 'owner-user' },
        items: [],
      });

      await controller.getOrderEvents(
        mockRequest as FastifyRequest,
        mockReply as FastifyReply
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(mockOrderService.getOrderEvents).not.toHaveBeenCalled();
    });
  });
});
