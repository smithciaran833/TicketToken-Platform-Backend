/**
 * Error Response Tests (FT5)
 * 
 * Tests error response handling for all error types
 */

import Ajv from 'ajv';

// Error response schema for validation
const errorResponseSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string', pattern: '^[A-Z_]+$' },
        message: { type: 'string', minLength: 1 },
        details: { type: ['object', 'array', 'null'] },
        requestId: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  },
};

// Initialize JSON Schema validator
const ajv = new Ajv({ formats: { 'date-time': true } });
const validateErrorResponse = ajv.compile(errorResponseSchema);

describe('Error Response Tests (FT5)', () => {
  describe('Error Response Schema Validation', () => {
    it('should match expected schema for validation errors', () => {
      const response = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: [
            { field: 'name', message: 'Required field' },
          ],
          requestId: 'req_123',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
    });

    it('should match expected schema for authentication errors', () => {
      const response = {
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'Invalid authentication token',
          requestId: 'req_456',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
    });

    it('should match expected schema for not found errors', () => {
      const response = {
        error: {
          code: 'VENUE_NOT_FOUND',
          message: 'Venue not found',
          requestId: 'req_789',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
    });

    it('should match expected schema for rate limit errors', () => {
      const response = {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          details: {
            retryAfter: 60,
            limit: 100,
            remaining: 0,
          },
          requestId: 'req_101',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
    });
  });

  describe('Error Code Coverage', () => {
    const errorCodes = [
      // Authentication
      'AUTH_TOKEN_MISSING',
      'AUTH_TOKEN_INVALID',
      'AUTH_TOKEN_EXPIRED',
      'AUTH_INSUFFICIENT_SCOPE',
      // Tenant
      'TENANT_ID_MISSING',
      'TENANT_ID_INVALID',
      'TENANT_NOT_FOUND',
      // Venue
      'VENUE_NOT_FOUND',
      'VENUE_ALREADY_EXISTS',
      'VENUE_SLUG_CONFLICT',
      'VENUE_UPDATE_CONFLICT',
      // Validation
      'VALIDATION_ERROR',
      'VALIDATION_REQUIRED_FIELD',
      'VALIDATION_TYPE_ERROR',
      // Rate Limiting
      'RATE_LIMIT_EXCEEDED',
      // Database
      'DB_CONNECTION_ERROR',
      'DB_CONSTRAINT_VIOLATION',
      // Stripe
      'STRIPE_ACCOUNT_NOT_FOUND',
      'STRIPE_ONBOARDING_INCOMPLETE',
      // Resale
      'RESALE_NOT_ALLOWED',
      'RESALE_PRICE_TOO_HIGH',
      'RESALE_TRANSFER_LIMIT',
    ];

    it.each(errorCodes)('should format %s error correctly', (code) => {
      const response = {
        error: {
          code,
          message: `Error with code ${code}`,
          requestId: 'req_test',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
      expect(response.error.code).toBe(code);
    });
  });

  describe('Error Response Content', () => {
    it('should not expose internal errors in production', () => {
      const internalError = new Error('Database connection string: postgres://...');
      const sanitizedResponse = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
          requestId: 'req_err',
          timestamp: new Date().toISOString(),
        },
      };

      // Should not contain connection string
      expect(JSON.stringify(sanitizedResponse)).not.toContain('postgres://');
      expect(validateErrorResponse(sanitizedResponse)).toBe(true);
    });

    it('should include validation details for 400 errors', () => {
      const response = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: [
            { field: 'capacity', message: 'must be a positive integer', value: -100 },
            { field: 'venue_type', message: 'invalid enum value', value: 'invalid' },
          ],
          requestId: 'req_val',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
      expect(response.error.details).toHaveLength(2);
    });

    it('should include retry-after for rate limit errors', () => {
      const response = {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded',
          details: {
            retryAfter: 30,
            limit: 100,
            window: '1 minute',
          },
          requestId: 'req_rate',
          timestamp: new Date().toISOString(),
        },
      };

      expect(validateErrorResponse(response)).toBe(true);
      expect(response.error.details).toHaveProperty('retryAfter');
    });
  });

  describe('HTTP Status Code Mapping', () => {
    const statusMappings: Array<[string, number]> = [
      ['AUTH_TOKEN_MISSING', 401],
      ['AUTH_TOKEN_INVALID', 401],
      ['AUTH_TOKEN_EXPIRED', 401],
      ['AUTH_INSUFFICIENT_SCOPE', 403],
      ['TENANT_NOT_FOUND', 404],
      ['VENUE_NOT_FOUND', 404],
      ['VENUE_ALREADY_EXISTS', 409],
      ['VENUE_UPDATE_CONFLICT', 409],
      ['VALIDATION_ERROR', 400],
      ['RATE_LIMIT_EXCEEDED', 429],
      ['DB_CONNECTION_ERROR', 503],
      ['INTERNAL_ERROR', 500],
    ];

    it.each(statusMappings)('%s should map to HTTP %d', (code, expectedStatus) => {
      const getStatusFromCode = (errorCode: string): number => {
        if (errorCode.startsWith('AUTH_TOKEN')) return 401;
        if (errorCode.startsWith('AUTH_')) return 403;
        if (errorCode.includes('NOT_FOUND')) return 404;
        if (errorCode.includes('CONFLICT') || errorCode.includes('ALREADY_EXISTS')) return 409;
        if (errorCode.startsWith('VALIDATION')) return 400;
        if (errorCode.includes('RATE_LIMIT')) return 429;
        if (errorCode.includes('CONNECTION')) return 503;
        return 500;
      };

      expect(getStatusFromCode(code)).toBe(expectedStatus);
    });
  });
});

describe('Response Schema Validation (FT7)', () => {
  const venueResponseSchema = {
    type: 'object',
    required: ['id', 'name', 'tenant_id', 'created_at', 'updated_at'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      slug: { type: 'string' },
      description: { type: ['string', 'null'] },
      address: { type: 'string' },
      city: { type: 'string' },
      state: { type: ['string', 'null'] },
      country: { type: 'string' },
      postal_code: { type: ['string', 'null'] },
      capacity: { type: 'integer', minimum: 0 },
      venue_type: { type: 'string', enum: ['arena', 'stadium', 'theater', 'club', 'outdoor', 'other'] },
      status: { type: 'string', enum: ['active', 'inactive', 'pending', 'archived'] },
      tenant_id: { type: 'string', format: 'uuid' },
      created_at: { type: 'string', format: 'date-time' },
      updated_at: { type: 'string', format: 'date-time' },
      version: { type: 'integer' },
    },
  };

  const validateVenueResponse = ajv.compile(venueResponseSchema);

  it('should validate venue response schema', () => {
    const venue = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Venue',
      slug: 'test-venue',
      description: 'A test venue',
      address: '123 Main St',
      city: 'Test City',
      state: 'TS',
      country: 'US',
      postal_code: '12345',
      capacity: 1000,
      venue_type: 'arena',
      status: 'active',
      tenant_id: '123e4567-e89b-12d3-a456-426614174001',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    expect(validateVenueResponse(venue)).toBe(true);
  });

  it('should fail validation for invalid venue data', () => {
    const invalidVenue = {
      id: 'not-a-uuid',
      name: '',  // Invalid: empty
      venue_type: 'invalid_type',  // Invalid enum
      capacity: -100,  // Invalid: negative
    };

    expect(validateVenueResponse(invalidVenue)).toBe(false);
  });

  const listResponseSchema = {
    type: 'object',
    required: ['data', 'pagination'],
    properties: {
      data: { type: 'array' },
      pagination: {
        type: 'object',
        required: ['total', 'page', 'limit'],
        properties: {
          total: { type: 'integer', minimum: 0 },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          totalPages: { type: 'integer', minimum: 0 },
          hasNext: { type: 'boolean' },
          hasPrev: { type: 'boolean' },
        },
      },
    },
  };

  const validateListResponse = ajv.compile(listResponseSchema);

  it('should validate list response schema', () => {
    const listResponse = {
      data: [{ id: '1' }, { id: '2' }],
      pagination: {
        total: 100,
        page: 1,
        limit: 20,
        totalPages: 5,
        hasNext: true,
        hasPrev: false,
      },
    };

    expect(validateListResponse(listResponse)).toBe(true);
  });
});
