import crypto from 'crypto';
import {
  sanitizeInput,
  escapeSqlIdentifier,
  generateApiKey,
  validateRequestSignature,
  generateRateLimitKey,
  generateCsrfToken,
  validateCsrfToken,
} from '../../../src/utils/security';

describe('security.ts', () => {
  describe('sanitizeInput', () => {
    it('removes null bytes from string', () => {
      const input = 'test\0value';
      expect(sanitizeInput(input)).toBe('testvalue');
    });

    it('trims whitespace', () => {
      const input = '  test value  ';
      expect(sanitizeInput(input)).toBe('test value');
    });

    it('removes script tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      expect(sanitizeInput(input)).toBe('Hello');
    });

    it('escapes HTML entities', () => {
      const input = '<div>"test" & \'value\'</div>';
      const result = sanitizeInput(input);
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&#x27;');
      expect(result).toContain('&amp;');
    });

    it('recursively sanitizes objects', () => {
      const input = {
        name: '<script>alert("xss")</script>Test',
        nested: {
          value: '  whitespace  ',
        },
      };

      const result = sanitizeInput(input);
      expect(result.name).toBe('Test');
      expect(result.nested.value).toBe('whitespace');
    });

    it('handles non-string, non-object values', () => {
      expect(sanitizeInput(123)).toBe(123);
      expect(sanitizeInput(true)).toBe(true);
      expect(sanitizeInput(null)).toBe(null);
    });

    it('handles arrays', () => {
      const input = ['<script>xss</script>', '  trim  '];
      const result = sanitizeInput(input);
      expect(result[0]).toBe('');
      expect(result[1]).toBe('trim');
    });
  });

  describe('escapeSqlIdentifier', () => {
    it('removes non-alphanumeric characters except underscore', () => {
      expect(escapeSqlIdentifier('user_name')).toBe('user_name');
      expect(escapeSqlIdentifier('user-name')).toBe('username');
      expect(escapeSqlIdentifier('user@name')).toBe('username');
      expect(escapeSqlIdentifier('user.name')).toBe('username');
    });

    it('keeps alphanumeric and underscores', () => {
      expect(escapeSqlIdentifier('table123_name')).toBe('table123_name');
    });

    it('handles empty string', () => {
      expect(escapeSqlIdentifier('')).toBe('');
    });
  });

  describe('generateApiKey', () => {
    it('generates a base64url string', () => {
      const key = generateApiKey();
      expect(typeof key).toBe('string');
      expect(key.length).toBeGreaterThan(0);
      // base64url uses A-Z, a-z, 0-9, -, _
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('generates unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('validateRequestSignature', () => {
    const originalDateNow = Date.now;
    const secret = 'test-secret';

    beforeEach(() => {
      Date.now = jest.fn(() => 1609459200000);
    });

    afterEach(() => {
      Date.now = originalDateNow;
    });

    it('returns true for valid signature', () => {
      const timestamp = Date.now().toString();
      const body = { test: 'data' };
      const payload = `${timestamp}.${JSON.stringify(body)}`;
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const request: any = {
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
        body,
      };

      expect(validateRequestSignature(request, secret)).toBe(true);
    });

    it('returns false when signature header missing', () => {
      const request: any = {
        headers: {
          'x-timestamp': Date.now().toString(),
        },
        body: {},
      };

      expect(validateRequestSignature(request, secret)).toBe(false);
    });

    it('returns false when timestamp header missing', () => {
      const request: any = {
        headers: {
          'x-signature': 'some-signature',
        },
        body: {},
      };

      expect(validateRequestSignature(request, secret)).toBe(false);
    });

    it('returns false for expired timestamp (> 5 minutes)', () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString();
      const body = { test: 'data' };
      const payload = `${oldTimestamp}.${JSON.stringify(body)}`;
      const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

      const request: any = {
        headers: {
          'x-signature': signature,
          'x-timestamp': oldTimestamp,
        },
        body,
      };

      expect(validateRequestSignature(request, secret)).toBe(false);
    });

    it('throws error for invalid signature (different lengths)', () => {
      const timestamp = Date.now().toString();

      const request: any = {
        headers: {
          'x-signature': 'short',
          'x-timestamp': timestamp,
        },
        body: { test: 'data' },
      };

      expect(() => validateRequestSignature(request, secret)).toThrow();
    });
  });

  describe('generateRateLimitKey', () => {
    const originalEnv = process.env.IP_SALT;

    afterEach(() => {
      process.env.IP_SALT = originalEnv;
    });

    it('generates user-based key when user is authenticated', () => {
      const request: any = {
        ip: '192.168.1.1',
        user: { id: 'user-123' },
      };

      const key = generateRateLimitKey(request);
      expect(key).toBe('user:user-123');
    });

    it('generates IP-based key when user is not authenticated', () => {
      const request: any = {
        ip: '192.168.1.1',
        user: undefined,
      };

      const key = generateRateLimitKey(request);
      expect(key).toMatch(/^ip:[a-f0-9]{16}$/);
    });

    it('generates different keys for different IPs', () => {
      const request1: any = { ip: '192.168.1.1', user: undefined };
      const request2: any = { ip: '192.168.1.2', user: undefined };

      const key1 = generateRateLimitKey(request1);
      const key2 = generateRateLimitKey(request2);

      expect(key1).not.toBe(key2);
    });

    it('generates consistent keys for same IP', () => {
      const request: any = { ip: '192.168.1.1', user: undefined };

      const key1 = generateRateLimitKey(request);
      const key2 = generateRateLimitKey(request);

      expect(key1).toBe(key2);
    });
  });

  describe('generateCsrfToken', () => {
    it('generates a hex string', () => {
      const token = generateCsrfToken();
      expect(typeof token).toBe('string');
      expect(token).toMatch(/^[a-f0-9]+$/);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('generates unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('validateCsrfToken', () => {
    it('returns true for matching tokens', () => {
      const token = generateCsrfToken();
      expect(validateCsrfToken(token, token)).toBe(true);
    });

    it('returns false for non-matching tokens with same length', () => {
      const token1 = 'a'.repeat(64);
      const token2 = 'b'.repeat(64);
      expect(validateCsrfToken(token1, token2)).toBe(false);
    });

    it('throws error when tokens have different lengths', () => {
      const token1 = 'short';
      const token2 = 'muchlongertoken';
      expect(() => validateCsrfToken(token1, token2)).toThrow();
    });
  });
});
