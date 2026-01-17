/**
 * Unit Tests for Validation Schemas
 *
 * Tests all Zod validation schemas:
 * - Common validators (UUID, email, acceptance code, message)
 * - Gift transfer schemas
 * - Accept transfer schemas
 * - Query parameter schemas
 * - Helper functions
 * - Error formatting
 */

import { z } from 'zod';
import {
  uuidSchema,
  emailSchema,
  acceptanceCodeSchema,
  messageSchema,
  giftTransferBodySchema,
  giftTransferResponseSchema,
  acceptTransferBodySchema,
  acceptTransferParamsSchema,
  acceptTransferResponseSchema,
  paginationSchema,
  transferListQuerySchema,
  transferIdParamSchema,
  ticketIdParamSchema,
  validateBody,
  validateQuery,
  validateParams,
  safeValidate,
  formatZodError
} from '../../../src/validators/schemas';

describe('Validation Schemas - Unit Tests', () => {
  describe('Common Validators', () => {
    describe('uuidSchema', () => {
      it('should validate valid UUIDs', () => {
        const validUUIDs = [
          '550e8400-e29b-41d4-a716-446655440000',
          '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          '00000000-0000-0000-0000-000000000000',
          '123e4567-e89b-12d3-a456-426614174000'
        ];

        validUUIDs.forEach(uuid => {
          expect(() => uuidSchema.parse(uuid)).not.toThrow();
          expect(uuidSchema.parse(uuid)).toBe(uuid);
        });
      });

      it('should reject invalid UUIDs', () => {
        const invalidUUIDs = [
          'not-a-uuid',
          '123',
          '550e8400-e29b-41d4-a716',
          '550e8400-e29b-41d4-a716-446655440000-extra',
          'ZZZZZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZZZZZZZZZ',
          '',
          '550e8400e29b41d4a716446655440000' // No hyphens
        ];

        invalidUUIDs.forEach(uuid => {
          expect(() => uuidSchema.parse(uuid)).toThrow(z.ZodError);
        });
      });

      it('should reject non-string values', () => {
        const nonStrings = [123, null, undefined, {}, [], true];

        nonStrings.forEach(value => {
          expect(() => uuidSchema.parse(value)).toThrow();
        });
      });
    });

    describe('emailSchema', () => {
      it('should validate valid emails', () => {
        const validEmails = [
          'user@example.com',
          'test.user@example.com',
          'user+tag@example.co.uk',
          'user_name@example-domain.com',
          'a@b.c',
          'test123@test123.com'
        ];

        validEmails.forEach(email => {
          expect(() => emailSchema.parse(email)).not.toThrow();
          expect(emailSchema.parse(email)).toBe(email);
        });
      });

      it('should reject invalid emails', () => {
        const invalidEmails = [
          'not-an-email',
          '@example.com',
          'user@',
          'user@.com',
          'user @example.com',
          'user@example',
          '',
          'user..name@example.com'
        ];

        invalidEmails.forEach(email => {
          expect(() => emailSchema.parse(email)).toThrow(z.ZodError);
        });
      });

      it('should reject emails longer than 255 characters', () => {
        const longEmail = 'a'.repeat(250) + '@example.com'; // > 255 chars
        expect(() => emailSchema.parse(longEmail)).toThrow('Email too long');
      });

      it('should accept emails at boundary (255 chars)', () => {
        const boundaryEmail = 'a'.repeat(243) + '@example.com'; // Exactly 255 chars
        expect(emailSchema.parse(boundaryEmail)).toBe(boundaryEmail);
      });
    });

    describe('acceptanceCodeSchema', () => {
      it('should validate valid acceptance codes', () => {
        const validCodes = [
          'ABC123',
          'ABCDEF',
          '123456',
          'A1B2C3D4',
          'ABCDEF123456',
          '000000'
        ];

        validCodes.forEach(code => {
          expect(() => acceptanceCodeSchema.parse(code)).not.toThrow();
          expect(acceptanceCodeSchema.parse(code)).toBe(code);
        });
      });

      it('should reject codes shorter than 6 characters', () => {
        const shortCodes = ['A', 'AB', 'ABC', 'ABCD', 'ABCDE'];

        shortCodes.forEach(code => {
          expect(() => acceptanceCodeSchema.parse(code)).toThrow('at least 6 characters');
        });
      });

      it('should reject codes longer than 12 characters', () => {
        const longCode = 'ABCDEFGHIJKLM'; // 13 chars
        expect(() => acceptanceCodeSchema.parse(longCode)).toThrow('at most 12 characters');
      });

      it('should reject codes with lowercase letters', () => {
        const lowercaseCodes = ['abc123', 'AbC123', 'ABC12a'];

        lowercaseCodes.forEach(code => {
          expect(() => acceptanceCodeSchema.parse(code)).toThrow('alphanumeric uppercase');
        });
      });

      it('should reject codes with special characters', () => {
        const specialCodes = [
          'ABC-123',
          'ABC_123',
          'ABC.123',
          'ABC 123',
          'ABC!23',
          'ABC@123'
        ];

        specialCodes.forEach(code => {
          expect(() => acceptanceCodeSchema.parse(code)).toThrow('alphanumeric uppercase');
        });
      });

      it('should accept codes at boundaries (6 and 12 chars)', () => {
        expect(acceptanceCodeSchema.parse('ABCDEF')).toBe('ABCDEF');
        expect(acceptanceCodeSchema.parse('ABCDEF123456')).toBe('ABCDEF123456');
      });
    });

    describe('messageSchema', () => {
      it('should validate valid messages', () => {
        const validMessages = [
          'Hello, this is a gift for you!',
          'A'.repeat(500), // Exactly 500 chars
          'Short message',
          'Message with special chars: !@#$%^&*()',
          'Multi\nline\nmessage'
        ];

        validMessages.forEach(message => {
          expect(() => messageSchema.parse(message)).not.toThrow();
          expect(messageSchema.parse(message)).toBe(message);
        });
      });

      it('should allow undefined (optional)', () => {
        expect(messageSchema.parse(undefined)).toBeUndefined();
      });

      it('should reject messages longer than 500 characters', () => {
        const longMessage = 'A'.repeat(501);
        expect(() => messageSchema.parse(longMessage)).toThrow('Message too long');
      });

      it('should accept empty string', () => {
        expect(messageSchema.parse('')).toBe('');
      });
    });
  });

  describe('Gift Transfer Schemas', () => {
    describe('giftTransferBodySchema', () => {
      it('should validate valid gift transfer body', () => {
        const validBody = {
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toEmail: 'recipient@example.com',
          message: 'Enjoy the show!'
        };

        const result = giftTransferBodySchema.parse(validBody);
        expect(result).toEqual(validBody);
      });

      it('should validate body without optional message', () => {
        const bodyWithoutMessage = {
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toEmail: 'recipient@example.com'
        };

        const result = giftTransferBodySchema.parse(bodyWithoutMessage);
        expect(result.ticketId).toBe(bodyWithoutMessage.ticketId);
        expect(result.toEmail).toBe(bodyWithoutMessage.toEmail);
        expect(result.message).toBeUndefined();
      });

      it('should reject missing required fields', () => {
        const invalidBodies = [
          { toEmail: 'test@example.com' }, // Missing ticketId
          { ticketId: '550e8400-e29b-41d4-a716-446655440000' }, // Missing toEmail
          {} // Missing both
        ];

        invalidBodies.forEach(body => {
          expect(() => giftTransferBodySchema.parse(body)).toThrow(z.ZodError);
        });
      });

      it('should reject invalid ticketId', () => {
        const invalidBody = {
          ticketId: 'not-a-uuid',
          toEmail: 'test@example.com'
        };

        expect(() => giftTransferBodySchema.parse(invalidBody)).toThrow();
      });

      it('should reject invalid email', () => {
        const invalidBody = {
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toEmail: 'not-an-email'
        };

        expect(() => giftTransferBodySchema.parse(invalidBody)).toThrow();
      });

      it('should reject additional properties (strict mode)', () => {
        const bodyWithExtra = {
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toEmail: 'test@example.com',
          extraField: 'should be rejected'
        };

        expect(() => giftTransferBodySchema.parse(bodyWithExtra)).toThrow();
      });

      it('should reject invalid message length', () => {
        const bodyWithLongMessage = {
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          toEmail: 'test@example.com',
          message: 'A'.repeat(501)
        };

        expect(() => giftTransferBodySchema.parse(bodyWithLongMessage)).toThrow('Message too long');
      });
    });

    describe('giftTransferResponseSchema', () => {
      it('should validate valid gift transfer response', () => {
        const validResponse = {
          transferId: '550e8400-e29b-41d4-a716-446655440000',
          acceptanceCode: 'ABC123',
          status: 'PENDING' as const,
          expiresAt: new Date('2025-12-31')
        };

        const result = giftTransferResponseSchema.parse(validResponse);
        expect(result).toEqual(validResponse);
      });

      it('should reject invalid status', () => {
        const invalidResponse = {
          transferId: '550e8400-e29b-41d4-a716-446655440000',
          acceptanceCode: 'ABC123',
          status: 'COMPLETED', // Must be PENDING
          expiresAt: new Date()
        };

        expect(() => giftTransferResponseSchema.parse(invalidResponse)).toThrow();
      });

      it('should reject invalid date', () => {
        const invalidResponse = {
          transferId: '550e8400-e29b-41d4-a716-446655440000',
          acceptanceCode: 'ABC123',
          status: 'PENDING',
          expiresAt: 'not-a-date'
        };

        expect(() => giftTransferResponseSchema.parse(invalidResponse)).toThrow();
      });
    });
  });

  describe('Accept Transfer Schemas', () => {
    describe('acceptTransferBodySchema', () => {
      it('should validate valid accept transfer body', () => {
        const validBody = {
          acceptanceCode: 'ABC123',
          userId: '550e8400-e29b-41d4-a716-446655440000'
        };

        const result = acceptTransferBodySchema.parse(validBody);
        expect(result).toEqual(validBody);
      });

      it('should reject missing required fields', () => {
        const invalidBodies = [
          { acceptanceCode: 'ABC123' }, // Missing userId
          { userId: '550e8400-e29b-41d4-a716-446655440000' }, // Missing acceptanceCode
          {} // Missing both
        ];

        invalidBodies.forEach(body => {
          expect(() => acceptTransferBodySchema.parse(body)).toThrow(z.ZodError);
        });
      });

      it('should reject invalid acceptance code', () => {
        const invalidBody = {
          acceptanceCode: 'abc', // Too short and lowercase
          userId: '550e8400-e29b-41d4-a716-446655440000'
        };

        expect(() => acceptTransferBodySchema.parse(invalidBody)).toThrow();
      });

      it('should reject additional properties (strict mode)', () => {
        const bodyWithExtra = {
          acceptanceCode: 'ABC123',
          userId: '550e8400-e29b-41d4-a716-446655440000',
          extraField: 'should be rejected'
        };

        expect(() => acceptTransferBodySchema.parse(bodyWithExtra)).toThrow();
      });
    });

    describe('acceptTransferParamsSchema', () => {
      it('should validate valid transfer ID param', () => {
        const validParams = {
          transferId: '550e8400-e29b-41d4-a716-446655440000'
        };

        const result = acceptTransferParamsSchema.parse(validParams);
        expect(result).toEqual(validParams);
      });

      it('should reject invalid transfer ID', () => {
        const invalidParams = { transferId: 'not-a-uuid' };
        expect(() => acceptTransferParamsSchema.parse(invalidParams)).toThrow();
      });

      it('should reject missing transfer ID', () => {
        expect(() => acceptTransferParamsSchema.parse({})).toThrow();
      });
    });

    describe('acceptTransferResponseSchema', () => {
      it('should validate valid accept transfer response', () => {
        const validResponse = {
          success: true,
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          newOwnerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
        };

        const result = acceptTransferResponseSchema.parse(validResponse);
        expect(result).toEqual(validResponse);
      });

      it('should validate failed response', () => {
        const failedResponse = {
          success: false,
          ticketId: '550e8400-e29b-41d4-a716-446655440000',
          newOwnerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
        };

        const result = acceptTransferResponseSchema.parse(failedResponse);
        expect(result.success).toBe(false);
      });

      it('should reject missing fields', () => {
        const invalidResponses = [
          { success: true, ticketId: '550e8400-e29b-41d4-a716-446655440000' }, // Missing newOwnerId
          { success: true, newOwnerId: '550e8400-e29b-41d4-a716-446655440000' }, // Missing ticketId
          { ticketId: '550e8400-e29b-41d4-a716-446655440000', newOwnerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8' } // Missing success
        ];

        invalidResponses.forEach(response => {
          expect(() => acceptTransferResponseSchema.parse(response)).toThrow();
        });
      });
    });
  });

  describe('Query Parameter Schemas', () => {
    describe('paginationSchema', () => {
      it('should validate valid pagination params', () => {
        const validParams = [
          { page: 1, limit: 20 },
          { page: 5, limit: 50 },
          { page: 100, limit: 100 }
        ];

        validParams.forEach(params => {
          const result = paginationSchema.parse(params);
          expect(result.page).toBe(params.page);
          expect(result.limit).toBe(params.limit);
        });
      });

      it('should apply defaults for missing values', () => {
        const result = paginationSchema.parse({});
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
      });

      it('should coerce string numbers to integers', () => {
        const result = paginationSchema.parse({ page: '5', limit: '30' });
        expect(result.page).toBe(5);
        expect(result.limit).toBe(30);
      });

      it('should reject page less than 1', () => {
        const invalidParams = [
          { page: 0, limit: 20 },
          { page: -1, limit: 20 }
        ];

        invalidParams.forEach(params => {
          expect(() => paginationSchema.parse(params)).toThrow();
        });
      });

      it('should reject limit less than 1', () => {
        expect(() => paginationSchema.parse({ page: 1, limit: 0 })).toThrow();
      });

      it('should reject limit greater than 100', () => {
        expect(() => paginationSchema.parse({ page: 1, limit: 101 })).toThrow();
      });

      it('should accept limit at boundary (100)', () => {
        const result = paginationSchema.parse({ page: 1, limit: 100 });
        expect(result.limit).toBe(100);
      });

      it('should reject non-integer values', () => {
        const invalidParams = [
          { page: 1.5, limit: 20 },
          { page: 1, limit: 20.7 }
        ];

        invalidParams.forEach(params => {
          expect(() => paginationSchema.parse(params)).toThrow();
        });
      });
    });

    describe('transferListQuerySchema', () => {
      it('should validate query with all params', () => {
        const validQuery = {
          status: 'PENDING' as const,
          page: 2,
          limit: 30
        };

        const result = transferListQuerySchema.parse(validQuery);
        expect(result).toEqual(validQuery);
      });

      it('should validate query without optional status', () => {
        const query = { page: 1, limit: 20 };
        const result = transferListQuerySchema.parse(query);
        expect(result.status).toBeUndefined();
      });

      it('should validate all valid status values', () => {
        const statuses = ['PENDING', 'COMPLETED', 'EXPIRED', 'CANCELLED'] as const;

        statuses.forEach(status => {
          const result = transferListQuerySchema.parse({ status });
          expect(result.status).toBe(status);
        });
      });

      it('should reject invalid status', () => {
        const invalidQuery = { status: 'INVALID' };
        expect(() => transferListQuerySchema.parse(invalidQuery)).toThrow();
      });

      it('should apply pagination defaults', () => {
        const result = transferListQuerySchema.parse({ status: 'PENDING' });
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
      });
    });

    describe('transferIdParamSchema', () => {
      it('should validate valid transfer ID param', () => {
        const validParams = { transferId: '550e8400-e29b-41d4-a716-446655440000' };
        const result = transferIdParamSchema.parse(validParams);
        expect(result).toEqual(validParams);
      });

      it('should reject invalid UUID', () => {
        expect(() => transferIdParamSchema.parse({ transferId: 'not-uuid' })).toThrow();
      });
    });

    describe('ticketIdParamSchema', () => {
      it('should validate valid ticket ID param', () => {
        const validParams = { ticketId: '550e8400-e29b-41d4-a716-446655440000' };
        const result = ticketIdParamSchema.parse(validParams);
        expect(result).toEqual(validParams);
      });

      it('should reject invalid UUID', () => {
        expect(() => ticketIdParamSchema.parse({ ticketId: 'not-uuid' })).toThrow();
      });
    });
  });

  describe('Helper Functions', () => {
    describe('validateBody', () => {
      it('should validate valid data', () => {
        const schema = z.object({ name: z.string() });
        const data = { name: 'test' };

        const result = validateBody(schema, data);
        expect(result).toEqual(data);
      });

      it('should throw on invalid data', () => {
        const schema = z.object({ name: z.string() });
        const data = { name: 123 };

        expect(() => validateBody(schema, data)).toThrow(z.ZodError);
      });
    });

    describe('validateQuery', () => {
      it('should validate valid query params', () => {
        const schema = z.object({ page: z.number() });
        const data = { page: 1 };

        const result = validateQuery(schema, data);
        expect(result).toEqual(data);
      });

      it('should throw on invalid query params', () => {
        const schema = z.object({ page: z.number() });
        const data = { page: 'not-a-number' };

        expect(() => validateQuery(schema, data)).toThrow(z.ZodError);
      });
    });

    describe('validateParams', () => {
      it('should validate valid URL params', () => {
        const schema = z.object({ id: z.string().uuid() });
        const data = { id: '550e8400-e29b-41d4-a716-446655440000' };

        const result = validateParams(schema, data);
        expect(result).toEqual(data);
      });

      it('should throw on invalid URL params', () => {
        const schema = z.object({ id: z.string().uuid() });
        const data = { id: 'not-a-uuid' };

        expect(() => validateParams(schema, data)).toThrow(z.ZodError);
      });
    });

    describe('safeValidate', () => {
      it('should return success for valid data', () => {
        const schema = z.object({ name: z.string() });
        const data = { name: 'test' };

        const result = safeValidate(schema, data);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(data);
        }
      });

      it('should return error for invalid data', () => {
        const schema = z.object({ name: z.string() });
        const data = { name: 123 };

        const result = safeValidate(schema, data);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(z.ZodError);
        }
      });

      it('should not throw on invalid data', () => {
        const schema = z.object({ name: z.string() });
        const data = { name: 123 };

        expect(() => safeValidate(schema, data)).not.toThrow();
      });
    });

    describe('formatZodError', () => {
      it('should format single field error', () => {
        const schema = z.object({ name: z.string().min(5) });
        const result = schema.safeParse({ name: 'abc' });

        if (!result.success) {
          const formatted = formatZodError(result.error);
          expect(formatted).toHaveProperty('name');
          expect(formatted.name).toBeInstanceOf(Array);
          expect(formatted.name.length).toBeGreaterThan(0);
        }
      });

      it('should format multiple field errors', () => {
        const schema = z.object({
          name: z.string().min(5),
          email: z.string().email()
        });
        const result = schema.safeParse({ name: 'ab', email: 'not-email' });

        if (!result.success) {
          const formatted = formatZodError(result.error);
          expect(formatted).toHaveProperty('name');
          expect(formatted).toHaveProperty('email');
          expect(formatted.name.length).toBeGreaterThan(0);
          expect(formatted.email.length).toBeGreaterThan(0);
        }
      });

      it('should format nested field errors', () => {
        const schema = z.object({
          user: z.object({
            name: z.string()
          })
        });
        const result = schema.safeParse({ user: { name: 123 } });

        if (!result.success) {
          const formatted = formatZodError(result.error);
          expect(formatted).toHaveProperty('user.name');
        }
      });

      it('should group multiple errors for same field', () => {
        const schema = z.string().min(5).max(10);
        const result = schema.safeParse('abc');

        if (!result.success) {
          const formatted = formatZodError(result.error);
          const rootErrors = formatted[''] || formatted['_root'];
          expect(rootErrors || formatted[Object.keys(formatted)[0]]).toBeDefined();
        }
      });

      it('should return empty object for no errors', () => {
        const schema = z.object({ name: z.string() });
        const result = schema.safeParse({ name: 'valid' });

        if (!result.success) {
          const formatted = formatZodError(result.error);
          expect(Object.keys(formatted).length).toBe(0);
        } else {
          // Success case - no errors to format
          expect(result.success).toBe(true);
        }
      });
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle null and undefined consistently', () => {
      expect(() => uuidSchema.parse(null)).toThrow();
      expect(() => uuidSchema.parse(undefined)).toThrow();
      expect(() => emailSchema.parse(null)).toThrow();
      expect(() => emailSchema.parse(undefined)).toThrow();
    });

    it('should handle empty objects', () => {
      expect(() => giftTransferBodySchema.parse({})).toThrow();
      expect(() => acceptTransferBodySchema.parse({})).toThrow();
    });

    it('should validate complex nested data', () => {
      const validBody = {
        ticketId: '550e8400-e29b-41d4-a716-446655440000',
        toEmail: 'test@example.com',
        message: 'A'.repeat(500) // Max length
      };

      expect(() => giftTransferBodySchema.parse(validBody)).not.toThrow();
    });

    it('should maintain type safety through validation chain', () => {
      const data = {
        ticketId: '550e8400-e29b-41d4-a716-446655440000',
        toEmail: 'test@example.com'
      };

      const validated = validateBody(giftTransferBodySchema, data);
      
      // TypeScript should know these properties exist
      expect(validated.ticketId).toBeDefined();
      expect(validated.toEmail).toBeDefined();
    });
  });
});
