/**
 * Unit tests for src/schemas/common.schema.ts
 * Tests common JSON schema definitions, patterns, and validation helpers
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

import {
  uuidPattern,
  dateTimePattern,
  currencyPattern,
  UUID_V4_REGEX,
  isValidUuid,
  uuidFieldSchema,
  urlFieldSchema,
  optionalUrlFieldSchema,
  dateTimeFieldSchema,
  optionalDateTimeFieldSchema,
  priceFieldSchema,
  percentageFieldSchema,
  currencyFieldSchema,
  uuidParamSchema,
  eventIdParamSchema,
  venueIdParamSchema,
  paginationQuerySchema,
  paginationResponseSchema,
  priceSchema,
  percentageSchema,
  errorResponseSchema,
  successResponseSchema,
  deleteResponseSchema,
  timestampFieldsSchema,
  http200ResponseSchema,
  http201ResponseSchema,
  http204ResponseSchema,
  http400ResponseSchema,
  http401ResponseSchema,
  http403ResponseSchema,
  http404ResponseSchema,
  http409ResponseSchema,
  http429ResponseSchema,
  http500ResponseSchema,
} from '../../../src/schemas/common.schema';

describe('schemas/common.schema', () => {
  let ajv: Ajv;

  beforeAll(() => {
    ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
  });

  describe('Patterns', () => {
    describe('uuidPattern', () => {
      it('should be a valid regex pattern string', () => {
        expect(typeof uuidPattern).toBe('string');
        expect(() => new RegExp(uuidPattern)).not.toThrow();
      });

      it('should match valid UUID v4', () => {
        const regex = new RegExp(uuidPattern, 'i');
        expect(regex.test('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
        expect(regex.test('00000000-0000-0000-0000-000000000000')).toBe(true);
        expect(regex.test('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(true);
      });

      it('should reject invalid UUIDs', () => {
        const regex = new RegExp(uuidPattern);
        expect(regex.test('not-a-uuid')).toBe(false);
        expect(regex.test('123e4567-e89b-12d3-a456')).toBe(false);
        expect(regex.test('123e4567e89b12d3a456426614174000')).toBe(false);
        expect(regex.test('')).toBe(false);
      });
    });

    describe('dateTimePattern', () => {
      it('should be a valid regex pattern string', () => {
        expect(typeof dateTimePattern).toBe('string');
        expect(() => new RegExp(dateTimePattern)).not.toThrow();
      });

      it('should match ISO 8601 date-time formats', () => {
        const regex = new RegExp(dateTimePattern);
        expect(regex.test('2024-01-15')).toBe(true);
        expect(regex.test('2024-01-15T10:30:00')).toBe(true);
        expect(regex.test('2024-01-15T10:30:00Z')).toBe(true);
        expect(regex.test('2024-01-15T10:30:00.123Z')).toBe(true);
        expect(regex.test('2024-01-15T10:30:00+05:00')).toBe(true);
        expect(regex.test('2024-01-15T10:30:00-08:00')).toBe(true);
      });

      it('should reject invalid date-time formats', () => {
        const regex = new RegExp(dateTimePattern);
        expect(regex.test('2024/01/15')).toBe(false);
        expect(regex.test('01-15-2024')).toBe(false);
        expect(regex.test('invalid')).toBe(false);
        expect(regex.test('')).toBe(false);
      });
    });

    describe('currencyPattern', () => {
      it('should be a valid regex pattern string', () => {
        expect(typeof currencyPattern).toBe('string');
        expect(() => new RegExp(currencyPattern)).not.toThrow();
      });

      it('should match valid 3-letter currency codes', () => {
        const regex = new RegExp(currencyPattern);
        expect(regex.test('USD')).toBe(true);
        expect(regex.test('EUR')).toBe(true);
        expect(regex.test('GBP')).toBe(true);
        expect(regex.test('JPY')).toBe(true);
      });

      it('should reject invalid currency codes', () => {
        const regex = new RegExp(currencyPattern);
        expect(regex.test('usd')).toBe(false);
        expect(regex.test('US')).toBe(false);
        expect(regex.test('USDD')).toBe(false);
        expect(regex.test('123')).toBe(false);
        expect(regex.test('')).toBe(false);
      });
    });
  });

  describe('UUID_V4_REGEX', () => {
    it('should be a RegExp instance', () => {
      expect(UUID_V4_REGEX).toBeInstanceOf(RegExp);
    });

    it('should match valid UUID v4 (version 4 specific)', () => {
      // UUID v4 has '4' in version position and [89ab] in variant position
      expect(UUID_V4_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(UUID_V4_REGEX.test('6ba7b810-9dad-41d4-80b4-00c04fd430c8')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(UUID_V4_REGEX.test('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
      expect(UUID_V4_REGEX.test('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });
  });

  describe('isValidUuid()', () => {
    it('should return true for valid UUID v4', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUuid('6ba7b810-9dad-41d4-80b4-00c04fd430c8')).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('123e4567-e89b-12d3-a456')).toBe(false);
      expect(isValidUuid('')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isValidUuid(null)).toBe(false);
      expect(isValidUuid(undefined)).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isValidUuid(123 as any)).toBe(false);
      expect(isValidUuid({} as any)).toBe(false);
      expect(isValidUuid([] as any)).toBe(false);
    });
  });

  describe('Field Schemas', () => {
    describe('uuidFieldSchema', () => {
      it('should have correct structure', () => {
        expect(uuidFieldSchema.type).toBe('string');
        expect(uuidFieldSchema.format).toBe('uuid');
        expect(uuidFieldSchema.description).toBeDefined();
      });

      it('should validate valid UUID with AJV', () => {
        const schema = { type: 'object', properties: { id: uuidFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });

      it('should reject invalid UUID with AJV', () => {
        const schema = { type: 'object', properties: { id: uuidFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ id: 'not-a-uuid' })).toBe(false);
      });
    });

    describe('urlFieldSchema', () => {
      it('should have correct structure', () => {
        expect(urlFieldSchema.type).toBe('string');
        expect(urlFieldSchema.format).toBe('uri');
        expect(urlFieldSchema.maxLength).toBe(2000);
      });

      it('should validate valid URLs', () => {
        const schema = { type: 'object', properties: { url: urlFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ url: 'https://example.com' })).toBe(true);
        expect(validate({ url: 'http://localhost:3000/path' })).toBe(true);
      });

      it('should reject invalid URLs', () => {
        const schema = { type: 'object', properties: { url: urlFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ url: 'not-a-url' })).toBe(false);
        expect(validate({ url: 'ftp://invalid' })).toBe(false);
      });
    });

    describe('optionalUrlFieldSchema', () => {
      it('should allow nullable', () => {
        expect(optionalUrlFieldSchema.nullable).toBe(true);
      });
    });

    describe('dateTimeFieldSchema', () => {
      it('should have correct structure', () => {
        expect(dateTimeFieldSchema.type).toBe('string');
        expect(dateTimeFieldSchema.format).toBe('date-time');
      });

      it('should validate valid ISO 8601 date-times', () => {
        const schema = { type: 'object', properties: { dt: dateTimeFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ dt: '2024-01-15T10:30:00Z' })).toBe(true);
        expect(validate({ dt: '2024-01-15T10:30:00.123+05:00' })).toBe(true);
      });
    });

    describe('optionalDateTimeFieldSchema', () => {
      it('should allow nullable', () => {
        expect(optionalDateTimeFieldSchema.nullable).toBe(true);
      });
    });

    describe('priceFieldSchema', () => {
      it('should have correct constraints', () => {
        expect(priceFieldSchema.type).toBe('number');
        expect(priceFieldSchema.minimum).toBe(0);
        expect(priceFieldSchema.maximum).toBe(9999999.99);
      });

      it('should validate valid prices', () => {
        const schema = { type: 'object', properties: { price: priceFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ price: 0 })).toBe(true);
        expect(validate({ price: 99.99 })).toBe(true);
        expect(validate({ price: 9999999.99 })).toBe(true);
      });

      it('should reject invalid prices', () => {
        const schema = { type: 'object', properties: { price: priceFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ price: -1 })).toBe(false);
        expect(validate({ price: 10000000 })).toBe(false);
      });
    });

    describe('percentageFieldSchema', () => {
      it('should have correct constraints', () => {
        expect(percentageFieldSchema.type).toBe('number');
        expect(percentageFieldSchema.minimum).toBe(0);
        expect(percentageFieldSchema.maximum).toBe(100);
      });

      it('should validate valid percentages', () => {
        const schema = { type: 'object', properties: { pct: percentageFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ pct: 0 })).toBe(true);
        expect(validate({ pct: 50 })).toBe(true);
        expect(validate({ pct: 100 })).toBe(true);
      });

      it('should reject invalid percentages', () => {
        const schema = { type: 'object', properties: { pct: percentageFieldSchema } };
        const validate = ajv.compile(schema);
        
        expect(validate({ pct: -1 })).toBe(false);
        expect(validate({ pct: 101 })).toBe(false);
      });
    });

    describe('currencyFieldSchema', () => {
      it('should have correct structure', () => {
        expect(currencyFieldSchema.type).toBe('string');
        expect(currencyFieldSchema.pattern).toBe(currencyPattern);
        expect(currencyFieldSchema.default).toBe('USD');
      });
    });
  });

  describe('Parameter Schemas', () => {
    describe('uuidParamSchema', () => {
      it('should have correct structure', () => {
        expect(uuidParamSchema.type).toBe('object');
        expect(uuidParamSchema.required).toContain('id');
        expect(uuidParamSchema.additionalProperties).toBe(false);
        expect(uuidParamSchema.properties.id).toBeDefined();
      });

      it('should validate valid params', () => {
        const validate = ajv.compile(uuidParamSchema);
        
        expect(validate({ id: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });

      it('should reject missing id', () => {
        const validate = ajv.compile(uuidParamSchema);
        
        expect(validate({})).toBe(false);
      });

      it('should reject additional properties', () => {
        const validate = ajv.compile(uuidParamSchema);
        
        expect(validate({ id: '550e8400-e29b-41d4-a716-446655440000', extra: 'field' })).toBe(false);
      });
    });

    describe('eventIdParamSchema', () => {
      it('should have correct structure', () => {
        expect(eventIdParamSchema.type).toBe('object');
        expect(eventIdParamSchema.required).toContain('eventId');
        expect(eventIdParamSchema.additionalProperties).toBe(false);
      });

      it('should validate valid eventId', () => {
        const validate = ajv.compile(eventIdParamSchema);
        
        expect(validate({ eventId: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });
    });

    describe('venueIdParamSchema', () => {
      it('should have correct structure', () => {
        expect(venueIdParamSchema.type).toBe('object');
        expect(venueIdParamSchema.required).toContain('venueId');
        expect(venueIdParamSchema.additionalProperties).toBe(false);
      });

      it('should validate valid venueId', () => {
        const validate = ajv.compile(venueIdParamSchema);
        
        expect(validate({ venueId: '550e8400-e29b-41d4-a716-446655440000' })).toBe(true);
      });
    });
  });

  describe('Pagination Schemas', () => {
    describe('paginationQuerySchema', () => {
      it('should have correct structure', () => {
        expect(paginationQuerySchema.type).toBe('object');
        expect(paginationQuerySchema.additionalProperties).toBe(false);
        expect(paginationQuerySchema.properties.limit).toBeDefined();
        expect(paginationQuerySchema.properties.offset).toBeDefined();
      });

      it('should have correct limit constraints', () => {
        const { limit } = paginationQuerySchema.properties;
        expect(limit.type).toBe('integer');
        expect(limit.minimum).toBe(1);
        expect(limit.maximum).toBe(100);
        expect(limit.default).toBe(20);
      });

      it('should have correct offset constraints', () => {
        const { offset } = paginationQuerySchema.properties;
        expect(offset.type).toBe('integer');
        expect(offset.minimum).toBe(0);
        expect(offset.default).toBe(0);
      });

      it('should validate valid pagination params', () => {
        const validate = ajv.compile(paginationQuerySchema);
        
        expect(validate({ limit: 50, offset: 100 })).toBe(true);
        expect(validate({ limit: 1 })).toBe(true);
        expect(validate({})).toBe(true); // defaults should apply
      });

      it('should reject invalid pagination params', () => {
        const validate = ajv.compile(paginationQuerySchema);
        
        expect(validate({ limit: 0 })).toBe(false);
        expect(validate({ limit: 101 })).toBe(false);
        expect(validate({ offset: -1 })).toBe(false);
      });
    });

    describe('paginationResponseSchema', () => {
      it('should have correct structure', () => {
        expect(paginationResponseSchema.type).toBe('object');
        expect(paginationResponseSchema.additionalProperties).toBe(false);
        expect(paginationResponseSchema.properties.total).toBeDefined();
        expect(paginationResponseSchema.properties.limit).toBeDefined();
        expect(paginationResponseSchema.properties.offset).toBeDefined();
        expect(paginationResponseSchema.properties.hasMore).toBeDefined();
      });

      it('should validate valid pagination response', () => {
        const validate = ajv.compile(paginationResponseSchema);
        
        expect(validate({ total: 100, limit: 20, offset: 0, hasMore: true })).toBe(true);
        expect(validate({ total: 0, limit: 20, offset: 0, hasMore: false })).toBe(true);
      });
    });
  });

  describe('Response Schemas', () => {
    describe('errorResponseSchema', () => {
      it('should have RFC 7807 Problem Details structure', () => {
        expect(errorResponseSchema.type).toBe('object');
        expect(errorResponseSchema.additionalProperties).toBe(false);
        expect(errorResponseSchema.properties.type).toBeDefined();
        expect(errorResponseSchema.properties.title).toBeDefined();
        expect(errorResponseSchema.properties.status).toBeDefined();
        expect(errorResponseSchema.properties.detail).toBeDefined();
        expect(errorResponseSchema.properties.instance).toBeDefined();
        expect(errorResponseSchema.properties.code).toBeDefined();
        expect(errorResponseSchema.properties.errors).toBeDefined();
      });

      it('should define errors array with field-level errors', () => {
        const { errors } = errorResponseSchema.properties;
        expect(errors.type).toBe('array');
        expect(errors.items.properties.field).toBeDefined();
        expect(errors.items.properties.message).toBeDefined();
        expect(errors.items.properties.code).toBeDefined();
      });

      it('should validate valid error response', () => {
        const validate = ajv.compile(errorResponseSchema);
        
        const validError = {
          type: 'https://api.example.com/errors/validation',
          title: 'Validation Error',
          status: 400,
          detail: 'The request body contains invalid data',
          instance: '/events/123',
          code: 'VALIDATION_ERROR',
          errors: [
            { field: 'name', message: 'Name is required', code: 'REQUIRED' }
          ]
        };
        
        expect(validate(validError)).toBe(true);
      });
    });

    describe('successResponseSchema', () => {
      it('should have correct structure', () => {
        expect(successResponseSchema.type).toBe('object');
        expect(successResponseSchema.additionalProperties).toBe(false);
        expect(successResponseSchema.properties.success).toBeDefined();
        expect(successResponseSchema.properties.message).toBeDefined();
        expect(successResponseSchema.properties.data).toBeDefined();
      });

      it('should have success as const true', () => {
        expect(successResponseSchema.properties.success.const).toBe(true);
      });
    });

    describe('deleteResponseSchema', () => {
      it('should have correct structure', () => {
        expect(deleteResponseSchema.type).toBe('object');
        expect(deleteResponseSchema.additionalProperties).toBe(false);
        expect(deleteResponseSchema.properties.success).toBeDefined();
        expect(deleteResponseSchema.properties.message).toBeDefined();
        expect(deleteResponseSchema.properties.deletedId).toBeDefined();
      });

      it('should validate deletedId as UUID', () => {
        expect(deleteResponseSchema.properties.deletedId.pattern).toBe(uuidPattern);
      });
    });
  });

  describe('Timestamp Fields Schema', () => {
    it('should have all audit timestamp fields', () => {
      expect(timestampFieldsSchema.created_at).toBeDefined();
      expect(timestampFieldsSchema.updated_at).toBeDefined();
      expect(timestampFieldsSchema.deleted_at).toBeDefined();
    });

    it('should use date-time format', () => {
      expect(timestampFieldsSchema.created_at.format).toBe('date-time');
      expect(timestampFieldsSchema.updated_at.format).toBe('date-time');
      expect(timestampFieldsSchema.deleted_at.format).toBe('date-time');
    });

    it('should allow nullable for deleted_at', () => {
      expect(timestampFieldsSchema.deleted_at.nullable).toBe(true);
    });
  });

  describe('HTTP Status Response Schemas', () => {
    it('http200ResponseSchema should have description', () => {
      expect(http200ResponseSchema.description).toBe('Successful operation');
      expect(http200ResponseSchema.type).toBe('object');
    });

    it('http201ResponseSchema should have description', () => {
      expect(http201ResponseSchema.description).toBe('Resource created successfully');
      expect(http201ResponseSchema.type).toBe('object');
    });

    it('http204ResponseSchema should have description', () => {
      expect(http204ResponseSchema.description).toBe('No content - operation successful');
    });

    it('http400ResponseSchema should extend errorResponseSchema', () => {
      expect(http400ResponseSchema.description).toBe('Bad Request - validation error');
      expect(http400ResponseSchema.type).toBe('object');
    });

    it('http401ResponseSchema should extend errorResponseSchema', () => {
      expect(http401ResponseSchema.description).toBe('Unauthorized - authentication required');
    });

    it('http403ResponseSchema should extend errorResponseSchema', () => {
      expect(http403ResponseSchema.description).toBe('Forbidden - insufficient permissions');
    });

    it('http404ResponseSchema should extend errorResponseSchema', () => {
      expect(http404ResponseSchema.description).toBe('Resource not found');
    });

    it('http409ResponseSchema should extend errorResponseSchema', () => {
      expect(http409ResponseSchema.description).toBe('Conflict - resource already exists or version mismatch');
    });

    it('http429ResponseSchema should extend errorResponseSchema', () => {
      expect(http429ResponseSchema.description).toBe('Too Many Requests - rate limit exceeded');
    });

    it('http500ResponseSchema should extend errorResponseSchema', () => {
      expect(http500ResponseSchema.description).toBe('Internal Server Error');
    });
  });

  describe('Legacy Exports', () => {
    it('priceSchema should be same as priceFieldSchema', () => {
      expect(priceSchema).toBe(priceFieldSchema);
    });

    it('percentageSchema should be same as percentageFieldSchema', () => {
      expect(percentageSchema).toBe(percentageFieldSchema);
    });
  });

  describe('Security: additionalProperties', () => {
    it('all object schemas should have additionalProperties: false', () => {
      // Param schemas
      expect(uuidParamSchema.additionalProperties).toBe(false);
      expect(eventIdParamSchema.additionalProperties).toBe(false);
      expect(venueIdParamSchema.additionalProperties).toBe(false);
      
      // Pagination schemas
      expect(paginationQuerySchema.additionalProperties).toBe(false);
      expect(paginationResponseSchema.additionalProperties).toBe(false);
      
      // Response schemas
      expect(errorResponseSchema.additionalProperties).toBe(false);
      expect(successResponseSchema.additionalProperties).toBe(false);
      expect(deleteResponseSchema.additionalProperties).toBe(false);
    });
  });
});
