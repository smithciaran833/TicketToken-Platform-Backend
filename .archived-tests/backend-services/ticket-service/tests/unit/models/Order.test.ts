// =============================================================================
// TEST SUITE - Order Model
// =============================================================================

import { Pool } from 'pg';
import { OrderModel, IOrder } from '../../../src/models/Order';

describe('OrderModel', () => {
  let model: OrderModel;
  let mockPool: jest.Mocked<Partial<Pool>>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    model = new OrderModel(mockPool as Pool);
  });

  describe('create()', () => {
    it('should create an order', async () => {
      const orderData: IOrder = {
        user_id: 'user-123',
        event_id: 'event-123',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11000,
        ticket_quantity: 2,
      };

      const mockResult = {
        rows: [{ id: 'order-1', ...orderData, order_number: 'ORD-12345' }],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await model.create(orderData);

      expect(result.id).toBe('order-1');
    });

    it('should generate order number if not provided', async () => {
      const orderData: IOrder = {
        user_id: 'user-123',
        event_id: 'event-123',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11000,
        ticket_quantity: 2,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(orderData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][2]).toMatch(/^ORD-\d{8}$/);
    });

    it('should use provided order number', async () => {
      const orderData: IOrder = {
        user_id: 'user-123',
        event_id: 'event-123',
        order_number: 'CUSTOM-123',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11000,
        ticket_quantity: 2,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [orderData] });

      await model.create(orderData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][2]).toBe('CUSTOM-123');
    });

    it('should default status to PENDING', async () => {
      const orderData: IOrder = {
        user_id: 'user-123',
        event_id: 'event-123',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11000,
        ticket_quantity: 2,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(orderData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][3]).toBe('PENDING');
    });

    it('should default currency to USD', async () => {
      const orderData: IOrder = {
        user_id: 'user-123',
        event_id: 'event-123',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11000,
        ticket_quantity: 2,
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(orderData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][5]).toBe('USD');
    });

    it('should handle optional metadata', async () => {
      const orderData: IOrder = {
        user_id: 'user-123',
        event_id: 'event-123',
        status: 'PENDING',
        subtotal_cents: 10000,
        total_cents: 11000,
        ticket_quantity: 2,
        metadata: { source: 'web' },
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [orderData] });

      await model.create(orderData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][9]).toEqual({ source: 'web' });
    });
  });

  describe('findById()', () => {
    it('should find order by id', async () => {
      const mockOrder = {
        id: 'order-1',
        user_id: 'user-123',
        status: 'PAID',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockOrder] });

      const result = await model.findById('order-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM orders WHERE id = $1',
        ['order-1']
      );
      expect(result).toEqual(mockOrder);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findById('notfound');

      expect(result).toBeNull();
    });
  });

  describe('findByUserId()', () => {
    it('should find orders by user id', async () => {
      const mockOrders = [
        { id: 'order-1', user_id: 'user-123' },
        { id: 'order-2', user_id: 'user-123' },
      ];

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: mockOrders });

      const result = await model.findByUserId('user-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1'),
        ['user-123']
      );
      expect(result).toEqual(mockOrders);
    });

    it('should order by created_at DESC', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await model.findByUserId('user-123');

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('ORDER BY created_at DESC');
    });

    it('should return empty array if none found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findByUserId('user-123');

      expect(result).toEqual([]);
    });
  });

  describe('update()', () => {
    it('should update order with valid fields', async () => {
      const mockUpdated = { id: 'order-1', status: 'PAID' };
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockUpdated] });

      const result = await model.update('order-1', { status: 'PAID' });

      expect(result).toEqual(mockUpdated);
    });

    it('should only update whitelisted fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('order-1', { status: 'PAID' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status = $2');
    });

    it('should reject non-whitelisted fields', async () => {
      await expect(
        model.update('order-1', { invalid_field: 'value' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should update updated_at timestamp', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('order-1', { status: 'PAID' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('updated_at = NOW()');
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.update('notfound', { status: 'PAID' });

      expect(result).toBeNull();
    });

    it('should handle multiple valid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('order-1', {
        status: 'PAID',
        total_cents: 15000,
      });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status');
      expect(call).toContain('total_cents');
    });

    it('should filter out invalid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('order-1', {
        status: 'PAID',
        invalid: 'field',
      } as any);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual(['order-1', 'PAID']);
    });
  });

  describe('delete()', () => {
    it('should delete order', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await model.delete('order-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM orders WHERE id = $1',
        ['order-1']
      );
      expect(result).toBe(true);
    });

    it('should return false if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: 0 });

      const result = await model.delete('notfound');

      expect(result).toBe(false);
    });

    it('should handle null rowCount', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rowCount: null });

      const result = await model.delete('order-1');

      expect(result).toBe(false);
    });
  });
});
