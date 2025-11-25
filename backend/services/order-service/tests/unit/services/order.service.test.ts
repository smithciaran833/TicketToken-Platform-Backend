import { OrderService } from '../../../src/services/order.service';
import { OrderStatus } from '../../../src/types/order.types';
import { Pool } from 'pg';

// Mock dependencies
jest.mock('../../../src/services/ticket.client');
jest.mock('../../../src/services/payment.client');
jest.mock('../../../src/services/event.client');
jest.mock('../../../src/events');
jest.mock('@tickettoken/shared', () => ({
  withLock: jest.fn((key, timeout, fn) => fn()),
  LockKeys: {
    orderConfirmation: jest.fn((id) => `order:confirmation:${id}`),
    orderCancellation: jest.fn((id) => `order:cancellation:${id}`),
    order: jest.fn((id) => `order:${id}`)
  }
}));

import { TicketClient } from '../../../src/services/ticket.client';
import { PaymentClient } from '../../../src/services/payment.client';
import { EventClient } from '../../../src/services/event.client';

describe('OrderService', () => {
  let orderService: OrderService;
  let mockPool: jest.Mocked<Pool>;
  let mockTicketClient: jest.Mocked<TicketClient>;
  let mockPaymentClient: jest.Mocked<PaymentClient>;
  let mockEventClient: jest.Mocked<EventClient>;

  beforeEach(() => {
    // Create mock pool
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    } as any;

    // Create service
    orderService = new OrderService(mockPool);

    // Get mocked clients
    mockTicketClient = (orderService as any).ticketClient;
    mockPaymentClient = (orderService as any).paymentClient;
    mockEventClient = (orderService as any).eventClient;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('should create an order successfully with valid data', async () => {
      // Arrange
      const request = {
        userId: 'user-123',
        eventId: 'event-456',
        currency: 'USD',
        idempotencyKey: 'idem-789',
        items: [
          {
            ticketTypeId: 'ticket-type-1',
            quantity: 2,
            unitPriceCents: 5000 // $50
          }
        ]
      };

      mockEventClient.getEvent = jest.fn().mockResolvedValue({ id: 'event-456' });
      mockTicketClient.checkAvailability = jest.fn().mockResolvedValue({
        'ticket-type-1': 10
      });
      mockTicketClient.getPrices = jest.fn().mockResolvedValue({
        'ticket-type-1': 5000
      });

      mockPool.query = jest.fn()
        .mockResolvedValueOnce({ // INSERT order
          rows: [{
            id: 'order-123',
            user_id: 'user-123',
            event_id: 'event-456',
            order_number: 'ORD-123',
            status: 'PENDING',
            subtotal_cents: 10000,
            platform_fee_cents: 500,
            processing_fee_cents: 320,
            tax_cents: 865,
            discount_cents: 0,
            total_cents: 11685,
            currency: 'USD',
            idempotency_key: 'idem-789',
            metadata: {},
            created_at: new Date(),
            updated_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ // INSERT order_items
          rows: [{
            id: 'item-1',
            order_id: 'order-123',
            ticket_type_id: 'ticket-type-1',
            quantity: 2,
            unit_price_cents: 5000,
            total_price_cents: 10000
          }]
        })
        .mockResolvedValueOnce({ // INSERT order_event - FIX: return proper structure
          rows: [{
            id: 'event-1',
            order_id: 'order-123',
            event_type: 'ORDER_CREATED',
            user_id: 'user-123',
            metadata: {},
            created_at: new Date()
          }]
        });

      // Act
      const result = await orderService.createOrder(request);

      // Assert
      expect(result.order).toBeDefined();
      expect(result.order.id).toBe('order-123');
      expect(result.order.status).toBe(OrderStatus.PENDING);
      expect(result.order.totalCents).toBe(11685);
      expect(result.items).toHaveLength(1);
      expect(mockEventClient.getEvent).toHaveBeenCalledWith('event-456');
      expect(mockTicketClient.checkAvailability).toHaveBeenCalled();
      expect(mockTicketClient.getPrices).toHaveBeenCalled();
    });

    it('should reject order with invalid price (price manipulation)', async () => {
      // Arrange
      const request = {
        userId: 'user-123',
        eventId: 'event-456',
        currency: 'USD',
        idempotencyKey: 'idem-789',
        items: [
          {
            ticketTypeId: 'ticket-type-1',
            quantity: 2,
            unitPriceCents: 1 // Trying to pay $0.01 instead of $50
          }
        ]
      };

      mockEventClient.getEvent = jest.fn().mockResolvedValue({ id: 'event-456' });
      mockTicketClient.checkAvailability = jest.fn().mockResolvedValue({
        'ticket-type-1': 10
      });
      mockTicketClient.getPrices = jest.fn().mockResolvedValue({
        'ticket-type-1': 5000 // Actual price is $50
      });

      // Act & Assert
      await expect(orderService.createOrder(request))
        .rejects
        .toThrow(/Invalid price for ticket type/);

      expect(mockTicketClient.getPrices).toHaveBeenCalled();
    });

    it('should reject order when tickets are not available', async () => {
      // Arrange
      const request = {
        userId: 'user-123',
        eventId: 'event-456',
        currency: 'USD',
        idempotencyKey: 'idem-789',
        items: [
          {
            ticketTypeId: 'ticket-type-1',
            quantity: 5,
            unitPriceCents: 5000
          }
        ]
      };

      mockEventClient.getEvent = jest.fn().mockResolvedValue({ id: 'event-456' });
      mockTicketClient.checkAvailability = jest.fn().mockResolvedValue({
        'ticket-type-1': 2 // Only 2 available, but requesting 5
      });

      // Act & Assert
      await expect(orderService.createOrder(request))
        .rejects
        .toThrow(/Insufficient tickets/);

      expect(mockTicketClient.checkAvailability).toHaveBeenCalled();
    });

    it('should reject order when event does not exist', async () => {
      // Arrange
      const request = {
        userId: 'user-123',
        eventId: 'non-existent-event',
        currency: 'USD',
        idempotencyKey: 'idem-789',
        items: [
          {
            ticketTypeId: 'ticket-type-1',
            quantity: 2,
            unitPriceCents: 5000
          }
        ]
      };

      mockEventClient.getEvent = jest.fn().mockResolvedValue(null);

      // Act & Assert
      await expect(orderService.createOrder(request))
        .rejects
        .toThrow('Event not found');

      expect(mockEventClient.getEvent).toHaveBeenCalledWith('non-existent-event');
    });
  });

  describe('reserveOrder', () => {
    it('should reserve an order and create payment intent', async () => {
      // Arrange
      const request = {
        orderId: 'order-123',
        userId: 'user-123'
      };

      const mockOrder = {
        id: 'order-123',
        user_id: 'user-123',
        status: 'PENDING',
        total_cents: 10000,
        currency: 'USD'
      };

      const mockItems = [{
        id: 'item-1',
        ticket_type_id: 'ticket-type-1',
        quantity: 2
      }];

      mockPool.query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockOrder] }) // findById
        .mockResolvedValueOnce({ rows: mockItems }) // findByOrderId
        .mockResolvedValueOnce({ // update order
          rows: [{
            ...mockOrder,
            status: 'RESERVED',
            payment_intent_id: 'pi_123',
            expires_at: new Date(Date.now() + 30 * 60 * 1000)
          }]
        })
        .mockResolvedValueOnce({ // insert order_event - FIX
          rows: [{
            id: 'event-1',
            order_id: 'order-123',
            event_type: 'TICKETS_RESERVED',
            metadata: {},
            created_at: new Date()
          }]
        });

      mockTicketClient.reserveTickets = jest.fn().mockResolvedValue(true);
      mockPaymentClient.createPaymentIntent = jest.fn().mockResolvedValue({
        paymentIntentId: 'pi_123',
        clientSecret: 'cs_123'
      });

      // Act
      const result = await orderService.reserveOrder(request);

      // Assert
      expect(result.order.status).toBe(OrderStatus.RESERVED);
      expect(result.paymentIntent.paymentIntentId).toBe('pi_123');
      expect(mockTicketClient.reserveTickets).toHaveBeenCalled();
      expect(mockPaymentClient.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          amountCents: 10000,
          currency: 'USD'
        })
      );
    });

    it('should not reserve an order that is not in PENDING status', async () => {
      // Arrange
      const request = {
        orderId: 'order-123',
        userId: 'user-123'
      };

      const mockOrder = {
        id: 'order-123',
        status: 'COMPLETED' // Already completed
      };

      mockPool.query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockOrder] });

      // Act & Assert
      await expect(orderService.reserveOrder(request))
        .rejects
        .toThrow(/Cannot reserve order in COMPLETED status/);
    });
  });

  describe('confirmOrder', () => {
    it('should confirm an order after successful payment', async () => {
      // Arrange
      const request = {
        orderId: 'order-123',
        paymentIntentId: 'pi_123'
      };

      const mockOrder = {
        id: 'order-123',
        status: 'RESERVED',
        payment_intent_id: 'pi_123'
      };

      const mockItems = [{
        id: 'item-1',
        ticket_type_id: 'ticket-type-1',
        quantity: 2
      }];

      mockPool.query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockOrder] }) // findById
        .mockResolvedValueOnce({ // update order
          rows: [{
            ...mockOrder,
            status: 'CONFIRMED',
            confirmed_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ // insert order_event - FIX
          rows: [{
            id: 'event-1',
            order_id: 'order-123',
            event_type: 'PAYMENT_CONFIRMED',
            metadata: {},
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: mockItems }); // findByOrderId

      mockPaymentClient.confirmPayment = jest.fn().mockResolvedValue(true);
      mockTicketClient.confirmAllocation = jest.fn().mockResolvedValue(true);

      // Act
      const result = await orderService.confirmOrder(request);

      // Assert
      expect(result.status).toBe(OrderStatus.CONFIRMED);
      expect(mockPaymentClient.confirmPayment).toHaveBeenCalledWith('pi_123');
      expect(mockTicketClient.confirmAllocation).toHaveBeenCalledWith('order-123');
    });

    it('should use distributed lock during confirmation', async () => {
      // Arrange
      const request = {
        orderId: 'order-123',
        paymentIntentId: 'pi_123'
      };

      const mockOrder = {
        id: 'order-123',
        status: 'RESERVED'
      };

      mockPool.query = jest.fn().mockResolvedValue({ rows: [mockOrder] });

      // Act
      try {
        await orderService.confirmOrder(request);
      } catch (e) {
        // Expected to fail due to incomplete mocking
      }

      // Assert
      const { withLock } = require('@tickettoken/shared');
      expect(withLock).toHaveBeenCalled();
    });
  });

  describe('cancelOrder', () => {
    it('should cancel a PENDING order and release tickets', async () => {
      // Arrange
      const request = {
        orderId: 'order-123',
        userId: 'user-123',
        reason: 'Customer request'
      };

      const mockOrder = {
        id: 'order-123',
        status: 'PENDING'
      };

      const mockItems = [{
        id: 'item-1',
        ticket_type_id: 'ticket-type-1',
        quantity: 2
      }];

      mockPool.query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockOrder] }) // findById
        .mockResolvedValueOnce({ // update order
          rows: [{
            ...mockOrder,
            status: 'CANCELLED',
            cancelled_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ // insert order_event - FIX
          rows: [{
            id: 'event-1',
            order_id: 'order-123',
            event_type: 'ORDER_CANCELLED',
            metadata: {},
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: mockItems }); // findByOrderId

      mockTicketClient.releaseTickets = jest.fn().mockResolvedValue(true);

      // Act
      const result = await orderService.cancelOrder(request);

      // Assert
      expect(result.order.status).toBe(OrderStatus.CANCELLED);
      expect(mockTicketClient.releaseTickets).toHaveBeenCalledWith('order-123');
    });

    it('should cancel a CONFIRMED order and initiate refund', async () => {
      // Arrange
      const request = {
        orderId: 'order-123',
        userId: 'user-123',
        reason: 'Customer request'
      };

      const mockOrder = {
        id: 'order-123',
        status: 'CONFIRMED',
        payment_intent_id: 'pi_123',
        total_cents: 10000
      };

      const mockItems = [];

      mockPool.query = jest.fn()
        .mockResolvedValueOnce({ rows: [mockOrder] }) // findById
        .mockResolvedValueOnce({ // insert refund
          rows: [{
            id: 'refund-123',
            refund_id: 'ref_123'
          }]
        })
        .mockResolvedValueOnce({ // update order
          rows: [{
            ...mockOrder,
            status: 'CANCELLED'
          }]
        })
        .mockResolvedValueOnce({ // insert order_event - FIX
          rows: [{
            id: 'event-1',
            order_id: 'order-123',
            event_type: 'ORDER_CANCELLED',
            metadata: {},
            created_at: new Date()
          }]
        })
        .mockResolvedValueOnce({ rows: mockItems }); // findByOrderId

      mockTicketClient.releaseTickets = jest.fn().mockResolvedValue(true);
      mockPaymentClient.initiateRefund = jest.fn().mockResolvedValue({
        refundId: 'ref_123'
      });

      // Act
      const result = await orderService.cancelOrder(request);

      // Assert
      expect(result.order.status).toBe(OrderStatus.CANCELLED);
      expect(result.refund).toBeDefined();
      expect(mockPaymentClient.initiateRefund).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'order-123',
          paymentIntentId: 'pi_123',
          amountCents: 10000
        })
      );
    });
  });
});
