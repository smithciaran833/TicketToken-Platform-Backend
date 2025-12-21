import { Pool } from 'pg';
import { 
  AdminOverride, 
  AdminOverrideType, 
  OverrideApprovalStatus,
  ApprovalWorkflow,
  OverrideAuditLog,
  AdminRole
} from '../types/admin.types';
// import { requiresApproval, canPerformOverride } from '../utils/admin-permissions';

// Stub functions (utils/admin-permissions not implemented)
const requiresApproval = (overrideType: AdminOverrideType, adminRole: AdminRole): boolean => false;
const canPerformOverride = (adminRole: AdminRole, overrideType: AdminOverrideType): boolean => true;

export class AdminOverrideService {
  constructor(private pool: Pool) {}

  async createOverride(
    tenantId: string,
    orderId: string,
    adminUserId: string,
    adminRole: AdminRole,
    overrideType: AdminOverrideType,
    originalValue: any,
    newValue: any,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<AdminOverride> {
    // Check if admin can perform this override
    if (!canPerformOverride(adminRole, overrideType)) {
      throw new Error(`Insufficient permissions to perform ${overrideType}`);
    }

    // Determine if approval is required
    const needsApproval = requiresApproval(overrideType, adminRole);
    const approvalStatus = needsApproval ? 
      OverrideApprovalStatus.PENDING : 
      OverrideApprovalStatus.AUTO_APPROVED;

    const result = await this.pool.query(
      `INSERT INTO admin_overrides 
       (tenant_id, order_id, admin_user_id, override_type, original_value, 
        new_value, reason, approval_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tenantId, orderId, adminUserId, overrideType,
        JSON.stringify(originalValue), JSON.stringify(newValue),
        reason, approvalStatus, JSON.stringify(metadata || {})
      ]
    );

    // Log the creation
    await this.logAudit(
      tenantId,
      result.rows[0].id,
      'CREATED',
      adminUserId,
      adminRole,
      { originalValue, newValue, reason }
    );

    return this.mapOverride(result.rows[0]);
  }

  async approveOverride(
    overrideId: string,
    tenantId: string,
    approvingUserId: string,
    approvingUserRole: AdminRole
  ): Promise<AdminOverride> {
    // Get the override
    const override = await this.getOverride(overrideId, tenantId);
    
    if (!override) {
      throw new Error('Override not found');
    }

    if (override.approvalStatus !== OverrideApprovalStatus.PENDING) {
      throw new Error('Override is not pending approval');
    }

    // Update approval status
    const result = await this.pool.query(
      `UPDATE admin_overrides 
       SET approval_status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [OverrideApprovalStatus.APPROVED, approvingUserId, overrideId, tenantId]
    );

    // Log the approval
    await this.logAudit(
      tenantId,
      overrideId,
      'APPROVED',
      approvingUserId,
      approvingUserRole,
      { approvedBy: approvingUserId }
    );

    return this.mapOverride(result.rows[0]);
  }

  async rejectOverride(
    overrideId: string,
    tenantId: string,
    rejectingUserId: string,
    rejectingUserRole: AdminRole,
    rejectionReason: string
  ): Promise<AdminOverride> {
    const result = await this.pool.query(
      `UPDATE admin_overrides 
       SET approval_status = $1, rejection_reason = $2, updated_at = NOW()
       WHERE id = $3 AND tenant_id = $4
       RETURNING *`,
      [OverrideApprovalStatus.REJECTED, rejectionReason, overrideId, tenantId]
    );

    // Log the rejection
    await this.logAudit(
      tenantId,
      overrideId,
      'REJECTED',
      rejectingUserId,
      rejectingUserRole,
      { rejectionReason }
    );

    return this.mapOverride(result.rows[0]);
  }

  async getOverride(overrideId: string, tenantId: string): Promise<AdminOverride | null> {
    const result = await this.pool.query(
      `SELECT * FROM admin_overrides WHERE id = $1 AND tenant_id = $2`,
      [overrideId, tenantId]
    );

    return result.rows[0] ? this.mapOverride(result.rows[0]) : null;
  }

  async getOrderOverrides(orderId: string, tenantId: string): Promise<AdminOverride[]> {
    const result = await this.pool.query(
      `SELECT * FROM admin_overrides 
       WHERE order_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC`,
      [orderId, tenantId]
    );

    return result.rows.map(row => this.mapOverride(row));
  }

  async getPendingApprovals(tenantId: string): Promise<AdminOverride[]> {
    const result = await this.pool.query(
      `SELECT * FROM admin_overrides 
       WHERE tenant_id = $1 AND approval_status = $2
       ORDER BY created_at ASC`,
      [tenantId, OverrideApprovalStatus.PENDING]
    );

    return result.rows.map(row => this.mapOverride(row));
  }

  async getAdminOverrides(
    adminUserId: string,
    tenantId: string,
    limit: number = 50
  ): Promise<AdminOverride[]> {
    const result = await this.pool.query(
      `SELECT * FROM admin_overrides 
       WHERE admin_user_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [adminUserId, tenantId, limit]
    );

    return result.rows.map(row => this.mapOverride(row));
  }

  async getApprovalWorkflow(
    tenantId: string,
    overrideType: AdminOverrideType
  ): Promise<ApprovalWorkflow | null> {
    const result = await this.pool.query(
      `SELECT * FROM admin_approval_workflow 
       WHERE tenant_id = $1 AND override_type = $2 AND is_active = true`,
      [tenantId, overrideType]
    );

    return result.rows[0] ? this.mapApprovalWorkflow(result.rows[0]) : null;
  }

  async updateApprovalWorkflow(
    workflowId: string,
    tenantId: string,
    updates: Partial<ApprovalWorkflow>
  ): Promise<ApprovalWorkflow> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 0;

    if (updates.requiresApproval !== undefined) {
      fields.push(`requires_approval = $${++paramCount}`);
      values.push(updates.requiresApproval);
    }

    if (updates.minApprovalLevel) {
      fields.push(`min_approval_level = $${++paramCount}`);
      values.push(updates.minApprovalLevel);
    }

    if (updates.approvalTimeoutHours !== undefined) {
      fields.push(`approval_timeout_hours = $${++paramCount}`);
      values.push(updates.approvalTimeoutHours);
    }

    if (updates.notifyRoles) {
      fields.push(`notify_roles = $${++paramCount}`);
      values.push(updates.notifyRoles);
    }

    if (updates.isActive !== undefined) {
      fields.push(`is_active = $${++paramCount}`);
      values.push(updates.isActive);
    }

    fields.push(`updated_at = NOW()`);
    values.push(workflowId, tenantId);

    const result = await this.pool.query(
      `UPDATE admin_approval_workflow 
       SET ${fields.join(', ')}
       WHERE id = $${paramCount + 1} AND tenant_id = $${paramCount + 2}
       RETURNING *`,
      values
    );

    return this.mapApprovalWorkflow(result.rows[0]);
  }

  async getAuditLog(
    overrideId: string,
    tenantId: string
  ): Promise<OverrideAuditLog[]> {
    const result = await this.pool.query(
      `SELECT * FROM admin_override_audit 
       WHERE override_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC`,
      [overrideId, tenantId]
    );

    return result.rows.map(row => this.mapAuditLog(row));
  }

  private async logAudit(
    tenantId: string,
    overrideId: string,
    action: string,
    actorUserId: string,
    actorRole: AdminRole | string,
    changes: Record<string, any>,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO admin_override_audit 
       (tenant_id, override_id, action, actor_user_id, actor_role, changes, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        tenantId, overrideId, action, actorUserId, actorRole,
        JSON.stringify(changes), ipAddress, userAgent
      ]
    );
  }

  private mapOverride(row: any): AdminOverride {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      orderId: row.order_id,
      adminUserId: row.admin_user_id,
      overrideType: row.override_type,
      originalValue: row.original_value,
      newValue: row.new_value,
      reason: row.reason,
      approvalStatus: row.approval_status,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      rejectionReason: row.rejection_reason,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapApprovalWorkflow(row: any): ApprovalWorkflow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      overrideType: row.override_type,
      requiresApproval: row.requires_approval,
      minApprovalLevel: row.min_approval_level,
      approvalTimeoutHours: row.approval_timeout_hours,
      notifyRoles: row.notify_roles,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapAuditLog(row: any): OverrideAuditLog {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      overrideId: row.override_id,
      action: row.action,
      actorUserId: row.actor_user_id,
      actorRole: row.actor_role,
      changes: row.changes,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      createdAt: row.created_at
    };
  }
}
