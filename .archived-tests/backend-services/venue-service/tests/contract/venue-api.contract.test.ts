/**
 * API Contract Tests for Venue Service (MT2)
 * 
 * These tests validate that the API responses conform to the expected
 * schema/contract, ensuring backward compatibility for consumers.
 * 
 * Uses JSON Schema validation to verify response structures.
 * 
 * Run: npm run test:contract
 */

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// ============================================================================
// API Response Schemas (Contract Definitions)
// ============================================================================

const venueSchema = {
  $id: 'venue',
  type: 'object',
  required: ['id', 'name', 'slug', 'tenant_id', 'created_at', 'updated_at'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    slug: { type: 'string', pattern: '^[a-z0-9-]+$' },
    tenant_id: { type: 'string', format: 'uuid' },
    description: { type: ['string', 'null'] },
    address: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    state: { type: ['string', 'null'] },
    country: { type: ['string', 'null'] },
    postal_code: { type: ['string', 'null'] },
    latitude: { type: ['number', 'null'] },
    longitude: { type: ['number', 'null'] },
    capacity: { type: ['integer', 'null'], minimum: 0 },
    venue_type: { type: ['string', 'null'], enum: ['arena', 'stadium', 'theater', 'club', 'outdoor', 'other', null] },
    status: { type: 'string', enum: ['active', 'inactive', 'pending', 'archived'] },
    timezone: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    email: { type: ['string', 'null'], format: 'email' },
    website: { type: ['string', 'null'], format: 'uri' },
    logo_url: { type: ['string', 'null'], format: 'uri' },
    cover_image_url: { type: ['string', 'null'], format: 'uri' },
    stripe_account_id: { type: ['string', 'null'] },
    stripe_onboarding_complete: { type: ['boolean', 'null'] },
    created_at: { type: 'string', format: 'date-time' },
    updated_at: { type: 'string', format: 'date-time' },
    version: { type: ['integer', 'null'] },
  },
  additionalProperties: true, // Allow additional properties for forward compatibility
};

const venueSettingsSchema = {
  $id: 'venue-settings',
  type: 'object',
  required: ['id', 'venue_id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    venue_id: { type: 'string', format: 'uuid' },
    default_currency: { type: ['string', 'null'], pattern: '^[A-Z]{3}$' },
    ticket_resale_allowed: { type: ['boolean', 'null'] },
    max_resale_price_multiplier: { type: ['string', 'number', 'null'] },
    max_resale_price_fixed: { type: ['string', 'number', 'null'] },
    max_transfers_per_ticket: { type: ['integer', 'null'] },
    require_seller_verification: { type: ['boolean', 'null'] },
    resale_cutoff_hours: { type: ['integer', 'null'] },
    anti_scalping_enabled: { type: ['boolean', 'null'] },
    theme_primary_color: { type: ['string', 'null'] },
    theme_secondary_color: { type: ['string', 'null'] },
    created_at: { type: ['string', 'null'], format: 'date-time' },
    updated_at: { type: ['string', 'null'], format: 'date-time' },
  },
  additionalProperties: true,
};

const paginatedResponseSchema = {
  $id: 'paginated-response',
  type: 'object',
  required: ['data', 'pagination'],
  properties: {
    data: { type: 'array' },
    pagination: {
      type: 'object',
      required: ['page', 'limit', 'total', 'totalPages'],
      properties: {
        page: { type: 'integer', minimum: 1 },
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        total: { type: 'integer', minimum: 0 },
        totalPages: { type: 'integer', minimum: 0 },
        hasNextPage: { type: 'boolean' },
        hasPreviousPage: { type: 'boolean' },
      },
    },
  },
};

const errorResponseSchema = {
  $id: 'error-response',
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: ['object', 'array', 'null'] },
        requestId: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};

const healthResponseSchema = {
  $id: 'health-response',
  type: 'object',
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded', 'unhealthy'] },
    timestamp: { type: 'string', format: 'date-time' },
    version: { type: 'string' },
    uptime: { type: 'number' },
    checks: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['healthy', 'unhealthy', 'degraded'] },
          latencyMs: { type: 'number' },
          error: { type: 'string' },
        },
      },
    },
  },
};

const stripeConnectStatusSchema = {
  $id: 'stripe-connect-status',
  type: 'object',
  required: ['venueId', 'stripeAccountId', 'onboardingComplete'],
  properties: {
    venueId: { type: 'string', format: 'uuid' },
    stripeAccountId: { type: ['string', 'null'] },
    onboardingComplete: { type: 'boolean' },
    chargesEnabled: { type: ['boolean', 'null'] },
    payoutsEnabled: { type: ['boolean', 'null'] },
    detailsSubmitted: { type: ['boolean', 'null'] },
    currentlyDue: { type: ['array', 'null'], items: { type: 'string' } },
  },
};

// Register schemas
ajv.addSchema(venueSchema);
ajv.addSchema(venueSettingsSchema);
ajv.addSchema(paginatedResponseSchema);
ajv.addSchema(errorResponseSchema);
ajv.addSchema(healthResponseSchema);
ajv.addSchema(stripeConnectStatusSchema);

// ============================================================================
// Contract Tests
// ============================================================================

describe('Venue API Contract Tests', () => {
  describe('Venue Schema', () => {
    it('should validate a complete venue object', () => {
      const venue = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Madison Square Garden',
        slug: 'madison-square-garden',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        description: 'World-famous arena in NYC',
        address: '4 Pennsylvania Plaza',
        city: 'New York',
        state: 'NY',
        country: 'US',
        postal_code: '10001',
        latitude: 40.7505,
        longitude: -73.9934,
        capacity: 20789,
        venue_type: 'arena',
        status: 'active',
        timezone: 'America/New_York',
        phone: '+1-212-465-6741',
        email: 'info@msg.com',
        website: 'https://www.msg.com',
        logo_url: 'https://cdn.example.com/msg-logo.png',
        cover_image_url: 'https://cdn.example.com/msg-cover.jpg',
        stripe_account_id: 'acct_1234567890',
        stripe_onboarding_complete: true,
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-06-15T12:30:00.000Z',
        version: 5,
      };

      const validate = ajv.getSchema('venue');
      const valid = validate!(venue);
      expect(valid).toBe(true);
    });

    it('should validate a minimal venue object', () => {
      const venue = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Simple Venue',
        slug: 'simple-venue',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const validate = ajv.getSchema('venue');
      const valid = validate!(venue);
      expect(valid).toBe(true);
    });

    it('should reject venue with invalid id format', () => {
      const venue = {
        id: 'not-a-uuid',
        name: 'Test Venue',
        slug: 'test-venue',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const validate = ajv.getSchema('venue');
      const valid = validate!(venue);
      expect(valid).toBe(false);
    });

    it('should reject venue with invalid slug pattern', () => {
      const venue = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Venue',
        slug: 'Invalid Slug With Spaces',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'active',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const validate = ajv.getSchema('venue');
      const valid = validate!(venue);
      expect(valid).toBe(false);
    });

    it('should reject venue with invalid status', () => {
      const venue = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Venue',
        slug: 'test-venue',
        tenant_id: '550e8400-e29b-41d4-a716-446655440001',
        status: 'deleted', // Invalid status
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const validate = ajv.getSchema('venue');
      const valid = validate!(venue);
      expect(valid).toBe(false);
    });
  });

  describe('Venue Settings Schema', () => {
    it('should validate complete settings', () => {
      const settings = {
        id: '550e8400-e29b-41d4-a716-446655440000',
        venue_id: '550e8400-e29b-41d4-a716-446655440001',
        default_currency: 'USD',
        ticket_resale_allowed: true,
        max_resale_price_multiplier: '1.50',
        max_transfers_per_ticket: 3,
        require_seller_verification: true,
        resale_cutoff_hours: 24,
        anti_scalping_enabled: true,
        theme_primary_color: '#FF5500',
        created_at: '2024-01-01T00:00:00.000Z',
        updated_at: '2024-01-01T00:00:00.000Z',
      };

      const validate = ajv.getSchema('venue-settings');
      const valid = validate!(settings);
      expect(valid).toBe(true);
    });
  });

  describe('Paginated Response Schema', () => {
    it('should validate paginated venue list', () => {
      const response = {
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            name: 'Venue 1',
            slug: 'venue-1',
            tenant_id: '550e8400-e29b-41d4-a716-446655440001',
            status: 'active',
            created_at: '2024-01-01T00:00:00.000Z',
            updated_at: '2024-01-01T00:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 50,
          totalPages: 5,
          hasNextPage: true,
          hasPreviousPage: false,
        },
      };

      const validate = ajv.getSchema('paginated-response');
      const valid = validate!(response);
      expect(valid).toBe(true);
    });

    it('should reject pagination with invalid page number', () => {
      const response = {
        data: [],
        pagination: {
          page: 0, // Invalid - must be >= 1
          limit: 10,
          total: 0,
          totalPages: 0,
        },
      };

      const validate = ajv.getSchema('paginated-response');
      const valid = validate!(response);
      expect(valid).toBe(false);
    });
  });

  describe('Error Response Schema', () => {
    it('should validate standard error response', () => {
      const errorResponse = {
        error: {
          code: 'VENUE_NOT_FOUND',
          message: 'The requested venue does not exist',
          requestId: 'req_1234567890',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      };

      const validate = ajv.getSchema('error-response');
      const valid = validate!(errorResponse);
      expect(valid).toBe(true);
    });

    it('should validate error response with details', () => {
      const errorResponse = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [
            { field: 'name', message: 'Name is required' },
            { field: 'capacity', message: 'Capacity must be positive' },
          ],
          requestId: 'req_1234567890',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
      };

      const validate = ajv.getSchema('error-response');
      const valid = validate!(errorResponse);
      expect(valid).toBe(true);
    });
  });

  describe('Health Response Schema', () => {
    it('should validate healthy response', () => {
      const health = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '1.0.0',
        uptime: 86400.5,
        checks: {
          database: { status: 'healthy', latencyMs: 5 },
          redis: { status: 'healthy', latencyMs: 2 },
          mongodb: { status: 'healthy', latencyMs: 8 },
        },
      };

      const validate = ajv.getSchema('health-response');
      const valid = validate!(health);
      expect(valid).toBe(true);
    });

    it('should validate degraded response', () => {
      const health = {
        status: 'degraded',
        timestamp: '2024-01-01T00:00:00.000Z',
        checks: {
          database: { status: 'healthy', latencyMs: 5 },
          redis: { status: 'unhealthy', error: 'Connection timeout' },
        },
      };

      const validate = ajv.getSchema('health-response');
      const valid = validate!(health);
      expect(valid).toBe(true);
    });
  });

  describe('Stripe Connect Status Schema', () => {
    it('should validate complete stripe status', () => {
      const status = {
        venueId: '550e8400-e29b-41d4-a716-446655440000',
        stripeAccountId: 'acct_1234567890',
        onboardingComplete: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        currentlyDue: [],
      };

      const validate = ajv.getSchema('stripe-connect-status');
      const valid = validate!(status);
      expect(valid).toBe(true);
    });

    it('should validate pending onboarding status', () => {
      const status = {
        venueId: '550e8400-e29b-41d4-a716-446655440000',
        stripeAccountId: 'acct_1234567890',
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        currentlyDue: ['business_type', 'company.address', 'external_account'],
      };

      const validate = ajv.getSchema('stripe-connect-status');
      const valid = validate!(status);
      expect(valid).toBe(true);
    });
  });
});

// ============================================================================
// Schema Export for Documentation
// ============================================================================

export const schemas = {
  venue: venueSchema,
  venueSettings: venueSettingsSchema,
  paginatedResponse: paginatedResponseSchema,
  errorResponse: errorResponseSchema,
  healthResponse: healthResponseSchema,
  stripeConnectStatus: stripeConnectStatusSchema,
};
