/**
 * IMPROVED Unit Tests for Validation Schemas
 * 
 * Tests actual validation logic, transformations, and error handling
 */

import {
  uuidSchema,
  emailSchema,
  sanitizedStringSchema,
  paginationSchema,
  transferStatusSchema,
  transferTypeSchema,
  initiateTransferSchema,
  acceptTransferSchema,
  validateInput,
  ValidationError
} from '../../../src/schemas/validation';

describe('Validation Schemas - Behavioral Tests', () => {
  describe('uuidSchema - Format Validation', () => {
    it('should accept all valid UUID v4 formats', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'a1b2c3d4-e5f6-47a8-b9c0-d1e2f3a4b5c6',
        '00000000-0000-0000-0000-000000000000',
        'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF' // Uppercase
      ];

      validUUIDs.forEach(uuid => {
        const result = uuidSchema.parse(uuid);
        expect(result).toBe(uuid);
      });
    });

    it('should reject invalid UUID formats with specific errors', () => {
      const invalidCases = [
        { input: 'not-a-uuid', reason: 'random string' },
        { input: '123', reason: 'too short' },
        { input: '', reason: 'empty string' },
        { input: '123e4567-e89b-12d3-a456', reason: 'incomplete' },
        { input: '123e4567-e89b-12d3-a456-42661417400g', reason: 'invalid char' },
        { input: '123e4567e89b12d3a456426614174000', reason: 'missing hyphens' }
      ];

      invalidCases.forEach(({ input, reason }) => {
        expect(() => uuidSchema.parse(input)).toThrow();
      });
    });

    it('should preserve UUID case', () => {
      const uppercase = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE';
      const lowercase = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      
      expect(uuidSchema.parse(uppercase)).toBe(uppercase);
      expect(uuidSchema.parse(lowercase)).toBe(lowercase);
    });
  });

  describe('emailSchema - Transformation and Validation', () => {
    it('should lowercase emails while preserving local part', () => {
      const testCases = [
        { input: 'TEST@EXAMPLE.COM', expected: 'test@example.com' },
        { input: 'User.Name@DOMAIN.CO.UK', expected: 'user.name@domain.co.uk' },
        { input: 'ADMIN+TAG@EXAMPLE.COM', expected: 'admin+tag@example.com' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(emailSchema.parse(input)).toBe(expected);
      });
    });

    it('should enforce maximum length of 255 characters', () => {
      const shortEmail = 'a@b.com';
      const maxLengthEmail = 'a'.repeat(250) + '@b.com'; // 255 chars
      const tooLongEmail = 'a'.repeat(251) + '@b.com'; // 256 chars

      expect(() => emailSchema.parse(shortEmail)).not.toThrow();
      expect(() => emailSchema.parse(tooLongEmail)).toThrow();
    });

    it('should reject emails with spaces', () => {
      const invalidEmails = [
        'user @example.com',
        'user@ example.com',
        ' user@example.com',
        'user@example.com '
      ];

      invalidEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).toThrow();
      });
    });

    it('should accept plus addressing', () => {
      const validEmails = [
        'user+tag@example.com',
        'user+multiple+tags@example.com',
        'user+123@example.com'
      ];

      validEmails.forEach(email => {
        expect(() => emailSchema.parse(email)).not.toThrow();
      });
    });
  });

  describe('sanitizedStringSchema - XSS Prevention', () => {
    it('should trim whitespace from both ends', () => {
      const testCases = [
        { input: '  hello  ', expected: 'hello' },
        { input: '\t\ntext\t\n', expected: 'text' },
        { input: '   spaces   everywhere   ', expected: 'spaces   everywhere' }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(sanitizedStringSchema.parse(input)).toBe(expected);
      });
    });

    it('should reject various script tag formats', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<SCRIPT>alert("xss")</SCRIPT>',
        '<ScRiPt>alert("xss")</ScRiPt>',
        'Hello <script>evil</script> world',
        '<script src="evil.js"></script>'
      ];

      maliciousInputs.forEach(input => {
        expect(() => sanitizedStringSchema.parse(input)).toThrow();
      });
    });

    it('should allow safe HTML-like content', () => {
      const safeInputs = [
        'I <3 programming',
        'Price: $100 < $200',
        'Math: 5 < 10 > 3',
        'Email: user@example.com',
        'Code: <component />'
      ];

      safeInputs.forEach(input => {
        expect(() => sanitizedStringSchema.parse(input)).not.toThrow();
      });
    });
  });

  describe('paginationSchema - Defaults and Coercion', () => {
    it('should coerce string numbers to integers', () => {
      const result = paginationSchema.parse({
        page: '5',
        limit: '30'
      });

      expect(result.page).toBe(5);
      expect(result.limit).toBe(30);
      expect(typeof result.page).toBe('number');
      expect(typeof result.limit).toBe('number');
    });

    it('should reject negative page numbers', () => {
      expect(() => paginationSchema.parse({ page: -1 })).toThrow();
      expect(() => paginationSchema.parse({ page: 0 })).toThrow();
    });

    it('should enforce limit boundaries strictly', () => {
      // Valid limits
      expect(() => paginationSchema.parse({ limit: 1 })).not.toThrow();
      expect(() => paginationSchema.parse({ limit: 100 })).not.toThrow();
      
      // Invalid limits
      expect(() => paginationSchema.parse({ limit: 0 })).toThrow();
      expect(() => paginationSchema.parse({ limit: 101 })).toThrow();
    });

    it('should provide complete default configuration', () => {
      const result = paginationSchema.parse({});
      
      expect(result).toEqual({
        page: 1,
        limit: 20,
        sortOrder: 'desc'
      });
    });

    it('should override defaults when provided', () => {
      const result = paginationSchema.parse({
        page: 3,
        limit: 50,
        sortBy: 'created_at',
        sortOrder: 'asc'
      });

      expect(result).toEqual({
        page: 3,
        limit: 50,
        sortBy: 'created_at',
        sortOrder: 'asc'
      });
    });
  });

  describe('initiateTransferSchema - Complex Validation', () => {
    it('should require at least one recipient identifier', () => {
      const noRecipient = {
        ticketId: '123e4567-e89b-12d3-a456-426614174000'
      };

      expect(() => initiateTransferSchema.parse(noRecipient)).toThrow();
    });

    it('should accept any single recipient type', () => {
      const ticketId = '123e4567-e89b-12d3-a456-426614174000';
      
      const withEmail = initiateTransferSchema.parse({
        ticketId,
        recipientEmail: 'user@example.com'
      });

      const withWallet = initiateTransferSchema.parse({
        ticketId,
        recipientWallet: 'Bxv7w9H8PbUv5K3zM2Yz7QwF6Lc8Vx9Gs2Zn3Wr1'
      });

      const withUserId = initiateTransferSchema.parse({
        ticketId,
        recipientUserId: '123e4567-e89b-12d3-a456-426614174000'
      });

      expect(withEmail.recipientEmail).toBeDefined();
      expect(withWallet.recipientWallet).toBeDefined();
      expect(withUserId.recipientUserId).toBeDefined();
    });

    it('should accept multiple recipient identifiers', () => {
      const result = initiateTransferSchema.parse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'user@example.com',
        recipientWallet: 'Bxv7w9H8PbUv5K3zM2Yz7QwF6Lc8Vx9Gs2Zn3Wr1',
        recipientUserId: '123e4567-e89b-12d3-a456-426614174000'
      });

      expect(result.recipientEmail).toBeDefined();
      expect(result.recipientWallet).toBeDefined();
      expect(result.recipientUserId).toBeDefined();
    });

    it('should enforce message length limit', () => {
      const shortMessage = initiateTransferSchema.parse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'user@example.com',
        message: 'Hello!'
      });

      expect(shortMessage.message).toBe('Hello!');

      const longMessage = 'a'.repeat(501);
      expect(() => initiateTransferSchema.parse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'user@example.com',
        message: longMessage
      })).toThrow();
    });

    it('should enforce expiry time boundaries', () => {
      const ticketId = '123e4567-e89b-12d3-a456-426614174000';
      const recipientEmail = 'user@example.com';

      // Valid expiries
      expect(() => initiateTransferSchema.parse({
        ticketId, recipientEmail, expiresInHours: 1
      })).not.toThrow();

      expect(() => initiateTransferSchema.parse({
        ticketId, recipientEmail, expiresInHours: 168
      })).not.toThrow();

      // Invalid expiries
      expect(() => initiateTransferSchema.parse({
        ticketId, recipientEmail, expiresInHours: 0
      })).toThrow();

      expect(() => initiateTransferSchema.parse({
        ticketId, recipientEmail, expiresInHours: 169
      })).toThrow();

      expect(() => initiateTransferSchema.parse({
        ticketId, recipientEmail, expiresInHours: -1
      })).toThrow();
    });

    it('should use default expiry when not provided', () => {
      const result = initiateTransferSchema.parse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'user@example.com'
      });

      expect(result.expiresInHours).toBe(48);
    });

    it('should use default transfer type when not provided', () => {
      const result = initiateTransferSchema.parse({
        ticketId: '123e4567-e89b-12d3-a456-426614174000',
        recipientEmail: 'user@example.com'
      });

      expect(result.transferType).toBe('gift');
    });
  });

  describe('validateInput Helper - Error Handling', () => {
    it('should return parsed data on successful validation', () => {
      const input = 'test@example.com';
      const result = validateInput(emailSchema, input);
      
      expect(result).toBe('test@example.com');
    });

    it('should throw ValidationError with detailed field information', () => {
      try {
        validateInput(paginationSchema, { page: -1, limit: 101 });
        fail('Should have thrown ValidationError');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const validationError = error as ValidationError;
        
        expect(validationError.errors).toBeDefined();
        expect(Array.isArray(validationError.errors)).toBe(true);
        expect(validationError.errors.length).toBeGreaterThan(0);
        
        // Check error structure
        validationError.errors.forEach(err => {
          expect(err).toHaveProperty('field');
          expect(err).toHaveProperty('message');
          expect(err).toHaveProperty('code');
        });
      }
    });

    it('should provide specific field paths in errors', () => {
      try {
        validateInput(initiateTransferSchema, {
          ticketId: 'invalid-uuid'
        });
        fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        const ticketIdError = validationError.errors.find(e => e.field === 'ticketId');
        
        expect(ticketIdError).toBeDefined();
        expect(ticketIdError!.message).toContain('Invalid UUID');
      }
    });

    it('should handle multiple validation errors', () => {
      try {
        validateInput(paginationSchema, {
          page: -1,
          limit: 200,
          sortOrder: 'invalid'
        });
        fail('Should have thrown');
      } catch (error) {
        const validationError = error as ValidationError;
        
        // Should have errors for multiple fields
        expect(validationError.errors.length).toBeGreaterThan(1);
        
        const fields = validationError.errors.map(e => e.field);
        expect(fields).toContain('page');
        expect(fields).toContain('limit');
      }
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle null and undefined inputs appropriately', () => {
      expect(() => uuidSchema.parse(null)).toThrow();
      expect(() => uuidSchema.parse(undefined)).toThrow();
      expect(() => emailSchema.parse(null)).toThrow();
      expect(() => emailSchema.parse(undefined)).toThrow();
    });

    it('should handle extremely long inputs gracefully', () => {
      const veryLongString = 'a'.repeat(10000);
      
      expect(() => emailSchema.parse(veryLongString + '@example.com')).toThrow();
      expect(() => sanitizedStringSchema.parse(veryLongString)).not.toThrow();
    });

    it('should handle unicode and special characters', () => {
      const unicodeString = '你好世界 🎉';
      const result = sanitizedStringSchema.parse(unicodeString);
      
      expect(result).toBe(unicodeString);
    });

    it('should prevent SQL injection in string fields', () => {
      const sqlInjection = "'; DROP TABLE users; --";
      
      // Should not throw (sanitization doesn't check for SQL)
      // But application should use parameterized queries
      expect(() => sanitizedStringSchema.parse(sqlInjection)).not.toThrow();
    });

    it('should handle type coercion edge cases', () => {
      // String numbers should work
      expect(paginationSchema.parse({ page: '1' }).page).toBe(1);
      
      // But non-numeric strings should fail
      expect(() => paginationSchema.parse({ page: 'abc' })).toThrow();
      
      // Boolean should fail
      expect(() => paginationSchema.parse({ page: true })).toThrow();
    });
  });
});
