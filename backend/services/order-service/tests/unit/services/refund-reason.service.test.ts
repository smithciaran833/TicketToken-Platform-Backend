/**
 * Unit Tests: Refund Reason Service
 * Tests CRUD operations for refund reasons with tenant isolation
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockPool),
}));

import { RefundReasonService } from '../../../src/services/refund-reason.service';

describe('RefundReasonService', () => {
  let service: RefundReasonService;
  const tenantId = 'tenant-123';
  const reasonId = 'reason-456';

  const sampleReason = {
    id: reasonId,
    tenant_id: tenantId,
    reason_code: 'EVENT_CANCELLED',
    reason_text: 'Event was cancelled',
    description: 'Full refund for cancelled events',
    requires_documentation: false,
    internal_only: false,
    auto_approve: true,
    priority: 10,
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RefundReasonService();
  });

  describe('createReason', () => {
    it('should create refund reason with all fields', async () => {
      const request = {
        reason_code: 'EVENT_CANCELLED',
        reason_text: 'Event was cancelled',
        description: 'Full refund for cancelled events',
        requires_documentation: false,
        internal_only: false,
        auto_approve: true,
        priority: 10,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      const result = await service.createReason(tenantId, request);

      expect(result.id).toBe(reasonId);
      expect(result.reason_code).toBe('EVENT_CANCELLED');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refund_reasons'),
        [
          tenantId,
          'EVENT_CANCELLED',
          'Event was cancelled',
          'Full refund for cancelled events',
          false,
          false,
          true,
          10,
        ]
      );
    });

    it('should create reason with default values', async () => {
      const minimalRequest = {
        reason_code: 'CUSTOMER_REQUEST',
        reason_text: 'Customer requested refund',
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      await service.createReason(tenantId, minimalRequest);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [
          tenantId,
          'CUSTOMER_REQUEST',
          'Customer requested refund',
          null, // description defaults to null
          false, // requires_documentation defaults to false
          false, // internal_only defaults to false
          false, // auto_approve defaults to false
          0, // priority defaults to 0
        ]
      );
    });

    it('should handle null description', async () => {
      const request = {
        reason_code: 'OTHER',
        reason_text: 'Other reason',
        description: undefined,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      await service.createReason(tenantId, request);

      const insertCall = mockQuery.mock.calls[0];
      expect(insertCall[1][3]).toBeNull();
    });

    it('should handle all boolean flags', async () => {
      const request = {
        reason_code: 'INTERNAL',
        reason_text: 'Internal reason',
        requires_documentation: true,
        internal_only: true,
        auto_approve: false,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      await service.createReason(tenantId, request);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([true, true, false])
      );
    });
  });

  describe('getReasonById', () => {
    it('should return reason by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      const result = await service.getReasonById(reasonId, tenantId);

      expect(result).toEqual(sampleReason);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND tenant_id = $2'),
        [reasonId, tenantId]
      );
    });

    it('should return null if reason not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getReasonById('nonexistent', tenantId);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getReasonById(reasonId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [reasonId, 'different-tenant']
      );
    });
  });

  describe('getReasonByCode', () => {
    it('should return active reason by code', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      const result = await service.getReasonByCode('EVENT_CANCELLED', tenantId);

      expect(result).toEqual(sampleReason);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('reason_code = $1'),
        ['EVENT_CANCELLED', tenantId]
      );
    });

    it('should only return active reasons', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getReasonByCode('EVENT_CANCELLED', tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('active = true'),
        expect.any(Array)
      );
    });

    it('should return null if code not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getReasonByCode('NONEXISTENT', tenantId);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getReasonByCode('EVENT_CANCELLED', 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        expect.arrayContaining(['different-tenant'])
      );
    });
  });

  describe('getReasons', () => {
    const reasons = [
      { ...sampleReason, priority: 10 },
      { ...sampleReason, id: 'reason-2', priority: 5, reason_text: 'B Reason' },
      { ...sampleReason, id: 'reason-3', priority: 5, reason_text: 'A Reason' },
    ];

    it('should return all active non-internal reasons by default', async () => {
      mockQuery.mockResolvedValueOnce({ rows: reasons });

      const result = await service.getReasons(tenantId);

      expect(result).toEqual(reasons);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('internal_only = false'),
        [tenantId]
      );
    });

    it('should include internal reasons when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: reasons });

      await service.getReasons(tenantId, true);

      const query = mockQuery.mock.calls[0][0];
      expect(query).not.toContain('internal_only = false');
    });

    it('should order by priority DESC then reason_text ASC', async () => {
      mockQuery.mockResolvedValueOnce({ rows: reasons });

      await service.getReasons(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority DESC, reason_text ASC'),
        [tenantId]
      );
    });

    it('should only return active reasons', async () => {
      mockQuery.mockResolvedValueOnce({ rows: reasons });

      await service.getReasons(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('active = true'),
        [tenantId]
      );
    });

    it('should return empty array when no reasons', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getReasons(tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('updateReason', () => {
    it('should update single field', async () => {
      const updates = { reason_text: 'Updated text' };
      const updated = { ...sampleReason, reason_text: 'Updated text' };

      mockQuery.mockResolvedValueOnce({ rows: [updated] });

      const result = await service.updateReason(reasonId, tenantId, updates);

      expect(result?.reason_text).toBe('Updated text');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('reason_text = $1'),
        ['Updated text', reasonId, tenantId]
      );
    });

    it('should update multiple fields', async () => {
      const updates = {
        reason_text: 'New text',
        description: 'New description',
        priority: 20,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      await service.updateReason(reasonId, tenantId, updates);

      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('reason_text = $1');
      expect(query).toContain('description = $2');
      expect(query).toContain('priority = $3');
    });

    it('should update boolean flags', async () => {
      const updates = {
        requires_documentation: true,
        internal_only: true,
        auto_approve: false,
      };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      await service.updateReason(reasonId, tenantId, updates);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([true, true, false, reasonId, tenantId])
      );
    });

    it('should always update updated_at', async () => {
      const updates = { reason_text: 'Updated' };

      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      await service.updateReason(reasonId, tenantId, updates);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return existing reason if no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleReason] });

      const result = await service.updateReason(reasonId, tenantId, {});

      expect(result).toEqual(sampleReason);
      // Should call getReasonById instead of UPDATE
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [reasonId, tenantId]
      );
    });

    it('should return null if reason not found', async () => {
      const updates = { reason_text: 'Updated' };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateReason('nonexistent', tenantId, updates);

      expect(result).toBeNull();
    });

    it('should enforce tenant isolation', async () => {
      const updates = { reason_text: 'Updated' };

      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.updateReason(reasonId, 'different-tenant', updates);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id'),
        expect.arrayContaining(['different-tenant'])
      );
    });
  });

  describe('deactivateReason', () => {
    it('should deactivate reason', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.deactivateReason(reasonId, tenantId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('active = false'),
        [reasonId, tenantId]
      );
    });

    it('should update updated_at timestamp', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      await service.deactivateReason(reasonId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return false if reason not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await service.deactivateReason('nonexistent', tenantId);

      expect(result).toBe(false);
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await service.deactivateReason(reasonId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        [reasonId, 'different-tenant']
      );
    });
  });

  describe('deleteReason', () => {
    it('should delete reason', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await service.deleteReason(reasonId, tenantId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM refund_reasons'),
        [reasonId, tenantId]
      );
    });

    it('should return false if reason not found', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const result = await service.deleteReason('nonexistent', tenantId);

      expect(result).toBe(false);
    });

    it('should enforce tenant isolation', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      await service.deleteReason(reasonId, 'different-tenant');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        [reasonId, 'different-tenant']
      );
    });
  });
});
