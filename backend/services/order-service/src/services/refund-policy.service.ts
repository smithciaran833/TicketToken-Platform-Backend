import { Pool } from 'pg';
import { getDatabase } from '../config/database';
import {
  RefundPolicy,
  RefundPolicyRule,
  CreateRefundPolicyRequest,
  CreateRefundPolicyRuleRequest,
  RefundRuleType
} from '../types/refund-policy.types';

export class RefundPolicyService {
  private db: Pool;

  constructor() {
    this.db = getDatabase();
  }

  async createPolicy(tenantId: string, request: CreateRefundPolicyRequest): Promise<RefundPolicy> {
    const query = `
      INSERT INTO refund_policies (
        tenant_id, policy_name, description, refund_window_hours,
        pro_rated, conditions, event_type, ticket_type
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      tenantId,
      request.policy_name,
      request.description || null,
      request.refund_window_hours,
      request.pro_rated,
      request.conditions ? JSON.stringify(request.conditions) : null,
      request.event_type || null,
      request.ticket_type || null
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getPolicyById(policyId: string, tenantId: string): Promise<RefundPolicy | null> {
    const query = `
      SELECT * FROM refund_policies
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.db.query(query, [policyId, tenantId]);
    return result.rows[0] || null;
  }

  async getPolicies(tenantId: string, activeOnly: boolean = true): Promise<RefundPolicy[]> {
    let query = `
      SELECT * FROM refund_policies
      WHERE tenant_id = $1
    `;

    if (activeOnly) {
      query += ` AND active = true`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.db.query(query, [tenantId]);
    return result.rows;
  }

  async getPolicyForOrder(
    tenantId: string,
    eventType?: string,
    ticketType?: string
  ): Promise<RefundPolicy | null> {
    const query = `
      SELECT * FROM refund_policies
      WHERE tenant_id = $1
        AND active = true
        AND (
          (event_type = $2 AND ticket_type = $3) OR
          (event_type = $2 AND ticket_type IS NULL) OR
          (event_type IS NULL AND ticket_type = $3) OR
          (event_type IS NULL AND ticket_type IS NULL)
        )
      ORDER BY 
        CASE 
          WHEN event_type = $2 AND ticket_type = $3 THEN 1
          WHEN event_type = $2 AND ticket_type IS NULL THEN 2
          WHEN event_type IS NULL AND ticket_type = $3 THEN 3
          ELSE 4
        END
      LIMIT 1
    `;

    const result = await this.db.query(query, [tenantId, eventType || null, ticketType || null]);
    return result.rows[0] || null;
  }

  async updatePolicy(
    policyId: string,
    tenantId: string,
    updates: Partial<CreateRefundPolicyRequest>
  ): Promise<RefundPolicy | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.policy_name !== undefined) {
      fields.push(`policy_name = $${paramIndex++}`);
      values.push(updates.policy_name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.refund_window_hours !== undefined) {
      fields.push(`refund_window_hours = $${paramIndex++}`);
      values.push(updates.refund_window_hours);
    }
    if (updates.pro_rated !== undefined) {
      fields.push(`pro_rated = $${paramIndex++}`);
      values.push(updates.pro_rated);
    }
    if (updates.conditions !== undefined) {
      fields.push(`conditions = $${paramIndex++}`);
      values.push(JSON.stringify(updates.conditions));
    }
    if (updates.event_type !== undefined) {
      fields.push(`event_type = $${paramIndex++}`);
      values.push(updates.event_type);
    }
    if (updates.ticket_type !== undefined) {
      fields.push(`ticket_type = $${paramIndex++}`);
      values.push(updates.ticket_type);
    }

    if (fields.length === 0) {
      return this.getPolicyById(policyId, tenantId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(policyId, tenantId);

    const query = `
      UPDATE refund_policies
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
      RETURNING *
    `;

    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async deactivatePolicy(policyId: string, tenantId: string): Promise<boolean> {
    const query = `
      UPDATE refund_policies
      SET active = false, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await this.db.query(query, [policyId, tenantId]);
    return result.rowCount > 0;
  }

  async createRule(tenantId: string, request: CreateRefundPolicyRuleRequest): Promise<RefundPolicyRule> {
    const policy = await this.getPolicyById(request.policy_id, tenantId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    const query = `
      INSERT INTO refund_policy_rules (
        policy_id, rule_type, rule_config, priority
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [
      request.policy_id,
      request.rule_type,
      JSON.stringify(request.rule_config),
      request.priority || 0
    ];

    const result = await this.db.query(query, values);
    return result.rows[0];
  }

  async getRulesForPolicy(policyId: string, tenantId: string): Promise<RefundPolicyRule[]> {
    const policy = await this.getPolicyById(policyId, tenantId);
    if (!policy) {
      throw new Error('Policy not found');
    }

    const query = `
      SELECT * FROM refund_policy_rules
      WHERE policy_id = $1 AND active = true
      ORDER BY priority DESC, created_at ASC
    `;

    const result = await this.db.query(query, [policyId]);
    return result.rows;
  }

  async getRuleById(ruleId: string, tenantId: string): Promise<RefundPolicyRule | null> {
    const query = `
      SELECT rpr.* FROM refund_policy_rules rpr
      JOIN refund_policies rp ON rpr.policy_id = rp.id
      WHERE rpr.id = $1 AND rp.tenant_id = $2
    `;

    const result = await this.db.query(query, [ruleId, tenantId]);
    return result.rows[0] || null;
  }

  async updateRule(
    ruleId: string,
    tenantId: string,
    updates: Partial<CreateRefundPolicyRuleRequest>
  ): Promise<RefundPolicyRule | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.rule_type !== undefined) {
      fields.push(`rule_type = $${paramIndex++}`);
      values.push(updates.rule_type);
    }
    if (updates.rule_config !== undefined) {
      fields.push(`rule_config = $${paramIndex++}`);
      values.push(JSON.stringify(updates.rule_config));
    }
    if (updates.priority !== undefined) {
      fields.push(`priority = $${paramIndex++}`);
      values.push(updates.priority);
    }

    if (fields.length === 0) {
      return this.getRuleById(ruleId, tenantId);
    }

    values.push(ruleId, tenantId);

    const query = `
      UPDATE refund_policy_rules rpr
      SET ${fields.join(', ')}
      FROM refund_policies rp
      WHERE rpr.id = $${paramIndex++}
        AND rpr.policy_id = rp.id
        AND rp.tenant_id = $${paramIndex++}
      RETURNING rpr.*
    `;

    const result = await this.db.query(query, values);
    return result.rows[0] || null;
  }

  async deactivateRule(ruleId: string, tenantId: string): Promise<boolean> {
    const query = `
      UPDATE refund_policy_rules rpr
      SET active = false
      FROM refund_policies rp
      WHERE rpr.id = $1
        AND rpr.policy_id = rp.id
        AND rp.tenant_id = $2
    `;

    const result = await this.db.query(query, [ruleId, tenantId]);
    return result.rowCount > 0;
  }

  async deleteRule(ruleId: string, tenantId: string): Promise<boolean> {
    const query = `
      DELETE FROM refund_policy_rules rpr
      USING refund_policies rp
      WHERE rpr.id = $1
        AND rpr.policy_id = rp.id
        AND rp.tenant_id = $2
    `;

    const result = await this.db.query(query, [ruleId, tenantId]);
    return result.rowCount > 0;
  }
}
