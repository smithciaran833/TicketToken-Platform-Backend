/**
 * Unit Tests: Partial Refund Service
 * Tests partial refund calculations and processing
 * 
 * NOTE: There is a bug in processPartialRefund - it queries the database directly
 * and gets snake_case fields, but calculatePartialRefundAmount expects camelCase.
 * These tests document the current behavior.
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

import { PartialRefundService } from '../../../src/services/partial-refund.service';
import { RefundType } from '../../../src/types/refund.types';

describe('PartialRefundService', () => {
  let service: PartialRefundService;
  const orderId = 'order-123';
  const orderItemId1 = 'item-1';
  const orderItemId2 = 'item-2';

  const sampleOrder = {
    id: orderId,
    subtotalCents: 20000,
    platformFeeCents: 1000,
    processingFeeCents: 610,
    taxCents: 1728,
    total_cents: 23338,
    status: 'CONFIRMED',
  };

  // Database returns snake_case
  const sampleOrderItems = [
    {
      id: orderItemId1,
      order_id: orderId,
      quantity: 2,
      unit_price_cents: 5000,
      total_price_cents: 10000,
    },
    {
      id: orderItemId2,
      order_id: orderId,
      quantity: 1,
      unit_price_cents: 10000,
      total_price_cents: 10000,
    },
  ];

  // For passing to service methods (camelCase) - this is what the types expect
  const sampleOrderItemsCamel = [
    {
      id: orderItemId1,
      orderId: orderId,
      quantity: 2,
      unitPriceCents: 5000,
      totalPriceCents: 10000,
    },
    {
      id: orderItemId2,
      orderId: orderId,
      quantity: 1,
      unitPriceCents: 10000,
      totalPriceCents: 10000,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PartialRefundService();
  });

  describe('calculatePartialRefundAmount', () => {
    it('should calculate refund for single item', () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = service.calculatePartialRefundAmount(
        sampleOrder as any,
        sampleOrderItemsCamel as any,
        refundItems
      );

      expect(result.subtotalRefundCents).toBe(5000);
      expect(result.refundPercentage).toBe(0.25); // 5000/20000
      expect(result.proportionalPlatformFeeCents).toBe(250); // 1000 * 0.25
      expect(result.proportionalProcessingFeeCents).toBe(0); // Processing fees non-refundable
      expect(result.proportionalTaxCents).toBe(432); // 1728 * 0.25
      expect(result.totalRefundCents).toBe(5682); // 5000 + 250 + 432
    });

    it('should calculate refund for multiple items', () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 2, amountCents: 10000 },
        { orderItemId: orderItemId2, quantity: 1, amountCents: 10000 },
      ];

      const result = service.calculatePartialRefundAmount(
        sampleOrder as any,
        sampleOrderItemsCamel as any,
        refundItems
      );

      expect(result.subtotalRefundCents).toBe(20000);
      expect(result.refundPercentage).toBe(1.0); // Full refund
      expect(result.proportionalPlatformFeeCents).toBe(1000);
      expect(result.proportionalTaxCents).toBe(1728);
      expect(result.totalRefundCents).toBe(22728);
    });

    it('should calculate refund for partial quantity', () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = service.calculatePartialRefundAmount(
        sampleOrder as any,
        sampleOrderItemsCamel as any,
        refundItems
      );

      expect(result.subtotalRefundCents).toBe(5000);
      expect(result.refundPercentage).toBe(0.25);
    });

    it('should handle item not found gracefully', () => {
      const refundItems = [
        { orderItemId: 'nonexistent', quantity: 1, amountCents: 5000 },
      ];

      const result = service.calculatePartialRefundAmount(
        sampleOrder as any,
        sampleOrderItemsCamel as any,
        refundItems
      );

      expect(result.subtotalRefundCents).toBe(0);
      expect(result.refundPercentage).toBe(0);
      expect(result.totalRefundCents).toBe(0);
    });

    it('should round proportional fees correctly', () => {
      const order = { ...sampleOrder, platformFeeCents: 333, taxCents: 777 };
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = service.calculatePartialRefundAmount(
        order as any,
        sampleOrderItemsCamel as any,
        refundItems
      );

      expect(result.proportionalPlatformFeeCents).toBe(83); // Math.round(333 * 0.25)
      expect(result.proportionalTaxCents).toBe(194); // Math.round(777 * 0.25)
    });
  });

  describe('validatePartialRefundItems', () => {
    beforeEach(() => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // order query
        .mockResolvedValueOnce({ rows: sampleOrderItems }) // items query
        .mockResolvedValueOnce({ rows: [] }); // existing refunds query
    });

    it('should validate valid refund items', async () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject if order not found', async () => {
      mockQuery.mockReset().mockResolvedValueOnce({ rows: [] });

      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = await service.validatePartialRefundItems('nonexistent', refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Order not found');
    });

    it('should reject if order status invalid', async () => {
      mockQuery
        .mockReset()
        .mockResolvedValueOnce({ rows: [{ ...sampleOrder, status: 'PENDING' }] })
        .mockResolvedValueOnce({ rows: sampleOrderItems })
        .mockResolvedValueOnce({ rows: [] });

      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Cannot refund order with status: PENDING');
    });

    it('should reject if order item not found', async () => {
      const refundItems = [
        { orderItemId: 'nonexistent', quantity: 1, amountCents: 5000 },
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Order item nonexistent not found in order');
    });

    it('should reject if quantity exceeds available', async () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 5, amountCents: 25000 }, // Only 2 available
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Cannot refund 5 of item');
    });

    it('should reject if quantity is zero or negative', async () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 0, amountCents: 0 },
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(`Refund quantity must be positive for item ${orderItemId1}`);
    });

    it('should warn on amount mismatch', async () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 6000 }, // Expected 5000
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(true); // Still valid, just warning
      expect(result.warnings[0]).toContain('Amount mismatch');
    });

    it('should reject if refund amount below minimum', async () => {
      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 25 }, // Below $0.50 minimum
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Refund amount must be at least $0.50');
    });

    it('should account for existing partial refunds', async () => {
      const existingRefund = {
        refund_type: 'PARTIAL',
        refunded_items: JSON.stringify([
          { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
        ]),
      };

      mockQuery
        .mockReset()
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: sampleOrderItems })
        .mockResolvedValueOnce({ rows: [existingRefund] });

      const refundItems = [
        { orderItemId: orderItemId1, quantity: 2, amountCents: 10000 }, // Only 1 left
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('1 already refunded');
    });

    it('should account for full refund', async () => {
      const existingRefund = {
        refund_type: 'FULL',
        refunded_items: null,
      };

      mockQuery
        .mockReset()
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: sampleOrderItems })
        .mockResolvedValueOnce({ rows: [existingRefund] });

      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('2 already refunded'); // All items refunded
    });

    it('should handle validation errors gracefully', async () => {
      mockQuery.mockReset().mockRejectedValue(new Error('Database error'));

      const refundItems = [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ];

      const result = await service.validatePartialRefundItems(orderId, refundItems);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Validation error occurred');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('processPartialRefund', () => {
    const refundRequest = {
      orderId,
      items: [
        { orderItemId: orderItemId1, quantity: 1, amountCents: 5000 },
      ],
      reason: 'Customer request',
      notes: 'Item damaged',
    };

    const mockRefund = {
      id: 'refund-123',
      order_id: orderId,
      refund_type: RefundType.PARTIAL,
      amount_cents: 5682,
      original_amount_cents: 23338,
      proportional_platform_fee_cents: 250,
      proportional_processing_fee_cents: 0,
      proportional_tax_cents: 432,
      reason: 'Customer request',
      notes: 'Item damaged',
      refund_status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
    };

    beforeEach(() => {
      // Setup validation mocks
      mockQuery
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // validation: order
        .mockResolvedValueOnce({ rows: sampleOrderItems }) // validation: items
        .mockResolvedValueOnce({ rows: [] }) // validation: existing refunds
        .mockResolvedValueOnce({ rows: [sampleOrder] }) // process: get order
        .mockResolvedValueOnce({ rows: sampleOrderItems }) // process: get items
        .mockResolvedValueOnce({ rows: [mockRefund] }); // process: insert refund
    });

    it('should process partial refund successfully', async () => {
      const result = await service.processPartialRefund(refundRequest);

      expect(result.id).toBe('refund-123');
      expect(result.refundType).toBe(RefundType.PARTIAL);
      expect(result.refundedItems).toEqual(refundRequest.items);
    });

    it('should throw error if validation fails', async () => {
      mockQuery.mockReset().mockResolvedValueOnce({ rows: [] }); // Order not found

      await expect(service.processPartialRefund(refundRequest)).rejects.toThrow('Validation failed');
    });

    it('should insert refund record into database', async () => {
      await service.processPartialRefund(refundRequest);

      const insertCall = mockQuery.mock.calls[5]; // 6th call is the insert
      expect(insertCall[0]).toContain('INSERT INTO order_refunds');
      expect(insertCall[1][0]).toBe(orderId);
      expect(insertCall[1][1]).toBe(RefundType.PARTIAL);
      expect(insertCall[1][8]).toBe('Customer request');
      expect(insertCall[1][9]).toBe('Item damaged');
    });

    it('should log refund processing', async () => {
      await service.processPartialRefund(refundRequest);

      expect(mockLogger.info).toHaveBeenCalledWith('Partial refund processed', expect.any(Object));
    });

    it('should handle processing errors', async () => {
      mockQuery.mockReset().mockRejectedValue(new Error('Database error'));

      await expect(service.processPartialRefund(refundRequest)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Error processing partial refund', expect.any(Object));
    });

    it('should process refund without notes', async () => {
      const requestWithoutNotes = { ...refundRequest, notes: undefined };

      mockQuery
        .mockReset()
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: sampleOrderItems })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [sampleOrder] })
        .mockResolvedValueOnce({ rows: sampleOrderItems })
        .mockResolvedValueOnce({ rows: [mockRefund] });

      await service.processPartialRefund(requestWithoutNotes);

      const insertCall = mockQuery.mock.calls[5];
      expect(insertCall[1][9]).toBeNull(); // notes should be null
    });
  });

  describe('updateOrderTotals', () => {
    it('should update order with total refunded amount', async () => {
      const refunds = [
        { amount_cents: 5000 },
        { amount_cents: 3000 },
      ];

      mockQuery
        .mockResolvedValueOnce({ rows: refunds })
        .mockResolvedValueOnce({ rows: [] });

      await service.updateOrderTotals(orderId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE orders'),
        [8000, orderId]
      );
    });

    it('should only include COMPLETED refunds', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.updateOrderTotals(orderId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("refund_status = $2"),
        [orderId, 'COMPLETED']
      );
    });

    it('should log success', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ amount_cents: 5000 }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.updateOrderTotals(orderId);

      expect(mockLogger.info).toHaveBeenCalledWith('Order totals updated after refund', expect.any(Object));
    });

    it('should handle errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.updateOrderTotals(orderId)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Error updating order totals', expect.any(Object));
    });
  });

  describe('getRefundHistory', () => {
    const mockRefunds = [
      {
        id: 'refund-1',
        order_id: orderId,
        refund_type: RefundType.PARTIAL,
        amount_cents: 5000,
        original_amount_cents: 20000,
        refunded_items: [{ orderItemId: orderItemId1, quantity: 1 }],
        proportional_platform_fee_cents: 250,
        proportional_processing_fee_cents: 0,
        proportional_tax_cents: 200,
        reason: 'Damaged',
        notes: 'Item broken',
        payment_intent_id: 'pi_123',
        refund_status: 'COMPLETED',
        processed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    it('should return refund history', async () => {
      mockQuery.mockResolvedValue({ rows: mockRefunds });

      const result = await service.getRefundHistory(orderId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('refund-1');
      expect(result[0].amountCents).toBe(5000);
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: mockRefunds });

      await service.getRefundHistory(orderId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [orderId]
      );
    });

    it('should map database fields correctly', async () => {
      mockQuery.mockResolvedValue({ rows: mockRefunds });

      const result = await service.getRefundHistory(orderId);

      expect(result[0]).toMatchObject({
        id: mockRefunds[0].id,
        orderId: mockRefunds[0].order_id,
        refundType: mockRefunds[0].refund_type,
        amountCents: mockRefunds[0].amount_cents,
        refundStatus: mockRefunds[0].refund_status,
      });
    });

    it('should handle errors', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      await expect(service.getRefundHistory(orderId)).rejects.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting refund history', expect.any(Object));
    });

    it('should return empty array when no refunds', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getRefundHistory(orderId);

      expect(result).toEqual([]);
    });
  });
});
