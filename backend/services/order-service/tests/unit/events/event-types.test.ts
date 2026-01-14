import { OrderEvents, OrderEventPayload, OrderEvent } from '../../../src/events/event-types';

describe('EventTypes', () => {
  describe('OrderEvents enum', () => {
    it('should have ORDER_CREATED event', () => {
      expect(OrderEvents.ORDER_CREATED).toBe('order.created');
    });

    it('should have ORDER_RESERVED event', () => {
      expect(OrderEvents.ORDER_RESERVED).toBe('order.reserved');
    });

    it('should have ORDER_CONFIRMED event', () => {
      expect(OrderEvents.ORDER_CONFIRMED).toBe('order.confirmed');
    });

    it('should have ORDER_CANCELLED event', () => {
      expect(OrderEvents.ORDER_CANCELLED).toBe('order.cancelled');
    });

    it('should have ORDER_EXPIRED event', () => {
      expect(OrderEvents.ORDER_EXPIRED).toBe('order.expired');
    });

    it('should have ORDER_REFUNDED event', () => {
      expect(OrderEvents.ORDER_REFUNDED).toBe('order.refunded');
    });

    it('should have ORDER_FAILED event', () => {
      expect(OrderEvents.ORDER_FAILED).toBe('order.failed');
    });

    it('should have exactly 7 event types', () => {
      const eventValues = Object.values(OrderEvents);
      expect(eventValues).toHaveLength(7);
    });

    it('should use dot notation for event names', () => {
      Object.values(OrderEvents).forEach(eventName => {
        expect(eventName).toMatch(/^order\.\w+$/);
      });
    });
  });

  describe('OrderEventPayload interface', () => {
    it('should accept a valid payload', () => {
      const payload: OrderEventPayload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987e6543-e21b-12d3-a456-426614174001',
        eventId: '456e7890-e12b-12d3-a456-426614174002',
        orderNumber: 'ORD-2024-001',
        status: 'PENDING',
        totalCents: 10000,
        currency: 'USD',
        items: [
          {
            ticketTypeId: '789e0123-e45b-12d3-a456-426614174003',
            quantity: 2,
            unitPriceCents: 5000,
          },
        ],
        timestamp: new Date(),
      };

      expect(payload.orderId).toBeDefined();
      expect(payload.userId).toBeDefined();
      expect(payload.eventId).toBeDefined();
      expect(payload.orderNumber).toBeDefined();
      expect(payload.status).toBeDefined();
      expect(payload.totalCents).toBeDefined();
      expect(payload.currency).toBeDefined();
      expect(payload.items).toBeDefined();
      expect(payload.timestamp).toBeDefined();
    });

    it('should accept optional metadata', () => {
      const payload: OrderEventPayload = {
        orderId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '987e6543-e21b-12d3-a456-426614174001',
        eventId: '456e7890-e12b-12d3-a456-426614174002',
        orderNumber: 'ORD-2024-001',
        status: 'PENDING',
        totalCents: 10000,
        currency: 'USD',
        items: [],
        timestamp: new Date(),
        metadata: { source: 'web' },
      };

      expect(payload.metadata).toEqual({ source: 'web' });
    });
  });

  describe('OrderEvent interface', () => {
    it('should accept a valid order event', () => {
      const orderEvent: OrderEvent<OrderEventPayload> = {
        version: '1.0.0',
        type: OrderEvents.ORDER_CREATED,
        idempotencyKey: 'key-123',
        sequenceNumber: 1,
        aggregateId: '123e4567-e89b-12d3-a456-426614174000',
        payload: {
          orderId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '987e6543-e21b-12d3-a456-426614174001',
          eventId: '456e7890-e12b-12d3-a456-426614174002',
          orderNumber: 'ORD-2024-001',
          status: 'PENDING',
          totalCents: 10000,
          currency: 'USD',
          items: [],
          timestamp: new Date(),
        },
        timestamp: new Date(),
      };

      expect(orderEvent.version).toBe('1.0.0');
      expect(orderEvent.type).toBe(OrderEvents.ORDER_CREATED);
      expect(orderEvent.idempotencyKey).toBeDefined();
      expect(orderEvent.sequenceNumber).toBeDefined();
      expect(orderEvent.aggregateId).toBeDefined();
      expect(orderEvent.payload).toBeDefined();
      expect(orderEvent.timestamp).toBeDefined();
    });

    it('should accept optional metadata', () => {
      const orderEvent: OrderEvent = {
        version: '1.0.0',
        type: OrderEvents.ORDER_CREATED,
        idempotencyKey: 'key-123',
        sequenceNumber: 1,
        aggregateId: 'order-123',
        payload: {},
        timestamp: new Date(),
        metadata: { environment: 'production' },
      };

      expect(orderEvent.metadata).toEqual({ environment: 'production' });
    });

    it('should support generic payload types', () => {
      interface CustomPayload {
        customField: string;
      }

      const orderEvent: OrderEvent<CustomPayload> = {
        version: '1.0.0',
        type: OrderEvents.ORDER_CREATED,
        idempotencyKey: 'key-123',
        sequenceNumber: 1,
        aggregateId: 'order-123',
        payload: {
          customField: 'custom value',
        },
        timestamp: new Date(),
      };

      expect(orderEvent.payload.customField).toBe('custom value');
    });
  });
});
