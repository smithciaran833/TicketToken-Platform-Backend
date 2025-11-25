import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  RefundReason,
  CreateRefundReasonRequest
} from '../types/refund-policy.types';

export class RefundReasonService {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async createReason(tenantId: string, request: CreateRefundReasonRequest): Promise<RefundReason> {
    const query = `
      INSERT INTO refund_reasons (
        tenant_id, reason_code, reason_text, description,
        requires_documentation, internal_only, auto_approve, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.reason_code,
      request.reason_text,
      request.description || null,
      request.requires_documentation ?? false,
      request.internal_only ?? false,
      request.auto_approve ?? false,
      request.priority ?? 0
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getReasonById(reasonId: string, tenantId: string): Promise<RefundReason | null> {
    const query = `
      SELECT * FROM refund_reasons
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.db.query(query, [reasonId, tenantId]);
    return result.rows[0] || null;
  }

  async getReasonByCode(reasonCode: string, tenantId: string): Promise<RefundReason | null> {
    const query = `
      SELECT * FROM refund_reasons
      WHERE reason_code = $1 AND tenant_id = $2 AND active = true
    `;

    const result = await this.db.query(query, [reasonCode, tenantId]);
    return result.rows[0] || null;
  }

  async getReasons(tenantId: string, includeInternal: boolean = false): Promise<RefundReason[]> {
    let query = `
      SELECT * FROM refund_reasons
      WHERE tenant_id = $1 AND active = true
    `;

    if (!includeInternal) {
      query += ` AND internal_only = false`;
    }

    query += ` ORDER BY priority DESC, reason_text ASC`;

    const result = await this.db.query(query, [tenantId]);
    return result.rows;
  }

  async updateReason(
    reasonId: string,
    tenantId: string,
    updates: Partial<CreateRefundReasonRequest>
  ): Promise<RefundReason | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.reason_code !== undefined) {
      fields.push(`reason_code = $${paramIndex++}`);
      values.push(updates.reason_code);
    }
    if (updates.reason_text !== undefined) {
      fields.push(`reason_text = $${paramIndex++}`);
      values.push(updates.reason_text);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.requires_documentation !== undefined) {
      fields.push(`requires_documentation = $${paramIndex++}`);
      values.push(updates.requires_documentation);
    }
    if (updates.internal_only !== undefined) {
      fields.push(`internal_only = $${paramIndex++}`);
      values.push(updates.internal_only);
    }
    if (updates.auto_approve !== undefined) {
      fields.push(`auto_approve = $${paramIndex++}`);
      values.push(updates.auto_approve);
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }

    if (fields.length === 0) {
      return this.getReasonById(reasonId, tenantId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(reasonId, tenantId);

    const query = `
      UPDATE refund_reasons
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async deactivateReason(reasonId: string, tenantId: string): Promise<boolean> {
    const query = `
      UPDATE refund_reasons
      SET active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.db.query(query, [reasonId, tenantId]);
    return result.rowCount > 0;
  }

  async deleteReason(reasonId: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM refund_reasons
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.db.query(query, [reasonId, tenantId]);
    return result.rowCount > 0;
  }
}
