/**
 * Unit Tests: Order Refund Model
 * Tests database operations for order refunds
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

import { OrderRefundModel } from '../../../src/models/order-refund.model';
import { RefundStatus } from '../../../src/types';

describe('OrderRefundModel', () => {
  let model: OrderRefundModel;
  const tenantId = 'tenant-123';
  const orderId = 'order-789';
  const refundId = 'refund-456';

  const sampleRefundRow = {
    id: refundId,
    tenant_id: tenantId,
    order_id: orderId,
    refund_amount_cents: '10000',
    refund_reason: 'Customer request',
    refund_status: RefundStatus.PENDING,
    stripe_refund_id: 're_123',
    initiated_by: 'user-456',
    metadata: { source: 'admin' },
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    model = new OrderRefundModel(mockPool as any);
  });

  describe('create', () => {
    it('should create refund successfully', async () => {
      const refundData = {
        orderId,
        tenantId,
        refundAmountCents: 10000,
        refundReason: 'Customer request',
        refundStatus: RefundStatus.PENDING,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      const result = await model.create(refundData);

      expect(result.id).toBe(refundId);
      expect(result.refundAmountCents).toBe(10000);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO order_refunds'),
        expect.arrayContaining([tenantId, orderId, 10000, 'Customer request', RefundStatus.PENDING])
      );
    });

    it('should create refund with stripe refund ID', async () => {
      const refundData = {
        orderId,
        tenantId,
        refundAmountCents: 10000,
        refundReason: 'Event cancelled',
        refundStatus: RefundStatus.COMPLETED,
        stripeRefundId: 're_123abc',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      await model.create(refundData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['re_123abc'])
      );
    });

    it('should create refund with initiated by user', async () => {
      const refundData = {
        orderId,
        tenantId,
        refundAmountCents: 5000,
        refundReason: 'Policy refund',
        refundStatus: RefundStatus.PENDING,
        initiatedBy: 'admin-789',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      await model.create(refundData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['admin-789'])
      );
    });

    it('should create refund with metadata', async () => {
      const metadata = { source: 'api', autoRefund: true };
      const refundData = {
        orderId,
        tenantId,
        refundAmountCents: 10000,
        refundReason: 'Auto refund',
        refundStatus: RefundStatus.PENDING,
        metadata,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      await model.create(refundData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(metadata)])
      );
    });

    it('should create refund with empty metadata if not provided', async () => {
      const refundData = {
        orderId,
        tenantId,
        refundAmountCents: 10000,
        refundReason: 'Refund',
        refundStatus: RefundStatus.PENDING,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      await model.create(refundData);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify({})])
      );
    });

    it('should handle all refund statuses', async () => {
      const statuses = [
        RefundStatus.PENDING,
        RefundStatus.COMPLETED,
        RefundStatus.FAILED,
      ];

      for (const status of statuses) {
        mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleRefundRow, refund_status: status }] });

        const result = await model.create({
          orderId,
          tenantId,
          refundAmountCents: 10000,
          refundReason: 'Test',
          refundStatus: status,
        });

        expect(result.refundStatus).toBe(status);
      }
    });

    it('should handle database errors', async () => {
      const refundData = {
        orderId,
        tenantId,
        refundAmountCents: 10000,
        refundReason: 'Test',
        refundStatus: RefundStatus.PENDING,
      };

      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(model.create(refundData)).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error creating order refund',
        expect.any(Object)
      );
    });
  });

  describe('findByOrderId', () => {
    it('should find all refunds for an order', async () => {
      const refunds = [
        { ...sampleRefundRow, id: 'refund-1' },
        { ...sampleRefundRow, id: 'refund-2' },
      ];

      mockQuery.mockResolvedValueOnce({ rows: refunds });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('refund-1');
      expect(result[1].id).toBe('refund-2');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE order_id = $1 AND tenant_id = $2'),
        [orderId, tenantId]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.findByOrderId(orderId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no refunds found', async () => {
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

  describe('updateStatus', () => {
    it('should update refund status successfully', async () => {
      const updatedRow = { ...sampleRefundRow, refund_status: RefundStatus.COMPLETED };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await model.updateStatus(refundId, tenantId, RefundStatus.COMPLETED);

      expect(result?.refundStatus).toBe(RefundStatus.COMPLETED);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE order_refunds'),
        [refundId, RefundStatus.COMPLETED, undefined, tenantId]
      );
    });

    it('should update status with stripe refund ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      await model.updateStatus(refundId, tenantId, RefundStatus.COMPLETED, 're_new123');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('stripe_refund_id = $3'),
        [refundId, RefundStatus.COMPLETED, 're_new123', tenantId]
      );
    });

    it('should update status to PENDING', async () => {
      const updatedRow = { ...sampleRefundRow, refund_status: RefundStatus.PENDING };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await model.updateStatus(refundId, tenantId, RefundStatus.PENDING);

      expect(result?.refundStatus).toBe(RefundStatus.PENDING);
    });

    it('should update status to FAILED', async () => {
      const updatedRow = { ...sampleRefundRow, refund_status: RefundStatus.FAILED };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const result = await model.updateStatus(refundId, tenantId, RefundStatus.FAILED);

      expect(result?.refundStatus).toBe(RefundStatus.FAILED);
    });

    it('should always update updated_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      await model.updateStatus(refundId, tenantId, RefundStatus.COMPLETED);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return null if refund not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await model.updateStatus('nonexistent', tenantId, RefundStatus.COMPLETED);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await model.updateStatus(refundId, 'different-tenant', RefundStatus.COMPLETED);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $4'),
        expect.arrayContaining(['different-tenant'])
      );
    });

    it('should handle database errors', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      await expect(
        model.updateStatus(refundId, tenantId, RefundStatus.COMPLETED)
      ).rejects.toThrow('DB error');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error updating refund status',
        expect.any(Object)
      );
    });
  });

  describe('mapToOrderRefund', () => {
    it('should map all fields correctly', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0]).toMatchObject({
        id: sampleRefundRow.id,
        refundId: sampleRefundRow.id, // Should map id to refundId
        tenantId: sampleRefundRow.tenant_id,
        orderId: sampleRefundRow.order_id,
        refundAmountCents: 10000,
        refundReason: sampleRefundRow.refund_reason,
        refundStatus: sampleRefundRow.refund_status,
        stripeRefundId: sampleRefundRow.stripe_refund_id,
        initiatedBy: sampleRefundRow.initiated_by,
        metadata: sampleRefundRow.metadata,
      });
    });

    it('should correctly parse refund amount as integer', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0].refundAmountCents).toBe(10000);
      expect(typeof result[0].refundAmountCents).toBe('number');
    });

    it('should convert snake_case to camelCase', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0]).toHaveProperty('refundAmountCents');
      expect(result[0]).toHaveProperty('refundReason');
      expect(result[0]).toHaveProperty('refundStatus');
      expect(result[0]).toHaveProperty('stripeRefundId');
      expect(result[0]).toHaveProperty('initiatedBy');
      expect(result[0]).not.toHaveProperty('refund_amount_cents');
      expect(result[0]).not.toHaveProperty('stripe_refund_id');
    });

    it('should map id to both id and refundId', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleRefundRow] });

      const result = await model.findByOrderId(orderId, tenantId);

      expect(result[0].id).toBe(refundId);
      expect(result[0].refundId).toBe(refundId);
    });
  });
});
