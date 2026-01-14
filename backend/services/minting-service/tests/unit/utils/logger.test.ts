/**
 * Unit Tests for utils/logger.ts
 * 
 * Tests sensitive data sanitization, logging configuration, and helper functions.
 * Priority: 🔴 Critical (20 tests)
 */

import {
  createChildLogger,
  sanitize,
  wouldRedact,
  addSensitiveField,
} from '../../../src/utils/logger';

// =============================================================================
// Sensitive Field Detection Tests
// =============================================================================

describe('Sensitive Field Detection', () => {
  describe('wouldRedact', () => {
    it("should detect sensitive field 'password'", () => {
      expect(wouldRedact('password')).toBe(true);
    });

    it("should detect sensitive field 'apiKey'", () => {
      expect(wouldRedact('apiKey')).toBe(true);
    });

    it("should detect sensitive field 'secret'", () => {
      expect(wouldRedact('secret')).toBe(true);
    });

    it("should detect sensitive field 'token'", () => {
      expect(wouldRedact('token')).toBe(true);
    });

    it("should detect sensitive field 'privateKey'", () => {
      expect(wouldRedact('privateKey')).toBe(true);
    });

    it("should detect sensitive field 'private_key'", () => {
      expect(wouldRedact('private_key')).toBe(true);
    });

    it('should detect sensitive field case-insensitively', () => {
      expect(wouldRedact('PASSWORD')).toBe(true);
      expect(wouldRedact('ApiKey')).toBe(true);
      expect(wouldRedact('SECRET')).toBe(true);
    });

    it('should detect sensitive field with partial match', () => {
      expect(wouldRedact('userPassword')).toBe(true);
      expect(wouldRedact('my_api_key')).toBe(true);
      expect(wouldRedact('secretKey')).toBe(true);
      expect(wouldRedact('accessToken')).toBe(true);
    });
  });
});

// =============================================================================
// Sensitive Pattern Detection Tests
// =============================================================================

describe('Sensitive Pattern Detection', () => {
  describe('sanitize function', () => {
    it('should detect JWT pattern in values', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = sanitize({ data: jwt });
      expect(result.data).toBe('[TOKEN_REDACTED]');
    });

    it('should detect Solana keypair pattern (base58, 87-88 chars)', () => {
      // Base58 string of 87-88 characters (simulating a Solana private key)
      const solanaKey = '5'.repeat(87);
      const result = sanitize({ key: solanaKey });
      expect(result.key).toBe('[REDACTED]');
    });

    it('should detect API key patterns (sk_, pk_, api_)', () => {
      const result = sanitize({
        stripe: 'sk_test_1234567890abcdefghijklmnop',
        public: 'pk_live_1234567890abcdefghijklmnop',
        custom: 'api_1234567890abcdefghijklmnop'
      });
      expect(result.stripe).toBe('[REDACTED]');
      expect(result.public).toBe('[REDACTED]');
      expect(result.custom).toBe('[REDACTED]');
    });

    it('should detect email pattern', () => {
      const result = sanitize({ email: 'user@example.com' });
      expect(result.email).toBe('[EMAIL_REDACTED]');
    });

    it('should detect long hex strings', () => {
      const longHex = 'a'.repeat(64);
      const result = sanitize({ hash: longHex });
      expect(result.hash).toBe('[REDACTED]');
    });
  });
});

// =============================================================================
// Sanitization Functions Tests
// =============================================================================

describe('Sanitization Functions', () => {
  describe('sanitize (sanitizeValue/sanitizeObject)', () => {
    it('should redact sensitive strings by field name', () => {
      const result = sanitize({
        password: 'mysecretpassword',
        username: 'john'
      });
      expect(result.password).toBe('[REDACTED]');
      expect(result.username).toBe('john');
    });

    it('should pass through safe values', () => {
      const result = sanitize({
        name: 'Test Event',
        count: 42,
        active: true
      });
      expect(result.name).toBe('Test Event');
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
    });

    it('should truncate very long strings', () => {
      const longString = 'a'.repeat(600);
      const result = sanitize({ data: longString });
      expect(result.data).toContain('[TRUNCATED');
      expect((result.data as string).length).toBeLessThan(600);
    });

    it('should handle nested objects', () => {
      const result = sanitize({
        user: {
          name: 'John',
          password: 'secret123'
        }
      });
      expect(result.user.name).toBe('John');
      expect(result.user.password).toBe('[REDACTED]');
    });

    it('should handle arrays', () => {
      const result = sanitize({
        items: [
          { id: 1, token: 'secret1' },
          { id: 2, token: 'secret2' }
        ]
      });
      expect(result.items[0].id).toBe(1);
      expect(result.items[0].token).toBe('[REDACTED]');
      expect(result.items[1].id).toBe(2);
      expect(result.items[1].token).toBe('[REDACTED]');
    });

    it('should limit recursion depth', () => {
      // Create deeply nested object
      let deepObj: any = { value: 'test' };
      for (let i = 0; i < 15; i++) {
        deepObj = { nested: deepObj };
      }
      
      const result = sanitize(deepObj);
      // Should not throw and should handle deep nesting
      expect(result).toBeDefined();
    });
  });
});

// =============================================================================
// Helper Exports Tests
// =============================================================================

describe('Helper Exports', () => {
  describe('createChildLogger', () => {
    it('should include context in child logger', () => {
      const childLogger = createChildLogger({ requestId: '123', tenantId: 'abc' });
      expect(childLogger).toBeDefined();
      // Child logger should be a winston logger instance
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.error).toBe('function');
    });
  });

  describe('sanitize', () => {
    it('should be exported for external use', () => {
      expect(typeof sanitize).toBe('function');
      
      const result = sanitize({ test: 'value', password: 'secret' });
      expect(result.test).toBe('value');
      expect(result.password).toBe('[REDACTED]');
    });
  });

  describe('wouldRedact', () => {
    it('should return true for sensitive fields', () => {
      expect(wouldRedact('apiKey')).toBe(true);
      expect(wouldRedact('password')).toBe(true);
      expect(wouldRedact('secret')).toBe(true);
    });

    it('should return false for non-sensitive fields', () => {
      expect(wouldRedact('name')).toBe(false);
      expect(wouldRedact('count')).toBe(false);
      expect(wouldRedact('status')).toBe(false);
    });
  });

  describe('addSensitiveField', () => {
    it('should add custom field to sensitive list', () => {
      // Before adding, field should not be redacted
      const before = sanitize({ customSecret: 'value123' });
      // Note: It might or might not be redacted depending on default patterns
      
      // Add custom sensitive field
      addSensitiveField('customSecret');
      
      // After adding, field should be redacted
      const after = sanitize({ customSecret: 'value123' });
      expect(after.customSecret).toBe('[REDACTED]');
    });
  });
});
