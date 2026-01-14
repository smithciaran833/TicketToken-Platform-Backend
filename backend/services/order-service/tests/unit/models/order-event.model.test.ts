/**
 * Unit Tests: Order Event Model
 * Tests database operations for order events (audit log)
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { OrderEventModel } from '../../../src/models/order-event.model';
import { OrderEventType } from '../../../src/types';

describe('OrderEventModel', () => {
  let model: OrderEventModel;
  const tenantId = 'tenant-123';
  const orderId = 'order-789';
  const userId = 'user-456';
  const eventId = 'event-abc';

  const sampleEventRow = {
    id: eventId,
    tenant_id: tenantId,
    order_id: orderId,
    event_type: OrderEventType.ORDER_CREATED,
    user_id: userId,
    metadata: { source: 'web' },
    created_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    model = new OrderEventModel(mockPool as any);
  });

  describe('create', () => {
    it('should create order event successfully', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_CREATED,
        userId,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleEventRow] });

      const result = await model.create(eventData);

      expect(result.id).toBe(eventId);
      expect(result.eventType).toBe(OrderEventType.ORDER_CREATED);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO order_events'),
        [tenantId, orderId, OrderEventType.ORDER_CREATED, userId, JSON.stringify({})]
      );
    });

    it('should create event with metadata', async () => {
      const metadata = { amount: 10000, reason: 'test' };
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.PAYMENT_CONFIRMED,
        userId,
        metadata,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleEventRow] });

      await model.create(eventData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(metadata)])
      );
    });

    it('should create event without userId', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.RESERVATION_EXPIRED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleEventRow] });

      await model.create(eventData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [tenantId, orderId, OrderEventType.RESERVATION_EXPIRED, undefined, JSON.stringify({})]
      );
    });

    it('should create event with empty metadata if not provided', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_UPDATED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleEventRow] });

      await model.create(eventData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify({})])
      );
    });

    it('should handle ORDER_CREATED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_CREATED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.ORDER_CREATED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.ORDER_CREATED);
    });

    it('should handle ORDER_UPDATED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_UPDATED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.ORDER_UPDATED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.ORDER_UPDATED);
    });

    it('should handle TICKETS_RESERVED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.TICKETS_RESERVED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.TICKETS_RESERVED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.TICKETS_RESERVED);
    });

    it('should handle PAYMENT_CONFIRMED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.PAYMENT_CONFIRMED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.PAYMENT_CONFIRMED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.PAYMENT_CONFIRMED);
    });

    it('should handle ORDER_CONFIRMED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_CONFIRMED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.ORDER_CONFIRMED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.ORDER_CONFIRMED);
    });

    it('should handle ORDER_CANCELLED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_CANCELLED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.ORDER_CANCELLED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.ORDER_CANCELLED);
    });

    it('should handle RESERVATION_EXPIRED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.RESERVATION_EXPIRED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.RESERVATION_EXPIRED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.RESERVATION_EXPIRED);
    });

    it('should handle REFUND_REQUESTED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.REFUND_REQUESTED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.REFUND_REQUESTED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.REFUND_REQUESTED);
    });

    it('should handle REFUND_ISSUED event type', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.REFUND_ISSUED,
      };

      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, event_type: OrderEventType.REFUND_ISSUED }] });

      const result = await model.create(eventData);

      expect(result.eventType).toBe(OrderEventType.REFUND_ISSUED);
    });

    it('should handle database errors', async () => {
      const eventData = {
        orderId,
        tenantId,
        eventType: OrderEventType.ORDER_CREATED,
      };

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(model.create(eventData)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error creating order event',
        expect.any(Object)
      );
    });
  });

  describe('findByOrderId', () => {
    it('should find all events for an order', async () => {
      const events = [
        { ...sampleEventRow, id: 'event-1', event_type: OrderEventType.ORDER_CREATED },
        { ...sampleEventRow, id: 'event-2', event_type: OrderEventType.PAYMENT_CONFIRMED },
      ];

      mockQuery.mockResolvedValueOnce({ rows: events });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('event-1');
      expect(result[1].id).toBe('event-2');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE order_id = $1 AND tenant_id = $2'),
        [orderId, tenantId]
      );
    });

    it('should order by created_at ASC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByOrderId(orderId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at ASC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no events found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result).toEqual([]);
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByOrderId(orderId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [orderId, 'different-tenant']
      );
    });

    it('should return events in chronological order', async () => {
      const events = [
        { ...sampleEventRow, id: 'event-1', created_at: new Date('2024-01-01') },
        { ...sampleEventRow, id: 'event-2', created_at: new Date('2024-01-02') },
        { ...sampleEventRow, id: 'event-3', created_at: new Date('2024-01-03') },
      ];

      mockQuery.mockResolvedValueOnce({ rows: events });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0].createdAt).toEqual(new Date('2024-01-01'));
      expect(result[1].createdAt).toEqual(new Date('2024-01-02'));
      expect(result[2].createdAt).toEqual(new Date('2024-01-03'));
    });
  });

  describe('mapToOrderEvent', () => {
    it('should map all fields correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleEventRow] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0]).toMatchObject({
        id: sampleEventRow.id,
        tenantId: sampleEventRow.tenant_id,
        orderId: sampleEventRow.order_id,
        eventType: sampleEventRow.event_type,
        userId: sampleEventRow.user_id,
        metadata: sampleEventRow.metadata,
        createdAt: sampleEventRow.created_at,
      });
    });

    it('should convert snake_case to camelCase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleEventRow] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0]).toHaveProperty('tenantId');
      expect(result[0]).toHaveProperty('orderId');
      expect(result[0]).toHaveProperty('eventType');
      expect(result[0]).toHaveProperty('userId');
      expect(result[0]).toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('tenant_id');
      expect(result[0]).not.toHaveProperty('order_id');
      expect(result[0]).not.toHaveProperty('event_type');
      expect(result[0]).not.toHaveProperty('user_id');
    });

    it('should preserve metadata object', async () => {
      const metadata = { custom: 'data', nested: { value: 123 } };
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, metadata }] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0].metadata).toEqual(metadata);
    });

    it('should handle null userId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleEventRow, user_id: null }] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0].userId).toBeNull();
    });
  });
});
