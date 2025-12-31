/**
 * Pricing-related JSON Schema definitions
 * 
 * CRITICAL: All schemas MUST include additionalProperties: false
 * to prevent prototype pollution attacks (SEC1).
 * 
 * Audit Fixes:
 * - RD5: Response schemas defined to prevent data leakage
 * - SD3: URL validation with format: uri
 * - SD4: Date validation with format: date-time
 * - SD9: Reusable schema definitions (DRY)
 */

import { 
  uuidPattern, 
  dateTimePattern, 
  currencyPattern,
  uuidFieldSchema,
  dateTimeFieldSchema,
  priceFieldSchema,
  percentageFieldSchema,
  currencyFieldSchema,
  timestampFieldsSchema,
  paginationResponseSchema,
  errorResponseSchema
} from './common.schema';

// Param schemas
export const pricingIdParamSchema = {
  type: 'object',
  required: ['id'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', pattern: uuidPattern }
  }
} as const;

export const eventIdParamSchema = {
  type: 'object',
  required: ['eventId'],
  additionalProperties: false,
  properties: {
    eventId: { type: 'string', pattern: uuidPattern }
  }
} as const;

// Create pricing body schema
export const createPricingBodySchema = {
  type: 'object',
  required: ['name', 'base_price'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 500 },
    tier: { type: 'string', maxLength: 50 },
    base_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    service_fee: { type: 'number', minimum: 0, maximum: 9999999.99 },
    facility_fee: { type: 'number', minimum: 0, maximum: 9999999.99 },
    tax_rate: { type: 'number', minimum: 0, maximum: 1 },
    is_dynamic: { type: 'boolean' },
    min_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    max_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    price_adjustment_rules: { 
      type: 'object',
      additionalProperties: false,
      properties: {
        demand_factor: { type: 'number', minimum: 0, maximum: 10 },
        time_factor: { type: 'number', minimum: 0, maximum: 10 }
      }
    },
    early_bird_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    early_bird_ends_at: { type: 'string', pattern: dateTimePattern },
    last_minute_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    last_minute_starts_at: { type: 'string', pattern: dateTimePattern },
    group_size_min: { type: 'integer', minimum: 1, maximum: 1000 },
    group_discount_percentage: { type: 'number', minimum: 0, maximum: 100 },
    currency: { type: 'string', pattern: currencyPattern, default: 'USD' },
    sales_start_at: { type: 'string', pattern: dateTimePattern },
    sales_end_at: { type: 'string', pattern: dateTimePattern },
    max_per_order: { type: 'integer', minimum: 1, maximum: 100 },
    max_per_customer: { type: 'integer', minimum: 1, maximum: 1000 },
    schedule_id: { type: 'string', pattern: uuidPattern },
    capacity_id: { type: 'string', pattern: uuidPattern },
    is_active: { type: 'boolean' },
    is_visible: { type: 'boolean' },
    display_order: { type: 'integer', minimum: 0, maximum: 1000 }
  }
} as const;

// Update pricing body schema
export const updatePricingBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    description: { type: 'string', maxLength: 500 },
    tier: { type: 'string', maxLength: 50 },
    base_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    service_fee: { type: 'number', minimum: 0, maximum: 9999999.99 },
    facility_fee: { type: 'number', minimum: 0, maximum: 9999999.99 },
    tax_rate: { type: 'number', minimum: 0, maximum: 1 },
    is_dynamic: { type: 'boolean' },
    min_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    max_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    price_adjustment_rules: { 
      type: 'object',
      additionalProperties: false,
      properties: {
        demand_factor: { type: 'number', minimum: 0, maximum: 10 },
        time_factor: { type: 'number', minimum: 0, maximum: 10 }
      }
    },
    early_bird_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    early_bird_ends_at: { type: 'string', pattern: dateTimePattern },
    last_minute_price: { type: 'number', minimum: 0, maximum: 9999999.99 },
    last_minute_starts_at: { type: 'string', pattern: dateTimePattern },
    group_size_min: { type: 'integer', minimum: 1, maximum: 1000 },
    group_discount_percentage: { type: 'number', minimum: 0, maximum: 100 },
    currency: { type: 'string', pattern: currencyPattern },
    sales_start_at: { type: 'string', pattern: dateTimePattern },
    sales_end_at: { type: 'string', pattern: dateTimePattern },
    max_per_order: { type: 'integer', minimum: 1, maximum: 100 },
    max_per_customer: { type: 'integer', minimum: 1, maximum: 1000 },
    is_active: { type: 'boolean' },
    is_visible: { type: 'boolean' },
    display_order: { type: 'integer', minimum: 0, maximum: 1000 }
  }
} as const;

// Calculate price body schema
export const calculatePriceBodySchema = {
  type: 'object',
  required: ['quantity'],
  additionalProperties: false,
  properties: {
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
    apply_group_discount: { type: 'boolean' },
    promo_code: { type: 'string', maxLength: 50 }
  }
} as const;

// ============================================================================
// RESPONSE SCHEMAS (RD5 - Response Schemas)
// ============================================================================

/**
 * Single pricing response schema
 * RD5: Response schema to prevent data leakage
 */
export const pricingResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: uuidFieldSchema,
    tenant_id: uuidFieldSchema,
    event_id: uuidFieldSchema,
    schedule_id: { ...uuidFieldSchema, nullable: true },
    capacity_id: { ...uuidFieldSchema, nullable: true },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    tier: { type: 'string', nullable: true },
    base_price: priceFieldSchema,
    service_fee: { ...priceFieldSchema, nullable: true },
    facility_fee: { ...priceFieldSchema, nullable: true },
    tax_rate: { type: 'number', nullable: true },
    is_dynamic: { type: 'boolean' },
    min_price: { ...priceFieldSchema, nullable: true },
    max_price: { ...priceFieldSchema, nullable: true },
    price_adjustment_rules: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: {
        demand_factor: { type: 'number' },
        time_factor: { type: 'number' }
      }
    },
    early_bird_price: { ...priceFieldSchema, nullable: true },
    early_bird_ends_at: { ...dateTimeFieldSchema, nullable: true },
    last_minute_price: { ...priceFieldSchema, nullable: true },
    last_minute_starts_at: { ...dateTimeFieldSchema, nullable: true },
    group_size_min: { type: 'integer', nullable: true },
    group_discount_percentage: { ...percentageFieldSchema, nullable: true },
    currency: currencyFieldSchema,
    sales_start_at: { ...dateTimeFieldSchema, nullable: true },
    sales_end_at: { ...dateTimeFieldSchema, nullable: true },
    max_per_order: { type: 'integer', nullable: true },
    max_per_customer: { type: 'integer', nullable: true },
    is_active: { type: 'boolean' },
    is_visible: { type: 'boolean' },
    display_order: { type: 'integer' },
    ...timestampFieldsSchema,
    version: { type: 'integer' }
  }
} as const;

/**
 * Pricing list response schema
 * RD5: Response schema for list endpoints
 */
export const pricingListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pricing: {
      type: 'array',
      items: pricingResponseSchema
    },
    pagination: paginationResponseSchema
  }
} as const;

/**
 * Price calculation response schema
 */
export const priceCalculationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pricing_id: uuidFieldSchema,
    quantity: { type: 'integer' },
    unit_price: priceFieldSchema,
    subtotal: priceFieldSchema,
    service_fee_total: priceFieldSchema,
    facility_fee_total: priceFieldSchema,
    tax_amount: priceFieldSchema,
    discount_amount: priceFieldSchema,
    total: priceFieldSchema,
    currency: currencyFieldSchema,
    discount_applied: { type: 'boolean' },
    discount_type: { type: 'string', nullable: true },
    price_type: { type: 'string', enum: ['regular', 'early_bird', 'last_minute', 'group'] }
  }
} as const;

// ============================================================================
// HTTP RESPONSE SCHEMAS FOR ROUTES
// ============================================================================

export const pricingRouteResponses = {
  200: {
    description: 'Successful operation',
    type: 'object',
    properties: pricingResponseSchema.properties
  },
  201: {
    description: 'Pricing created successfully',
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      pricing: pricingResponseSchema
    }
  },
  400: {
    description: 'Bad Request - validation error',
    ...errorResponseSchema
  },
  401: {
    description: 'Unauthorized',
    ...errorResponseSchema
  },
  404: {
    description: 'Pricing not found',
    ...errorResponseSchema
  }
} as const;

export const pricingListRouteResponses = {
  200: {
    description: 'List of pricing options',
    type: 'object',
    properties: pricingListResponseSchema.properties
  },
  400: {
    description: 'Bad Request - validation error',
    ...errorResponseSchema
  },
  401: {
    description: 'Unauthorized',
    ...errorResponseSchema
  }
} as const;

export const priceCalculationRouteResponses = {
  200: {
    description: 'Price calculation result',
    type: 'object',
    properties: priceCalculationResponseSchema.properties
  },
  400: {
    description: 'Bad Request - validation error',
    ...errorResponseSchema
  },
  404: {
    description: 'Pricing not found',
    ...errorResponseSchema
  }
} as const;
