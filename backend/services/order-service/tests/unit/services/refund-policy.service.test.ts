/**
 * Unit Tests: Refund Policy Service
 * Tests refund policy and rule management
 */

const mockQuery = jest.fn();
const mockPool = { query: mockQuery };

jest.mock('../../../src/config/database', () => ({
  getDatabase: jest.fn(() => mockPool),
}));

import { RefundPolicyService } from '../../../src/services/refund-policy.service';
import { RefundRuleType } from '../../../src/types/refund-policy.types';

describe('RefundPolicyService', () => {
  let service: RefundPolicyService;
  const tenantId = 'tenant-123';
  const policyId = 'policy-456';
  const ruleId = 'rule-789';

  const samplePolicy = {
    id: policyId,
    tenant_id: tenantId,
    policy_name: 'Standard Refund Policy',
    description: 'Default refund policy',
    refund_window_hours: 48,
    pro_rated: false,
    conditions: { min_amount: 100 },
    event_type: 'concert',
    ticket_type: 'general',
    active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const sampleRule = {
    id: ruleId,
    policy_id: policyId,
    rule_type: RefundRuleType.TIME_BASED,
    rule_config: {
      tiers: [
        { hours_before_event: 72, refund_percentage: 100 },
        { hours_before_event: 24, refund_percentage: 50 },
      ],
    },
    priority: 10,
    active: true,
    created_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RefundPolicyService();
  });

  describe('createPolicy', () => {
    const createRequest = {
      policy_name: 'VIP Refund Policy',
      description: 'Generous refunds for VIP',
      refund_window_hours: 72,
      pro_rated: true,
      conditions: { vip_only: true },
      event_type: 'concert',
      ticket_type: 'vip',
    };

    it('should create policy successfully', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      const result = await service.createPolicy(tenantId, createRequest);

      expect(result).toEqual(samplePolicy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refund_policies'),
        [
          tenantId,
          createRequest.policy_name,
          createRequest.description,
          createRequest.refund_window_hours,
          createRequest.pro_rated,
          JSON.stringify(createRequest.conditions),
          createRequest.event_type,
          createRequest.ticket_type,
        ]
      );
    });

    it('should create policy with null optional fields', async () => {
      const minimalRequest = {
        policy_name: 'Basic Policy',
        refund_window_hours: 24,
        pro_rated: false,
      };

      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      await service.createPolicy(tenantId, minimalRequest);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refund_policies'),
        expect.arrayContaining([tenantId, minimalRequest.policy_name, null])
      );
    });
  });

  describe('getPolicyById', () => {
    it('should return policy by ID', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      const result = await service.getPolicyById(policyId, tenantId);

      expect(result).toEqual(samplePolicy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM refund_policies'),
        [policyId, tenantId]
      );
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getPolicyById('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('getPolicies', () => {
    const multiplePolicies = [samplePolicy, { ...samplePolicy, id: 'policy-2' }];

    it('should return active policies by default', async () => {
      mockQuery.mockResolvedValue({ rows: multiplePolicies });

      const result = await service.getPolicies(tenantId);

      expect(result).toEqual(multiplePolicies);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND active = true'),
        [tenantId]
      );
    });

    it('should return all policies when activeOnly is false', async () => {
      mockQuery.mockResolvedValue({ rows: multiplePolicies });

      await service.getPolicies(tenantId, false);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('AND active = true'),
        [tenantId]
      );
    });

    it('should order by created_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: multiplePolicies });

      await service.getPolicies(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        [tenantId]
      );
    });
  });

  describe('getPolicyForOrder', () => {
    it('should return exact match policy', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      const result = await service.getPolicyForOrder(tenantId, 'concert', 'general');

      expect(result).toEqual(samplePolicy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE tenant_id = $1'),
        [tenantId, 'concert', 'general']
      );
    });

    it('should return policy with correct priority ordering', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      await service.getPolicyForOrder(tenantId, 'concert', 'vip');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY'),
        expect.any(Array)
      );
    });

    it('should return null when no policy found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getPolicyForOrder(tenantId, 'unknown', 'unknown');

      expect(result).toBeNull();
    });

    it('should handle null event and ticket types', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      await service.getPolicyForOrder(tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [tenantId, null, null]
      );
    });
  });

  describe('updatePolicy', () => {
    it('should update policy fields', async () => {
      const updates = {
        policy_name: 'Updated Policy',
        refund_window_hours: 96,
      };

      mockQuery.mockResolvedValue({ rows: [{ ...samplePolicy, ...updates }] });

      const result = await service.updatePolicy(policyId, tenantId, updates);

      expect(result?.policy_name).toBe(updates.policy_name);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refund_policies'),
        expect.arrayContaining([updates.policy_name, updates.refund_window_hours, policyId, tenantId])
      );
    });

    it('should update conditions as JSON', async () => {
      const updates = {
        conditions: { new_condition: true },
      };

      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      await service.updatePolicy(policyId, tenantId, updates);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('conditions = $1'),
        expect.arrayContaining([JSON.stringify(updates.conditions)])
      );
    });

    it('should return existing policy if no updates provided', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      const result = await service.updatePolicy(policyId, tenantId, {});

      expect(result).toEqual(samplePolicy);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM refund_policies'),
        [policyId, tenantId]
      );
    });

    it('should update updated_at timestamp', async () => {
      const updates = { policy_name: 'New Name' };
      mockQuery.mockResolvedValue({ rows: [samplePolicy] });

      await service.updatePolicy(policyId, tenantId, updates);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should return null when policy not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.updatePolicy('nonexistent', tenantId, { policy_name: 'Test' });

      expect(result).toBeNull();
    });
  });

  describe('deactivatePolicy', () => {
    it('should deactivate policy successfully', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await service.deactivatePolicy(policyId, tenantId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET active = false'),
        [policyId, tenantId]
      );
    });

    it('should return false when policy not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await service.deactivatePolicy('nonexistent', tenantId);

      expect(result).toBe(false);
    });

    it('should update updated_at on deactivation', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.deactivatePolicy(policyId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.any(Array)
      );
    });
  });

  describe('createRule', () => {
    const createRuleRequest = {
      policy_id: policyId,
      rule_type: RefundRuleType.PERCENTAGE,
      rule_config: {
        percentage: 80,
        apply_to: 'ORDER_TOTAL' as const,
      },
      priority: 5,
    };

    it('should create rule successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [samplePolicy] }) // getPolicyById
        .mockResolvedValueOnce({ rows: [sampleRule] }); // insert rule

      const result = await service.createRule(tenantId, createRuleRequest);

      expect(result).toEqual(sampleRule);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refund_policy_rules'),
        [
          createRuleRequest.policy_id,
          createRuleRequest.rule_type,
          JSON.stringify(createRuleRequest.rule_config),
          createRuleRequest.priority,
        ]
      );
    });

    it('should throw error if policy not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(service.createRule(tenantId, createRuleRequest)).rejects.toThrow('Policy not found');
    });

    it('should default priority to 0 if not provided', async () => {
      const requestWithoutPriority = {
        policy_id: policyId,
        rule_type: RefundRuleType.FLAT_FEE,
        rule_config: { fee_cents: 500, deduct_from_refund: true },
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [samplePolicy] })
        .mockResolvedValueOnce({ rows: [sampleRule] });

      await service.createRule(tenantId, requestWithoutPriority);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refund_policy_rules'),
        expect.arrayContaining([0])
      );
    });
  });

  describe('getRulesForPolicy', () => {
    const multipleRules = [sampleRule, { ...sampleRule, id: 'rule-2' }];

    it('should return rules for policy', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [samplePolicy] })
        .mockResolvedValueOnce({ rows: multipleRules });

      const result = await service.getRulesForPolicy(policyId, tenantId);

      expect(result).toEqual(multipleRules);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE policy_id = $1 AND active = true'),
        [policyId]
      );
    });

    it('should order by priority DESC then created_at ASC', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [samplePolicy] })
        .mockResolvedValueOnce({ rows: multipleRules });

      await service.getRulesForPolicy(policyId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY priority DESC, created_at ASC'),
        [policyId]
      );
    });

    it('should throw error if policy not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await expect(service.getRulesForPolicy('nonexistent', tenantId)).rejects.toThrow('Policy not found');
    });
  });

  describe('getRuleById', () => {
    it('should return rule by ID', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRule] });

      const result = await service.getRuleById(ruleId, tenantId);

      expect(result).toEqual(sampleRule);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN refund_policies rp ON rpr.policy_id = rp.id'),
        [ruleId, tenantId]
      );
    });

    it('should return null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.getRuleById('nonexistent', tenantId);

      expect(result).toBeNull();
    });
  });

  describe('updateRule', () => {
    it('should update rule fields', async () => {
      const updates = {
        priority: 20,
        rule_config: { percentage: 90, apply_to: 'TICKET_PRICE_ONLY' as const },
      };

      mockQuery.mockResolvedValue({ rows: [{ ...sampleRule, ...updates }] });

      const result = await service.updateRule(ruleId, tenantId, updates);

      expect(result?.priority).toBe(updates.priority);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refund_policy_rules'),
        expect.arrayContaining([updates.priority, JSON.stringify(updates.rule_config), ruleId, tenantId])
      );
    });

    it('should return existing rule if no updates provided', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRule] });

      const result = await service.updateRule(ruleId, tenantId, {});

      expect(result).toEqual(sampleRule);
    });

    it('should return null when rule not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await service.updateRule('nonexistent', tenantId, { priority: 10 });

      expect(result).toBeNull();
    });

    it('should verify tenant ownership through JOIN', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRule] });

      await service.updateRule(ruleId, tenantId, { priority: 15 });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM refund_policies rp'),
        expect.any(Array)
      );
    });
  });

  describe('deactivateRule', () => {
    it('should deactivate rule successfully', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await service.deactivateRule(ruleId, tenantId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SET active = false'),
        [ruleId, tenantId]
      );
    });

    it('should return false when rule not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await service.deactivateRule('nonexistent', tenantId);

      expect(result).toBe(false);
    });

    it('should verify tenant ownership through JOIN', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.deactivateRule(ruleId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM refund_policies rp'),
        expect.any(Array)
      );
    });
  });

  describe('deleteRule', () => {
    it('should delete rule successfully', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await service.deleteRule(ruleId, tenantId);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM refund_policy_rules'),
        [ruleId, tenantId]
      );
    });

    it('should return false when rule not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await service.deleteRule('nonexistent', tenantId);

      expect(result).toBe(false);
    });

    it('should verify tenant ownership through USING', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await service.deleteRule(ruleId, tenantId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('USING refund_policies rp'),
        expect.any(Array)
      );
    });
  });
});
