/**
 * Unit Tests: Order Split Service
 * Tests order splitting into multiple child orders with payment allocation
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockPool),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

// Mock crypto.randomUUID
const mockRandomUUID = jest.fn();
global.crypto = {
  randomUUID: mockRandomUUID,
} as any;

import { OrderSplitService } from '../../../src/services/order-split.service';

describe('OrderSplitService', () => {
  let service: OrderSplitService;
  const tenantId = 'tenant-123';
  const userId = 'user-456';
  const orderId = 'order-789';

  const parentOrder = {
    id: orderId,
    tenant_id: tenantId,
    total_cents: 30000,
    status: 'CONFIRMED',
  };

  const createMockSplit = (childIds: string[], allocations: any[]) => ({
    id: 'split-123',
    parent_order_id: orderId,
    tenant_id: tenantId,
    split_count: childIds.length,
    split_reason: 'Test reason',
    split_by: userId,
    child_order_ids: childIds,
    payment_allocations: JSON.stringify(allocations),
    metadata: null,
    created_at: new Date(),
    completed_at: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OrderSplitService();
  });

  describe('splitOrder', () => {
    const splitRequest = {
      orderId,
      splitCount: 3,
      itemAllocations: [
        { orderItemId: 'item-1', childOrderIndex: 0, quantity: 1 },
        { orderItemId: 'item-2', childOrderIndex: 1, quantity: 1 },
        { orderItemId: 'item-3', childOrderIndex: 2, quantity: 1 },
      ],
      reason: 'Split for different attendees',
    };

    it('should split order successfully', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(
        ['child-1', 'child-2', 'child-3'],
        [
          { childOrderId: 'child-1', amountCents: 10000, percentage: 33.33 },
          { childOrderId: 'child-2', amountCents: 10000, percentage: 33.33 },
          { childOrderId: 'child-3', amountCents: 10000, percentage: 33.33 },
        ]
      );

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      const result = await service.splitOrder(tenantId, userId, splitRequest);

      expect(result.id).toBe('split-123');
      expect(result.splitCount).toBe(3);
      expect(result.childOrderIds).toHaveLength(3);
    });

    it('should throw error if parent order not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.splitOrder(tenantId, userId, splitRequest)
      ).rejects.toThrow('Order not found');
    });

    it('should validate parent order belongs to tenant', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, splitRequest);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        [orderId, tenantId]
      );
    });

    it('should generate child order IDs', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, splitRequest);

      const insertCall = mockQuery.mock.calls[1];
      const childIds = insertCall[1][5];
      
      expect(childIds).toEqual(['child-1', 'child-2', 'child-3']);
    });

    it('should allocate payment evenly across child orders', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, splitRequest);

      const insertCall = mockQuery.mock.calls[1];
      const allocationsJson = insertCall[1][6];
      const allocations = JSON.parse(allocationsJson);
      
      expect(allocations).toHaveLength(3);
      // Each child gets 10000 cents (30000 / 3)
      allocations.forEach((allocation: any) => {
        expect(allocation.amountCents).toBe(10000);
        expect(allocation.percentage).toBeCloseTo(33.33, 1);
      });
    });

    it('should handle uneven split amounts', async () => {
      const unevenOrder = { ...parentOrder, total_cents: 10000 };
      const unevenRequest = { ...splitRequest, splitCount: 3 };

      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [unevenOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, unevenRequest);

      const insertCall = mockQuery.mock.calls[1];
      const allocationsJson = insertCall[1][6];
      const allocations = JSON.parse(allocationsJson);
      
      // 10000 / 3 = 3333.33, floored to 3333
      allocations.forEach((allocation: any) => {
        expect(allocation.amountCents).toBe(3333);
      });
    });

    it('should create split record in database', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, splitRequest);

      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO order_splits');
      expect(insertCall[1][0]).toBe(orderId);
      expect(insertCall[1][1]).toBe(tenantId);
      expect(insertCall[1][2]).toBe(3);
      expect(insertCall[1][3]).toBe('Split for different attendees');
      expect(insertCall[1][4]).toBe(userId);
    });

    it('should use default reason if not provided', async () => {
      const requestWithoutReason = { ...splitRequest, reason: undefined };

      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, requestWithoutReason);

      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[1][3]).toBe('Order split'); // Default reason
    });

    it('should log successful split', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2')
        .mockReturnValueOnce('child-3');

      const mockSplit = createMockSplit(['child-1', 'child-2', 'child-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, splitRequest);

      expect(mockLogger.info).toHaveBeenCalledWith('Order split completed', {
        splitId: 'split-123',
        parentOrderId: orderId,
        childCount: 3,
      });
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(
        service.splitOrder(tenantId, userId, splitRequest)
      ).rejects.toThrow('Database error');

      expect(mockLogger.error).toHaveBeenCalledWith('Error splitting order', expect.any(Object));
    });

    it('should handle split count of 2', async () => {
      const twoWaySplit = { ...splitRequest, splitCount: 2 };
      
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1')
        .mockReturnValueOnce('child-2');

      const mockSplit = createMockSplit(['child-1', 'child-2'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, twoWaySplit);

      const insertCall = mockQuery.mock.calls[1];
      const childIds = insertCall[1][5];
      const allocations = JSON.parse(insertCall[1][6]);

      expect(childIds).toHaveLength(2);
      expect(allocations).toHaveLength(2);
    });

    it('should handle split count of 1 (edge case)', async () => {
      const singleSplit = { ...splitRequest, splitCount: 1 };
      
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('child-1');

      const mockSplit = createMockSplit(['child-1'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, singleSplit);

      const insertCall = mockQuery.mock.calls[1];
      const childIds = insertCall[1][5];
      const allocations = JSON.parse(insertCall[1][6]);

      expect(childIds).toHaveLength(1);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].amountCents).toBe(30000); // Full amount
      expect(allocations[0].percentage).toBe(100);
    });

    it('should generate unique child order IDs', async () => {
      mockRandomUUID
        .mockReturnValueOnce('split-group-1')
        .mockReturnValueOnce('unique-1')
        .mockReturnValueOnce('unique-2')
        .mockReturnValueOnce('unique-3');

      const mockSplit = createMockSplit(['unique-1', 'unique-2', 'unique-3'], []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, splitRequest);

      const insertCall = mockQuery.mock.calls[1];
      const childIds = insertCall[1][5];
      
      expect(new Set(childIds).size).toBe(3); // All unique
      expect(childIds).toEqual(['unique-1', 'unique-2', 'unique-3']);
    });

    it('should handle large split counts', async () => {
      const largeSplit = { ...splitRequest, splitCount: 10 };
      
      mockRandomUUID.mockReturnValueOnce('split-group-1');
      const childIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const id = `child-${i}`;
        childIds.push(id);
        mockRandomUUID.mockReturnValueOnce(id);
      }

      const mockSplit = createMockSplit(childIds, []);

      mockQuery
        .mockResolvedValueOnce({ rows: [parentOrder] })
        .mockResolvedValueOnce({ rows: [mockSplit] });

      await service.splitOrder(tenantId, userId, largeSplit);

      const insertCall = mockQuery.mock.calls[1];
      const returnedChildIds = insertCall[1][5];
      const allocations = JSON.parse(insertCall[1][6]);

      expect(returnedChildIds).toHaveLength(10);
      expect(allocations).toHaveLength(10);
    });
  });

  describe('getOrderSplit', () => {
    const sampleSplit = {
      id: 'split-123',
      parent_order_id: orderId,
      tenant_id: tenantId,
      split_count: 3,
      split_reason: 'Customer request',
      split_by: userId,
      child_order_ids: ['child-1', 'child-2', 'child-3'],
      payment_allocations: JSON.stringify([
        { childOrderId: 'child-1', amountCents: 10000, percentage: 33.33 },
        { childOrderId: 'child-2', amountCents: 10000, percentage: 33.33 },
        { childOrderId: 'child-3', amountCents: 10000, percentage: 33.34 },
      ]),
      metadata: null,
      created_at: new Date(),
      completed_at: new Date(),
    };

    it('should return split details for order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleSplit] });

      const result = await service.getOrderSplit(orderId);

      expect(result).toBeDefined();
      expect(result?.id).toBe('split-123');
      expect(result?.parentOrderId).toBe(orderId);
    });

    it('should return null if split not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getOrderSplit('nonexistent');

      expect(result).toBeNull();
    });

    it('should query by parent order ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleSplit] });

      await service.getOrderSplit(orderId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('parent_order_id = $1'),
        [orderId]
      );
    });

    it('should parse payment allocations JSON', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleSplit] });

      const result = await service.getOrderSplit(orderId);

      expect(result?.paymentAllocations).toEqual([
        { childOrderId: 'child-1', amountCents: 10000, percentage: 33.33 },
        { childOrderId: 'child-2', amountCents: 10000, percentage: 33.33 },
        { childOrderId: 'child-3', amountCents: 10000, percentage: 33.34 },
      ]);
    });

    it('should map all fields correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleSplit] });

      const result = await service.getOrderSplit(orderId);

      expect(result).toMatchObject({
        id: sampleSplit.id,
        parentOrderId: sampleSplit.parent_order_id,
        tenantId: sampleSplit.tenant_id,
        splitCount: sampleSplit.split_count,
        splitReason: sampleSplit.split_reason,
        splitBy: sampleSplit.split_by,
        childOrderIds: sampleSplit.child_order_ids,
      });
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getOrderSplit(orderId)).rejects.toThrow('Database error');
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting order split', expect.any(Object));
    });

    it('should handle null metadata', async () => {
      const splitWithNullMetadata = { ...sampleSplit, metadata: null };
      mockQuery.mockResolvedValueOnce({ rows: [splitWithNullMetadata] });

      const result = await service.getOrderSplit(orderId);

      expect(result?.metadata).toBeNull();
    });

    it('should handle metadata object', async () => {
      const metadata = { splitType: 'manual', notes: 'Split for group' };
      const splitWithMetadata = { ...sampleSplit, metadata };
      mockQuery.mockResolvedValueOnce({ rows: [splitWithMetadata] });

      const result = await service.getOrderSplit(orderId);

      expect(result?.metadata).toEqual(metadata);
    });
  });
});
