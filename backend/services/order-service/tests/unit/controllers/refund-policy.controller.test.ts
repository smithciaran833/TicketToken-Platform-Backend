/**
 * Unit Tests: Refund Policy Controller
 * Tests HTTP request handling, validation, and error responses
 */

const mockPolicyService = {
  createPolicy: jest.fn(),
  getPolicyById: jest.fn(),
  getPolicies: jest.fn(),
  updatePolicy: jest.fn(),
  deactivatePolicy: jest.fn(),
  createRule: jest.fn(),
  getRulesForPolicy: jest.fn(),
  getRuleById: jest.fn(),
  updateRule: jest.fn(),
  deactivateRule: jest.fn(),
  deleteRule: jest.fn(),
};

const mockReasonService = {
  createReason: jest.fn(),
  getReasonById: jest.fn(),
  getReasons: jest.fn(),
  updateReason: jest.fn(),
  deactivateReason: jest.fn(),
};

const mockEligibilityService = {
  checkEligibility: jest.fn(),
};

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Mock all validation schemas to always pass
jest.mock('../../../src/validators/refund-policy.schemas', () => ({
  createPolicySchema: { validate: jest.fn((data) => ({ value: data })) },
  updatePolicySchema: { validate: jest.fn((data) => ({ value: data })) },
  createRuleSchema: { validate: jest.fn((data) => ({ value: data })) },
  updateRuleSchema: { validate: jest.fn((data) => ({ value: data })) },
  createReasonSchema: { validate: jest.fn((data) => ({ value: data })) },
  updateReasonSchema: { validate: jest.fn((data) => ({ value: data })) },
  checkEligibilitySchema: { validate: jest.fn((data) => ({ value: data })) },
  listPoliciesQuerySchema: { validate: jest.fn((data) => ({ value: data })) },
  listReasonsQuerySchema: { validate: jest.fn((data) => ({ value: data })) },
}));

jest.mock('../../../src/services/refund-policy.service', () => ({
  RefundPolicyService: jest.fn(() => mockPolicyService),
}));

jest.mock('../../../src/services/refund-reason.service', () => ({
  RefundReasonService: jest.fn(() => mockReasonService),
}));

jest.mock('../../../src/services/refund-eligibility.service', () => ({
  RefundEligibilityService: jest.fn(() => mockEligibilityService),
}));

jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger,
}));

import { RefundPolicyController } from '../../../src/controllers/refund-policy.controller';
import * as schemas from '../../../src/validators/refund-policy.schemas';

describe('RefundPolicyController', () => {
  let controller: RefundPolicyController;
  let mockRequest: any;
  let mockReply: any;

  const tenantId = 'tenant-123';
  const userId = 'user-456';

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new RefundPolicyController();

    mockRequest = {
      id: 'req-123',
      tenantId,
      user: { id: userId },
      params: {},
      query: {},
      body: {},
    };

    mockReply = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('createPolicy', () => {
    it('should create policy successfully', async () => {
      const policyData = {
        policy_name: 'Test Policy',
        order_type: 'standard',
      };

      const createdPolicy = { id: 'policy-1', ...policyData };

      mockRequest.body = policyData;
      mockPolicyService.createPolicy.mockResolvedValue(createdPolicy);

      await controller.createPolicy(mockRequest, mockReply);

      expect(mockPolicyService.createPolicy).toHaveBeenCalledWith(tenantId, policyData);
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(createdPolicy);
    });

    it('should return 400 for invalid request body', async () => {
      mockRequest.body = { invalid: 'data' };
      (schemas.createPolicySchema.validate as jest.Mock).mockReturnValueOnce({
        error: { details: [{ message: 'Validation failed' }] },
      });

      await controller.createPolicy(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Validation failed' })
      );
    });

    it('should return 500 on service error', async () => {
      mockRequest.body = { policy_name: 'Test', order_type: 'standard' };
      mockPolicyService.createPolicy.mockRejectedValue(new Error('DB error'));

      await controller.createPolicy(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(500);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getPolicy', () => {
    it('should return policy by ID', async () => {
      const policy = { id: 'policy-1', policy_name: 'Test Policy' };
      mockRequest.params = { policyId: 'policy-1' };
      mockPolicyService.getPolicyById.mockResolvedValue(policy);

      await controller.getPolicy(mockRequest, mockReply);

      expect(mockPolicyService.getPolicyById).toHaveBeenCalledWith('policy-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith(policy);
    });

    it('should return 404 if policy not found', async () => {
      mockRequest.params = { policyId: 'nonexistent' };
      mockPolicyService.getPolicyById.mockResolvedValue(null);

      await controller.getPolicy(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'Policy not found' })
      );
    });
  });

  describe('getPolicies', () => {
    it('should return all policies with active_only default true', async () => {
      const policies = [{ id: 'policy-1' }, { id: 'policy-2' }];
      mockRequest.query = {};
      (schemas.listPoliciesQuerySchema.validate as jest.Mock).mockReturnValueOnce({
        value: {},
      });
      mockPolicyService.getPolicies.mockResolvedValue(policies);

      await controller.getPolicies(mockRequest, mockReply);

      expect(mockPolicyService.getPolicies).toHaveBeenCalledWith(tenantId, true);
      expect(mockReply.send).toHaveBeenCalledWith(policies);
    });

    it('should return all policies including inactive when active_only=false', async () => {
      mockRequest.query = { active_only: false };
      (schemas.listPoliciesQuerySchema.validate as jest.Mock).mockReturnValueOnce({
        value: { active_only: false },
      });
      const policies = [{ id: 'policy-1' }, { id: 'policy-2' }];
      mockPolicyService.getPolicies.mockResolvedValue(policies);

      await controller.getPolicies(mockRequest, mockReply);

      expect(mockPolicyService.getPolicies).toHaveBeenCalledWith(tenantId, false);
    });
  });

  describe('updatePolicy', () => {
    it('should update policy successfully', async () => {
      const updates = { policy_name: 'Updated Name' };
      const updatedPolicy = { id: 'policy-1', ...updates };

      mockRequest.params = { policyId: 'policy-1' };
      mockRequest.body = updates;
      mockPolicyService.updatePolicy.mockResolvedValue(updatedPolicy);

      await controller.updatePolicy(mockRequest, mockReply);

      expect(mockPolicyService.updatePolicy).toHaveBeenCalledWith('policy-1', tenantId, updates);
      expect(mockReply.send).toHaveBeenCalledWith(updatedPolicy);
    });

    it('should return 404 if policy not found', async () => {
      mockRequest.params = { policyId: 'nonexistent' };
      mockRequest.body = { policy_name: 'Updated' };
      mockPolicyService.updatePolicy.mockResolvedValue(null);

      await controller.updatePolicy(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deactivatePolicy', () => {
    it('should deactivate policy successfully', async () => {
      mockRequest.params = { policyId: 'policy-1' };
      mockPolicyService.deactivatePolicy.mockResolvedValue(true);

      await controller.deactivatePolicy(mockRequest, mockReply);

      expect(mockPolicyService.deactivatePolicy).toHaveBeenCalledWith('policy-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Policy deactivated successfully' });
    });

    it('should return 404 if policy not found', async () => {
      mockRequest.params = { policyId: 'nonexistent' };
      mockPolicyService.deactivatePolicy.mockResolvedValue(false);

      await controller.deactivatePolicy(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createRule', () => {
    it('should create rule successfully', async () => {
      const ruleData = {
        policy_id: 'policy-1',
        rule_type: 'FULL_REFUND',
      };
      const createdRule = { id: 'rule-1', ...ruleData };

      mockRequest.body = ruleData;
      mockPolicyService.createRule.mockResolvedValue(createdRule);

      await controller.createRule(mockRequest, mockReply);

      expect(mockPolicyService.createRule).toHaveBeenCalledWith(tenantId, ruleData);
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(createdRule);
    });

    it('should return 404 if policy not found', async () => {
      mockRequest.body = { policy_id: 'nonexistent', rule_type: 'FULL_REFUND' };
      mockPolicyService.createRule.mockRejectedValue(new Error('Policy not found'));

      await controller.createRule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getRulesForPolicy', () => {
    it('should return rules for policy', async () => {
      const rules = [{ id: 'rule-1' }, { id: 'rule-2' }];
      mockRequest.params = { policyId: 'policy-1' };
      mockPolicyService.getRulesForPolicy.mockResolvedValue(rules);

      await controller.getRulesForPolicy(mockRequest, mockReply);

      expect(mockPolicyService.getRulesForPolicy).toHaveBeenCalledWith('policy-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith(rules);
    });

    it('should return 404 if policy not found', async () => {
      mockRequest.params = { policyId: 'nonexistent' };
      mockPolicyService.getRulesForPolicy.mockRejectedValue(new Error('Policy not found'));

      await controller.getRulesForPolicy(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getRule', () => {
    it('should return rule by ID', async () => {
      const rule = { id: 'rule-1', rule_type: 'FULL_REFUND' };
      mockRequest.params = { ruleId: 'rule-1' };
      mockPolicyService.getRuleById.mockResolvedValue(rule);

      await controller.getRule(mockRequest, mockReply);

      expect(mockPolicyService.getRuleById).toHaveBeenCalledWith('rule-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith(rule);
    });

    it('should return 404 if rule not found', async () => {
      mockRequest.params = { ruleId: 'nonexistent' };
      mockPolicyService.getRuleById.mockResolvedValue(null);

      await controller.getRule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateRule', () => {
    it('should update rule successfully', async () => {
      const updates = { refund_percentage: 50 };
      const updatedRule = { id: 'rule-1', ...updates };

      mockRequest.params = { ruleId: 'rule-1' };
      mockRequest.body = updates;
      mockPolicyService.updateRule.mockResolvedValue(updatedRule);

      await controller.updateRule(mockRequest, mockReply);

      expect(mockPolicyService.updateRule).toHaveBeenCalledWith('rule-1', tenantId, updates);
      expect(mockReply.send).toHaveBeenCalledWith(updatedRule);
    });

    it('should return 404 if rule not found', async () => {
      mockRequest.params = { ruleId: 'nonexistent' };
      mockRequest.body = { refund_percentage: 50 };
      mockPolicyService.updateRule.mockResolvedValue(null);

      await controller.updateRule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deactivateRule', () => {
    it('should deactivate rule successfully', async () => {
      mockRequest.params = { ruleId: 'rule-1' };
      mockPolicyService.deactivateRule.mockResolvedValue(true);

      await controller.deactivateRule(mockRequest, mockReply);

      expect(mockPolicyService.deactivateRule).toHaveBeenCalledWith('rule-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Rule deactivated successfully' });
    });

    it('should return 404 if rule not found', async () => {
      mockRequest.params = { ruleId: 'nonexistent' };
      mockPolicyService.deactivateRule.mockResolvedValue(false);

      await controller.deactivateRule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deleteRule', () => {
    it('should delete rule successfully', async () => {
      mockRequest.params = { ruleId: 'rule-1' };
      mockPolicyService.deleteRule.mockResolvedValue(true);

      await controller.deleteRule(mockRequest, mockReply);

      expect(mockPolicyService.deleteRule).toHaveBeenCalledWith('rule-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Rule deleted successfully' });
    });

    it('should return 404 if rule not found', async () => {
      mockRequest.params = { ruleId: 'nonexistent' };
      mockPolicyService.deleteRule.mockResolvedValue(false);

      await controller.deleteRule(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('createReason', () => {
    it('should create reason successfully', async () => {
      const reasonData = {
        reason_code: 'EVENT_CANCELLED',
        reason_text: 'Event cancelled',
      };
      const createdReason = { id: 'reason-1', ...reasonData };

      mockRequest.body = reasonData;
      mockReasonService.createReason.mockResolvedValue(createdReason);

      await controller.createReason(mockRequest, mockReply);

      expect(mockReasonService.createReason).toHaveBeenCalledWith(tenantId, reasonData);
      expect(mockReply.status).toHaveBeenCalledWith(201);
      expect(mockReply.send).toHaveBeenCalledWith(createdReason);
    });
  });

  describe('getReason', () => {
    it('should return reason by ID', async () => {
      const reason = { id: 'reason-1', reason_code: 'EVENT_CANCELLED' };
      mockRequest.params = { reasonId: 'reason-1' };
      mockReasonService.getReasonById.mockResolvedValue(reason);

      await controller.getReason(mockRequest, mockReply);

      expect(mockReasonService.getReasonById).toHaveBeenCalledWith('reason-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith(reason);
    });

    it('should return 404 if reason not found', async () => {
      mockRequest.params = { reasonId: 'nonexistent' };
      mockReasonService.getReasonById.mockResolvedValue(null);

      await controller.getReason(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('getReasons', () => {
    it('should return reasons excluding internal by default', async () => {
      const reasons = [{ id: 'reason-1' }, { id: 'reason-2' }];
      mockRequest.query = {};
      (schemas.listReasonsQuerySchema.validate as jest.Mock).mockReturnValueOnce({
        value: {},
      });
      mockReasonService.getReasons.mockResolvedValue(reasons);

      await controller.getReasons(mockRequest, mockReply);

      expect(mockReasonService.getReasons).toHaveBeenCalledWith(tenantId, false);
      expect(mockReply.send).toHaveBeenCalledWith(reasons);
    });

    it('should include internal reasons when requested', async () => {
      mockRequest.query = { include_internal: true };
      (schemas.listReasonsQuerySchema.validate as jest.Mock).mockReturnValueOnce({
        value: { include_internal: true },
      });
      const reasons = [{ id: 'reason-1' }, { id: 'reason-2' }];
      mockReasonService.getReasons.mockResolvedValue(reasons);

      await controller.getReasons(mockRequest, mockReply);

      expect(mockReasonService.getReasons).toHaveBeenCalledWith(tenantId, true);
    });
  });

  describe('updateReason', () => {
    it('should update reason successfully', async () => {
      const updates = { reason_text: 'Updated text' };
      const updatedReason = { id: 'reason-1', ...updates };

      mockRequest.params = { reasonId: 'reason-1' };
      mockRequest.body = updates;
      mockReasonService.updateReason.mockResolvedValue(updatedReason);

      await controller.updateReason(mockRequest, mockReply);

      expect(mockReasonService.updateReason).toHaveBeenCalledWith('reason-1', tenantId, updates);
      expect(mockReply.send).toHaveBeenCalledWith(updatedReason);
    });

    it('should return 404 if reason not found', async () => {
      mockRequest.params = { reasonId: 'nonexistent' };
      mockRequest.body = { reason_text: 'Updated' };
      mockReasonService.updateReason.mockResolvedValue(null);

      await controller.updateReason(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('deactivateReason', () => {
    it('should deactivate reason successfully', async () => {
      mockRequest.params = { reasonId: 'reason-1' };
      mockReasonService.deactivateReason.mockResolvedValue(true);

      await controller.deactivateReason(mockRequest, mockReply);

      expect(mockReasonService.deactivateReason).toHaveBeenCalledWith('reason-1', tenantId);
      expect(mockReply.send).toHaveBeenCalledWith({ message: 'Reason deactivated successfully' });
    });

    it('should return 404 if reason not found', async () => {
      mockRequest.params = { reasonId: 'nonexistent' };
      mockReasonService.deactivateReason.mockResolvedValue(false);

      await controller.deactivateReason(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(404);
    });
  });

  describe('checkEligibility', () => {
    it('should check eligibility successfully', async () => {
      const eligibilityData = { orderId: 'order-123' };
      const eligibilityResult = { eligible: true, reason: 'Within refund window' };

      mockRequest.body = eligibilityData;
      mockEligibilityService.checkEligibility.mockResolvedValue(eligibilityResult);

      await controller.checkEligibility(mockRequest, mockReply);

      expect(mockEligibilityService.checkEligibility).toHaveBeenCalledWith(
        'order-123',
        userId,
        { tenantId }
      );
      expect(mockReply.send).toHaveBeenCalledWith(eligibilityResult);
    });

    it('should return 400 for invalid request body', async () => {
      mockRequest.body = { invalid: 'data' };
      (schemas.checkEligibilitySchema.validate as jest.Mock).mockReturnValueOnce({
        error: { details: [{ message: 'Validation failed' }] },
      });

      await controller.checkEligibility(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(400);
    });
  });
});
