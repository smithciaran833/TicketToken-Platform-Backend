/**
 * Event-related JSON Schema definitions
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
  uuidFieldSchema,
  urlFieldSchema,
  dateTimeFieldSchema,
  timestampFieldsSchema,
  paginationResponseSchema,
  errorResponseSchema
} from './common.schema';

// ============================================================================
// ENUMS
// ============================================================================

export const eventStatuses = [
  'DRAFT', 'REVIEW', 'APPROVED', 'PUBLISHED', 'ON_SALE', 
  'SOLD_OUT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'POSTPONED'
] as const;

export const visibilityTypes = ['PUBLIC', 'PRIVATE', 'UNLISTED'] as const;
export const eventTypes = ['single', 'recurring', 'series'] as const;

// ============================================================================
// RESPONSE SCHEMAS (RD5)
// ============================================================================

/**
 * Single event response schema
 * RD5: Response schema to prevent data leakage
 */
export const eventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: uuidFieldSchema,
    tenant_id: uuidFieldSchema,
    venue_id: uuidFieldSchema,
    name: { type: 'string' },
    slug: { type: 'string' },
    description: { type: 'string', nullable: true },
    short_description: { type: 'string', nullable: true },
    event_type: { type: 'string', enum: eventTypes },
    status: { type: 'string', enum: eventStatuses },
    visibility: { type: 'string', enum: visibilityTypes },
    is_featured: { type: 'boolean' },
    priority_score: { type: 'integer' },
    primary_category_id: { ...uuidFieldSchema, nullable: true },
    // URLs with proper format validation (SD3)
    banner_image_url: { ...urlFieldSchema, nullable: true },
    thumbnail_image_url: { ...urlFieldSchema, nullable: true },
    video_url: { ...urlFieldSchema, nullable: true },
    virtual_event_url: { ...urlFieldSchema, nullable: true },
    // Date-times with proper format validation (SD4)
    starts_at: { ...dateTimeFieldSchema, nullable: true },
    ends_at: { ...dateTimeFieldSchema, nullable: true },
    doors_open: { ...dateTimeFieldSchema, nullable: true },
    timezone: { type: 'string', nullable: true },
    // Additional fields
    age_restriction: { type: 'integer', nullable: true },
    dress_code: { type: 'string', nullable: true },
    capacity: { type: 'integer', nullable: true },
    tags: {
      type: 'array',
      items: { type: 'string' }
    },
    accessibility_info: {
      type: 'object',
      additionalProperties: false,
      nullable: true,
      properties: {
        wheelchair_accessible: { type: 'boolean' },
        hearing_assistance: { type: 'boolean' },
        visual_assistance: { type: 'boolean' },
        notes: { type: 'string' }
      }
    },
    cancellation_policy: { type: 'string', nullable: true },
    refund_policy: { type: 'string', nullable: true },
    is_virtual: { type: 'boolean' },
    is_hybrid: { type: 'boolean' },
    streaming_platform: { type: 'string', nullable: true },
    // SEO
    meta_title: { type: 'string', nullable: true },
    meta_description: { type: 'string', nullable: true },
    // Blockchain
    artist_wallet: { type: 'string', nullable: true },
    artist_percentage: { type: 'number', nullable: true },
    venue_percentage: { type: 'number', nullable: true },
    resaleable: { type: 'boolean' },
    // Statistics
    views: { type: 'integer' },
    // Timestamps (SD4)
    ...timestampFieldsSchema,
    // Version for optimistic locking
    version: { type: 'integer' }
  }
} as const;

/**
 * Event list response schema
 * RD5: Response schema for list endpoints
 */
export const eventListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    events: {
      type: 'array',
      items: eventResponseSchema
    },
    pagination: paginationResponseSchema
  }
} as const;

/**
 * Event creation success response
 */
export const createEventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
    event: eventResponseSchema
  }
} as const;

/**
 * Event update success response
 */
export const updateEventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
    event: eventResponseSchema
  }
} as const;

/**
 * Event delete success response
 */
export const deleteEventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
    message: { type: 'string' }
  }
} as const;

/**
 * Publish event success response
 */
export const publishEventResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    success: { type: 'boolean', const: true },
    event: eventResponseSchema
  }
} as const;

// ============================================================================
// HTTP RESPONSE SCHEMAS FOR ROUTES
// ============================================================================

export const eventRouteResponses = {
  200: {
    description: 'Successful operation',
    type: 'object',
    properties: eventResponseSchema.properties
  },
  201: {
    description: 'Event created successfully',
    type: 'object',
    properties: createEventResponseSchema.properties
  },
  400: {
    description: 'Bad Request - validation error',
    ...errorResponseSchema
  },
  401: {
    description: 'Unauthorized',
    ...errorResponseSchema
  },
  403: {
    description: 'Forbidden',
    ...errorResponseSchema
  },
  404: {
    description: 'Event not found',
    ...errorResponseSchema
  },
  409: {
    description: 'Conflict - duplicate or version mismatch',
    ...errorResponseSchema
  }
} as const;

export const eventListRouteResponses = {
  200: {
    description: 'List of events',
    type: 'object',
    properties: eventListResponseSchema.properties
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
