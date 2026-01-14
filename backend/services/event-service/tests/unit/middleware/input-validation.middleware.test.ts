/**
 * Unit tests for input-validation middleware
 * 
 * Tests:
 * - Unicode normalization (NFC)
 * - XSS prevention / string sanitization
 * - SSRF prevention / URL validation
 * - Date range validation
 * - Object sanitization
 * - Request body sanitization middleware
 * - Pagination validation
 * - Email validation
 * - UUID validation
 * - Combined string validation
 */

import {
  normalizeUnicode,
  sanitizeString,
  validateUrl,
  validateDateRange,
  sanitizeObject,
  sanitizeRequestBody,
  validatePagination,
  validateEmail,
  validateUUID,
  normalizeAndValidateString,
} from '../../../src/middleware/input-validation';
import { createMockRequest, createMockReply } from '../../__mocks__/fastify.mock';

describe('Input Validation Middleware', () => {
  describe('normalizeUnicode', () => {
    it('should normalize Unicode strings to NFC form', () => {
      // The letter "é" can be represented as a single character (U+00E9) or 
      // as "e" (U+0065) followed by combining acute accent (U+0301)
      const decomposed = 'café\u0301'; // Using NFD form
      const result = normalizeUnicode(decomposed);
      expect(result).toBe(result.normalize('NFC'));
    });

    it('should return empty string for empty input', () => {
      expect(normalizeUnicode('')).toBe('');
    });

    it('should return null for null input', () => {
      expect(normalizeUnicode(null as any)).toBeNull();
    });

    it('should return undefined for undefined input', () => {
      expect(normalizeUnicode(undefined as any)).toBeUndefined();
    });

    it('should return non-string values unchanged', () => {
      expect(normalizeUnicode(123 as any)).toBe(123);
    });

    it('should handle ASCII strings without modification', () => {
      const ascii = 'Hello World';
      expect(normalizeUnicode(ascii)).toBe(ascii);
    });

    it('should normalize different Unicode representations to same form', () => {
      // "ñ" as single character vs "n" + combining tilde
      const combined = '\u00f1'; // ñ
      const decomposed = 'n\u0303'; // n + combining tilde
      const normalized1 = normalizeUnicode(combined);
      const normalized2 = normalizeUnicode(decomposed);
      expect(normalized1).toBe(normalized2);
    });
  });

  describe('sanitizeString', () => {
    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = sanitizeString(input);
      expect(result).toBe('Hello');
      expect(result).not.toContain('<script>');
    });

    it('should remove HTML tags', () => {
      const input = '<div><p>Hello</p></div>';
      const result = sanitizeString(input);
      expect(result).toBe('Hello');
    });

    it('should remove javascript: protocol', () => {
      const input = 'javascript:alert("xss")';
      const result = sanitizeString(input);
      expect(result).not.toContain('javascript:');
    });

    it('should remove event handlers', () => {
      const input = 'onclick=alert("xss") onmouseover=hack()';
      const result = sanitizeString(input);
      expect(result).not.toMatch(/on\w+\s*=/i);
    });

    it('should remove control characters', () => {
      const input = 'Hello\x00World\x1F';
      const result = sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = sanitizeString(input);
      expect(result).toBe('Hello World');
    });

    it('should return empty string for empty input', () => {
      expect(sanitizeString('')).toBe('');
    });

    it('should return falsy values unchanged', () => {
      expect(sanitizeString(null as any)).toBeNull();
      expect(sanitizeString(undefined as any)).toBeUndefined();
    });

    it('should handle nested script tags', () => {
      const input = '<script><script>nested</script></script>test';
      const result = sanitizeString(input);
      expect(result).not.toContain('script');
    });

    it('should handle mixed case script tags', () => {
      const input = '<ScRiPt>alert("xss")</sCrIpT>Hello';
      const result = sanitizeString(input);
      expect(result).toBe('Hello');
    });

    it('should normalize Unicode before sanitization', () => {
      const input = '<script>alert(\u0065\u0301)</script>café';
      const result = sanitizeString(input);
      expect(result).not.toContain('script');
    });
  });

  describe('validateUrl', () => {
    describe('valid URLs', () => {
      it('should accept valid HTTP URLs', () => {
        expect(validateUrl('http://example.com')).toBe(true);
        expect(validateUrl('http://example.com/path')).toBe(true);
        expect(validateUrl('http://example.com:8080')).toBe(true);
      });

      it('should accept valid HTTPS URLs', () => {
        expect(validateUrl('https://example.com')).toBe(true);
        expect(validateUrl('https://api.example.com/v1')).toBe(true);
      });

      it('should accept URLs with query parameters', () => {
        expect(validateUrl('https://example.com?foo=bar')).toBe(true);
      });

      it('should accept URLs with fragments', () => {
        expect(validateUrl('https://example.com#section')).toBe(true);
      });
    });

    describe('blocked URLs (SSRF prevention)', () => {
      it('should block localhost URLs', () => {
        expect(validateUrl('http://localhost')).toBe(false);
        expect(validateUrl('http://localhost:3000')).toBe(false);
        expect(validateUrl('https://localhost/admin')).toBe(false);
      });

      it('should block 127.0.0.1', () => {
        expect(validateUrl('http://127.0.0.1')).toBe(false);
        expect(validateUrl('http://127.0.0.1:8080')).toBe(false);
      });

      it('should block IPv6 localhost', () => {
        expect(validateUrl('http://[::1]')).toBe(false);
      });

      it('should block 10.x.x.x private range', () => {
        expect(validateUrl('http://10.0.0.1')).toBe(false);
        expect(validateUrl('http://10.255.255.255')).toBe(false);
      });

      it('should block 172.16-31.x.x private range', () => {
        expect(validateUrl('http://172.16.0.1')).toBe(false);
        expect(validateUrl('http://172.31.255.255')).toBe(false);
        // 172.15.x.x and 172.32.x.x should be allowed
        expect(validateUrl('http://172.15.0.1')).toBe(true);
        expect(validateUrl('http://172.32.0.1')).toBe(true);
      });

      it('should block 192.168.x.x private range', () => {
        expect(validateUrl('http://192.168.0.1')).toBe(false);
        expect(validateUrl('http://192.168.1.254')).toBe(false);
      });

      it('should block 169.254.x.x link-local range', () => {
        expect(validateUrl('http://169.254.0.1')).toBe(false);
        expect(validateUrl('http://169.254.169.254')).toBe(false); // AWS metadata
      });

      it('should block .local domains', () => {
        expect(validateUrl('http://myhost.local')).toBe(false);
        expect(validateUrl('http://internal.local')).toBe(false);
      });
    });

    describe('invalid URLs', () => {
      it('should reject empty URLs', () => {
        expect(validateUrl('')).toBe(false);
      });

      it('should reject null/undefined', () => {
        expect(validateUrl(null as any)).toBe(false);
        expect(validateUrl(undefined as any)).toBe(false);
      });

      it('should reject non-HTTP protocols', () => {
        expect(validateUrl('ftp://example.com')).toBe(false);
        expect(validateUrl('file:///etc/passwd')).toBe(false);
        expect(validateUrl('ssh://example.com')).toBe(false);
      });

      it('should reject invalid URL formats', () => {
        expect(validateUrl('not-a-url')).toBe(false);
        expect(validateUrl('://missing-protocol')).toBe(false);
      });

      it('should reject javascript: protocol', () => {
        expect(validateUrl('javascript:alert(1)')).toBe(false);
      });

      it('should reject data: protocol', () => {
        expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      });
    });
  });

  describe('validateDateRange', () => {
    const futureDate = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date;
    };

    const pastDate = (days: number) => {
      const date = new Date();
      date.setDate(date.getDate() - days);
      return date;
    };

    it('should validate valid date range', () => {
      const start = futureDate(1);
      const end = futureDate(2);
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(true);
    });

    it('should accept date strings', () => {
      const start = futureDate(1).toISOString();
      const end = futureDate(2).toISOString();
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid start date', () => {
      const result = validateDateRange('invalid', futureDate(1));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid start date');
    });

    it('should reject invalid end date', () => {
      const result = validateDateRange(futureDate(1), 'invalid');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid end date');
    });

    it('should reject end date before start date', () => {
      const start = futureDate(2);
      const end = futureDate(1);
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('End date must be after start date');
    });

    it('should reject equal start and end dates', () => {
      const date = futureDate(1);
      const result = validateDateRange(date, date);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('End date must be after start date');
    });

    it('should reject start date in the past', () => {
      const start = pastDate(1);
      const end = futureDate(1);
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Start date cannot be in the past');
    });

    it('should reject date range exceeding 2 years', () => {
      const start = futureDate(1);
      const end = futureDate(800); // More than 2 years
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Date range cannot exceed 2 years');
    });

    it('should accept date range of exactly 2 years', () => {
      const start = futureDate(1);
      const end = futureDate(730); // About 2 years
      const result = validateDateRange(start, end);
      expect(result.valid).toBe(true);
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize string values', () => {
      const obj = { name: '<script>alert("xss")</script>John' };
      const result = sanitizeObject(obj);
      expect(result.name).toBe('John');
    });

    it('should sanitize nested objects', () => {
      const obj = {
        user: {
          name: '<div>John</div>',
          profile: {
            bio: '<p>Hello</p>',
          },
        },
      };
      const result = sanitizeObject(obj);
      expect(result.user.name).toBe('John');
      expect(result.user.profile.bio).toBe('Hello');
    });

    it('should sanitize arrays', () => {
      const arr = ['<script>bad</script>good', '<div>nested</div>'];
      const result = sanitizeObject(arr);
      expect(result[0]).toBe('good');
      expect(result[1]).toBe('nested');
    });

    it('should handle mixed arrays', () => {
      const arr = ['<b>text</b>', 123, { name: '<i>test</i>' }];
      const result = sanitizeObject(arr);
      expect(result[0]).toBe('text');
      expect(result[1]).toBe(123);
      expect(result[2].name).toBe('test');
    });

    it('should preserve non-string primitive values', () => {
      const obj = { count: 42, active: true, ratio: 0.5, empty: null };
      const result = sanitizeObject(obj);
      expect(result.count).toBe(42);
      expect(result.active).toBe(true);
      expect(result.ratio).toBe(0.5);
      expect(result.empty).toBeNull();
    });

    it('should normalize object keys', () => {
      // Keys with combining characters should be normalized
      const obj = { 'café': 'value' };
      const result = sanitizeObject(obj);
      expect(result['café']).toBe('value');
    });

    it('should handle empty objects', () => {
      const result = sanitizeObject({});
      expect(result).toEqual({});
    });

    it('should handle null input', () => {
      const result = sanitizeObject(null);
      expect(result).toBeNull();
    });

    it('should handle undefined input', () => {
      const result = sanitizeObject(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('sanitizeRequestBody middleware', () => {
    it('should sanitize request body', async () => {
      const request = createMockRequest({
        body: {
          name: '<script>alert("xss")</script>Test',
          description: '<div>Hello</div>',
        },
      });
      const reply = createMockReply();

      await sanitizeRequestBody(request as any, reply as any);

      expect(request.body.name).toBe('Test');
      expect(request.body.description).toBe('Hello');
    });

    it('should sanitize query parameters', async () => {
      const request = createMockRequest({
        query: {
          search: '<script>bad</script>good',
          filter: '<b>test</b>',
        },
      });
      const reply = createMockReply();

      await sanitizeRequestBody(request as any, reply as any);

      expect(request.query.search).toBe('good');
      expect(request.query.filter).toBe('test');
    });

    it('should handle null body', async () => {
      const request = createMockRequest({ body: null });
      const reply = createMockReply();

      await expect(sanitizeRequestBody(request as any, reply as any)).resolves.not.toThrow();
    });

    it('should handle non-object body', async () => {
      const request = createMockRequest({ body: 'string-body' });
      const reply = createMockReply();

      await expect(sanitizeRequestBody(request as any, reply as any)).resolves.not.toThrow();
    });
  });

  describe('validatePagination', () => {
    it('should accept valid pagination parameters', () => {
      const result = validatePagination({ limit: 20, offset: 0 });
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should parse string parameters', () => {
      const result = validatePagination({ limit: '50', offset: '10' });
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });

    it('should use defaults when not provided', () => {
      const result = validatePagination({});
      expect(result.valid).toBe(true);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should reject limit less than 1', () => {
      const result = validatePagination({ limit: 0 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Limit must be between 1 and 100');
    });

    it('should reject limit greater than 100', () => {
      const result = validatePagination({ limit: 101 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Limit must be between 1 and 100');
    });

    it('should reject negative offset', () => {
      const result = validatePagination({ offset: -1 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Offset must be >= 0');
    });

    it('should accept boundary values', () => {
      expect(validatePagination({ limit: 1 }).valid).toBe(true);
      expect(validatePagination({ limit: 100 }).valid).toBe(true);
      expect(validatePagination({ offset: 0 }).valid).toBe(true);
    });

    it('should reject NaN limit', () => {
      const result = validatePagination({ limit: 'invalid' as any });
      expect(result.valid).toBe(false);
    });

    it('should reject NaN offset', () => {
      const result = validatePagination({ offset: 'invalid' as any });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.com')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
      expect(validateEmail('test@subdomain.example.com')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('')).toBe(false);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('missing@domain')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('user@')).toBe(false);
      expect(validateEmail('user name@example.com')).toBe(false);
    });

    it('should normalize Unicode before validation', () => {
      // Email with combining characters
      expect(validateEmail('café@example.com')).toBe(true);
    });
  });

  describe('validateUUID', () => {
    it('should accept valid UUIDs', () => {
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(validateUUID('550E8400-E29B-41D4-A716-446655440000')).toBe(true); // Uppercase
      expect(validateUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
    });

    it('should accept UUID v1-v5', () => {
      // v1
      expect(validateUUID('550e8400-e29b-11d4-a716-446655440000')).toBe(true);
      // v4
      expect(validateUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      // v5
      expect(validateUUID('550e8400-e29b-51d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(validateUUID('')).toBe(false);
      expect(validateUUID('not-a-uuid')).toBe(false);
      expect(validateUUID('550e8400-e29b-41d4-a716')).toBe(false); // Too short
      expect(validateUUID('550e8400-e29b-41d4-a716-4466554400001')).toBe(false); // Too long
      expect(validateUUID('550e8400-e29b-41d4-c716-446655440000')).toBe(false); // Invalid variant
      expect(validateUUID('550e8400-e29b-01d4-a716-446655440000')).toBe(false); // Invalid version (0)
      expect(validateUUID('550e8400-e29b-61d4-a716-446655440000')).toBe(false); // Invalid version (6)
    });

    it('should reject UUIDs with invalid characters', () => {
      expect(validateUUID('550e8400-e29b-41d4-a716-44665544000g')).toBe(false);
      expect(validateUUID('550e8400-e29b-41d4-a716-44665544000!')).toBe(false);
    });
  });

  describe('normalizeAndValidateString', () => {
    it('should validate and normalize a valid string', () => {
      const result = normalizeAndValidateString('Hello World');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Hello World');
    });

    it('should reject empty string when not allowed', () => {
      const result = normalizeAndValidateString('', { allowEmpty: false });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Value is required');
    });

    it('should accept empty string when allowed', () => {
      const result = normalizeAndValidateString('', { allowEmpty: true });
      expect(result.valid).toBe(true);
      expect(result.value).toBe('');
    });

    it('should enforce minimum length', () => {
      const result = normalizeAndValidateString('ab', { minLength: 3 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 3 characters');
    });

    it('should enforce maximum length', () => {
      const result = normalizeAndValidateString('Hello World', { maxLength: 5 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not exceed 5 characters');
    });

    it('should enforce pattern matching', () => {
      const result = normalizeAndValidateString('abc123', { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match required format');
    });

    it('should accept valid pattern', () => {
      const result = normalizeAndValidateString('abc', { pattern: /^[a-z]+$/ });
      expect(result.valid).toBe(true);
    });

    it('should sanitize and normalize input', () => {
      const result = normalizeAndValidateString('<script>alert("xss")</script>Test');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Test');
    });

    it('should combine multiple validations', () => {
      const result = normalizeAndValidateString('  Hello  ', {
        minLength: 3,
        maxLength: 10,
        pattern: /^[A-Za-z]+$/,
      });
      expect(result.valid).toBe(true);
      expect(result.value).toBe('Hello');
    });

    it('should handle null input', () => {
      const result = normalizeAndValidateString(null as any);
      expect(result.valid).toBe(false);
    });

    it('should handle undefined input', () => {
      const result = normalizeAndValidateString(undefined as any);
      expect(result.valid).toBe(false);
    });
  });
});
