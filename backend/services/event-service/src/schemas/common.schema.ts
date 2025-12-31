/**
 * Common JSON Schema definitions for event-service
 * 
 * CRITICAL: All schemas MUST include additionalProperties: false
 * to prevent prototype pollution attacks (SEC1).
 * 
 * Audit Fixes:
 * - RD5: Response schemas defined
 * - SD3: URL validation with format: uri
 * - SD4: Date validation with format: date-time
 * - SD9: Reusable schema definitions (DRY)
 */

// ============================================================================
// REUSABLE PATTERNS & FORMATS (SD9 - DRY)
// ============================================================================

/**
 * UUID v4 pattern - kept for backward compatibility
 * @deprecated Use format: 'uuid' instead (SD1 audit fix)
 */
export const uuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

// Common date-time format pattern (ISO 8601) - for pattern validation
export const dateTimePattern = '^\\d{4}-\\d{2}-\\d{2}(T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?(Z|[+-]\\d{2}:\\d{2})?)?$';

// Currency pattern (3-letter code)
export const currencyPattern = '^[A-Z]{3}$';

// ============================================================================
// UUID VALIDATION HELPERS (SD1 - format: 'uuid')
// ============================================================================

/**
 * UUID v4 regex for programmatic validation
 * AUDIT FIX (SD1): Use this for runtime validation
 */
export const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4
 * AUDIT FIX (MT-UUID): Runtime UUID validation
 */
export function isValidUuid(value: string | undefined | null): boolean {
  if (!value || typeof value !== 'string') return false;
  return UUID_V4_REGEX.test(value);
}

// ============================================================================
// REUSABLE FIELD SCHEMAS (SD9 - DRY)
// ============================================================================

/**
 * UUID field schema - reusable for all UUID fields
 * AUDIT FIX (SD1): Use format: 'uuid' instead of pattern
 * This leverages AJV's built-in UUID format validation
 */
export const uuidFieldSchema = {
  type: 'string',
  format: 'uuid',
  description: 'UUID v4 identifier'
} as const;

/**
 * URL field schema with proper format validation
 * SD3: URLs validated with format: uri
 */
export const urlFieldSchema = {
  type: 'string',
  format: 'uri',
  maxLength: 2000,
  description: 'Valid URI/URL'
} as const;

/**
 * Optional URL field schema
 * SD3: URLs validated with format: uri
 */
export const optionalUrlFieldSchema = {
  type: 'string',
  format: 'uri',
  maxLength: 2000,
  nullable: true,
  description: 'Optional valid URI/URL'
} as const;

/**
 * DateTime field schema with ISO 8601 format validation
 * SD4: Dates validated with format: date-time
 */
export const dateTimeFieldSchema = {
  type: 'string',
  format: 'date-time',
  description: 'ISO 8601 date-time string'
} as const;

/**
 * Optional DateTime field schema
 * SD4: Dates validated with format: date-time
 */
export const optionalDateTimeFieldSchema = {
  type: 'string',
  format: 'date-time',
  nullable: true,
  description: 'Optional ISO 8601 date-time string'
} as const;

/**
 * Price/money field schema with proper constraints
 */
export const priceFieldSchema = {
  type: 'number',
  minimum: 0,
  maximum: 9999999.99,
  description: 'Price in decimal format'
} as const;

/**
 * Percentage field schema
 */
export const percentageFieldSchema = {
  type: 'number',
  minimum: 0,
  maximum: 100,
  description: 'Percentage value (0-100)'
} as const;

/**
 * Currency field schema
 */
export const currencyFieldSchema = {
  type: 'string',
  pattern: currencyPattern,
  default: 'USD',
  description: 'ISO 4217 3-letter currency code'
} as const;

// ============================================================================
// COMMON PARAMETER SCHEMAS
// ============================================================================

export const uuidParamSchema = {
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

export const venueIdParamSchema = {
  type: 'object',
  required: ['venueId'],
  additionalProperties: false,
  properties: {
    venueId: { type: 'string', pattern: uuidPattern }
  }
} as const;

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

export const paginationQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 }
  }
} as const;

export const paginationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    total: { type: 'integer', minimum: 0 },
    limit: { type: 'integer', minimum: 1 },
    offset: { type: 'integer', minimum: 0 },
    hasMore: { type: 'boolean' }
  }
} as const;

// Legacy exports for backward compatibility
export const priceSchema = priceFieldSchema;
export const percentageSchema = percentageFieldSchema;

// ============================================================================
// COMMON RESPONSE SCHEMAS (RD5 - Response Schemas)
// ============================================================================

/**
 * RFC 7807 Problem Details error response schema
 * RD5: Standardized error response format
 */
export const errorResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', description: 'URI reference identifying the problem type' },
    title: { type: 'string', description: 'Short human-readable summary' },
    status: { type: 'integer', description: 'HTTP status code' },
    detail: { type: 'string', description: 'Human-readable explanation' },
    instance: { type: 'string', description: 'URI reference for this occurrence' },
    code: { type: 'string', description: 'Machine-readable error code' },
    errors: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          field: { type: 'string' },
          message: { type: 'string' },
          code: { type: 'string' }
        }
      },
      description: 'Field-level validation errors'
    }
  }
} as const;

/**
 * Success response wrapper schema
 * RD5: Consistent success response format
 */
export const successResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
    message: { type: 'string' },
    data: { type: 'object' }
  }
} as const;

/**
 * Delete confirmation response schema
 * RD5: Standardized delete response
 */
export const deleteResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
    message: { type: 'string' },
    deletedId: { type: 'string', pattern: uuidPattern }
  }
} as const;

/**
 * Timestamp fields schema - common audit fields
 */
export const timestampFieldsSchema = {
  created_at: { type: 'string', format: 'date-time' },
  updated_at: { type: 'string', format: 'date-time' },
  deleted_at: { type: 'string', format: 'date-time', nullable: true }
} as const;

// ============================================================================
// HTTP STATUS CODE RESPONSES
// ============================================================================

export const http200ResponseSchema = {
  description: 'Successful operation',
  type: 'object'
} as const;

export const http201ResponseSchema = {
  description: 'Resource created successfully',
  type: 'object'
} as const;

export const http204ResponseSchema = {
  description: 'No content - operation successful'
} as const;

export const http400ResponseSchema = {
  description: 'Bad Request - validation error',
  ...errorResponseSchema
} as const;

export const http401ResponseSchema = {
  description: 'Unauthorized - authentication required',
  ...errorResponseSchema
} as const;

export const http403ResponseSchema = {
  description: 'Forbidden - insufficient permissions',
  ...errorResponseSchema
} as const;

export const http404ResponseSchema = {
  description: 'Resource not found',
  ...errorResponseSchema
} as const;

export const http409ResponseSchema = {
  description: 'Conflict - resource already exists or version mismatch',
  ...errorResponseSchema
} as const;

export const http429ResponseSchema = {
  description: 'Too Many Requests - rate limit exceeded',
  ...errorResponseSchema
} as const;

export const http500ResponseSchema = {
  description: 'Internal Server Error',
  ...errorResponseSchema
} as const;
