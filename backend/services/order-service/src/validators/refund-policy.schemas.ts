import Joi from 'joi';
import { RefundRuleType, RegulationType } from '../types/refund-policy.types';

// Policy schemas
export const createRefundPolicySchema = Joi.object({
  policy_name: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(1000).optional().allow(null, ''),
  refund_window_hours: Joi.number().integer().min(0).max(87600).required(), // Max ~10 years
  pro_rated: Joi.boolean().required(),
  conditions: Joi.object().optional().allow(null),
  event_type: Joi.string().max(100).optional().allow(null, ''),
  ticket_type: Joi.string().max(100).optional().allow(null, '')
});

export const updateRefundPolicySchema = Joi.object({
  policy_name: Joi.string().min(3).max(255).optional(),
  description: Joi.string().max(1000).optional().allow(null, ''),
  refund_window_hours: Joi.number().integer().min(0).max(87600).optional(),
  pro_rated: Joi.boolean().optional(),
  conditions: Joi.object().optional().allow(null),
  event_type: Joi.string().max(100).optional().allow(null, ''),
  ticket_type: Joi.string().max(100).optional().allow(null, '')
}).min(1);

// Rule schemas
const timeBasedRuleConfigSchema = Joi.object({
  tiers: Joi.array().items(
    Joi.object({
      hours_before_event: Joi.number().integer().min(0).required(),
      refund_percentage: Joi.number().min(0).max(100).required()
    })
  ).min(1).required()
});

const percentageRuleConfigSchema = Joi.object({
  percentage: Joi.number().min(0).max(100).required(),
  apply_to: Joi.string().valid('ORDER_TOTAL', 'TICKET_PRICE_ONLY', 'EXCLUDING_FEES').required()
});

const tieredRuleConfigSchema = Joi.object({
  tiers: Joi.array().items(
    Joi.object({
      min_amount_cents: Joi.number().integer().min(0).optional(),
      max_amount_cents: Joi.number().integer().min(0).optional(),
      refund_percentage: Joi.number().min(0).max(100).required()
    })
  ).min(1).required()
});

const flatFeeRuleConfigSchema = Joi.object({
  fee_cents: Joi.number().integer().min(0).required(),
  deduct_from_refund: Joi.boolean().required()
});

export const createRefundPolicyRuleSchema = Joi.object({
  policy_id: Joi.string().uuid().required(),
  rule_type: Joi.string().valid(...Object.values(RefundRuleType)).required(),
  rule_config: Joi.alternatives().conditional('rule_type', [
    { is: RefundRuleType.TIME_BASED, then: timeBasedRuleConfigSchema },
    { is: RefundRuleType.PERCENTAGE, then: percentageRuleConfigSchema },
    { is: RefundRuleType.TIERED, then: tieredRuleConfigSchema },
    { is: RefundRuleType.FLAT_FEE, then: flatFeeRuleConfigSchema },
    { is: RefundRuleType.NO_REFUND, then: Joi.object().optional() }
  ]).required(),
  priority: Joi.number().integer().min(0).max(100).optional()
});

export const updateRefundPolicyRuleSchema = Joi.object({
  rule_type: Joi.string().valid(...Object.values(RefundRuleType)).optional(),
  rule_config: Joi.when('rule_type', {
    is: Joi.exist(),
    then: Joi.alternatives().conditional('rule_type', [
      { is: RefundRuleType.TIME_BASED, then: timeBasedRuleConfigSchema },
      { is: RefundRuleType.PERCENTAGE, then: percentageRuleConfigSchema },
      { is: RefundRuleType.TIERED, then: tieredRuleConfigSchema },
      { is: RefundRuleType.FLAT_FEE, then: flatFeeRuleConfigSchema },
      { is: RefundRuleType.NO_REFUND, then: Joi.object().optional() }
    ])
  }),
  priority: Joi.number().integer().min(0).max(100).optional()
}).min(1);

// Reason schemas
export const createRefundReasonSchema = Joi.object({
  reason_code: Joi.string().min(2).max(50).required(),
  reason_text: Joi.string().min(3).max(255).required(),
  description: Joi.string().max(1000).optional().allow(null, ''),
  requires_documentation: Joi.boolean().optional(),
  internal_only: Joi.boolean().optional(),
  auto_approve: Joi.boolean().optional(),
  priority: Joi.number().integer().min(0).max(100).optional()
});

export const updateRefundReasonSchema = Joi.object({
  reason_code: Joi.string().min(2).max(50).optional(),
  reason_text: Joi.string().min(3).max(255).optional(),
  description: Joi.string().max(1000).optional().allow(null, ''),
  requires_documentation: Joi.boolean().optional(),
  internal_only: Joi.boolean().optional(),
  auto_approve: Joi.boolean().optional(),
  priority: Joi.number().integer().min(0).max(100).optional()
}).min(1);

// Eligibility check schema
export const checkRefundEligibilitySchema = Joi.object({
  order_id: Joi.string().uuid().required(),
  reason_id: Joi.string().uuid().optional(),
  requested_amount_cents: Joi.number().integer().min(0).optional(),
  event_date: Joi.date().iso().optional()
});

// Query parameters
export const policyQuerySchema = Joi.object({
  active_only: Joi.boolean().optional(),
  event_type: Joi.string().max(100).optional(),
  ticket_type: Joi.string().max(100).optional()
});

export const reasonQuerySchema = Joi.object({
  include_internal: Joi.boolean().optional()
});
