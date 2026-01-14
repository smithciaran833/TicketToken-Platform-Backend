/**
 * Unit Tests: Order Service
 * Tests order lifecycle management with circuit breakers and distributed locks
 */

// Mock dependencies at the top
const mockPool = {
  query: jest.fn(),
};

const mockOrderModel = {
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findByUserId: jest.fn(),
  findExpiredReservations: jest.fn(),
  findExpiringReservations: jest.fn(),
  findByEvent: jest.fn(),
  getTenantsWithReservedOrders: jest.fn(),
};

const mockOrderItemModel = {
  createBulk: jest.fn(),
  findByOrderId: jest.fn(),
};

const mockOrderEventModel = {
  create: jest.fn(),
  findByOrderId: jest.fn(),
};

const mockOrderRefundModel = {
  create: jest.fn(),
};

const mockTicketClient = {
  getEvent: jest.fn(),
  checkAvailability: jest.fn(),
  getPrices: jest.fn(),
  reserveTickets: jest.fn(),
  confirmAllocation: jest.fn(),
  releaseTickets: jest.fn(),
};

const mockPaymentClient = {
  createPaymentIntent: jest.fn(),
  confirmPayment: jest.fn(),
  initiateRefund: jest.fn(),
  cancelPaymentIntent: jest.fn(),
};

const mockEventClient = {
  getEvent: jest.fn(),
};

const mockEventPublisher = {
  publishOrderCreated: jest.fn(),
  publishOrderReserved: jest.fn(),
  publishOrderConfirmed: jest.fn(),
  publishOrderCancelled: jest.fn(),
  publishOrderExpired: jest.fn(),
  publishOrderRefunded: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockOrderMetrics = {
  orderCreationDuration: { startTimer: jest.fn().mockReturnValue(jest.fn()) },
  ordersCreated: { inc: jest.fn() },
  orderAmount: { observe: jest.fn() },
  orderStateTransitions: { inc: jest.fn() },
  activeReservations: { inc: jest.fn(), dec: jest.fn() },
  ordersCancelled: { inc: jest.fn() },
  ordersRefunded: { inc: jest.fn() },
};

const mockWithLock = jest.fn(async (_key, _timeout, fn) => await fn());

const mockCircuitBreaker = {
  execute: jest.fn(async (fn) => await fn()),
};

const mockRetry = jest.fn(async (fn) => await fn());

// Mock modules
jest.mock('../../../src/models/order.model', () => ({
  OrderModel: jest.fn().mockImplementation(() => mockOrderModel),
}));

jest.mock('../../../src/models/order-item.model', () => ({
  OrderItemModel: jest.fn().mockImplementation(() => mockOrderItemModel),
}));

jest.mock('../../../src/models/order-event.model', () => ({
  OrderEventModel: jest.fn().mockImplementation(() => mockOrderEventModel),
}));

jest.mock('../../../src/models/order-refund.model', () => ({
  OrderRefundModel: jest.fn().mockImplementation(() => mockOrderRefundModel),
}));

jest.mock('../../../src/services/ticket.client', () => ({
  TicketClient: jest.fn().mockImplementation(() => mockTicketClient),
}));

jest.mock('../../../src/services/payment.client', () => ({
  PaymentClient: jest.fn().mockImplementation(() => mockPaymentClient),
}));

jest.mock('../../../src/services/event.client', () => ({
  EventClient: jest.fn().mockImplementation(() => mockEventClient),
}));

jest.mock('../../../src/events', () => ({
  eventPublisher: mockEventPublisher,
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

jest.mock('../../../src/utils/metrics', () => ({
  orderMetrics: mockOrderMetrics,
}));

jest.mock('@tickettoken/shared', () => ({
  withLock: mockWithLock,
  LockKeys: {
    orderConfirmation: (id: string) => `order:confirmation:${id}`,
    orderCancellation: (id: string) => `order:cancellation:${id}`,
    order: (id: string) => `order:${id}`,
  },
}));

jest.mock('../../../src/utils/circuit-breaker', () => ({
  CircuitBreaker: jest.fn().mockImplementation(() => mockCircuitBreaker),
}));

jest.mock('../../../src/utils/retry', () => ({
  retry: mockRetry,
}));

import { OrderService } from '../../../src/services/order.service';
import { OrderStatus, RefundStatus, OrderEventType } from '../../../src/types/order.types';

describe('OrderService', () => {
  let service: OrderService;
  const tenantId = 'tenant-123';
  const userId = 'user-456';
  const orderId = 'order-789';
  const eventId = 'event-999';

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderService(mockPool as any);
  });

  describe('createOrder', () => {
    const mockEvent = { id: eventId, name: 'Test Event' };
    const ticketTypeId1 = 'ticket-type-1';
    const ticketTypeId2 = 'ticket-type-2';

    const createOrderRequest = {
      userId,
      eventId,
      items: [
        { ticketTypeId: ticketTypeId1, quantity: 2, unitPriceCents: 5000 },
        { ticketTypeId: ticketTypeId2, quantity: 1, unitPriceCents: 10000 },
      ],
      currency: 'USD',
      idempotencyKey: 'idemp-123',
      metadata: { source: 'web' },
    };

    const mockOrder = {
      id: orderId,
      tenantId,
      userId,
      eventId,
      orderNumber: 'ORD-123',
      status: OrderStatus.PENDING,
      subtotalCents: 20000,
      platformFeeCents: 1000,
      processingFeeCents: 610,
      taxCents: 1728,
      totalCents: 23338,
      currency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockItems = [
      { id: 'item-1', orderId, ticketTypeId: ticketTypeId1, quantity: 2, unitPriceCents: 5000, totalPriceCents: 10000 },
      { id: 'item-2', orderId, ticketTypeId: ticketTypeId2, quantity: 1, unitPriceCents: 10000, totalPriceCents: 10000 },
    ];

    beforeEach(() => {
      mockEventClient.getEvent.mockResolvedValue(mockEvent);
      mockTicketClient.checkAvailability.mockResolvedValue({ [ticketTypeId1]: 10, [ticketTypeId2]: 5 });
      mockTicketClient.getPrices.mockResolvedValue({ [ticketTypeId1]: 5000, [ticketTypeId2]: 10000 });
      mockOrderModel.create.mockResolvedValue(mockOrder);
      mockOrderItemModel.createBulk.mockResolvedValue(mockItems);
      mockOrderEventModel.create.mockResolvedValue({});
    });

    it('should create order successfully', async () => {
      const result = await service.createOrder(tenantId, createOrderRequest);

      expect(result.order).toEqual(mockOrder);
      expect(result.items).toEqual(mockItems);
      expect(mockEventClient.getEvent).toHaveBeenCalledWith(eventId);
      expect(mockTicketClient.checkAvailability).toHaveBeenCalled();
      expect(mockTicketClient.getPrices).toHaveBeenCalled();
    });

    it('should calculate fees correctly', async () => {
      await service.createOrder(tenantId, createOrderRequest);

      const createCall = mockOrderModel.create.mock.calls[0][0];
      expect(createCall.subtotalCents).toBe(20000); // 2*5000 + 1*10000
      expect(createCall.platformFeeCents).toBe(1000); // 5% of 20000
      expect(createCall.processingFeeCents).toBe(610); // 2.9% of 20000 + 30 cents
      expect(createCall.taxCents).toBe(1728); // 8% of (20000 + 1000 + 610)
      expect(createCall.totalCents).toBe(23338); // sum of all
    });

    it('should throw error if event not found', async () => {
      mockEventClient.getEvent.mockResolvedValue(null);

      await expect(service.createOrder(tenantId, createOrderRequest)).rejects.toThrow('Event not found');
    });

    it('should throw error if insufficient tickets', async () => {
      mockTicketClient.checkAvailability.mockResolvedValue({ [ticketTypeId1]: 1, [ticketTypeId2]: 5 });

      await expect(service.createOrder(tenantId, createOrderRequest)).rejects.toThrow('Insufficient tickets');
    });

    it('should detect price manipulation', async () => {
      mockTicketClient.getPrices.mockResolvedValue({ [ticketTypeId1]: 6000, [ticketTypeId2]: 10000 });

      await expect(service.createOrder(tenantId, createOrderRequest)).rejects.toThrow('Invalid price');
      expect(mockLogger.warn).toHaveBeenCalledWith('Price manipulation attempt detected', expect.any(Object));
    });

    it('should create order event', async () => {
      await service.createOrder(tenantId, createOrderRequest);

      expect(mockOrderEventModel.create).toHaveBeenCalledWith({
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_CREATED,
        userId,
        metadata: { items: createOrderRequest.items },
      });
    });

    it('should publish event', async () => {
      await service.createOrder(tenantId, createOrderRequest);

      expect(mockEventPublisher.publishOrderCreated).toHaveBeenCalled();
    });

    it('should record metrics', async () => {
      await service.createOrder(tenantId, createOrderRequest);

      expect(mockOrderMetrics.ordersCreated.inc).toHaveBeenCalledWith({ status: OrderStatus.PENDING });
      expect(mockOrderMetrics.orderAmount.observe).toHaveBeenCalled();
    });
  });

  describe('reserveOrder', () => {
    const mockOrder = {
      id: orderId,
      tenantId,
      userId,
      status: OrderStatus.PENDING,
      totalCents: 10000,
      currency: 'USD',
    };

    const mockItems = [{ id: 'item-1', orderId, ticketTypeId: 'ticket-1', quantity: 2 }];
    const mockPaymentIntent = { paymentIntentId: 'pi_123', clientSecret: 'secret_123' };
    const mockUpdatedOrder = { ...mockOrder, status: OrderStatus.RESERVED, paymentIntentId: 'pi_123' };

    beforeEach(() => {
      mockOrderModel.findById.mockResolvedValue(mockOrder);
      mockOrderItemModel.findByOrderId.mockResolvedValue(mockItems);
      mockTicketClient.reserveTickets.mockResolvedValue({ success: true });
      mockPaymentClient.createPaymentIntent.mockResolvedValue(mockPaymentIntent);
      mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
      mockOrderEventModel.create.mockResolvedValue({});
    });

    it('should reserve order successfully', async () => {
      const result = await service.reserveOrder(tenantId, { orderId, userId });

      expect(result.order.status).toBe(OrderStatus.RESERVED);
      expect(result.paymentIntent).toEqual(mockPaymentIntent);
    });

    it('should throw error if order not found', async () => {
      mockOrderModel.findById.mockResolvedValue(null);

      await expect(service.reserveOrder(tenantId, { orderId, userId })).rejects.toThrow('Order not found');
    });

    it('should throw error if not PENDING', async () => {
      mockOrderModel.findById.mockResolvedValue({ ...mockOrder, status: OrderStatus.CONFIRMED });

      await expect(service.reserveOrder(tenantId, { orderId, userId })).rejects.toThrow('Cannot reserve order');
    });

    it('should increment metrics', async () => {
      await service.reserveOrder(tenantId, { orderId, userId });

      expect(mockOrderMetrics.activeReservations.inc).toHaveBeenCalled();
    });
  });

  describe('confirmOrder', () => {
    const paymentIntentId = 'pi_123';
    const mockOrder = { id: orderId, tenantId, status: OrderStatus.RESERVED, paymentIntentId };
    const mockUpdatedOrder = { ...mockOrder, status: OrderStatus.CONFIRMED };

    beforeEach(() => {
      mockOrderModel.findById.mockResolvedValue(mockOrder);
      mockPaymentClient.confirmPayment.mockResolvedValue({ success: true });
      mockTicketClient.confirmAllocation.mockResolvedValue({ success: true });
      mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
      mockOrderItemModel.findByOrderId.mockResolvedValue([]);
      mockOrderEventModel.create.mockResolvedValue({});
    });

    it('should use distributed lock', async () => {
      await service.confirmOrder(tenantId, { orderId, paymentIntentId });

      expect(mockWithLock).toHaveBeenCalled();
    });

    it('should confirm order successfully', async () => {
      const result = await service.confirmOrder(tenantId, { orderId, paymentIntentId });

      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(mockPaymentClient.confirmPayment).toHaveBeenCalledWith(paymentIntentId);
      expect(mockTicketClient.confirmAllocation).toHaveBeenCalledWith(orderId);
    });

    it('should throw error if not RESERVED', async () => {
      mockOrderModel.findById.mockResolvedValue({ ...mockOrder, status: OrderStatus.PENDING });

      await expect(service.confirmOrder(tenantId, { orderId, paymentIntentId })).rejects.toThrow('Cannot confirm order');
    });

    it('should decrement active reservations', async () => {
      await service.confirmOrder(tenantId, { orderId, paymentIntentId });

      expect(mockOrderMetrics.activeReservations.dec).toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    beforeEach(() => {
      mockOrderItemModel.findByOrderId.mockResolvedValue([]);
      mockTicketClient.releaseTickets.mockResolvedValue({ success: true });
      mockOrderEventModel.create.mockResolvedValue({});
    });

    it('should use distributed lock', async () => {
      mockOrderModel.findById.mockResolvedValue({ id: orderId, tenantId, status: OrderStatus.PENDING });
      mockOrderModel.update.mockResolvedValue({ id: orderId, status: OrderStatus.CANCELLED });

      await service.cancelOrder(tenantId, { orderId, userId, reason: 'Customer request' });

      expect(mockWithLock).toHaveBeenCalled();
    });

    it('should cancel PENDING order without refund', async () => {
      mockOrderModel.findById.mockResolvedValue({ id: orderId, tenantId, status: OrderStatus.PENDING });
      mockOrderModel.update.mockResolvedValue({ id: orderId, status: OrderStatus.CANCELLED });

      const result = await service.cancelOrder(tenantId, { orderId, userId, reason: 'Test' });

      expect(result.order.status).toBe(OrderStatus.CANCELLED);
      expect(result.refund).toBeUndefined();
    });

    it('should cancel CONFIRMED order with refund', async () => {
      const mockRefund = { id: 'refund-1', orderId, refundAmountCents: 10000 };
      mockOrderModel.findById.mockResolvedValue({
        id: orderId,
        tenantId,
        status: OrderStatus.CONFIRMED,
        paymentIntentId: 'pi_123',
        totalCents: 10000,
      });
      mockOrderModel.update.mockResolvedValue({ id: orderId, status: OrderStatus.CANCELLED });
      mockPaymentClient.initiateRefund.mockResolvedValue({ refundId: 'ref_123' });
      mockOrderRefundModel.create.mockResolvedValue(mockRefund);

      const result = await service.cancelOrder(tenantId, { orderId, userId, reason: 'Test' });

      expect(result.refund).toEqual(mockRefund);
      expect(mockPaymentClient.initiateRefund).toHaveBeenCalled();
    });

    it('should throw error if invalid status', async () => {
      mockOrderModel.findById.mockResolvedValue({ id: orderId, status: OrderStatus.REFUNDED });

      await expect(service.cancelOrder(tenantId, { orderId, userId, reason: 'Test' })).rejects.toThrow('Cannot cancel order');
    });
  });

  describe('expireReservation', () => {
    const mockOrder = { id: orderId, tenantId, status: OrderStatus.RESERVED, paymentIntentId: 'pi_123' };
    const mockUpdatedOrder = { ...mockOrder, status: OrderStatus.EXPIRED };

    beforeEach(() => {
      mockOrderModel.findById.mockResolvedValue(mockOrder);
      mockTicketClient.releaseTickets.mockResolvedValue({ success: true });
      mockPaymentClient.cancelPaymentIntent.mockResolvedValue({ success: true });
      mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
      mockOrderItemModel.findByOrderId.mockResolvedValue([]);
      mockOrderEventModel.create.mockResolvedValue({});
    });

    it('should expire reservation successfully', async () => {
      const result = await service.expireReservation(orderId, tenantId, 'Timeout');

      expect(result.status).toBe(OrderStatus.EXPIRED);
    });

    it('should continue if ticket release fails', async () => {
      mockTicketClient.releaseTickets.mockRejectedValue(new Error('Failed'));

      const result = await service.expireReservation(orderId, tenantId, 'Timeout');

      expect(result.status).toBe(OrderStatus.EXPIRED);
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should throw error if not RESERVED', async () => {
      mockOrderModel.findById.mockResolvedValue({ ...mockOrder, status: OrderStatus.CONFIRMED });

      await expect(service.expireReservation(orderId, tenantId, 'Timeout')).rejects.toThrow('Order not in RESERVED status');
    });
  });

  describe('refundOrder', () => {
    const mockOrder = { id: orderId, tenantId, status: OrderStatus.CONFIRMED, paymentIntentId: 'pi_123' };
    const mockRefund = { refundId: 'ref-123', orderId, refundAmountCents: 10000 };
    const mockUpdatedOrder = { ...mockOrder, status: OrderStatus.REFUNDED };

    beforeEach(() => {
      mockOrderModel.findById.mockResolvedValue(mockOrder);
      mockPaymentClient.initiateRefund.mockResolvedValue({ refundId: 'stripe_ref_123' });
      mockOrderRefundModel.create.mockResolvedValue(mockRefund);
      mockOrderModel.update.mockResolvedValue(mockUpdatedOrder);
      mockOrderItemModel.findByOrderId.mockResolvedValue([]);
      mockOrderEventModel.create.mockResolvedValue({});
    });

    it('should use distributed lock', async () => {
      await service.refundOrder(tenantId, { orderId, userId, amountCents: 10000, reason: 'Test' });

      expect(mockWithLock).toHaveBeenCalled();
    });

    it('should refund order successfully', async () => {
      const result = await service.refundOrder(tenantId, { orderId, userId, amountCents: 10000, reason: 'Test' });

      expect(result.order.status).toBe(OrderStatus.REFUNDED);
      expect(result.refund).toEqual(mockRefund);
    });

    it('should throw error if not CONFIRMED', async () => {
      mockOrderModel.findById.mockResolvedValue({ ...mockOrder, status: OrderStatus.PENDING });

      await expect(
        service.refundOrder(tenantId, { orderId, userId, amountCents: 10000, reason: 'Test' })
      ).rejects.toThrow('Cannot refund order');
    });

    it('should throw error if no payment intent', async () => {
      mockOrderModel.findById.mockResolvedValue({ ...mockOrder, paymentIntentId: null });

      await expect(
        service.refundOrder(tenantId, { orderId, userId, amountCents: 10000, reason: 'Test' })
      ).rejects.toThrow('No payment intent found');
    });
  });

  describe('getOrder', () => {
    it('should return order with items', async () => {
      const mockOrder = { id: orderId, tenantId, status: OrderStatus.CONFIRMED };
      const mockItems = [{ id: 'item-1', orderId }];
      mockOrderModel.findById.mockResolvedValue(mockOrder);
      mockOrderItemModel.findByOrderId.mockResolvedValue(mockItems);

      const result = await service.getOrder(orderId, tenantId);

      expect(result?.order).toEqual(mockOrder);
      expect(result?.items).toEqual(mockItems);
    });

    it('should return null if not found', async () => {
      mockOrderModel.findById.mockResolvedValue(null);

      const result = await service.getOrder(orderId, tenantId);

      expect(result).toBeNull();
    });
  });

  describe('getUserOrders', () => {
    it('should return user orders with default pagination', async () => {
      const mockOrders = [{ id: 'order-1', userId }];
      mockOrderModel.findByUserId.mockResolvedValue(mockOrders);

      const result = await service.getUserOrders(userId, tenantId);

      expect(result).toEqual(mockOrders);
      expect(mockOrderModel.findByUserId).toHaveBeenCalledWith(userId, tenantId, 50, 0);
    });

    it('should respect custom pagination', async () => {
      mockOrderModel.findByUserId.mockResolvedValue([]);

      await service.getUserOrders(userId, tenantId, 20, 10);

      expect(mockOrderModel.findByUserId).toHaveBeenCalledWith(userId, tenantId, 20, 10);
    });
  });

  describe('getExpiredReservations', () => {
    it('should return expired reservations', async () => {
      const mockOrders = [{ id: 'order-1', status: OrderStatus.RESERVED }];
      mockOrderModel.findExpiredReservations.mockResolvedValue(mockOrders);

      const result = await service.getExpiredReservations(tenantId);

      expect(result).toEqual(mockOrders);
    });
  });

  describe('getExpiringReservations', () => {
    it('should return expiring reservations', async () => {
      const mockOrders = [{ id: 'order-1', status: OrderStatus.RESERVED }];
      mockOrderModel.findExpiringReservations.mockResolvedValue(mockOrders);

      const result = await service.getExpiringReservations(tenantId, 10, 50);

      expect(result).toEqual(mockOrders);
    });
  });

  describe('getOrderEvents', () => {
    it('should return order events', async () => {
      const mockEvents = [{ id: 'event-1', orderId, eventType: OrderEventType.ORDER_CREATED }];
      mockOrderEventModel.findByOrderId.mockResolvedValue(mockEvents);

      const result = await service.getOrderEvents(orderId, tenantId);

      expect(result).toEqual(mockEvents);
    });
  });

  describe('findOrdersByEvent', () => {
    it('should return orders for event', async () => {
      const mockOrders = [{ id: 'order-1', eventId }];
      mockOrderModel.findByEvent.mockResolvedValue(mockOrders);

      const result = await service.findOrdersByEvent(eventId, tenantId);

      expect(result).toEqual(mockOrders);
    });

    it('should filter by status', async () => {
      mockOrderModel.findByEvent.mockResolvedValue([]);

      await service.findOrdersByEvent(eventId, tenantId, [OrderStatus.CONFIRMED]);

      expect(mockOrderModel.findByEvent).toHaveBeenCalledWith(eventId, tenantId, [OrderStatus.CONFIRMED]);
    });
  });

  describe('getTenantsWithReservedOrders', () => {
    it('should return tenant IDs', async () => {
      const mockTenants = ['tenant-1', 'tenant-2'];
      mockOrderModel.getTenantsWithReservedOrders.mockResolvedValue(mockTenants);

      const result = await service.getTenantsWithReservedOrders();

      expect(result).toEqual(mockTenants);
    });
  });
});
