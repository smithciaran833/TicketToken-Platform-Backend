/**
 * Capacity-related JSON Schema definitions
 * 
 * CRITICAL: All schemas MUST include additionalProperties: false
 * to prevent prototype pollution attacks (SEC1).
 * 
 * Audit Fixes:
 * - RD5: Response schemas defined to prevent data leakage
 * - SD9: Reusable schema definitions (DRY)
 */

import { 
  uuidPattern,
  uuidFieldSchema,
  timestampFieldsSchema,
  paginationResponseSchema,
  errorResponseSchema
} from './common.schema';

// Param schemas
export const capacityIdParamSchema = {
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

// Create capacity body schema
export const createCapacityBodySchema = {
  type: 'object',
  required: ['section_name', 'total_capacity'],
  additionalProperties: false,
  properties: {
    section_name: { type: 'string', minLength: 1, maxLength: 100 },
    section_code: { type: 'string', maxLength: 20 },
    tier: { type: 'string', maxLength: 50 },
    total_capacity: { type: 'integer', minimum: 1, maximum: 1000000 },
    available_capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
    reserved_capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
    buffer_capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
    schedule_id: { type: 'string', pattern: uuidPattern },
    // LOW PRIORITY ISSUE #16: Row Configuration Math
    // TODO: Add service-layer validation in capacity.service.ts to ensure:
    // rows × seats_per_row = total_capacity (when row_config is provided)
    // This is a business logic validation that cannot be expressed in JSON Schema
    row_config: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rows: { type: 'integer', minimum: 1, maximum: 1000 },
        seats_per_row: { type: 'integer', minimum: 1, maximum: 1000 },
        row_labels: {
          type: 'array',
          maxItems: 1000,
          items: { type: 'string', maxLength: 10 }
        }
      }
    },
    seat_map: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['grid', 'custom', 'ga'] },
        data: {
          type: 'object',
          required: ['version', 'layout_type'],
          additionalProperties: true,
          properties: {
            version: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
            layout_type: { 
              type: 'string', 
              enum: ['theater', 'stadium', 'general_admission', 'custom'] 
            },
            sections: {
              type: 'array',
              maxItems: 1000,
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string', maxLength: 50 },
                  name: { type: 'string', maxLength: 100 },
                  rows: { type: 'integer', minimum: 0, maximum: 1000 },
                  seats_per_row: { type: 'integer', minimum: 0, maximum: 1000 }
                }
              }
            },
            coordinates: {
              type: 'object',
              additionalProperties: true,
              properties: {
                width: { type: 'number', minimum: 0 },
                height: { type: 'number', minimum: 0 }
              }
            }
          }
        }
      }
    },
    is_active: { type: 'boolean' },
    is_visible: { type: 'boolean' },
    minimum_purchase: { type: 'integer', minimum: 1, maximum: 100 },
    maximum_purchase: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;

// Update capacity body schema
export const updateCapacityBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    section_name: { type: 'string', minLength: 1, maxLength: 100 },
    section_code: { type: 'string', maxLength: 20 },
    tier: { type: 'string', maxLength: 50 },
    total_capacity: { type: 'integer', minimum: 1, maximum: 1000000 },
    available_capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
    reserved_capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
    buffer_capacity: { type: 'integer', minimum: 0, maximum: 1000000 },
    row_config: {
      type: 'object',
      additionalProperties: false,
      properties: {
        rows: { type: 'integer', minimum: 1, maximum: 1000 },
        seats_per_row: { type: 'integer', minimum: 1, maximum: 1000 },
        row_labels: {
          type: 'array',
          maxItems: 1000,
          items: { type: 'string', maxLength: 10 }
        }
      }
    },
    seat_map: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['grid', 'custom', 'ga'] },
        data: {
          type: 'object',
          required: ['version', 'layout_type'],
          additionalProperties: true,
          properties: {
            version: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
            layout_type: { 
              type: 'string', 
              enum: ['theater', 'stadium', 'general_admission', 'custom'] 
            },
            sections: {
              type: 'array',
              maxItems: 1000,
              items: {
                type: 'object',
                additionalProperties: true,
                properties: {
                  id: { type: 'string', maxLength: 50 },
                  name: { type: 'string', maxLength: 100 },
                  rows: { type: 'integer', minimum: 0, maximum: 1000 },
                  seats_per_row: { type: 'integer', minimum: 0, maximum: 1000 }
                }
              }
            },
            coordinates: {
              type: 'object',
              additionalProperties: true,
              properties: {
                width: { type: 'number', minimum: 0 },
                height: { type: 'number', minimum: 0 }
              }
            }
          }
        }
      }
    },
    is_active: { type: 'boolean' },
    is_visible: { type: 'boolean' },
    minimum_purchase: { type: 'integer', minimum: 1, maximum: 100 },
    maximum_purchase: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;

// Check availability body schema
export const checkAvailabilityBodySchema = {
  type: 'object',
  required: ['quantity'],
  additionalProperties: false,
  properties: {
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
    seat_ids: {
      type: 'array',
      maxItems: 100,
      items: { type: 'string', maxLength: 50 }
    }
  }
} as const;

// Reserve capacity body schema
export const reserveCapacityBodySchema = {
  type: 'object',
  required: ['quantity'],
  additionalProperties: false,
  properties: {
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
    seat_ids: {
      type: 'array',
      maxItems: 100,
      items: { type: 'string', maxLength: 50 }
    },
    reservation_duration_minutes: { type: 'integer', minimum: 1, maximum: 60, default: 15 },
    pricing_id: { type: 'string', pattern: uuidPattern }
  }
} as const;

// ============================================================================
// RESPONSE SCHEMAS (RD5 - Response Schemas)
// ============================================================================

/**
 * Single capacity response schema
 * RD5: Response schema to prevent data leakage
 */
export const capacityResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    id: uuidFieldSchema,
    tenant_id: uuidFieldSchema,
    event_id: uuidFieldSchema,
    schedule_id: { ...uuidFieldSchema, nullable: true },
    section_name: { type: 'string' },
    section_code: { type: 'string', nullable: true },
    tier: { type: 'string', nullable: true },
    total_capacity: { type: 'integer' },
    available_capacity: { type: 'integer' },
    reserved_capacity: { type: 'integer' },
    sold_capacity: { type: 'integer' },
    buffer_capacity: { type: 'integer' },
    row_config: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: {
        rows: { type: 'integer' },
        seats_per_row: { type: 'integer' },
        row_labels: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    },
    seat_map: {
      type: 'object',
      nullable: true,
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: ['grid', 'custom', 'ga'] },
        data: { type: 'object' }
      }
    },
    is_active: { type: 'boolean' },
    is_visible: { type: 'boolean' },
    minimum_purchase: { type: 'integer', nullable: true },
    maximum_purchase: { type: 'integer', nullable: true },
    ...timestampFieldsSchema,
    version: { type: 'integer' }
  }
} as const;

/**
 * Capacity list response schema
 * RD5: Response schema for list endpoints
 * 
 * NAMING CONVENTION (Issue #12):
 * Uses "capacities" (PLURAL) because a single event typically has MULTIPLE
 * capacity configurations - one for each section/tier (e.g., VIP, General Admission,
 * Balcony, Floor). Each capacity record represents a distinct seating section.
 * 
 * This differs from pricing which uses singular form, as pricing typically
 * represents a single configuration per event (though with multiple tiers within it).
 */
export const capacityListResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    capacities: {
      type: 'array',
      items: capacityResponseSchema
    },
    pagination: paginationResponseSchema
  }
} as const;

/**
 * Availability check response schema
 */
export const availabilityResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    capacity_id: uuidFieldSchema,
    is_available: { type: 'boolean' },
    requested_quantity: { type: 'integer' },
    available_quantity: { type: 'integer' },
    seats_available: {
      type: 'array',
      items: { type: 'string' }
    },
    seats_unavailable: {
      type: 'array',
      items: { type: 'string' }
    }
  }
} as const;

/**
 * Reservation response schema
 */
export const reservationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reservation_id: uuidFieldSchema,
    capacity_id: uuidFieldSchema,
    pricing_id: { ...uuidFieldSchema, nullable: true },
    quantity: { type: 'integer' },
    seat_ids: {
      type: 'array',
      items: { type: 'string' }
    },
    expires_at: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['active', 'expired', 'converted', 'cancelled'] }
  }
} as const;

// ============================================================================
// HTTP RESPONSE SCHEMAS FOR ROUTES
// ============================================================================

export const capacityRouteResponses = {
  200: {
    description: 'Successful operation',
    type: 'object',
    properties: capacityResponseSchema.properties
  },
  201: {
    description: 'Capacity created successfully',
    type: 'object',
    properties: {
      success: { type: 'boolean', const: true },
      capacity: capacityResponseSchema
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
    description: 'Capacity not found',
    ...errorResponseSchema
  }
} as const;

export const capacityListRouteResponses = {
  200: {
    description: 'List of capacity configurations',
    type: 'object',
    properties: capacityListResponseSchema.properties
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

export const availabilityRouteResponses = {
  200: {
    description: 'Availability check result',
    type: 'object',
    properties: availabilityResponseSchema.properties
  },
  400: {
    description: 'Bad Request - validation error',
    ...errorResponseSchema
  },
  404: {
    description: 'Capacity not found',
    ...errorResponseSchema
  }
} as const;

export const reservationRouteResponses = {
  201: {
    description: 'Reservation created successfully',
    type: 'object',
    properties: reservationResponseSchema.properties
  },
  400: {
    description: 'Bad Request - validation error or insufficient capacity',
    ...errorResponseSchema
  },
  404: {
    description: 'Capacity not found',
    ...errorResponseSchema
  },
  409: {
    description: 'Conflict - seats already reserved',
    ...errorResponseSchema
  }
} as const;
