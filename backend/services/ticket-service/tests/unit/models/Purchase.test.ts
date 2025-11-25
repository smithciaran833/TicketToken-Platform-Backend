// =============================================================================
// TEST SUITE - Purchase Model
// =============================================================================

import { Pool } from 'pg';
import { PurchaseModel, IPurchase } from '../../../src/models/Purchase';

describe('PurchaseModel', () => {
  let model: PurchaseModel;
  let mockPool: jest.Mocked<Partial<Pool>>;

  beforeEach(() => {
    mockPool = {
      query: jest.fn(),
    };

    model = new PurchaseModel(mockPool as Pool);
  });

  describe('create()', () => {
    it('should create a purchase', async () => {
      const purchaseData: IPurchase = {
        order_id: 'order-123',
        user_id: 'user-123',
        ticket_ids: ['ticket-1', 'ticket-2'],
        amount: 10000,
        payment_method: 'card',
        status: 'initiated',
      };

      const mockResult = {
        rows: [{ id: 'purchase-1', ...purchaseData }],
      };

      (mockPool.query as jest.Mock).mockResolvedValue(mockResult);

      const result = await model.create(purchaseData);

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO purchases'),
        [
          'order-123',
          'user-123',
          ['ticket-1', 'ticket-2'],
          10000,
          'card',
          'initiated',
        ]
      );
      expect(result.id).toBe('purchase-1');
    });

    it('should default status to initiated', async () => {
      const purchaseData: IPurchase = {
        order_id: 'order-123',
        user_id: 'user-123',
        ticket_ids: [],
        amount: 5000,
        status: 'initiated',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.create(purchaseData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][5]).toBe('initiated');
    });

    it('should handle optional payment_method', async () => {
      const purchaseData: IPurchase = {
        order_id: 'order-123',
        user_id: 'user-123',
        ticket_ids: [],
        amount: 5000,
        status: 'initiated',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [purchaseData] });

      await model.create(purchaseData);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][4]).toBeUndefined();
    });
  });

  describe('findById()', () => {
    it('should find purchase by id', async () => {
      const mockPurchase = {
        id: 'purchase-1',
        order_id: 'order-123',
        status: 'completed',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockPurchase] });

      const result = await model.findById('purchase-1');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM purchases WHERE id = $1',
        ['purchase-1']
      );
      expect(result).toEqual(mockPurchase);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findById('notfound');

      expect(result).toBeNull();
    });
  });

  describe('findByOrderId()', () => {
    it('should find purchase by order id', async () => {
      const mockPurchase = {
        id: 'purchase-1',
        order_id: 'order-123',
      };

      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockPurchase] });

      const result = await model.findByOrderId('order-123');

      expect(mockPool.query).toHaveBeenCalledWith(
        'SELECT * FROM purchases WHERE order_id = $1',
        ['order-123']
      );
      expect(result).toEqual(mockPurchase);
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.findByOrderId('notfound');

      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('should update purchase with valid fields', async () => {
      const mockUpdated = { id: 'purchase-1', status: 'completed' };
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [mockUpdated] });

      const result = await model.update('purchase-1', { status: 'completed' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE purchases'),
        ['purchase-1', 'completed']
      );
      expect(result).toEqual(mockUpdated);
    });

    it('should only update whitelisted fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', { status: 'completed' });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status = $2');
    });

    it('should reject non-whitelisted fields', async () => {
      await expect(
        model.update('purchase-1', { invalid_field: 'value' } as any)
      ).rejects.toThrow('No valid fields to update');
    });

    it('should handle multiple valid fields', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', {
        status: 'completed',
        amount: 15000,
      });

      const call = (mockPool.query as jest.Mock).mock.calls[0][0];
      expect(call).toContain('status');
      expect(call).toContain('amount');
    });

    it('should return null if not found', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await model.update('notfound', { status: 'completed' });

      expect(result).toBeNull();
    });

    it('should filter out invalid fields from update', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', {
        status: 'completed',
        invalid: 'field',
      } as any);

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toEqual(['purchase-1', 'completed']);
    });

    it('should update order_id if provided', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', { order_id: 'new-order' });

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toContain('new-order');
    });

    it('should update user_id if provided', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', { user_id: 'new-user' });

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toContain('new-user');
    });

    it('should update ticket_ids if provided', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', { ticket_ids: ['t1', 't2'] });

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1][1]).toEqual(['t1', 't2']);
    });

    it('should update amount if provided', async () => {
      (mockPool.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await model.update('purchase-1', { amount: 20000 });

      const call = (mockPool.query as jest.Mock).mock.calls[0];
      expect(call[1]).toContain(20000);
    });
  });
});
