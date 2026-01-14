/**
 * Unit Tests: Order Controller
 * Tests HTTP request handling for order operations
 */

const mockOrderService = {
  createOrder: jest.fn(),
  getOrder: jest.fn(),
  getUserOrders: jest.fn(),
  reserveOrder: jest.fn(),
  cancelOrder: jest.fn(),
  refundOrder: jest.fn(),
  getOrderEvents: jest.fn(),
};

const mockPartialRefundService = {
  processPartialRefund: jest.fn(),
  updateOrderTotals: jest.fn(),
  getRefundHistory: jest.fn(),
};

const mockOrderModificationService = {
  requestModification: jest.fn(),
  upgradeItem: jest.fn(),
  getOrderModifications: jest.fn(),
  getModification: jest.fn(),
};

const mockAuditService = {
  logAction: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

const mockPool = {};

jest.mock('../../../src/services/order.service', () => ({
  OrderService: jest.fn(() => mockOrderService),
}));

jest.mock('../../../src/services/partial-refund.service', () => ({
  partialRefundService: mockPartialRefundService,
}));

jest.mock('../../../src/services/order-modification.service', () => ({
  orderModificationService: mockOrderModificationService,
}));

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockPool),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

jest.mock('@tickettoken/shared', () => ({
  auditService: mockAuditService,
}));

import { OrderController } from '../../../src/controllers/order.controller';

describe('OrderController', () => {
  let controller: OrderController;
  let mockRequest: any;
  let mockReply: any;

  const tenantId = 'tenant-123';
  const userId = 'user-456';
  const orderId = 'order-789';

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OrderController();

    mockRequest = {
      user: { id: userId, role: 'user' },
      tenant: { tenantId },
      params: {},
      query: {},
      body: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-agent' },
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('createOrder', () => {
    it('should create order successfully', async () => {
      const orderData = {
        eventId: 'event-1',
        items: [{ ticketTypeId: 'ticket-1', quantity: 2 }],
      };

      const createdOrder = {
        order: {
          id: orderId,
          orderNumber: 'ORD-001',
          status: 'PENDING',
          totalCents: 10000,
          currency: 'USD',
          createdAt: new Date(),
        },
        items: [{ id: 'item-1', ticketTypeId: 'ticket-1', quantity: 2 }],
      };

      mockRequest.body = orderData;
      mockOrderService.createOrder.mockResolvedValue(createdOrder);

      await controller.createOrder(mockRequest, mockReply);

      expect(mockOrderService.createOrder).toHaveBeenCalledWith(tenantId, {
        ...orderData,
        userId,
      });
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'create_order', success: true })
      );
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ orderId, orderNumber: 'ORD-001' })
      );
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = undefined;

      await controller.createOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Unauthorized' });
    });

    it('should return 400 if tenant ID missing', async () => {
      mockRequest.tenant = {};

      await controller.createOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Tenant ID required' });
    });

    it('should return 500 on service error', async () => {
      mockRequest.body = { eventId: 'event-1', items: [] };
      mockOrderService.createOrder.mockRejectedValue(new Error('DB error'));

      await controller.createOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getOrder', () => {
    const order = {
      order: {
        id: orderId,
        userId,
        status: 'CONFIRMED',
        totalCents: 10000,
      },
      items: [{ id: 'item-1' }],
    };

    it('should return order for owner', async () => {
      mockRequest.params = { orderId };
      mockOrderService.getOrder.mockResolvedValue(order);

      await controller.getOrder(mockRequest, mockReply);

      expect(mockOrderService.getOrder).toHaveBeenCalledWith(orderId, tenantId);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ id: orderId })
      );
    });

    it('should return order for admin', async () => {
      mockRequest.params = { orderId };
      mockRequest.user.role = 'admin';
      const adminOrder = { ...order, order: { ...order.order, userId: 'different-user' } };
      mockOrderService.getOrder.mockResolvedValue(adminOrder);

      await controller.getOrder(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalled();
    });

    it('should return 403 if user does not own order', async () => {
      mockRequest.params = { orderId };
      const otherOrder = { ...order, order: { ...order.order, userId: 'other-user' } };
      mockOrderService.getOrder.mockResolvedValue(otherOrder);

      await controller.getOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Forbidden' });
    });

    it('should return 404 if order not found', async () => {
      mockRequest.params = { orderId };
      mockOrderService.getOrder.mockResolvedValue(null);

      await controller.getOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { orderId };

      await controller.getOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('listOrders', () => {
    it('should list user orders with default pagination', async () => {
      const orders = [{ id: 'order-1' }, { id: 'order-2' }];
      mockOrderService.getUserOrders.mockResolvedValue(orders);

      await controller.listOrders(mockRequest, mockReply);

      expect(mockOrderService.getUserOrders).toHaveBeenCalledWith(userId, tenantId, 50, 0);
      expect(mockReply.send).toHaveBeenCalledWith({
        orders,
        pagination: { limit: 50, offset: 0, total: 2 },
      });
    });

    it('should list orders with custom pagination', async () => {
      mockRequest.query = { limit: 10, offset: 20 };
      const orders = [{ id: 'order-1' }];
      mockOrderService.getUserOrders.mockResolvedValue(orders);

      await controller.listOrders(mockRequest, mockReply);

      expect(mockOrderService.getUserOrders).toHaveBeenCalledWith(userId, tenantId, 10, 20);
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = undefined;

      await controller.listOrders(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('reserveOrder', () => {
    it('should reserve order successfully', async () => {
      mockRequest.params = { orderId };
      const reservation = {
        order: { id: orderId, status: 'RESERVED', expiresAt: new Date(), paymentIntentId: 'pi_123' },
        paymentIntent: { clientSecret: 'secret_123' },
      };
      mockOrderService.reserveOrder.mockResolvedValue(reservation);

      await controller.reserveOrder(mockRequest, mockReply);

      expect(mockOrderService.reserveOrder).toHaveBeenCalledWith(tenantId, { orderId, userId });
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ clientSecret: 'secret_123' })
      );
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { orderId };

      await controller.reserveOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('cancelOrder', () => {
    it('should cancel order successfully', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = { reason: 'Changed my mind' };
      
      const beforeResult = { order: { status: 'CONFIRMED' } };
      const cancelResult = {
        order: { id: orderId, status: 'CANCELLED', cancelledAt: new Date() },
        refund: { id: 'refund-1', refundAmountCents: 10000 },
      };

      mockOrderService.getOrder.mockResolvedValue(beforeResult);
      mockOrderService.cancelOrder.mockResolvedValue(cancelResult);

      await controller.cancelOrder(mockRequest, mockReply);

      expect(mockOrderService.cancelOrder).toHaveBeenCalledWith(tenantId, {
        orderId,
        userId,
        reason: 'Changed my mind',
      });
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'cancel_order', success: true })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CANCELLED' })
      );
    });

    it('should use default reason if not provided', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = {};

      mockOrderService.getOrder.mockResolvedValue({ order: { status: 'CONFIRMED' } });
      mockOrderService.cancelOrder.mockResolvedValue({
        order: { id: orderId, status: 'CANCELLED' },
        refund: null,
      });

      await controller.cancelOrder(mockRequest, mockReply);

      expect(mockOrderService.cancelOrder).toHaveBeenCalledWith(
        tenantId,
        expect.objectContaining({ reason: 'User cancelled' })
      );
    });

    it('should log failed cancellation', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = {};
      mockOrderService.getOrder.mockRejectedValue(new Error('DB error'));

      await controller.cancelOrder(mockRequest, mockReply);

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('refundOrder', () => {
    it('should refund order successfully', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = { reason: 'Event cancelled' };

      const beforeResult = { order: { status: 'COMPLETED', totalCents: 10000 } };
      const refundResult = {
        order: { id: orderId, status: 'REFUNDED' },
        refund: { id: 'refund-1', refundAmountCents: 10000 },
      };

      mockOrderService.getOrder.mockResolvedValue(beforeResult);
      mockOrderService.refundOrder.mockResolvedValue(refundResult);

      await controller.refundOrder(mockRequest, mockReply);

      expect(mockOrderService.refundOrder).toHaveBeenCalledWith(tenantId, {
        orderId,
        reason: 'Event cancelled',
        userId,
      });
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'refund_order', success: true })
      );
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'REFUNDED' })
      );
    });

    it('should log failed refund attempt', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = { amountCents: 5000, reason: 'Partial' };
      mockOrderService.getOrder.mockRejectedValue(new Error('DB error'));

      await controller.refundOrder(mockRequest, mockReply);

      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, action: 'refund_order' })
      );
      expect(mockReply.status).toHaveBeenCalledWith(500);
    });
  });

  describe('getOrderEvents', () => {
    it('should return order events for owner', async () => {
      mockRequest.params = { orderId };
      const order = { order: { id: orderId, userId }, items: [] };
      const events = [{ id: 'event-1', type: 'CREATED' }];

      mockOrderService.getOrder.mockResolvedValue(order);
      mockOrderService.getOrderEvents.mockResolvedValue(events);

      await controller.getOrderEvents(mockRequest, mockReply);

      expect(mockOrderService.getOrderEvents).toHaveBeenCalledWith(orderId, tenantId);
      expect(mockReply.send).toHaveBeenCalledWith({ events });
    });

    it('should return 403 if user does not own order', async () => {
      mockRequest.params = { orderId };
      const order = { order: { id: orderId, userId: 'other-user' }, items: [] };

      mockOrderService.getOrder.mockResolvedValue(order);

      await controller.getOrderEvents(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 if order not found', async () => {
      mockRequest.params = { orderId };
      mockOrderService.getOrder.mockResolvedValue(null);

      await controller.getOrderEvents(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('partialRefundOrder', () => {
    it('should process partial refund successfully', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = {
        items: [{ orderItemId: 'item-1', quantity: 1 }],
        reason: 'Partial cancellation',
      };

      const refund = { id: 'refund-1', amountCents: 5000, refundedItems: [] };
      mockPartialRefundService.processPartialRefund.mockResolvedValue(refund);

      await controller.partialRefundOrder(mockRequest, mockReply);

      expect(mockPartialRefundService.processPartialRefund).toHaveBeenCalledWith({
        orderId,
        items: mockRequest.body.items,
        reason: 'Partial cancellation',
      });
      expect(mockPartialRefundService.updateOrderTotals).toHaveBeenCalledWith(orderId);
      expect(mockAuditService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'partial_refund_order' })
      );
      expect(mockReply.send).toHaveBeenCalledWith({ refund });
    });

    it('should return 401 if user not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.params = { orderId };

      await controller.partialRefundOrder(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getRefundHistory', () => {
    it('should return refund history for order owner', async () => {
      mockRequest.params = { orderId };
      const order = { order: { id: orderId, userId }, items: [] };
      const refunds = [{ id: 'refund-1' }, { id: 'refund-2' }];

      mockOrderService.getOrder.mockResolvedValue(order);
      mockPartialRefundService.getRefundHistory.mockResolvedValue(refunds);

      await controller.getRefundHistory(mockRequest, mockReply);

      expect(mockPartialRefundService.getRefundHistory).toHaveBeenCalledWith(orderId);
      expect(mockReply.send).toHaveBeenCalledWith({ refunds });
    });

    it('should return 403 if user does not own order', async () => {
      mockRequest.params = { orderId };
      const order = { order: { id: orderId, userId: 'other-user' }, items: [] };

      mockOrderService.getOrder.mockResolvedValue(order);

      await controller.getRefundHistory(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getRefund', () => {
    const refundId = 'refund-123';

    it('should return specific refund', async () => {
      mockRequest.params = { orderId, refundId };
      const order = { order: { id: orderId, userId }, items: [] };
      const refunds = [
        { id: refundId, amountCents: 5000 },
        { id: 'refund-2', amountCents: 3000 },
      ];

      mockOrderService.getOrder.mockResolvedValue(order);
      mockPartialRefundService.getRefundHistory.mockResolvedValue(refunds);

      await controller.getRefund(mockRequest, mockReply);

      expect(mockReply.send).toHaveBeenCalledWith({
        refund: { id: refundId, amountCents: 5000 },
      });
    });

    it('should return 404 if refund not found', async () => {
      mockRequest.params = { orderId, refundId: 'nonexistent' };
      const order = { order: { id: orderId, userId }, items: [] };
      const refunds = [{ id: 'other-refund', amountCents: 5000 }];

      mockOrderService.getOrder.mockResolvedValue(order);
      mockPartialRefundService.getRefundHistory.mockResolvedValue(refunds);

      await controller.getRefund(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Refund not found' });
    });
  });

  describe('requestModification', () => {
    it('should request modification successfully', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = {
        modificationType: 'UPGRADE_ITEM',
        originalItemId: 'item-1',
        newTicketTypeId: 'ticket-vip',
        reason: 'Upgrade to VIP',
      };

      const modification = { id: 'mod-1', status: 'PENDING' };
      mockOrderModificationService.requestModification.mockResolvedValue(modification);

      await controller.requestModification(mockRequest, mockReply);

      expect(mockOrderModificationService.requestModification).toHaveBeenCalledWith(
        tenantId,
        userId,
        { orderId, ...mockRequest.body }
      );
      expect(mockReply.send).toHaveBeenCalledWith({ modification });
    });
  });

  describe('upgradeOrderItem', () => {
    it('should upgrade order item successfully', async () => {
      mockRequest.params = { orderId };
      mockRequest.body = {
        originalItemId: 'item-1',
        newTicketTypeId: 'ticket-vip',
        reason: 'Upgrade',
      };

      const modification = { id: 'mod-1', modificationType: 'UPGRADE_ITEM' };
      mockOrderModificationService.upgradeItem.mockResolvedValue(modification);

      await controller.upgradeOrderItem(mockRequest, mockReply);

      expect(mockOrderModificationService.upgradeItem).toHaveBeenCalledWith(
        tenantId,
        userId,
        { orderId, ...mockRequest.body }
      );
      expect(mockReply.send).toHaveBeenCalledWith({ modification });
    });
  });

  describe('getOrderModifications', () => {
    it('should return modifications for order owner', async () => {
      mockRequest.params = { orderId };
      const order = { order: { id: orderId, userId }, items: [] };
      const modifications = [{ id: 'mod-1' }, { id: 'mod-2' }];

      mockOrderService.getOrder.mockResolvedValue(order);
      mockOrderModificationService.getOrderModifications.mockResolvedValue(modifications);

      await controller.getOrderModifications(mockRequest, mockReply);

      expect(mockOrderModificationService.getOrderModifications).toHaveBeenCalledWith(orderId);
      expect(mockReply.send).toHaveBeenCalledWith({ modifications });
    });

    it('should return 403 if user does not own order', async () => {
      mockRequest.params = { orderId };
      const order = { order: { id: orderId, userId: 'other-user' }, items: [] };

      mockOrderService.getOrder.mockResolvedValue(order);

      await controller.getOrderModifications(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
    });
  });

  describe('getModification', () => {
    const modificationId = 'mod-123';

    it('should return specific modification', async () => {
      mockRequest.params = { orderId, modificationId };
      const order = { order: { id: orderId, userId }, items: [] };
      const modification = { id: modificationId, status: 'COMPLETED' };

      mockOrderService.getOrder.mockResolvedValue(order);
      mockOrderModificationService.getModification.mockResolvedValue(modification);

      await controller.getModification(mockRequest, mockReply);

      expect(mockOrderModificationService.getModification).toHaveBeenCalledWith(modificationId);
      expect(mockReply.send).toHaveBeenCalledWith({ modification });
    });

    it('should return 404 if modification not found', async () => {
      mockRequest.params = { orderId, modificationId: 'nonexistent' };
      const order = { order: { id: orderId, userId }, items: [] };

      mockOrderService.getOrder.mockResolvedValue(order);
      mockOrderModificationService.getModification.mockResolvedValue(null);

      await controller.getModification(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith({ error: 'Modification not found' });
    });
  });
});
