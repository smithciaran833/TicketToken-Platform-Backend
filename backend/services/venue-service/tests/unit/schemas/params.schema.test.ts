/**
 * Unit tests for src/schemas/params.schema.ts
 * Tests UUID validation, security fixes (RD3, RD6), and schema factories
 */

import {
  venueIdParamsSchema,
  integrationIdParamsSchema,
  contentIdParamsSchema,
  reviewIdParamsSchema,
  createUuidParamSchema,
  createMultipleUuidParamsSchema,
  venueIdParamsSchemaTypebox,
  integrationIdParamsSchemaTypebox,
} from '../../../src/schemas/params.schema';

describe('schemas/params.schema', () => {
  // Valid UUID v4 for testing
  const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_UUID_2 = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const VALID_UUID_LOWERCASE = '550e8400-e29b-41d4-a716-446655440000';
  const VALID_UUID_UPPERCASE = '550E8400-E29B-41D4-A716-446655440000';
  const VALID_UUID_MIXED_CASE = '550E8400-e29b-41D4-a716-446655440000';

  // Invalid UUIDs for testing
  const INVALID_UUIDS = {
    tooShort: '550e8400-e29b-41d4-a716',
    tooLong: '550e8400-e29b-41d4-a716-446655440000-extra',
    wrongFormat: '550e8400e29b41d4a716446655440000',
    wrongVersion: '550e8400-e29b-31d4-a716-446655440000', // v3 instead of v4
    invalidChars: '550e8400-e29b-41d4-g716-446655440000', // 'g' is invalid
    emptyString: '',
    withSpaces: '550e8400-e29b-41d4-a716- 446655440000',
    sqlInjection: "550e8400-e29b-41d4-a716-446655440000'; DROP TABLE venues;--",
    pathTraversal: '../../../etc/passwd',
    nullByte: '550e8400-e29b-41d4-a716-4466554400\x00',
  };

  describe('venueIdParamsSchema', () => {
    it('should validate correct UUID v4', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: VALID_UUID });
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({ venueId: VALID_UUID });
    });

    it('should validate lowercase UUID', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: VALID_UUID_LOWERCASE });
      expect(result.error).toBeUndefined();
    });

    it('should validate uppercase UUID', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: VALID_UUID_UPPERCASE });
      expect(result.error).toBeUndefined();
    });

    it('should validate mixed case UUID', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: VALID_UUID_MIXED_CASE });
      expect(result.error).toBeUndefined();
    });

    describe('invalid UUIDs', () => {
      it('should reject UUID that is too short', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.tooShort });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('venueId must be a valid UUID');
      });

      it('should reject UUID that is too long', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.tooLong });
        expect(result.error).toBeDefined();
      });

      it('should reject UUID with wrong format (no dashes)', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.wrongFormat });
        expect(result.error).toBeDefined();
      });

      it('should reject non-v4 UUID (wrong version number)', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.wrongVersion });
        expect(result.error).toBeDefined();
      });

      it('should reject UUID with invalid characters', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.invalidChars });
        expect(result.error).toBeDefined();
      });

      it('should reject empty string', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.emptyString });
        expect(result.error).toBeDefined();
      });

      it('should reject UUID with spaces', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.withSpaces });
        expect(result.error).toBeDefined();
      });
    });

    describe('security tests (RD3)', () => {
      it('should reject SQL injection attempt in UUID', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.sqlInjection });
        expect(result.error).toBeDefined();
      });

      it('should reject path traversal attempt', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.pathTraversal });
        expect(result.error).toBeDefined();
      });

      it('should reject null byte injection', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: INVALID_UUIDS.nullByte });
        expect(result.error).toBeDefined();
      });
    });

    describe('required field', () => {
      it('should reject missing venueId', () => {
        const result = venueIdParamsSchema.params.validate({});
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('venueId is required');
      });

      it('should reject null venueId', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: null });
        expect(result.error).toBeDefined();
      });

      it('should reject undefined venueId', () => {
        const result = venueIdParamsSchema.params.validate({ venueId: undefined });
        expect(result.error).toBeDefined();
      });
    });

    describe('unknown properties (RD6)', () => {
      it('should reject unknown properties', () => {
        const result = venueIdParamsSchema.params.validate({
          venueId: VALID_UUID,
          maliciousField: 'attack',
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('not allowed');
      });
    });
  });

  describe('integrationIdParamsSchema', () => {
    it('should validate both venueId and integrationId', () => {
      const result = integrationIdParamsSchema.params.validate({
        venueId: VALID_UUID,
        integrationId: VALID_UUID_2,
      });
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({
        venueId: VALID_UUID,
        integrationId: VALID_UUID_2,
      });
    });

    it('should reject missing venueId', () => {
      const result = integrationIdParamsSchema.params.validate({
        integrationId: VALID_UUID_2,
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('venueId is required');
    });

    it('should reject missing integrationId', () => {
      const result = integrationIdParamsSchema.params.validate({
        venueId: VALID_UUID,
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('integrationId is required');
    });

    it('should reject invalid venueId format', () => {
      const result = integrationIdParamsSchema.params.validate({
        venueId: 'not-a-uuid',
        integrationId: VALID_UUID_2,
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('venueId must be a valid UUID');
    });

    it('should reject invalid integrationId format', () => {
      const result = integrationIdParamsSchema.params.validate({
        venueId: VALID_UUID,
        integrationId: 'not-a-uuid',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('integrationId must be a valid UUID');
    });

    describe('unknown properties (RD6)', () => {
      it('should reject unknown properties', () => {
        const result = integrationIdParamsSchema.params.validate({
          venueId: VALID_UUID,
          integrationId: VALID_UUID_2,
          extraField: 'malicious',
        });
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('not allowed');
      });
    });
  });

  describe('contentIdParamsSchema', () => {
    it('should validate both venueId and contentId', () => {
      const result = contentIdParamsSchema.params.validate({
        venueId: VALID_UUID,
        contentId: VALID_UUID_2,
      });
      expect(result.error).toBeUndefined();
    });

    it('should reject missing venueId', () => {
      const result = contentIdParamsSchema.params.validate({
        contentId: VALID_UUID_2,
      });
      expect(result.error).toBeDefined();
    });

    it('should reject missing contentId', () => {
      const result = contentIdParamsSchema.params.validate({
        venueId: VALID_UUID,
      });
      expect(result.error).toBeDefined();
    });

    it('should reject invalid contentId', () => {
      const result = contentIdParamsSchema.params.validate({
        venueId: VALID_UUID,
        contentId: 'invalid',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('contentId must be a valid UUID');
    });
  });

  describe('reviewIdParamsSchema', () => {
    it('should validate both venueId and reviewId', () => {
      const result = reviewIdParamsSchema.params.validate({
        venueId: VALID_UUID,
        reviewId: VALID_UUID_2,
      });
      expect(result.error).toBeUndefined();
    });

    it('should reject missing venueId', () => {
      const result = reviewIdParamsSchema.params.validate({
        reviewId: VALID_UUID_2,
      });
      expect(result.error).toBeDefined();
    });

    it('should reject missing reviewId', () => {
      const result = reviewIdParamsSchema.params.validate({
        venueId: VALID_UUID,
      });
      expect(result.error).toBeDefined();
    });

    it('should reject invalid reviewId', () => {
      const result = reviewIdParamsSchema.params.validate({
        venueId: VALID_UUID,
        reviewId: 'invalid',
      });
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('reviewId must be a valid UUID');
    });
  });

  describe('createUuidParamSchema()', () => {
    it('should create schema for custom param name', () => {
      const schema = createUuidParamSchema('customId');
      const result = schema.params.validate({ customId: VALID_UUID });
      
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({ customId: VALID_UUID });
    });

    it('should use param name in error message', () => {
      const schema = createUuidParamSchema('myCustomId');
      const result = schema.params.validate({ myCustomId: 'invalid' });
      
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('myCustomId must be a valid UUID');
    });

    it('should require the param', () => {
      const schema = createUuidParamSchema('requiredId');
      const result = schema.params.validate({});
      
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('requiredId is required');
    });

    it('should work with various param names', () => {
      const paramNames = ['eventId', 'ticketId', 'orderId', 'userId', 'staffId'];
      
      for (const paramName of paramNames) {
        const schema = createUuidParamSchema(paramName);
        const result = schema.params.validate({ [paramName]: VALID_UUID });
        expect(result.error).toBeUndefined();
      }
    });

    it('should reject invalid UUIDs for custom params', () => {
      const schema = createUuidParamSchema('testId');
      const result = schema.params.validate({ testId: 'not-a-uuid' });
      
      expect(result.error).toBeDefined();
    });
  });

  describe('createMultipleUuidParamsSchema()', () => {
    it('should create schema for multiple params', () => {
      const schema = createMultipleUuidParamsSchema(['venueId', 'eventId']);
      const result = schema.params.validate({
        venueId: VALID_UUID,
        eventId: VALID_UUID_2,
      });
      
      expect(result.error).toBeUndefined();
      expect(result.value).toEqual({
        venueId: VALID_UUID,
        eventId: VALID_UUID_2,
      });
    });

    it('should require all specified params', () => {
      const schema = createMultipleUuidParamsSchema(['param1', 'param2', 'param3']);
      const result = schema.params.validate({
        param1: VALID_UUID,
        param2: VALID_UUID_2,
        // param3 missing
      });
      
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('param3 is required');
    });

    it('should use param name in error messages', () => {
      const schema = createMultipleUuidParamsSchema(['first', 'second']);
      const result = schema.params.validate({
        first: 'invalid',
        second: VALID_UUID,
      });
      
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('first must be a valid UUID');
    });

    it('should handle single param', () => {
      const schema = createMultipleUuidParamsSchema(['onlyOne']);
      const result = schema.params.validate({ onlyOne: VALID_UUID });
      
      expect(result.error).toBeUndefined();
    });

    it('should handle many params', () => {
      const paramNames = ['a', 'b', 'c', 'd', 'e'];
      const schema = createMultipleUuidParamsSchema(paramNames);
      
      const values: Record<string, string> = {};
      for (const name of paramNames) {
        values[name] = VALID_UUID;
      }
      
      const result = schema.params.validate(values);
      expect(result.error).toBeUndefined();
    });

    it('should handle empty array', () => {
      const schema = createMultipleUuidParamsSchema([]);
      const result = schema.params.validate({});
      
      expect(result.error).toBeUndefined();
    });
  });

  describe('venueIdParamsSchemaTypebox', () => {
    it('should have correct type structure', () => {
      expect(venueIdParamsSchemaTypebox.type).toBe('object');
      expect(venueIdParamsSchemaTypebox.properties.venueId.type).toBe('string');
      expect(venueIdParamsSchemaTypebox.properties.venueId.format).toBe('uuid');
      expect(venueIdParamsSchemaTypebox.required).toContain('venueId');
    });

    it('should have additionalProperties false (RD6)', () => {
      expect(venueIdParamsSchemaTypebox.additionalProperties).toBe(false);
    });
  });

  describe('integrationIdParamsSchemaTypebox', () => {
    it('should have correct type structure', () => {
      expect(integrationIdParamsSchemaTypebox.type).toBe('object');
      expect(integrationIdParamsSchemaTypebox.properties.venueId.type).toBe('string');
      expect(integrationIdParamsSchemaTypebox.properties.venueId.format).toBe('uuid');
      expect(integrationIdParamsSchemaTypebox.properties.integrationId.type).toBe('string');
      expect(integrationIdParamsSchemaTypebox.properties.integrationId.format).toBe('uuid');
    });

    it('should require both venueId and integrationId', () => {
      expect(integrationIdParamsSchemaTypebox.required).toContain('venueId');
      expect(integrationIdParamsSchemaTypebox.required).toContain('integrationId');
    });

    it('should have additionalProperties false (RD6)', () => {
      expect(integrationIdParamsSchemaTypebox.additionalProperties).toBe(false);
    });
  });

  describe('UUID v4 format validation', () => {
    // Testing the specific UUID v4 regex pattern
    it('should require version 4 (4 in the third group)', () => {
      // Version 1 UUID (time-based)
      const v1Uuid = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
      const result = venueIdParamsSchema.params.validate({ venueId: v1Uuid });
      expect(result.error).toBeDefined();
    });

    it('should require variant bits [89ab] in fourth group', () => {
      // Valid: 89ab variants
      const valid89 = '550e8400-e29b-41d4-8716-446655440000';
      const validA = '550e8400-e29b-41d4-a716-446655440000';
      const validB = '550e8400-e29b-41d4-b716-446655440000';
      
      expect(venueIdParamsSchema.params.validate({ venueId: valid89 }).error).toBeUndefined();
      expect(venueIdParamsSchema.params.validate({ venueId: validA }).error).toBeUndefined();
      expect(venueIdParamsSchema.params.validate({ venueId: validB }).error).toBeUndefined();
      
      // Invalid: 0-7 or c-f variants
      const invalidVariant = '550e8400-e29b-41d4-0716-446655440000';
      expect(venueIdParamsSchema.params.validate({ venueId: invalidVariant }).error).toBeDefined();
    });

    it('should handle edge case UUIDs', () => {
      // All zeros (invalid - not v4)
      const allZeros = '00000000-0000-0000-0000-000000000000';
      expect(venueIdParamsSchema.params.validate({ venueId: allZeros }).error).toBeDefined();
      
      // All f's valid v4 format
      const allFs = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
      expect(venueIdParamsSchema.params.validate({ venueId: allFs }).error).toBeUndefined();
    });
  });

  describe('Type coercion behavior', () => {
    it('should not coerce numbers to strings', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: 12345 });
      expect(result.error).toBeDefined();
    });

    it('should not coerce objects to strings', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: { toString: () => VALID_UUID } });
      expect(result.error).toBeDefined();
    });

    it('should not coerce arrays to strings', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: [VALID_UUID] });
      expect(result.error).toBeDefined();
    });

    it('should not coerce boolean to string', () => {
      const result = venueIdParamsSchema.params.validate({ venueId: true });
      expect(result.error).toBeDefined();
    });
  });
});
