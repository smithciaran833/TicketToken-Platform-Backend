/**
 * Unit Tests: Admin Override Service
 * Tests admin overrides with approval workflow
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

import { AdminOverrideService } from '../../../src/services/admin-override.service';
import { OverrideApprovalStatus, AdminRole, AdminOverrideType } from '../../../src/types/admin.types';

describe('AdminOverrideService', () => {
  let service: AdminOverrideService;
  const tenantId = 'tenant-123';
  const orderId = 'order-456';
  const adminUserId = 'admin-789';

  const sampleOverride = {
    id: 'override-1',
    tenant_id: tenantId,
    order_id: orderId,
    admin_user_id: adminUserId,
    override_type: AdminOverrideType.ADJUST_PRICE,
    original_value: { amount: 100 },
    new_value: { amount: 80 },
    reason: 'Customer complaint',
    approval_status: OverrideApprovalStatus.AUTO_APPROVED,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AdminOverrideService(mockPool as any);
  });

  describe('createOverride', () => {
    it('should create override with auto-approval', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sampleOverride] })
        .mockResolvedValueOnce({ rows: [] }); // audit log

      const result = await service.createOverride(
        tenantId, orderId, adminUserId, AdminRole.ADMIN,
        AdminOverrideType.ADJUST_PRICE, { amount: 100 }, { amount: 80 }, 'Customer complaint'
      );

      expect(result.approvalStatus).toBe(OverrideApprovalStatus.AUTO_APPROVED);
    });

    it('should log audit on creation', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [sampleOverride] })
        .mockResolvedValueOnce({ rows: [] });

      await service.createOverride(
        tenantId, orderId, adminUserId, AdminRole.ADMIN,
        AdminOverrideType.ADJUST_PRICE, { amount: 100 }, { amount: 80 }, 'Test'
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO admin_override_audit'),
        expect.any(Array)
      );
    });

    it('should include metadata', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...sampleOverride, metadata: { ticket: 'SUPP-123' } }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.createOverride(
        tenantId, orderId, adminUserId, AdminRole.ADMIN,
        AdminOverrideType.ADJUST_PRICE, {}, {}, 'Test', { ticket: 'SUPP-123' }
      );

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify({ ticket: 'SUPP-123' })])
      );
    });
  });

  describe('approveOverride', () => {
    it('should approve pending override', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...sampleOverride, approval_status: OverrideApprovalStatus.PENDING }] })
        .mockResolvedValueOnce({ rows: [{ ...sampleOverride, approval_status: OverrideApprovalStatus.APPROVED }] })
        .mockResolvedValueOnce({ rows: [] }); // audit

      const result = await service.approveOverride('override-1', tenantId, 'approver-1', AdminRole.MANAGER);

      expect(result.approvalStatus).toBe(OverrideApprovalStatus.APPROVED);
    });

    it('should throw when override not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        service.approveOverride('nonexistent', tenantId, 'approver-1', AdminRole.MANAGER)
      ).rejects.toThrow('Override not found');
    });

    it('should throw when not pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleOverride, approval_status: OverrideApprovalStatus.APPROVED }] });

      await expect(
        service.approveOverride('override-1', tenantId, 'approver-1', AdminRole.MANAGER)
      ).rejects.toThrow('not pending approval');
    });
  });

  describe('rejectOverride', () => {
    it('should reject with reason', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...sampleOverride, approval_status: OverrideApprovalStatus.REJECTED, rejection_reason: 'Invalid' }] })
        .mockResolvedValueOnce({ rows: [] }); // audit

      const result = await service.rejectOverride('override-1', tenantId, 'rejector-1', AdminRole.MANAGER, 'Invalid');

      expect(result.approvalStatus).toBe(OverrideApprovalStatus.REJECTED);
    });
  });

  describe('getOverride', () => {
    it('should return override by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOverride] });

      const result = await service.getOverride('override-1', tenantId);

      expect(result?.id).toBe('override-1');
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getOverride('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('getOrderOverrides', () => {
    it('should return overrides for order', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOverride] });

      const result = await service.getOrderOverrides(orderId, tenantId);

      expect(result).toHaveLength(1);
    });
  });

  describe('getPendingApprovals', () => {
    it('should return pending overrides', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleOverride, approval_status: OverrideApprovalStatus.PENDING }] });

      const result = await service.getPendingApprovals(tenantId);

      expect(result).toHaveLength(1);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('approval_status = $2'),
        [tenantId, OverrideApprovalStatus.PENDING]
      );
    });
  });

  describe('getAdminOverrides', () => {
    it('should return overrides by admin user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sampleOverride] });

      const result = await service.getAdminOverrides(adminUserId, tenantId);

      expect(result).toHaveLength(1);
    });

    it('should respect limit', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await service.getAdminOverrides(adminUserId, tenantId, 10);

      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [adminUserId, tenantId, 10]);
    });
  });

  describe('getApprovalWorkflow', () => {
    it('should return workflow for override type', async () => {
      const workflow = { id: 'wf-1', tenant_id: tenantId, override_type: AdminOverrideType.ADJUST_PRICE, requires_approval: true, min_approval_level: 'MANAGER', is_active: true };
      mockQuery.mockResolvedValueOnce({ rows: [workflow] });

      const result = await service.getApprovalWorkflow(tenantId, AdminOverrideType.ADJUST_PRICE);

      expect(result?.requiresApproval).toBe(true);
    });

    it('should return null when no workflow', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await service.getApprovalWorkflow(tenantId, AdminOverrideType.STATUS_CHANGE);

      expect(result).toBeNull();
    });
  });

  describe('getAuditLog', () => {
    it('should return audit log for override', async () => {
      const auditLog = { id: 'audit-1', tenant_id: tenantId, override_id: 'override-1', action: 'CREATED', actor_user_id: adminUserId, actor_role: AdminRole.ADMIN, changes: {}, created_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [auditLog] });

      const result = await service.getAuditLog('override-1', tenantId);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe('CREATED');
    });
  });
});
