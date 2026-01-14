/**
 * Unit Tests for src/models/Order.ts
 */

import { OrderModel, IOrder } from '../../../src/models/Order';

describe('models/Order', () => {
  let mockPool: any;
  let orderModel: OrderModel;

  const mockOrderRow = {
    id: 'order-123',
    tenant_id: 'tenant-456',
    user_id: 'user-789',
    event_id: 'event-abc',
    order_number: 'ORD-12345678',
    status: 'PENDING',
    subtotal_cents: 10000,
    platform_fee_cents: 500,
    processing_fee_cents: 300,
    tax_cents: 800,
    discount_cents: 0,
    total_cents: 11600,
    currency: 'USD',
    ticket_quantity: 2,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };
    orderModel = new OrderModel(mockPool);
  });

  describe('create()', () => {
    it('inserts order and returns mapped result', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow] });

      const input: IOrder = {
        tenant_id: 'tenant-456',
        user_id: 'user-789',
        event_id: 'event-abc',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11600,
        ticket_quantity: 2,
      };

      const result = await orderModel.create(input);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO orders'),
        expect.any(Array)
      );
      expect(result.id).toBe('order-123');
    });

    it('generates order_number if not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow] });

      const input: IOrder = {
        tenant_id: 'tenant-456',
        user_id: 'user-789',
        event_id: 'event-abc',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11600,
        ticket_quantity: 2,
      };

      await orderModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[3]).toMatch(/^ORD-/);
    });

    it('uses default values for optional fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow] });

      const input: IOrder = {
        tenant_id: 'tenant-456',
        user_id: 'user-789',
        event_id: 'event-abc',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11600,
        ticket_quantity: 2,
      };

      await orderModel.create(input);

      const values = mockPool.query.mock.calls[0][1];
      expect(values[6]).toBe(0); // platform_fee_cents
      expect(values[11]).toBe('USD'); // currency
    });
  });

  describe('findById()', () => {
    it('returns order when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow] });

      const result = await orderModel.findById('order-123');

      expect(result?.id).toBe('order-123');
    });

    it('returns null when not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await orderModel.findById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId()', () => {
    it('returns array of user orders', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow] });

      const result = await orderModel.findByUserId('user-789');

      expect(result).toHaveLength(1);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-789']
      );
    });
  });

  describe('findByOrderNumber()', () => {
    it('returns order when found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow] });

      const result = await orderModel.findByOrderNumber('ORD-12345678');

      expect(result?.order_number).toBe('ORD-12345678');
    });
  });

  describe('findByEventId()', () => {
    it('returns array of event orders', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [mockOrderRow, { ...mockOrderRow, id: 'order-456' }] });

      const result = await orderModel.findByEventId('event-abc');

      expect(result).toHaveLength(2);
    });
  });

  describe('update()', () => {
    it('updates allowed fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ ...mockOrderRow, status: 'CONFIRMED' }] });

      const result = await orderModel.update('order-123', { status: 'CONFIRMED' });

      expect(result?.status).toBe('CONFIRMED');
    });

    it('throws error for no valid fields', async () => {
      await expect(
        orderModel.update('order-123', { id: 'new-id' } as any)
      ).rejects.toThrow('No valid fields to update');
    });
  });

  describe('delete()', () => {
    it('deletes order and returns true', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 1 });

      const result = await orderModel.delete('order-123');

      expect(result).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM orders'),
        ['order-123']
      );
    });

    it('returns false when order not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rowCount: 0 });

      const result = await orderModel.delete('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('mapRowToOrder()', () => {
    it('converts numeric fields to numbers', async () => {
      const rowWithStrings = {
        ...mockOrderRow,
        subtotal_cents: '10000',
        total_cents: '11600',
      };
      mockPool.query.mockResolvedValueOnce({ rows: [rowWithStrings] });

      const result = await orderModel.findById('order-123');

      expect(typeof result?.subtotal_cents).toBe('number');
      expect(typeof result?.total_cents).toBe('number');
    });
  });
});
