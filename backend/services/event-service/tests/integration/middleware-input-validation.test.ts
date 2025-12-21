/**
 * Input Validation Middleware Integration Tests
 */

import {
  sanitizeString,
  validateUrl,
  validateDateRange,
  sanitizeObject,
  validatePagination,
  validateEmail,
  validateUUID,
} from '../../src/middleware/input-validation';

describe('Input Validation Middleware', () => {
  // ==========================================================================
  // sanitizeString
  // ==========================================================================
  describe('sanitizeString', () => {
    it('should remove script tags', () => {
      const input = 'Hello <script>alert("xss")</script> World';
      const result = sanitizeString(input);
      expect(result).toBe('Hello  World');
    });

    it('should remove all HTML tags', () => {
      const input = '<div><p>Hello</p><span>World</span></div>';
      const result = sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should remove javascript: protocol', () => {
      const input = 'Click javascript:alert("xss")';
      const result = sanitizeString(input);
      expect(result).toBe('Click alert("xss")');
    });

    it('should remove event handlers', () => {
      const input = 'Hello onclick=alert("xss") World';
      const result = sanitizeString(input);
      expect(result).toBe('Hello alert("xss") World');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = sanitizeString(input);
      expect(result).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(sanitizeString(null as any)).toBe(null);
      expect(sanitizeString(undefined as any)).toBe(undefined);
    });

    it('should preserve normal text', () => {
      const input = 'Normal text with numbers 123 and symbols !@#';
      const result = sanitizeString(input);
      expect(result).toBe('Normal text with numbers 123 and symbols !@#');
    });
  });

  // ==========================================================================
  // validateUrl
  // ==========================================================================
  describe('validateUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      expect(validateUrl('https://example.com')).toBe(true);
      expect(validateUrl('https://example.com/path')).toBe(true);
      expect(validateUrl('https://sub.example.com')).toBe(true);
    });

    it('should accept valid HTTP URLs', () => {
      expect(validateUrl('http://example.com')).toBe(true);
    });

    it('should reject non-HTTP protocols', () => {
      expect(validateUrl('ftp://example.com')).toBe(false);
      expect(validateUrl('file:///etc/passwd')).toBe(false);
      expect(validateUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject localhost (SSRF prevention)', () => {
      expect(validateUrl('http://localhost')).toBe(false);
      expect(validateUrl('http://localhost:3000')).toBe(false);
      expect(validateUrl('http://127.0.0.1')).toBe(false);
      expect(validateUrl('http://::1')).toBe(false);
    });

    it('should reject private IP ranges (SSRF prevention)', () => {
      expect(validateUrl('http://10.0.0.1')).toBe(false);
      expect(validateUrl('http://10.255.255.255')).toBe(false);
      expect(validateUrl('http://172.16.0.1')).toBe(false);
      expect(validateUrl('http://172.31.255.255')).toBe(false);
      expect(validateUrl('http://192.168.1.1')).toBe(false);
      expect(validateUrl('http://192.168.255.255')).toBe(false);
    });

    it('should reject link-local addresses', () => {
      expect(validateUrl('http://169.254.0.1')).toBe(false);
    });

    it('should reject .local domains', () => {
      expect(validateUrl('http://myserver.local')).toBe(false);
    });

    it('should handle invalid URLs', () => {
      expect(validateUrl('not a url')).toBe(false);
      expect(validateUrl('')).toBe(false);
      expect(validateUrl(null as any)).toBe(false);
    });
  });

  // ==========================================================================
  // validateDateRange
  // ==========================================================================
  describe('validateDateRange', () => {
    it('should accept valid future date range', () => {
      const now = new Date();
      const start = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
      const end = new Date(now.getTime() + 48 * 60 * 60 * 1000); // Day after

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(true);
    });

    it('should reject end date before start date', () => {
      const now = new Date();
      const start = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('End date must be after start date');
    });

    it('should reject start date in the past', () => {
      const now = new Date();
      const start = new Date(now.getTime() - 24 * 60 * 60 * 1000); // Yesterday
      const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('past');
    });

    it('should reject date range exceeding 2 years', () => {
      const now = new Date();
      const start = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() + 3 * 365 * 24 * 60 * 60 * 1000); // 3 years

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('2 years');
    });

    it('should reject invalid date formats', () => {
      const result = validateDateRange('not-a-date', '2025-01-01');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should accept string dates', () => {
      const now = new Date();
      const start = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      const end = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

      const result = validateDateRange(start, end);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // sanitizeObject
  // ==========================================================================
  describe('sanitizeObject', () => {
    it('should sanitize nested string values', () => {
      const input = {
        name: '<script>alert("xss")</script>Test',
        nested: {
          value: '<b>Bold</b>',
        },
      };

      const result = sanitizeObject(input);
      expect(result.name).toBe('Test');
      expect(result.nested.value).toBe('Bold');
    });

    it('should sanitize arrays', () => {
      const input = ['<script>xss</script>Hello', '<b>World</b>'];
      const result = sanitizeObject(input);
      expect(result).toEqual(['Hello', 'World']);
    });

    it('should preserve non-string values', () => {
      const input = {
        count: 42,
        active: true,
        data: null,
      };

      const result = sanitizeObject(input);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.data).toBe(null);
    });

    it('should handle deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              value: '<script>xss</script>Deep',
            },
          },
        },
      };

      const result = sanitizeObject(input);
      expect(result.level1.level2.level3.value).toBe('Deep');
    });
  });

  // ==========================================================================
  // validatePagination
  // ==========================================================================
  describe('validatePagination', () => {
    it('should accept valid pagination params', () => {
      const result = validatePagination({ limit: 50, offset: 100 });
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(100);
    });

    it('should apply default values', () => {
      const result = validatePagination({});
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should reject limit > 100', () => {
      const result = validatePagination({ limit: 150 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Limit');
    });

    it('should reject limit < 1', () => {
      const result = validatePagination({ limit: 0 });
      expect(result.valid).toBe(false);
    });

    it('should reject negative offset', () => {
      const result = validatePagination({ offset: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Offset');
    });

    it('should handle string values', () => {
      const result = validatePagination({ limit: '25', offset: '50' });
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(50);
    });

    it('should reject non-numeric strings', () => {
      const result = validatePagination({ limit: 'abc' });
      expect(result.valid).toBe(false);
    });
  });

  // ==========================================================================
  // validateEmail
  // ==========================================================================
  describe('validateEmail', () => {
    it('should accept valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.org')).toBe(true);
      expect(validateEmail('user+tag@example.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(validateEmail('notanemail')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@nodomain.com')).toBe(false);
      expect(validateEmail('spaces in@email.com')).toBe(false);
    });
  });

  // ==========================================================================
  // validateUUID
  // ==========================================================================
  describe('validateUUID', () => {
    it('should accept valid UUIDs', () => {
      // Valid v1 UUID
      expect(validateUUID('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      // Valid v4 UUID
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      // Valid v4 UUID uppercase
      expect(validateUUID('A1B2C3D4-E5F6-4234-8678-9ABCDEF01234')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(validateUUID('not-a-uuid')).toBe(false);
      expect(validateUUID('12345678-1234-1234-1234-123456789')).toBe(false); // Too short
      expect(validateUUID('12345678-1234-1234-1234-1234567890123')).toBe(false); // Too long
      expect(validateUUID('12345678123412341234123456789012')).toBe(false); // No dashes
      expect(validateUUID('')).toBe(false);
    });

    it('should reject UUIDs with invalid version', () => {
      // Version 0 (not valid per RFC 4122)
      expect(validateUUID('00000000-0000-0000-0000-000000000001')).toBe(false);
      // Version 6+ (not valid)
      expect(validateUUID('12345678-1234-6234-8234-123456789012')).toBe(false);
    });
  });
});
