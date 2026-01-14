/**
 * Validation Schemas for Integration Service
 * 
 * AUDIT FIX VAL-1: Missing .unknown(false) → Strict schema validation
 * AUDIT FIX VAL-2: Routes without schema validation → Complete schemas
 * 
 * Features:
 * - Strict mode rejects unknown fields (prevents injection)
 * - Common reusable schemas
 * - Provider-specific schemas
 * - Comprehensive validation messages
 */

import Joi from 'joi';

// =============================================================================
// STRICT OPTIONS
// =============================================================================

/**
 * AUDIT FIX VAL-1: Default options for all schemas
 * - unknown(false) rejects unknown fields
 * - stripUnknown removes unknown fields (alternative)
 */
const strictOptions: Joi.ValidationOptions = {
  abortEarly: false,  // Return all errors, not just first
  stripUnknown: false, // Don't strip - reject unknown
  convert: true,       // Type conversion enabled
};

// =============================================================================
// BASE SCHEMAS
// =============================================================================

/**
 * UUID v4 schema
 */
export const uuidSchema = Joi.string()
  .uuid({ version: 'uuidv4' })
  .required()
  .messages({
    'string.guid': '{{#label}} must be a valid UUID v4',
    'any.required': '{{#label}} is required'
  });

/**
 * Optional UUID schema
 */
export const optionalUuidSchema = Joi.string()
  .uuid({ version: 'uuidv4' })
  .optional()
  .allow(null);

/**
 * Pagination schema
 */
export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sortBy: Joi.string().max(50).optional(),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
}).unknown(false);

/**
 * Date range schema
 */
export const dateRangeSchema = Joi.object({
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')).optional()
}).unknown(false);

// =============================================================================
// COMMON ID PARAMS
// =============================================================================

/**
 * Single ID param
 */
export const idParamSchema = Joi.object({
  id: uuidSchema
}).unknown(false);

/**
 * Provider ID param
 */
export const providerParamSchema = Joi.object({
  provider: Joi.string()
    .valid('stripe', 'square', 'ticketmaster', 'eventbrite', 'mailchimp', 'quickbooks')
    .required()
}).unknown(false);

/**
 * Integration ID param
 */
export const integrationParamSchema = Joi.object({
  integrationId: uuidSchema
}).unknown(false);

// =============================================================================
// INTEGRATION SCHEMAS
// =============================================================================

/**
 * Create integration request
 */
export const createIntegrationSchema = Joi.object({
  provider: Joi.string()
    .valid('stripe', 'square', 'ticketmaster', 'eventbrite', 'mailchimp', 'quickbooks')
    .required()
    .messages({
      'any.only': 'Provider must be one of: stripe, square, ticketmaster, eventbrite, mailchimp, quickbooks'
    }),
  name: Joi.string()
    .min(3)
    .max(100)
    .required()
    .messages({
      'string.min': 'Name must be at least 3 characters',
      'string.max': 'Name cannot exceed 100 characters'
    }),
  description: Joi.string()
    .max(500)
    .optional()
    .allow(''),
  config: Joi.object()
    .optional()
    .default({})
}).unknown(false);

/**
 * Update integration request
 */
export const updateIntegrationSchema = Joi.object({
  name: Joi.string().min(3).max(100).optional(),
  description: Joi.string().max(500).optional().allow(''),
  config: Joi.object().optional(),
  enabled: Joi.boolean().optional()
}).unknown(false);

// =============================================================================
// OAUTH SCHEMAS
// =============================================================================

/**
 * OAuth authorize request
 */
export const oauthAuthorizeSchema = Joi.object({
  provider: Joi.string()
    .valid('stripe', 'square', 'mailchimp', 'quickbooks')
    .required(),
  returnUrl: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .required()
    .messages({
      'string.uri': 'Return URL must be a valid HTTP(S) URL'
    }),
  state: Joi.string()
    .max(500)
    .optional()
}).unknown(false);

/**
 * OAuth callback request
 */
export const oauthCallbackSchema = Joi.object({
  code: Joi.string()
    .required()
    .messages({
      'any.required': 'Authorization code is required'
    }),
  state: Joi.string()
    .required(),
  error: Joi.string().optional(),
  error_description: Joi.string().optional()
}).unknown(false);

/**
 * OAuth token refresh request
 */
export const oauthRefreshSchema = Joi.object({
  integrationId: uuidSchema
}).unknown(false);

// =============================================================================
// WEBHOOK SCHEMAS
// =============================================================================

/**
 * Register webhook request
 */
export const registerWebhookSchema = Joi.object({
  integrationId: uuidSchema,
  events: Joi.array()
    .items(Joi.string().max(100))
    .min(1)
    .max(50)
    .required()
    .messages({
      'array.min': 'At least one event must be specified',
      'array.max': 'Cannot register more than 50 events'
    }),
  callbackUrl: Joi.string()
    .uri({ scheme: ['https'] })
    .required()
    .messages({
      'string.uri': 'Callback URL must be a valid HTTPS URL'
    })
}).unknown(false);

/**
 * Webhook event payload (from provider)
 * Less strict since providers send various formats
 */
export const webhookEventSchema = Joi.object({
  id: Joi.string().optional(),
  type: Joi.string().optional(),
  event: Joi.string().optional(),
  created: Joi.alternatives().try(
    Joi.number(),
    Joi.date().iso()
  ).optional(),
  data: Joi.object().optional(),
  object: Joi.any().optional(),
  livemode: Joi.boolean().optional(),
  api_version: Joi.string().optional()
}).unknown(true); // Allow unknown for provider flexibility

// =============================================================================
// FIELD MAPPING SCHEMAS
// =============================================================================

/**
 * Create field mapping request
 */
export const createFieldMappingSchema = Joi.object({
  integrationId: uuidSchema,
  sourceField: Joi.string()
    .max(200)
    .required()
    .messages({
      'string.max': 'Source field path cannot exceed 200 characters'
    }),
  targetField: Joi.string()
    .max(200)
    .required(),
  transformer: Joi.string()
    .valid('none', 'date', 'currency', 'boolean', 'string', 'number', 'json', 'custom')
    .default('none'),
  transformerConfig: Joi.object().optional().default({}),
  required: Joi.boolean().default(false),
  defaultValue: Joi.any().optional()
}).unknown(false);

/**
 * Update field mapping request
 */
export const updateFieldMappingSchema = Joi.object({
  sourceField: Joi.string().max(200).optional(),
  targetField: Joi.string().max(200).optional(),
  transformer: Joi.string()
    .valid('none', 'date', 'currency', 'boolean', 'string', 'number', 'json', 'custom')
    .optional(),
  transformerConfig: Joi.object().optional(),
  required: Joi.boolean().optional(),
  defaultValue: Joi.any().optional(),
  enabled: Joi.boolean().optional()
}).unknown(false);

// =============================================================================
// SYNC SCHEMAS
// =============================================================================

/**
 * Start sync request
 */
export const startSyncSchema = Joi.object({
  integrationId: uuidSchema,
  syncType: Joi.string()
    .valid('full', 'incremental', 'events', 'orders', 'customers', 'products')
    .default('incremental'),
  options: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    batchSize: Joi.number().integer().min(1).max(1000).default(100),
    dryRun: Joi.boolean().default(false)
  }).optional().default({})
}).unknown(false);

/**
 * Sync status query
 */
export const syncStatusSchema = Joi.object({
  syncId: uuidSchema
}).unknown(false);

// =============================================================================
// PROVIDER-SPECIFIC SCHEMAS
// =============================================================================

/**
 * Stripe-specific configuration
 */
export const stripeConfigSchema = Joi.object({
  webhookEndpoint: Joi.string().uri().optional(),
  paymentMethods: Joi.array()
    .items(Joi.string().valid('card', 'ach_debit', 'us_bank_account'))
    .optional(),
  currency: Joi.string().length(3).uppercase().optional(),
  statementDescriptor: Joi.string().max(22).optional()
}).unknown(false);

/**
 * Square-specific configuration
 */
export const squareConfigSchema = Joi.object({
  locationId: Joi.string().optional(),
  environment: Joi.string().valid('sandbox', 'production').optional(),
  webhookSignatureKey: Joi.string().optional()
}).unknown(false);

/**
 * Ticketmaster configuration
 */
export const ticketmasterConfigSchema = Joi.object({
  venueId: Joi.string().optional(),
  eventFilters: Joi.object({
    genres: Joi.array().items(Joi.string()).optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  }).optional()
}).unknown(false);

/**
 * Eventbrite configuration
 */
export const eventbriteConfigSchema = Joi.object({
  organizationId: Joi.string().optional(),
  webhookSecret: Joi.string().optional()
}).unknown(false);

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

/**
 * List integrations query
 */
export const listIntegrationsQuerySchema = Joi.object({
  provider: Joi.string()
    .valid('stripe', 'square', 'ticketmaster', 'eventbrite', 'mailchimp', 'quickbooks')
    .optional(),
  enabled: Joi.boolean().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(false);

/**
 * List webhooks query
 */
export const listWebhooksQuerySchema = Joi.object({
  integrationId: optionalUuidSchema,
  status: Joi.string()
    .valid('active', 'inactive', 'failed')
    .optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(false);

/**
 * List sync history query
 */
export const listSyncHistoryQuerySchema = Joi.object({
  integrationId: optionalUuidSchema,
  status: Joi.string()
    .valid('pending', 'running', 'completed', 'failed')
    .optional(),
  syncType: Joi.string()
    .valid('full', 'incremental', 'events', 'orders', 'customers', 'products')
    .optional(),
  startDate: Joi.date().iso().optional(),
  endDate: Joi.date().iso().optional(),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20)
}).unknown(false);

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate data against schema with strict options
 * AUDIT FIX VAL-1: Centralized validation with unknown(false)
 */
export function validate<T>(
  schema: Joi.Schema,
  data: unknown,
  options?: Joi.ValidationOptions
): { value: T; error?: Joi.ValidationError } {
  const mergedOptions = { ...strictOptions, ...options };
  return schema.validate(data, mergedOptions) as { value: T; error?: Joi.ValidationError };
}

/**
 * Create strict schema from base schema
 */
export function strict<T extends Joi.Schema>(schema: T): T {
  return schema.options({ stripUnknown: false }) as T;
}

// =============================================================================
// FASTIFY SCHEMA HELPERS
// =============================================================================

/**
 * Convert Joi schema to Fastify schema format
 */
export function toFastifySchema(schema: {
  params?: Joi.Schema;
  querystring?: Joi.Schema;
  body?: Joi.Schema;
  headers?: Joi.Schema;
}): object {
  return {
    params: schema.params,
    querystring: schema.querystring,
    body: schema.body,
    headers: schema.headers
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  // Options
  strictOptions,
  // Validators
  validate,
  strict,
  toFastifySchema,
  // Base schemas
  uuidSchema,
  optionalUuidSchema,
  paginationSchema,
  dateRangeSchema,
  // Params
  idParamSchema,
  providerParamSchema,
  integrationParamSchema,
  // Integration
  createIntegrationSchema,
  updateIntegrationSchema,
  // OAuth
  oauthAuthorizeSchema,
  oauthCallbackSchema,
  oauthRefreshSchema,
  // Webhooks
  registerWebhookSchema,
  webhookEventSchema,
  // Field mappings
  createFieldMappingSchema,
  updateFieldMappingSchema,
  // Sync
  startSyncSchema,
  syncStatusSchema,
  // Provider configs
  stripeConfigSchema,
  squareConfigSchema,
  ticketmasterConfigSchema,
  eventbriteConfigSchema,
  // Queries
  listIntegrationsQuerySchema,
  listWebhooksQuerySchema,
  listSyncHistoryQuerySchema
};
