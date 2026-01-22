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
// REQUEST BODY SCHEMAS
// ============================================================================

/**
 * Create event request body schema
 * CRITICAL FIX: Added missing request body validation schema
 * 
 * User-editable fields only - excludes system-generated fields:
 * - id, tenant_id (generated/injected)
 * - views (system statistic)
 * - created_at, updated_at, deleted_at (timestamps)
 * - version (optimistic locking)
 */
export const createEventBodySchema = {
  type: 'object',
  required: ['venue_id', 'name', 'event_type', 'status', 'visibility'],
  additionalProperties: false,
  properties: {
    // Core required fields
    venue_id: { type: 'string', pattern: uuidPattern },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    event_type: { type: 'string', enum: eventTypes },
    status: { type: 'string', enum: eventStatuses },
    visibility: { type: 'string', enum: visibilityTypes },
    
    // Optional core fields
    slug: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 10000 },
    short_description: { type: 'string', maxLength: 500 },
    
    // Display & categorization
    is_featured: { type: 'boolean' },
    priority_score: { type: 'integer', minimum: 0, maximum: 100 },
    primary_category_id: { type: 'string', pattern: uuidPattern },
    tags: {
      type: 'array',
      maxItems: 100,
      items: { type: 'string', maxLength: 50 }
    },
    
    // Media URLs (SD3: format: uri validation)
    banner_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
    thumbnail_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
    video_url: { type: 'string', format: 'uri', maxLength: 2000 },
    virtual_event_url: { type: 'string', format: 'uri', maxLength: 2000 },
    
    // Date-time fields (SD4: format: date-time validation)
    starts_at: { type: 'string', format: 'date-time' },
    ends_at: { type: 'string', format: 'date-time' },
    doors_open: { type: 'string', format: 'date-time' },
    timezone: { type: 'string', maxLength: 100 },
    
    // Event details
    age_restriction: { type: 'integer', minimum: 0, maximum: 99 },
    dress_code: { type: 'string', maxLength: 200 },
    capacity: { type: 'integer', minimum: 1, maximum: 1000000 },
    
    // Accessibility information
    accessibility_info: {
      type: 'object',
      additionalProperties: false,
      properties: {
        wheelchair_accessible: { type: 'boolean' },
        hearing_assistance: { type: 'boolean' },
        visual_assistance: { type: 'boolean' },
        notes: { type: 'string', maxLength: 2000 }
      }
    },
    
    // Policies
    cancellation_policy: { type: 'string', maxLength: 5000 },
    refund_policy: { type: 'string', maxLength: 5000 },
    
    // Virtual/Hybrid event support
    is_virtual: { type: 'boolean' },
    is_hybrid: { type: 'boolean' },
    streaming_platform: { type: 'string', maxLength: 100 },
    
    // SEO fields
    meta_title: { type: 'string', maxLength: 200 },
    meta_description: { type: 'string', maxLength: 500 },
    
    // Blockchain/NFT fields
    artist_wallet: { type: 'string', maxLength: 200 },
    artist_percentage: { type: 'number', minimum: 0, maximum: 100 },
    venue_percentage: { type: 'number', minimum: 0, maximum: 100 },
    resaleable: { type: 'boolean' }
  }
} as const;

/**
 * Update event request body schema
 * CRITICAL FIX: Added missing request body validation schema
 * 
 * All fields optional for partial updates
 * Excludes system-generated fields (id, tenant_id, views, timestamps, version)
 */
export const updateEventBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    // Core fields (all optional for updates)
    venue_id: { type: 'string', pattern: uuidPattern },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    slug: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 10000 },
    short_description: { type: 'string', maxLength: 500 },
    event_type: { type: 'string', enum: eventTypes },
    status: { type: 'string', enum: eventStatuses },
    visibility: { type: 'string', enum: visibilityTypes },
    
    // Display & categorization
    is_featured: { type: 'boolean' },
    priority_score: { type: 'integer', minimum: 0, maximum: 100 },
    primary_category_id: { type: 'string', pattern: uuidPattern },
    tags: {
      type: 'array',
      maxItems: 100,
      items: { type: 'string', maxLength: 50 }
    },
    
    // Media URLs
    banner_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
    thumbnail_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
    video_url: { type: 'string', format: 'uri', maxLength: 2000 },
    virtual_event_url: { type: 'string', format: 'uri', maxLength: 2000 },
    
    // Date-time fields
    starts_at: { type: 'string', format: 'date-time' },
    ends_at: { type: 'string', format: 'date-time' },
    doors_open: { type: 'string', format: 'date-time' },
    timezone: { type: 'string', maxLength: 100 },
    
    // Event details
    age_restriction: { type: 'integer', minimum: 0, maximum: 99 },
    dress_code: { type: 'string', maxLength: 200 },
    capacity: { type: 'integer', minimum: 1, maximum: 1000000 },
    
    // Accessibility information
    accessibility_info: {
      type: 'object',
      additionalProperties: false,
      properties: {
        wheelchair_accessible: { type: 'boolean' },
        hearing_assistance: { type: 'boolean' },
        visual_assistance: { type: 'boolean' },
        notes: { type: 'string', maxLength: 2000 }
      }
    },
    
    // Policies
    cancellation_policy: { type: 'string', maxLength: 5000 },
    refund_policy: { type: 'string', maxLength: 5000 },
    
    // Virtual/Hybrid event support
    is_virtual: { type: 'boolean' },
    is_hybrid: { type: 'boolean' },
    streaming_platform: { type: 'string', maxLength: 100 },
    
    // SEO fields
    meta_title: { type: 'string', maxLength: 200 },
    meta_description: { type: 'string', maxLength: 500 },
    
    // Blockchain/NFT fields
    artist_wallet: { type: 'string', maxLength: 200 },
    artist_percentage: { type: 'number', minimum: 0, maximum: 100 },
    venue_percentage: { type: 'number', minimum: 0, maximum: 100 },
    resaleable: { type: 'boolean' }
  }
} as const;

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
