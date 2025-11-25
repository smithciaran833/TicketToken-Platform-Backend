import Joi from 'joi';

/**
 * Validation Schemas for Integration Service
 */

// Common schemas
const venueIdSchema = Joi.string().uuid().required();
const providerSchema = Joi.string().valid('stripe', 'square', 'mailchimp', 'quickbooks').required();
const directionSchema = Joi.string().valid('inbound', 'outbound', 'bidirectional').required();
const prioritySchema = Joi.string().valid('low', 'normal', 'high', 'critical').optional();

// Sync routes validation
export const queueSyncSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema,
  syncType: Joi.string().required().min(1).max(100),
  direction: directionSchema,
  priority: prioritySchema,
  scheduledFor: Joi.date().optional(),
  metadata: Joi.object().optional(),
});

export const getSyncHistorySchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema.optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
});

export const retrySyncSchema = Joi.object({
  jobId: Joi.string().uuid().required(),
});

export const cancelSyncSchema = Joi.object({
  jobId: Joi.string().uuid().required(),
});

// OAuth routes validation
export const initiateOAuthSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema,
  userId: Joi.string().uuid().required(),
});

export const oauthCallbackParamsSchema = Joi.object({
  provider: providerSchema,
});

export const oauthCallbackQuerySchema = Joi.object({
  code: Joi.string().required().min(1),
  state: Joi.string().required().min(1),
  error: Joi.string().optional(),
  error_description: Joi.string().optional(),
});

export const refreshTokenSchema = Joi.object({
  venueId: venueIdSchema,
  provider: providerSchema,
});

// Connection routes validation
export const createConnectionSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema,
  config: Joi.object({
    syncEnabled: Joi.boolean().optional(),
    syncInterval: Joi.number().integer().min(60).max(86400).optional(),
    autoRetry: Joi.boolean().optional(),
    webhookEnabled: Joi.boolean().optional(),
  }).optional(),
  credentials: Joi.object({
    apiKey: Joi.string().optional(),
    apiSecret: Joi.string().optional(),
    accessToken: Joi.string().optional(),
    refreshToken: Joi.string().optional(),
  }).optional(),
});

export const updateConnectionSchema = Joi.object({
  connectionId: Joi.string().uuid().required(),
  config: Joi.object({
    syncEnabled: Joi.boolean().optional(),
    syncInterval: Joi.number().integer().min(60).max(86400).optional(),
    autoRetry: Joi.boolean().optional(),
    webhookEnabled: Joi.boolean().optional(),
  }).optional(),
  status: Joi.string().valid('connected', 'disconnected', 'error', 'pending').optional(),
});

export const deleteConnectionSchema = Joi.object({
  connectionId: Joi.string().uuid().required(),
});

export const getConnectionSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema.optional(),
});

// Field mapping routes validation
export const createMappingSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema,
  entityType: Joi.string().required().valid('customer', 'product', 'order', 'invoice', 'payment', 'contact'),
  direction: directionSchema,
  fieldMappings: Joi.array().items(
    Joi.object({
      sourceField: Joi.string().required().min(1),
      targetField: Joi.string().required().min(1),
      transformation: Joi.string().optional().valid('uppercase', 'lowercase', 'trim', 'format_phone', 'format_date'),
      defaultValue: Joi.any().optional(),
      required: Joi.boolean().optional(),
    })
  ).min(1).required(),
});

export const updateMappingSchema = Joi.object({
  mappingId: Joi.string().uuid().required(),
  fieldMappings: Joi.array().items(
    Joi.object({
      sourceField: Joi.string().required().min(1),
      targetField: Joi.string().required().min(1),
      transformation: Joi.string().optional().valid('uppercase', 'lowercase', 'trim', 'format_phone', 'format_date'),
      defaultValue: Joi.any().optional(),
      required: Joi.boolean().optional(),
    })
  ).min(1).optional(),
  isActive: Joi.boolean().optional(),
});

export const deleteMappingSchema = Joi.object({
  mappingId: Joi.string().uuid().required(),
});

export const getMappingSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema.optional(),
  entityType: Joi.string().optional().valid('customer', 'product', 'order', 'invoice', 'payment', 'contact'),
});

// Webhook routes validation
export const webhookParamsSchema = Joi.object({
  provider: providerSchema,
  venueId: venueIdSchema,
});

// Admin routes validation
export const getIntegrationStatusSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema.optional(),
});

export const testConnectionSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema,
});

export const rotateCredentialsSchema = Joi.object({
  venueId: venueIdSchema,
  integrationType: providerSchema,
});

// Query parameter validation
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).optional().default(1),
  limit: Joi.number().integer().min(1).max(100).optional().default(20),
  sortBy: Joi.string().optional(),
  sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
});
