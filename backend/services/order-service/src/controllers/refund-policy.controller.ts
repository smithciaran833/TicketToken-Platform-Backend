import { FastifyRequest, FastifyReply } from 'fastify';
import { RefundPolicyService } from '../services/refund-policy.service';
import { RefundReasonService } from '../services/refund-reason.service';
import { RefundEligibilityService } from '../services/refund-eligibility.service';
import {
  createRefundPolicySchema,
  updateRefundPolicySchema,
  createRefundPolicyRuleSchema,
  updateRefundPolicyRuleSchema,
  createRefundReasonSchema,
  updateRefundReasonSchema,
  checkRefundEligibilitySchema,
  policyQuerySchema,
  reasonQuerySchema
} from '../validators/refund-policy.schemas';

export class RefundPolicyController {
  private policyService: RefundPolicyService;
  private reasonService: RefundReasonService;
  private eligibilityService: RefundEligibilityService;

  constructor() {
    this.policyService = new RefundPolicyService();
    this.reasonService = new RefundReasonService();
    this.eligibilityService = new RefundEligibilityService();
  }

  async createPolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = createRefundPolicySchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const policy = await this.policyService.createPolicy(tenantId, value);
      return reply.status(201).send(policy);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to create refund policy' });
    }
  }

  async getPolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const policy = await this.policyService.getPolicyById(policyId, tenantId);
      
      if (!policy) {
        return reply.status(404).send({ error: 'Policy not found' });
      }

      return reply.send(policy);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to retrieve policy' });
    }
  }

  async getPolicies(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = policyQuerySchema.validate(req.query);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const policies = await this.policyService.getPolicies(tenantId, value.active_only !== false);
      return reply.send(policies);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to retrieve policies' });
    }
  }

  async updatePolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const { error, value } = updateRefundPolicySchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const policy = await this.policyService.updatePolicy(policyId, tenantId, value);
      if (!policy) {
        return reply.status(404).send({ error: 'Policy not found' });
      }

      return reply.send(policy);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update policy' });
    }
  }

  async deactivatePolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const success = await this.policyService.deactivatePolicy(policyId, tenantId);
      if (!success) {
        return reply.status(404).send({ error: 'Policy not found' });
      }

      return reply.send({ message: 'Policy deactivated successfully' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to deactivate policy' });
    }
  }

  async createRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = createRefundPolicyRuleSchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const rule = await this.policyService.createRule(tenantId, value);
      return reply.status(201).send(rule);
    } catch (error: any) {
      if (error.message === 'Policy not found') {
        return reply.status(404).send({ error: error.message });
      } else {
        return reply.status(500).send({ error: 'Failed to create rule' });
      }
    }
  }

  async getRulesForPolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const rules = await this.policyService.getRulesForPolicy(policyId, tenantId);
      return reply.send(rules);
    } catch (error: any) {
      if (error.message === 'Policy not found') {
        return reply.status(404).send({ error: error.message });
      } else {
        return reply.status(500).send({ error: 'Failed to retrieve rules' });
      }
    }
  }

  async getRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const rule = await this.policyService.getRuleById(ruleId, tenantId);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to retrieve rule' });
    }
  }

  async updateRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const { error, value } = updateRefundPolicyRuleSchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const rule = await this.policyService.updateRule(ruleId, tenantId, value);
      if (!rule) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send(rule);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update rule' });
    }
  }

  async deactivateRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const success = await this.policyService.deactivateRule(ruleId, tenantId);
      if (!success) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send({ message: 'Rule deactivated successfully' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to deactivate rule' });
    }
  }

  async deleteRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const success = await this.policyService.deleteRule(ruleId, tenantId);
      if (!success) {
        return reply.status(404).send({ error: 'Rule not found' });
      }

      return reply.send({ message: 'Rule deleted successfully' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to delete rule' });
    }
  }

  async createReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = createRefundReasonSchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const reason = await this.reasonService.createReason(tenantId, value);
      return reply.status(201).send(reason);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to create reason' });
    }
  }

  async getReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { reasonId } = req.params as any;
      const reason = await this.reasonService.getReasonById(reasonId, tenantId);
      if (!reason) {
        return reply.status(404).send({ error: 'Reason not found' });
      }

      return reply.send(reason);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to retrieve reason' });
    }
  }

  async getReasons(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = reasonQuerySchema.validate(req.query);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const reasons = await this.reasonService.getReasons(tenantId, value.include_internal === true);
      return reply.send(reasons);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to retrieve reasons' });
    }
  }

  async updateReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { reasonId } = req.params as any;
      const { error, value } = updateRefundReasonSchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const reason = await this.reasonService.updateReason(reasonId, tenantId, value);
      if (!reason) {
        return reply.status(404).send({ error: 'Reason not found' });
      }

      return reply.send(reason);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to update reason' });
    }
  }

  async deactivateReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { reasonId } = req.params as any;
      const success = await this.reasonService.deactivateReason(reasonId, tenantId);
      if (!success) {
        return reply.status(404).send({ error: 'Reason not found' });
      }

      return reply.send({ message: 'Reason deactivated successfully' });
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to deactivate reason' });
    }
  }

  async checkEligibility(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = checkRefundEligibilitySchema.validate(req.body);
      if (error) {
        return reply.status(400).send({ error: error.details[0].message });
      }

      const eligibility = await this.eligibilityService.checkEligibility({
        ...value,
        tenant_id: tenantId
      });
      
      return reply.send(eligibility);
    } catch (error) {
      return reply.status(500).send({ error: 'Failed to check eligibility' });
    }
  }
}
