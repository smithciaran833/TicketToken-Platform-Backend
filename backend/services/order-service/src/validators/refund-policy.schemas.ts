import Joi from 'joi';

/**
 * RD1: Input validation schemas for refund-policy routes
 * All schemas use .unknown(false) to reject extra fields (SEC1, SEC2)
 */

// Common field patterns
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UUID parameter validation
export const policyParamSchema = Joi.object({
  policyId: Joi.string().pattern(uuidPattern).required(),
}).unknown(false);

export const ruleParamSchema = Joi.object({
  ruleId: Joi.string().pattern(uuidPattern).required(),
}).unknown(false);

export const policyRuleParamSchema = Joi.object({
  policyId: Joi.string().pattern(uuidPattern).required(),
}).unknown(false);

export const reasonParamSchema = Joi.object({
  reasonId: Joi.string().pattern(uuidPattern).required(),
}).unknown(false);

// Create Refund Policy
export const createPolicySchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional().allow(null),
  eventTypes: Joi.array().items(Joi.string().max(50)).optional(),
  isDefault: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveUntil: Joi.date().iso().optional().allow(null),
  priority: Joi.number().integer().min(0).max(1000).default(0),
}).unknown(false);

// Update Refund Policy
export const updatePolicySchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(null),
  eventTypes: Joi.array().items(Joi.string().max(50)).optional(),
  isDefault: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
  effectiveFrom: Joi.date().iso().optional(),
  effectiveUntil: Joi.date().iso().optional().allow(null),
  priority: Joi.number().integer().min(0).max(1000).optional(),
}).unknown(false);

// Create Policy Rule
export const createRuleSchema = Joi.object({
  policyId: Joi.string().pattern(uuidPattern).required(),
  name: Joi.string().min(1).max(100).required(),
  ruleType: Joi.string().valid(
    'TIME_BASED',
    'PERCENTAGE',
    'TIERED',
    'FLAT_FEE',
    'EVENT_STATUS',
    'TICKET_TYPE'
  ).required(),
  conditionType: Joi.string().valid(
    'HOURS_BEFORE_EVENT',
    'DAYS_BEFORE_EVENT',
    'EVENT_CANCELLED',
    'EVENT_POSTPONED',
    'EVENT_RESCHEDULED',
    'ALWAYS'
  ).required(),
  conditionValue: Joi.number().optional().allow(null), // e.g., hours/days before event
  refundPercentage: Joi.number().min(0).max(100).precision(2).optional(),
  flatFeeAmountCents: Joi.number().integer().min(0).optional(),
  tierValues: Joi.array().items(
    Joi.object({
      minHours: Joi.number().integer().min(0).required(),
      maxHours: Joi.number().integer().min(0).optional(),
      percentage: Joi.number().min(0).max(100).precision(2).required(),
    }).unknown(false)
  ).optional(),
  isActive: Joi.boolean().default(true),
  priority: Joi.number().integer().min(0).max(1000).default(0),
  description: Joi.string().max(500).optional().allow(null),
}).unknown(false);

// Update Policy Rule
export const updateRuleSchema = Joi.object({
  name: Joi.string().min(1).max(100).optional(),
  ruleType: Joi.string().valid(
    'TIME_BASED',
    'PERCENTAGE',
    'TIERED',
    'FLAT_FEE',
    'EVENT_STATUS',
    'TICKET_TYPE'
  ).optional(),
  conditionType: Joi.string().valid(
    'HOURS_BEFORE_EVENT',
    'DAYS_BEFORE_EVENT',
    'EVENT_CANCELLED',
    'EVENT_POSTPONED',
    'EVENT_RESCHEDULED',
    'ALWAYS'
  ).optional(),
  conditionValue: Joi.number().optional().allow(null),
  refundPercentage: Joi.number().min(0).max(100).precision(2).optional(),
  flatFeeAmountCents: Joi.number().integer().min(0).optional(),
  tierValues: Joi.array().items(
    Joi.object({
      minHours: Joi.number().integer().min(0).required(),
      maxHours: Joi.number().integer().min(0).optional(),
      percentage: Joi.number().min(0).max(100).precision(2).required(),
    }).unknown(false)
  ).optional(),
  isActive: Joi.boolean().optional(),
  priority: Joi.number().integer().min(0).max(1000).optional(),
  description: Joi.string().max(500).optional().allow(null),
}).unknown(false);

// Create Refund Reason
export const createReasonSchema = Joi.object({
  code: Joi.string().min(1).max(50).required()
    .pattern(/^[A-Z0-9_]+$/)
    .messages({ 'string.pattern.base': 'Code must be uppercase letters, numbers, and underscores only' }),
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500).optional().allow(null),
  requiresEvidence: Joi.boolean().default(false),
  evidenceTypes: Joi.array().items(
    Joi.string().valid('SCREENSHOT', 'EMAIL', 'DOCUMENT', 'PHOTO', 'OTHER')
  ).optional(),
  isUserSelectable: Joi.boolean().default(true),
  isActive: Joi.boolean().default(true),
  displayOrder: Joi.number().integer().min(0).max(1000).default(0),
}).unknown(false);

// Update Refund Reason
export const updateReasonSchema = Joi.object({
  code: Joi.string().min(1).max(50).optional()
    .pattern(/^[A-Z0-9_]+$/)
    .messages({ 'string.pattern.base': 'Code must be uppercase letters, numbers, and underscores only' }),
  name: Joi.string().min(1).max(100).optional(),
  description: Joi.string().max(500).optional().allow(null),
  requiresEvidence: Joi.boolean().optional(),
  evidenceTypes: Joi.array().items(
    Joi.string().valid('SCREENSHOT', 'EMAIL', 'DOCUMENT', 'PHOTO', 'OTHER')
  ).optional(),
  isUserSelectable: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
  displayOrder: Joi.number().integer().min(0).max(1000).optional(),
}).unknown(false);

// Check Refund Eligibility
export const checkEligibilitySchema = Joi.object({
  orderId: Joi.string().pattern(uuidPattern).required(),
  reasonCode: Joi.string().max(50).optional(),
  requestedAmountCents: Joi.number().integer().min(1).optional(),
  itemIds: Joi.array().items(Joi.string().pattern(uuidPattern)).optional(),
}).unknown(false);

// Query parameters for list endpoints
export const listPoliciesQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().optional(),
  eventType: Joi.string().max(50).optional(),
}).unknown(false);

export const listReasonsQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().optional(),
  isUserSelectable: Joi.boolean().optional(),
}).unknown(false);

export default {
  policyParamSchema,
  ruleParamSchema,
  policyRuleParamSchema,
  reasonParamSchema,
  createPolicySchema,
  updatePolicySchema,
  createRuleSchema,
  updateRuleSchema,
  createReasonSchema,
  updateReasonSchema,
  checkEligibilitySchema,
  listPoliciesQuerySchema,
  listReasonsQuerySchema,
};
