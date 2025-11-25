import Joi from 'joi';
import { OrderNoteType, AdminOverrideType, FraudRiskLevel } from '../types/admin.types';

// Search schemas
export const searchOrdersSchema = Joi.object({
  query: Joi.string().max(500).optional(),
  orderId: Joi.string().uuid().optional(),
  customerEmail: Joi.string().email().max(255).optional(),
  customerName: Joi.string().max(255).optional(),
  customerPhone: Joi.string().max(50).optional(),
  status: Joi.array().items(Joi.string()).optional(),
  eventId: Joi.string().uuid().optional(),
  venueId: Joi.string().uuid().optional(),
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional(),
  minAmount: Joi.number().min(0).optional(),
  maxAmount: Joi.number().min(0).optional(),
  hasNotes: Joi.boolean().optional(),
  isFlagged: Joi.boolean().optional(),
  hasFraudScore: Joi.boolean().optional(),
  riskLevel: Joi.array().items(Joi.string().valid(...Object.values(FraudRiskLevel))).optional(),
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(50)
});

export const savedSearchSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  filters: Joi.object().required(),
  isDefault: Joi.boolean().default(false)
});

// Admin override schemas
export const createOverrideSchema = Joi.object({
  overrideType: Joi.string().valid(...Object.values(AdminOverrideType)).required(),
  originalValue: Joi.any().required(),
  newValue: Joi.any().required(),
  reason: Joi.string().min(10).max(1000).required(),
  metadata: Joi.object().optional()
});

export const approveOverrideSchema = Joi.object({
  notes: Joi.string().max(1000).optional()
});

export const rejectOverrideSchema = Joi.object({
  rejectionReason: Joi.string().min(10).max(1000).required()
});

// Order notes schemas
export const createNoteSchema = Joi.object({
  noteType: Joi.string().valid(...Object.values(OrderNoteType)).required(),
  content: Joi.string().min(1).max(5000).required(),
  isInternal: Joi.boolean().default(true),
  isFlagged: Joi.boolean().default(false),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional(),
  attachments: Joi.array().items(
    Joi.object({
      fileName: Joi.string().required(),
      fileSize: Joi.number().required(),
      fileType: Joi.string().required(),
      url: Joi.string().uri().required()
    })
  ).max(5).optional(),
  mentionedUsers: Joi.array().items(Joi.string().uuid()).max(20).optional()
});

export const updateNoteSchema = Joi.object({
  content: Joi.string().min(1).max(5000).optional(),
  isFlagged: Joi.boolean().optional(),
  tags: Joi.array().items(Joi.string().max(50)).max(10).optional()
}).min(1);

export const noteTemplateSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  noteType: Joi.string().valid(...Object.values(OrderNoteType)).required(),
  contentTemplate: Joi.string().min(1).max(5000).required()
});

// Customer interaction schemas
export const recordInteractionSchema = Joi.object({
  userId: Joi.string().uuid().required(),
  interactionType: Joi.string().max(50).required(),
  channel: Joi.string().max(50).required(),
  summary: Joi.string().min(1).max(2000).required(),
  orderId: Joi.string().uuid().optional(),
  subject: Joi.string().max(500).optional(),
  durationSeconds: Joi.number().integer().min(0).optional(),
  resolutionStatus: Joi.string().max(50).optional(),
  satisfactionScore: Joi.number().integer().min(1).max(5).optional(),
  ticketId: Joi.string().max(255).optional(),
  ticketSystem: Joi.string().max(50).optional(),
  metadata: Joi.object().optional()
});

export const updateInteractionSchema = Joi.object({
  resolutionStatus: Joi.string().max(50).optional(),
  satisfactionScore: Joi.number().integer().min(1).max(5).optional(),
  durationSeconds: Joi.number().integer().min(0).optional()
}).min(1);

// Fraud detection schemas
export const blockEntitySchema = Joi.object({
  entityType: Joi.string().valid('EMAIL', 'IP', 'PHONE', 'CARD', 'DEVICE', 'USER').required(),
  entityValue: Joi.string().min(1).max(500).required(),
  blockReason: Joi.string().min(10).max(1000).required(),
  isPermanent: Joi.boolean().default(false),
  blockedUntil: Joi.date().greater('now').optional()
});

export const reviewFraudScoreSchema = Joi.object({
  resolution: Joi.string().valid('APPROVED', 'REJECTED', 'ESCALATED', 'CLEARED').required(),
  notes: Joi.string().max(2000).optional()
});

export const createFraudRuleSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  ruleType: Joi.string().max(50).required(),
  conditions: Joi.object().required(),
  scoreImpact: Joi.number().integer().min(0).max(100).required(),
  priority: Joi.number().integer().min(0).default(0)
});

// Query parameter schemas
export const uuidParamSchema = Joi.object({
  id: Joi.string().uuid().required()
});

export const orderIdParamSchema = Joi.object({
  orderId: Joi.string().uuid().required()
});

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(50)
});

export const dateRangeSchema = Joi.object({
  dateFrom: Joi.date().optional(),
  dateTo: Joi.date().optional()
});
