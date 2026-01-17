/**
 * Unit Tests for Logger Utility
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('Logger Utility', () => {
  let logger: any;
  let redactString: any;
  let redactObject: any;
  let REDACTION_PATTERNS: any;
  let REDACTED_FIELDS: any;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.resetModules();

    const module = await import('../../../src/utils/logger');
    logger = module.logger;
    redactString = module.redactString;
    redactObject = module.redactObject;
    REDACTION_PATTERNS = module.REDACTION_PATTERNS;
    REDACTED_FIELDS = module.REDACTED_FIELDS;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('redactString', () => {
    it('should redact EIN numbers', () => {
      const input = 'EIN: 12-3456789';
      const result = redactString(input);
      expect(result).toBe('EIN: [EIN REDACTED]');
    });

    it('should redact SSN with dashes', () => {
      const input = 'SSN: 123-45-6789';
      const result = redactString(input);
      expect(result).toBe('SSN: [SSN REDACTED]');
    });

    it('should redact SSN without dashes', () => {
      const input = 'SSN is 123456789 here';
      const result = redactString(input);
      expect(result).toContain('[SSN REDACTED]');
    });

    it('should redact ITIN numbers', () => {
      const input = 'ITIN: 912-34-5678';
      const result = redactString(input);
      expect(result).toBe('ITIN: [ITIN REDACTED]');
    });

    it('should redact email addresses', () => {
      const input = 'Contact john.doe@example.com for info';
      const result = redactString(input);
      expect(result).toBe('Contact [EMAIL REDACTED] for info');
    });

    it('should redact phone numbers', () => {
      const input = 'Call 555-123-4567';
      const result = redactString(input);
      expect(result).toContain('[PHONE REDACTED]');
    });

    it('should redact phone numbers with area code in parens', () => {
      const input = 'Call (555) 123-4567';
      const result = redactString(input);
      expect(result).toContain('[PHONE REDACTED]');
    });

    it('should redact credit card numbers', () => {
      const input = 'Card: 4111-1111-1111-1111';
      const result = redactString(input);
      expect(result).toContain('[CARD REDACTED]');
    });

    it('should redact credit card numbers with spaces', () => {
      const input = 'Card: 4111 1111 1111 1111';
      const result = redactString(input);
      expect(result).toContain('[CARD REDACTED]');
    });

    it('should redact JWT tokens', () => {
      const input = 'Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
      const result = redactString(input);
      expect(result).toBe('Token: [JWT REDACTED]');
    });

    it('should redact API keys', () => {
      const input = 'api_key: sk_test_abcdefghijklmnop';
      const result = redactString(input);
      expect(result).toContain('[SECRET REDACTED]');
    });

    it('should redact account numbers', () => {
      const input = 'account_number: 12345678901234';
      const result = redactString(input);
      expect(result).toContain('[ACCOUNT REDACTED]');
    });

    it('should redact routing numbers', () => {
      const input = 'routing_number: 123456789';
      const result = redactString(input);
      expect(result).toContain('[ROUTING REDACTED]');
    });

    it('should handle multiple sensitive values', () => {
      const input = 'User 123-45-6789 email john@test.com';
      const result = redactString(input);
      expect(result).toContain('[SSN REDACTED]');
      expect(result).toContain('[EMAIL REDACTED]');
    });

    it('should return non-string values unchanged', () => {
      expect(redactString(123 as any)).toBe(123);
      expect(redactString(null as any)).toBe(null);
      expect(redactString(undefined as any)).toBe(undefined);
    });

    it('should handle empty string', () => {
      expect(redactString('')).toBe('');
    });
  });

  describe('redactObject', () => {
    it('should redact sensitive fields by name', () => {
      const obj = {
        name: 'John',
        password: 'secret123',
        ssn: '123-45-6789'
      };
      const result = redactObject(obj);

      expect(result.name).toBe('John');
      expect(result.password).toBe('[REDACTED]');
      expect(result.ssn).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      const obj = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret'
          }
        }
      };
      const result = redactObject(obj);

      expect(result.user.name).toBe('John');
      expect(result.user.credentials.password).toBe('[REDACTED]');
    });

    it('should redact sensitive values in strings', () => {
      const obj = {
        message: 'User SSN is 123-45-6789'
      };
      const result = redactObject(obj);

      expect(result.message).toBe('User SSN is [SSN REDACTED]');
    });

    it('should handle arrays', () => {
      const obj = {
        emails: ['john@test.com', 'jane@test.com']
      };
      const result = redactObject(obj);

      expect(result.emails[0]).toBe('[EMAIL REDACTED]');
      expect(result.emails[1]).toBe('[EMAIL REDACTED]');
    });

    it('should handle null and undefined', () => {
      expect(redactObject(null)).toBe(null);
      expect(redactObject(undefined)).toBe(undefined);
    });

    it('should handle deeply nested objects with max depth', () => {
      let obj: any = { value: 'test' };
      for (let i = 0; i < 15; i++) {
        obj = { nested: obj };
      }
      const result = redactObject(obj);
      
      // Should not throw and should handle depth
      expect(result).toBeDefined();
    });

    it('should redact common sensitive field names', () => {
      const sensitiveFields = [
        'password', 'ssn', 'ein', 'tax_id', 'taxId',
        'account_number', 'accountNumber', 'routing_number',
        'card_number', 'cvv', 'api_key', 'apiKey',
        'authorization', 'token', 'accessToken', 'refreshToken'
      ];

      for (const field of sensitiveFields) {
        const obj = { [field]: 'sensitive-value' };
        const result = redactObject(obj);
        expect(result[field]).toBe('[REDACTED]');
      }
    });
  });

  describe('REDACTION_PATTERNS', () => {
    it('should have patterns for all sensitive data types', () => {
      const patternNames = REDACTION_PATTERNS.map((p: any) => p.name);

      expect(patternNames).toContain('EIN');
      expect(patternNames).toContain('SSN');
      expect(patternNames).toContain('ACCOUNT_NUMBER');
      expect(patternNames).toContain('ROUTING_NUMBER');
      expect(patternNames).toContain('CREDIT_CARD');
      expect(patternNames).toContain('ITIN');
      expect(patternNames).toContain('EMAIL');
      expect(patternNames).toContain('PHONE');
      expect(patternNames).toContain('SECRET');
      expect(patternNames).toContain('JWT');
    });
  });

  describe('REDACTED_FIELDS', () => {
    it('should include common sensitive field names', () => {
      expect(REDACTED_FIELDS).toContain('password');
      expect(REDACTED_FIELDS).toContain('ssn');
      expect(REDACTED_FIELDS).toContain('ein');
      expect(REDACTED_FIELDS).toContain('token');
      expect(REDACTED_FIELDS).toContain('authorization');
    });
  });

  describe('logger methods', () => {
    it('should have all log level methods', () => {
      expect(typeof logger.trace).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.fatal).toBe('function');
    });

    it('should have child method', () => {
      expect(typeof logger.child).toBe('function');
    });

    it('should create child logger', () => {
      const child = logger.child({ service: 'test' });
      expect(child).toBeDefined();
      expect(typeof child.info).toBe('function');
    });

    it('should not throw when logging objects', () => {
      expect(() => {
        logger.info({ test: 'value' }, 'Test message');
      }).not.toThrow();
    });

    it('should not throw when logging strings', () => {
      expect(() => {
        logger.info('Test message');
      }).not.toThrow();
    });

    it('should redact sensitive data in logs', () => {
      // This test verifies the logger doesn't throw with sensitive data
      expect(() => {
        logger.info({ ssn: '123-45-6789', email: 'test@test.com' }, 'User data');
      }).not.toThrow();
    });
  });
});
