import { FastifyRequest, FastifyReply } from 'fastify';
import { RefundPolicyService } from '../services/refund-policy.service';
import { RefundReasonService } from '../services/refund-reason.service';
import { RefundEligibilityService } from '../services/refund-eligibility.service';
import { logger } from '../utils/logger';
import {
  createPolicySchema,
  updatePolicySchema,
  createRuleSchema,
  updateRuleSchema,
  createReasonSchema,
  updateReasonSchema,
  checkEligibilitySchema,
  listPoliciesQuerySchema,
  listReasonsQuerySchema
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

  // MEDIUM: Helper to send error responses with requestId
  private sendError(reply: FastifyReply, req: FastifyRequest, statusCode: number, error: string, details?: any) {
    logger.error(error, { requestId: req.id, statusCode, details });
    return reply.status(statusCode).send({
      error,
      requestId: req.id,
      statusCode
    });
  }

  async createPolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = createPolicySchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const policy = await this.policyService.createPolicy(tenantId, value);
      return reply.status(201).send(policy);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to create refund policy', error);
    }
  }

  async getPolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const policy = await this.policyService.getPolicyById(policyId, tenantId);

      if (!policy) {
        return this.sendError(reply, req, 404, 'Policy not found');
      }

      return reply.send(policy);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to retrieve policy', error);
    }
  }

  async getPolicies(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = listPoliciesQuerySchema.validate(req.query);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const policies = await this.policyService.getPolicies(tenantId, value.active_only !== false);
      return reply.send(policies);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to retrieve policies', error);
    }
  }

  async updatePolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const { error, value } = updatePolicySchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const policy = await this.policyService.updatePolicy(policyId, tenantId, value);
      if (!policy) {
        return this.sendError(reply, req, 404, 'Policy not found');
      }

      return reply.send(policy);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to update policy', error);
    }
  }

  async deactivatePolicy(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { policyId } = req.params as any;
      const success = await this.policyService.deactivatePolicy(policyId, tenantId);
      if (!success) {
        return this.sendError(reply, req, 404, 'Policy not found');
      }

      return reply.send({ message: 'Policy deactivated successfully' });
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to deactivate policy', error);
    }
  }

  async createRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = createRuleSchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const rule = await this.policyService.createRule(tenantId, value);
      return reply.status(201).send(rule);
    } catch (error: any) {
      if (error.message === 'Policy not found') {
        return this.sendError(reply, req, 404, error.message);
      } else {
        return this.sendError(reply, req, 500, 'Failed to create rule', error);
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
        return this.sendError(reply, req, 404, error.message);
      } else {
        return this.sendError(reply, req, 500, 'Failed to retrieve rules', error);
      }
    }
  }

  async getRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const rule = await this.policyService.getRuleById(ruleId, tenantId);
      if (!rule) {
        return this.sendError(reply, req, 404, 'Rule not found');
      }

      return reply.send(rule);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to retrieve rule', error);
    }
  }

  async updateRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const { error, value } = updateRuleSchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const rule = await this.policyService.updateRule(ruleId, tenantId, value);
      if (!rule) {
        return this.sendError(reply, req, 404, 'Rule not found');
      }

      return reply.send(rule);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to update rule', error);
    }
  }

  async deactivateRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const success = await this.policyService.deactivateRule(ruleId, tenantId);
      if (!success) {
        return this.sendError(reply, req, 404, 'Rule not found');
      }

      return reply.send({ message: 'Rule deactivated successfully' });
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to deactivate rule', error);
    }
  }

  async deleteRule(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { ruleId } = req.params as any;
      const success = await this.policyService.deleteRule(ruleId, tenantId);
      if (!success) {
        return this.sendError(reply, req, 404, 'Rule not found');
      }

      return reply.send({ message: 'Rule deleted successfully' });
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to delete rule', error);
    }
  }

  async createReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = createReasonSchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const reason = await this.reasonService.createReason(tenantId, value);
      return reply.status(201).send(reason);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to create reason', error);
    }
  }

  async getReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { reasonId } = req.params as any;
      const reason = await this.reasonService.getReasonById(reasonId, tenantId);
      if (!reason) {
        return this.sendError(reply, req, 404, 'Reason not found');
      }

      return reply.send(reason);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to retrieve reason', error);
    }
  }

  async getReasons(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { error, value } = listReasonsQuerySchema.validate(req.query);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const reasons = await this.reasonService.getReasons(tenantId, value.include_internal === true);
      return reply.send(reasons);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to retrieve reasons', error);
    }
  }

  async updateReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { reasonId } = req.params as any;
      const { error, value } = updateReasonSchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const reason = await this.reasonService.updateReason(reasonId, tenantId, value);
      if (!reason) {
        return this.sendError(reply, req, 404, 'Reason not found');
      }

      return reply.send(reason);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to update reason', error);
    }
  }

  async deactivateReason(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const { reasonId } = req.params as any;
      const success = await this.reasonService.deactivateReason(reasonId, tenantId);
      if (!success) {
        return this.sendError(reply, req, 404, 'Reason not found');
      }

      return reply.send({ message: 'Reason deactivated successfully' });
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to deactivate reason', error);
    }
  }

  async checkEligibility(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tenantId = (req as any).tenantId;
      const userId = (req as any).user?.id;
      const { error, value } = checkEligibilitySchema.validate(req.body);
      if (error) {
        return this.sendError(reply, req, 400, error.details[0].message);
      }

      const eligibility = await this.eligibilityService.checkEligibility(
        value.orderId,
        userId,
        { tenantId }
      );

      return reply.send(eligibility);
    } catch (error) {
      return this.sendError(reply, req, 500, 'Failed to check eligibility', error);
    }
  }
}
