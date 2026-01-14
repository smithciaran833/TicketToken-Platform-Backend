/**
 * Unit Tests: Order Item Model
 * Tests database operations for order items
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

import { OrderItemModel } from '../../../src/models/order-item.model';

describe('OrderItemModel', () => {
  let model: OrderItemModel;
  const tenantId = 'tenant-123';
  const orderId = 'order-789';
  const itemId = 'item-456';

  const sampleItemRow = {
    id: itemId,
    tenant_id: tenantId,
    order_id: orderId,
    ticket_type_id: 'ticket-1',
    quantity: 2,
    unit_price_cents: 5000,
    total_price_cents: 10000,
    created_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    model = new OrderItemModel(mockPool as any);
  });

  describe('create', () => {
    it('should create order item successfully', async () => {
      const itemData = {
        tenantId,
        orderId,
        ticketTypeId: 'ticket-1',
        quantity: 2,
        unitPriceCents: 5000,
        totalPriceCents: 10000,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleItemRow] });

      const result = await model.create(itemData);

      expect(result.id).toBe(itemId);
      expect(result.quantity).toBe(2);
      expect(result.unitPriceCents).toBe(5000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO order_items'),
        [tenantId, orderId, 'ticket-1', 2, 5000, 10000]
      );
    });

    it('should create item with all fields', async () => {
      const itemData = {
        tenantId,
        orderId,
        ticketTypeId: 'ticket-vip',
        quantity: 1,
        unitPriceCents: 15000,
        totalPriceCents: 15000,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleItemRow] });

      await model.create(itemData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [tenantId, orderId, 'ticket-vip', 1, 15000, 15000]
      );
    });
  });

  describe('createBulk', () => {
    it('should create multiple items in one query', async () => {
      const items = [
        {
          ticketTypeId: 'ticket-1',
          quantity: 2,
          unitPriceCents: 5000,
          totalPriceCents: 10000,
        },
        {
          ticketTypeId: 'ticket-2',
          quantity: 1,
          unitPriceCents: 8000,
          totalPriceCents: 8000,
        },
      ];

      const createdItems = [
        { ...sampleItemRow, id: 'item-1', ticket_type_id: 'ticket-1' },
        { ...sampleItemRow, id: 'item-2', ticket_type_id: 'ticket-2' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: createdItems });

      const result = await model.createBulk(orderId, tenantId, items);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('item-1');
      expect(result[1].id).toBe('item-2');
    });

    it('should generate correct SQL placeholders for bulk insert', async () => {
      const items = [
        {
          ticketTypeId: 'ticket-1',
          quantity: 2,
          unitPriceCents: 5000,
          totalPriceCents: 10000,
        },
        {
          ticketTypeId: 'ticket-2',
          quantity: 1,
          unitPriceCents: 8000,
          totalPriceCents: 8000,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.createBulk(orderId, tenantId, items);

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('($1, $2, $3, $4, $5, $6)');
      expect(query).toContain('($7, $8, $9, $10, $11, $12)');
    });

    it('should flatten values array correctly', async () => {
      const items = [
        {
          ticketTypeId: 'ticket-1',
          quantity: 2,
          unitPriceCents: 5000,
          totalPriceCents: 10000,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.createBulk(orderId, tenantId, items);

      const values = mockQuery.mock.calls[0][1];
      expect(values).toEqual([
        tenantId,
        orderId,
        'ticket-1',
        2,
        5000,
        10000,
      ]);
    });

    it('should handle single item bulk insert', async () => {
      const items = [
        {
          ticketTypeId: 'ticket-1',
          quantity: 1,
          unitPriceCents: 5000,
          totalPriceCents: 5000,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: [sampleItemRow] });

      const result = await model.createBulk(orderId, tenantId, items);

      expect(result).toHaveLength(1);
    });

    it('should handle large bulk insert', async () => {
      const items = Array.from({ length: 10 }, (_, i) => ({
        ticketTypeId: `ticket-${i}`,
        quantity: 1,
        unitPriceCents: 1000,
        totalPriceCents: 1000,
      }));

      const createdItems = items.map((item, i) => ({
        ...sampleItemRow,
        id: `item-${i}`,
        ticket_type_id: item.ticketTypeId,
      }));

      mockQuery.mockResolvedValueOnce({ rows: createdItems });

      const result = await model.createBulk(orderId, tenantId, items);

      expect(result).toHaveLength(10);
    });

    it('should handle database errors', async () => {
      const items = [
        {
          ticketTypeId: 'ticket-1',
          quantity: 2,
          unitPriceCents: 5000,
          totalPriceCents: 10000,
        },
      ];

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(model.createBulk(orderId, tenantId, items)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error creating order items',
        expect.any(Object)
      );
    });
  });

  describe('findByOrderId', () => {
    it('should find all items for an order', async () => {
      const items = [
        { ...sampleItemRow, id: 'item-1' },
        { ...sampleItemRow, id: 'item-2' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: items });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('item-1');
      expect(result[1].id).toBe('item-2');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE order_id = $1 AND tenant_id = $2'),
        [orderId, tenantId]
      );
    });

    it('should order by created_at', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByOrderId(orderId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at'),
        expect.any(Array)
      );
    });

    it('should return empty array when no items found', async () => {
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
  });

  describe('findById', () => {
    it('should find item by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleItemRow] });

      const result = await model.findById(itemId, tenantId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(itemId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND tenant_id = $2'),
        [itemId, tenantId]
      );
    });

    it('should return null if item not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.findById('nonexistent', tenantId);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findById(itemId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [itemId, 'different-tenant']
      );
    });
  });

  describe('mapRow', () => {
    it('should map all fields correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleItemRow] });

      const result = await model.findById(itemId, tenantId);

      expect(result).toMatchObject({
        id: sampleItemRow.id,
        tenantId: sampleItemRow.tenant_id,
        orderId: sampleItemRow.order_id,
        ticketTypeId: sampleItemRow.ticket_type_id,
        quantity: sampleItemRow.quantity,
        unitPriceCents: sampleItemRow.unit_price_cents,
        totalPriceCents: sampleItemRow.total_price_cents,
        createdAt: sampleItemRow.created_at,
      });
    });

    it('should convert snake_case to camelCase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleItemRow] });

      const result = await model.findById(itemId, tenantId);

      expect(result).toHaveProperty('ticketTypeId');
      expect(result).toHaveProperty('unitPriceCents');
      expect(result).toHaveProperty('totalPriceCents');
      expect(result).not.toHaveProperty('ticket_type_id');
      expect(result).not.toHaveProperty('unit_price_cents');
    });
  });
});
