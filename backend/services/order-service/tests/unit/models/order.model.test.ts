/**
 * Unit Tests: Order Model
 * Tests database operations for orders
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

import { OrderModel } from '../../../src/models/order.model';
import { OrderStatus } from '../../../src/types';

describe('OrderModel', () => {
  let model: OrderModel;
  const tenantId = 'tenant-123';
  const userId = 'user-456';
  const orderId = 'order-789';

  const sampleOrderRow = {
    id: orderId,
    tenant_id: tenantId,
    user_id: userId,
    event_id: 'event-abc',
    order_number: 'ORD-001',
    status: OrderStatus.CONFIRMED,
    subtotal_cents: '9000',
    platform_fee_cents: '500',
    processing_fee_cents: '300',
    tax_cents: '200',
    discount_cents: '0',
    total_cents: '10000',
    currency: 'USD',
    payment_intent_id: 'pi_123',
    idempotency_key: 'idem-key-123',
    expires_at: new Date('2024-12-31'),
    confirmed_at: new Date('2024-01-01'),
    cancelled_at: null,
    refunded_at: null,
    metadata: { source: 'web' },
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    model = new OrderModel(mockPool as any);
  });

  describe('create', () => {
    it('should create order successfully', async () => {
      const orderData = {
        tenantId,
        userId,
        eventId: 'event-abc',
        orderNumber: 'ORD-001',
        status: OrderStatus.PENDING,
        subtotalCents: 9000,
        platformFeeCents: 500,
        processingFeeCents: 300,
        taxCents: 200,
        discountCents: 0,
        totalCents: 10000,
        currency: 'USD',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.create(orderData);

      expect(result.id).toBe(orderId);
      expect(result.totalCents).toBe(10000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO orders'),
        expect.arrayContaining([tenantId, userId, 'event-abc'])
      );
    });

    it('should create order with idempotency key', async () => {
      const orderData = {
        tenantId,
        userId,
        eventId: 'event-abc',
        orderNumber: 'ORD-002',
        status: OrderStatus.PENDING,
        subtotalCents: 5000,
        platformFeeCents: 0,
        processingFeeCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5000,
        currency: 'USD',
        idempotencyKey: 'unique-key-123',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.create(orderData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['unique-key-123'])
      );
    });

    it('should create order with reservation expiry', async () => {
      const expiryDate = new Date('2024-12-31');
      const orderData = {
        tenantId,
        userId,
        eventId: 'event-abc',
        orderNumber: 'ORD-003',
        status: OrderStatus.RESERVED,
        subtotalCents: 5000,
        platformFeeCents: 0,
        processingFeeCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5000,
        currency: 'USD',
        reservationExpiresAt: expiryDate,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.create(orderData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expiryDate])
      );
    });

    it('should create order with metadata', async () => {
      const metadata = { source: 'mobile', campaign: 'summer' };
      const orderData = {
        tenantId,
        userId,
        eventId: 'event-abc',
        orderNumber: 'ORD-004',
        status: OrderStatus.PENDING,
        subtotalCents: 5000,
        platformFeeCents: 0,
        processingFeeCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5000,
        currency: 'USD',
        metadata,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.create(orderData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(metadata)])
      );
    });

    it('should handle database errors', async () => {
      const orderData = {
        tenantId,
        userId,
        eventId: 'event-abc',
        orderNumber: 'ORD-005',
        status: OrderStatus.PENDING,
        subtotalCents: 5000,
        platformFeeCents: 0,
        processingFeeCents: 0,
        taxCents: 0,
        discountCents: 0,
        totalCents: 5000,
        currency: 'USD',
      };

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(model.create(orderData)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find order by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.findById(orderId, tenantId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(orderId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND tenant_id = $2'),
        [orderId, tenantId]
      );
    });

    it('should return null if order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.findById('nonexistent', tenantId);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findById(orderId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [orderId, 'different-tenant']
      );
    });
  });

  describe('findByUserId', () => {
    it('should find orders by user ID with default pagination', async () => {
      const orders = [sampleOrderRow, { ...sampleOrderRow, id: 'order-2' }];
      mockQuery.mockResolvedValueOnce({ rows: orders });

      const result = await model.findByUserId(userId, tenantId);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1 AND tenant_id = $2'),
        [userId, tenantId, 50, 0]
      );
    });

    it('should find orders with custom pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByUserId(userId, tenantId, 10, 20);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [userId, tenantId, 10, 20]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByUserId(userId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });
  });

  describe('findByIdempotencyKey', () => {
    it('should find order by idempotency key', async () => {
      const idempotencyKey = 'idem-key-123';
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.findByIdempotencyKey(idempotencyKey, tenantId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(orderId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE idempotency_key = $1 AND tenant_id = $2'),
        [idempotencyKey, tenantId]
      );
    });

    it('should return null if not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.findByIdempotencyKey('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('findByPaymentIntentId', () => {
    it('should find order by payment intent ID', async () => {
      const paymentIntentId = 'pi_123';
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.findByPaymentIntentId(paymentIntentId, tenantId);

      expect(result).not.toBeNull();
      expect(result?.paymentIntentId).toBe(paymentIntentId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE payment_intent_id = $1 AND tenant_id = $2'),
        [paymentIntentId, tenantId]
      );
    });

    it('should return null if not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.findByPaymentIntentId('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('findExpiredReservations', () => {
    it('should find expired reservations', async () => {
      const expiredOrders = [
        { ...sampleOrderRow, status: OrderStatus.RESERVED },
        { ...sampleOrderRow, id: 'order-2', status: OrderStatus.RESERVED },
      ];
      mockQuery.mockResolvedValueOnce({ rows: expiredOrders });

      const result = await model.findExpiredReservations(tenantId);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1'),
        [tenantId, OrderStatus.RESERVED, 100]
      );
    });

    it('should filter by RESERVED status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findExpiredReservations(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        expect.arrayContaining([OrderStatus.RESERVED])
      );
    });

    it('should filter by expiry time', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findExpiredReservations(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at <= NOW()'),
        expect.any(Array)
      );
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findExpiredReservations(tenantId, 50);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $3'),
        [tenantId, OrderStatus.RESERVED, 50]
      );
    });
  });

  describe('findExpiringReservations', () => {
    it('should find reservations expiring soon', async () => {
      const expiringOrders = [{ ...sampleOrderRow, status: OrderStatus.RESERVED }];
      mockQuery.mockResolvedValueOnce({ rows: expiringOrders });

      const result = await model.findExpiringReservations(tenantId, 15);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at > NOW()'),
        [tenantId, OrderStatus.RESERVED, '15', 100]
      );
    });

    it('should use parameterized interval to prevent SQL injection', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findExpiringReservations(tenantId, 30);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("($3 || ' minutes')::INTERVAL"),
        expect.arrayContaining(['30'])
      );
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findExpiringReservations(tenantId, 15, 25);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [tenantId, OrderStatus.RESERVED, '15', 25]
      );
    });
  });

  describe('findByEvent', () => {
    const eventId = 'event-abc';

    it('should find orders by event ID', async () => {
      const orders = [sampleOrderRow, { ...sampleOrderRow, id: 'order-2' }];
      mockQuery.mockResolvedValueOnce({ rows: orders });

      const result = await model.findByEvent(eventId, tenantId);

      expect(result).toHaveLength(2);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE event_id = $1 AND tenant_id = $2'),
        [eventId, tenantId]
      );
    });

    it('should filter by status when provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByEvent(eventId, tenantId, [OrderStatus.CONFIRMED, OrderStatus.COMPLETED]);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND status = ANY($3)'),
        [eventId, tenantId, [OrderStatus.CONFIRMED, OrderStatus.COMPLETED]]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByEvent(eventId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });
  });

  describe('getTenantsWithReservedOrders', () => {
    it('should return distinct tenant IDs', async () => {
      const tenants = [{ tenant_id: 'tenant-1' }, { tenant_id: 'tenant-2' }];
      mockQuery.mockResolvedValueOnce({ rows: tenants });

      const result = await model.getTenantsWithReservedOrders();

      expect(result).toEqual(['tenant-1', 'tenant-2']);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT DISTINCT tenant_id'),
        [OrderStatus.RESERVED, 1000]
      );
    });

    it('should filter by RESERVED status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.getTenantsWithReservedOrders();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE status = $1'),
        expect.arrayContaining([OrderStatus.RESERVED])
      );
    });

    it('should respect limit parameter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.getTenantsWithReservedOrders(500);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [OrderStatus.RESERVED, 500]
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(model.getTenantsWithReservedOrders()).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update order status', async () => {
      const updatedRow = { ...sampleOrderRow, status: OrderStatus.COMPLETED };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await model.update(orderId, tenantId, { status: OrderStatus.COMPLETED });

      expect(result?.status).toBe(OrderStatus.COMPLETED);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [orderId, tenantId, OrderStatus.COMPLETED]
      );
    });

    it('should update payment intent ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { paymentIntentId: 'pi_new' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('payment_intent_id = $3'),
        [orderId, tenantId, 'pi_new']
      );
    });

    it('should update reservation expiry', async () => {
      const newExpiry = new Date('2025-01-01');
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { reservationExpiresAt: newExpiry });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('expires_at = $3'),
        [orderId, tenantId, newExpiry]
      );
    });

    it('should update confirmed timestamp', async () => {
      const confirmedAt = new Date();
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { confirmedAt });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('confirmed_at = $3'),
        [orderId, tenantId, confirmedAt]
      );
    });

    it('should update cancelled timestamp', async () => {
      const cancelledAt = new Date();
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { cancelledAt });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('cancelled_at = $3'),
        [orderId, tenantId, cancelledAt]
      );
    });

    it('should update refunded timestamp', async () => {
      const refundedAt = new Date();
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { refundedAt });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('refunded_at = $3'),
        [orderId, tenantId, refundedAt]
      );
    });

    it('should update metadata', async () => {
      const metadata = { updated: true };
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { metadata });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('metadata = $3'),
        [orderId, tenantId, JSON.stringify(metadata)]
      );
    });

    it('should update multiple fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, {
        status: OrderStatus.CONFIRMED,
        paymentIntentId: 'pi_123',
        confirmedAt: new Date(),
      });

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('status = $3');
      expect(query).toContain('payment_intent_id = $4');
      expect(query).toContain('confirmed_at = $5');
    });

    it('should always update updated_at', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      await model.update(orderId, tenantId, { status: OrderStatus.COMPLETED });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return existing order if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.update(orderId, tenantId, {});

      expect(result?.id).toBe(orderId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [orderId, tenantId]
      );
    });

    it('should return null if order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.update('nonexistent', tenantId, { status: OrderStatus.COMPLETED });

      expect(result).toBeNull();
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        model.update(orderId, tenantId, { status: OrderStatus.COMPLETED })
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should delete order', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await model.delete(orderId, tenantId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM orders'),
        [orderId, tenantId]
      );
    });

    it('should return false if order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await model.delete('nonexistent', tenantId);

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await model.delete(orderId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        [orderId, 'different-tenant']
      );
    });

    it('should handle null rowCount', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: null });

      const result = await model.delete(orderId, tenantId);

      expect(result).toBe(false);
    });
  });

  describe('mapToOrder', () => {
    it('should correctly parse integer fields', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.findById(orderId, tenantId);

      expect(result?.subtotalCents).toBe(9000);
      expect(result?.platformFeeCents).toBe(500);
      expect(result?.processingFeeCents).toBe(300);
      expect(result?.taxCents).toBe(200);
      expect(result?.discountCents).toBe(0);
      expect(result?.totalCents).toBe(10000);
    });

    it('should map all field names correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOrderRow] });

      const result = await model.findById(orderId, tenantId);

      expect(result).toMatchObject({
        id: sampleOrderRow.id,
        tenantId: sampleOrderRow.tenant_id,
        userId: sampleOrderRow.user_id,
        eventId: sampleOrderRow.event_id,
        orderNumber: sampleOrderRow.order_number,
        status: sampleOrderRow.status,
        currency: sampleOrderRow.currency,
        paymentIntentId: sampleOrderRow.payment_intent_id,
        idempotencyKey: sampleOrderRow.idempotency_key,
      });
    });
  });
});
