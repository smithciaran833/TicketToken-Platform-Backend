import { Request, Response } from 'express';
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

interface AuthRequest extends Request {
  tenantId: string;
  userId: string;
}

export class RefundPolicyController {
  private policyService: RefundPolicyService;
  private reasonService: RefundReasonService;
  private eligibilityService: RefundEligibilityService;

  constructor() {
    this.policyService = new RefundPolicyService();
    this.reasonService = new RefundReasonService();
    this.eligibilityService = new RefundEligibilityService();
  }

  async createPolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createRefundPolicySchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const policy = await this.policyService.createPolicy(req.tenantId, value);
      res.status(201).json(policy);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create refund policy' });
    }
  }

  async getPolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const policy = await this.policyService.getPolicyById(req.params.policyId, req.tenantId);
      
      if (!policy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
      }

      res.json(policy);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve policy' });
    }
  }

  async getPolicies(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = policyQuerySchema.validate(req.query);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const policies = await this.policyService.getPolicies(req.tenantId, value.active_only !== false);
      res.json(policies);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve policies' });
    }
  }

  async updatePolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = updateRefundPolicySchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const policy = await this.policyService.updatePolicy(req.params.policyId, req.tenantId, value);
      if (!policy) {
        res.status(404).json({ error: 'Policy not found' });
        return;
      }

      res.json(policy);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update policy' });
    }
  }

  async deactivatePolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const success = await this.policyService.deactivatePolicy(req.params.policyId, req.tenantId);
      if (!success) {
        res.status(404).json({ error: 'Policy not found' });
        return;
      }

      res.json({ message: 'Policy deactivated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to deactivate policy' });
    }
  }

  async createRule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createRefundPolicyRuleSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const rule = await this.policyService.createRule(req.tenantId, value);
      res.status(201).json(rule);
    } catch (error: any) {
      if (error.message === 'Policy not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create rule' });
      }
    }
  }

  async getRulesForPolicy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const rules = await this.policyService.getRulesForPolicy(req.params.policyId, req.tenantId);
      res.json(rules);
    } catch (error: any) {
      if (error.message === 'Policy not found') {
        res.status(404).json({ error: error.message });
      } else {
        res.status(500).json({ error: 'Failed to retrieve rules' });
      }
    }
  }

  async getRule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const rule = await this.policyService.getRuleById(req.params.ruleId, req.tenantId);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve rule' });
    }
  }

  async updateRule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = updateRefundPolicyRuleSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const rule = await this.policyService.updateRule(req.params.ruleId, req.tenantId, value);
      if (!rule) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      res.json(rule);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update rule' });
    }
  }

  async deactivateRule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const success = await this.policyService.deactivateRule(req.params.ruleId, req.tenantId);
      if (!success) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      res.json({ message: 'Rule deactivated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to deactivate rule' });
    }
  }

  async deleteRule(req: AuthRequest, res: Response): Promise<void> {
    try {
      const success = await this.policyService.deleteRule(req.params.ruleId, req.tenantId);
      if (!success) {
        res.status(404).json({ error: 'Rule not found' });
        return;
      }

      res.json({ message: 'Rule deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to delete rule' });
    }
  }

  async createReason(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createRefundReasonSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const reason = await this.reasonService.createReason(req.tenantId, value);
      res.status(201).json(reason);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create reason' });
    }
  }

  async getReason(req: AuthRequest, res: Response): Promise<void> {
    try {
      const reason = await this.reasonService.getReasonById(req.params.reasonId, req.tenantId);
      if (!reason) {
        res.status(404).json({ error: 'Reason not found' });
        return;
      }

      res.json(reason);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve reason' });
    }
  }

  async getReasons(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = reasonQuerySchema.validate(req.query);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const reasons = await this.reasonService.getReasons(req.tenantId, value.include_internal === true);
      res.json(reasons);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve reasons' });
    }
  }

  async updateReason(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = updateRefundReasonSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const reason = await this.reasonService.updateReason(req.params.reasonId, req.tenantId, value);
      if (!reason) {
        res.status(404).json({ error: 'Reason not found' });
        return;
      }

      res.json(reason);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update reason' });
    }
  }

  async deactivateReason(req: AuthRequest, res: Response): Promise<void> {
    try {
      const success = await this.reasonService.deactivateReason(req.params.reasonId, req.tenantId);
      if (!success) {
        res.status(404).json({ error: 'Reason not found' });
        return;
      }

      res.json({ message: 'Reason deactivated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to deactivate reason' });
    }
  }

  async checkEligibility(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = checkRefundEligibilitySchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const eligibility = await this.eligibilityService.checkEligibility({
        ...value,
        tenant_id: req.tenantId
      });
      
      res.json(eligibility);
    } catch (error) {
      res.status(500).json({ error: 'Failed to check eligibility' });
    }
  }
}
