/**
 * Unit Tests: Bulk Operation Service
 * Tests bulk operations on orders
 */

const mockQuery = jest.fn();

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => ({ query: mockQuery })),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { BulkOperationService } from '../../../src/services/bulk-operation.service';
import { BulkOperationType, BulkOperationStatus } from '../../../src/types/bulk.types';

describe('BulkOperationService', () => {
  let service: BulkOperationService;
  const tenantId = 'tenant-123';
  const userId = 'user-456';

  const sampleOperation = {
    id: 'bulk-op-1',
    tenant_id: tenantId,
    operation_type: BulkOperationType.BULK_CANCEL,
    status: BulkOperationStatus.PENDING,
    order_ids: ['order-1', 'order-2', 'order-3'],
    total_count: 3,
    processed_count: 0,
    success_count: 0,
    failed_count: 0,
    initiated_by: userId,
    parameters: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BulkOperationService();
  });

  describe('createBulkOperation', () => {
    it('should create bulk operation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOperation] });

      const result = await service.createBulkOperation(tenantId, userId, {
        operationType: BulkOperationType.BULK_CANCEL,
        orderIds: ['order-1', 'order-2', 'order-3'],
      });

      expect(result.id).toBe('bulk-op-1');
      expect(result.status).toBe(BulkOperationStatus.PENDING);
      expect(result.totalCount).toBe(3);
    });

    it('should store parameters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleOperation, parameters: { reason: 'Event cancelled' } }] });

      await service.createBulkOperation(tenantId, userId, {
        operationType: BulkOperationType.BULK_REFUND,
        orderIds: ['order-1'],
        parameters: { reason: 'Event cancelled' },
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify({ reason: 'Event cancelled' })])
      );
    });
  });

  describe('getBulkOperation', () => {
    it('should return operation by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOperation] });

      const result = await service.getBulkOperation('bulk-op-1');

      expect(result?.id).toBe('bulk-op-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getBulkOperation('nonexistent');

      expect(result).toBeNull();
    });

    it('should map all fields correctly', async () => {
      const fullOperation = {
        ...sampleOperation,
        status: BulkOperationStatus.COMPLETED,
        processed_count: 3,
        success_count: 2,
        failed_count: 1,
        results: [{ orderId: 'order-1', status: 'success' }],
        errors: [{ orderId: 'order-3', error: 'Failed' }],
        started_at: new Date(),
        completed_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [fullOperation] });

      const result = await service.getBulkOperation('bulk-op-1');

      expect(result?.processedCount).toBe(3);
      expect(result?.successCount).toBe(2);
      expect(result?.failedCount).toBe(1);
    });
  });

  describe('listBulkOperations', () => {
    it('should list operations for tenant', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOperation, { ...sampleOperation, id: 'bulk-op-2' }] });

      const result = await service.listBulkOperations(tenantId);

      expect(result).toHaveLength(2);
    });

    it('should respect limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.listBulkOperations(tenantId, 10);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        [tenantId, 10]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.listBulkOperations(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });
  });
});
