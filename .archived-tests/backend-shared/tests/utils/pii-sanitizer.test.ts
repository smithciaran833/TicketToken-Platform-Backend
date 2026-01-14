/**
 * PII Sanitizer Test Suite
 *
 * Comprehensive tests for PII (Personally Identifiable Information) removal including:
 * - Email address sanitization
 * - SSN (Social Security Number) redaction
 * - Credit card number masking
 * - Phone number sanitization
 * - Password/token/secret key redaction
 * - IP address masking
 * - Nested object sanitization
 * - Array sanitization
 * - Request object sanitization
 * - Sensitive key detection
 *
 * Priority: P0 (Critical) - Data protection, compliance
 * Expected Coverage: 95%+
 */

import { PIISanitizer } from '../../src/utils/pii-sanitizer';

describe('PIISanitizer', () => {
  // ============================================================================
  // EMAIL SANITIZATION TESTS
  // ============================================================================

  describe('Email Sanitization', () => {
    test('sanitizes single email address in string', () => {
      const input = 'Contact us at support@example.com for help';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Contact us at [EMAIL] for help');
    });

    test('sanitizes multiple email addresses in string', () => {
      const input = 'Email admin@test.com or support@example.com';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Email [EMAIL] or [EMAIL]');
    });

    test('sanitizes email with subdomain', () => {
      const input = 'Send to user@mail.example.com';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Send to [EMAIL]');
    });

    test('sanitizes email with numbers and dots', () => {
      const input = 'Contact john.doe123@company.co.uk';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Contact [EMAIL]');
    });

    test('sanitizes email in mixed case', () => {
      const input = 'Email User@EXAMPLE.COM';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Email [EMAIL]');
    });
  });

  // ============================================================================
  // SSN SANITIZATION TESTS
  // ============================================================================

  describe('SSN Sanitization', () => {
    test('sanitizes SSN in standard format', () => {
      const input = 'SSN: 123-45-6789';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('SSN: [SSN]');
    });

    test('sanitizes multiple SSNs', () => {
      const input = '123-45-6789 and 987-65-4321';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('[SSN] and [SSN]');
    });

    test('sanitizes SSN in sentence', () => {
      const input = 'Applicant SSN is 555-12-3456 on file';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Applicant SSN is [SSN] on file');
    });

    test('does not sanitize similar but incorrect patterns', () => {
      const input = 'Order #12-34-5678';
      const result = PIISanitizer.sanitize(input);

      // Should not match (not enough digits)
      expect(result).toBe('Order #12-34-5678');
    });
  });

  // ============================================================================
  // CREDIT CARD SANITIZATION TESTS
  // ============================================================================

  describe('Credit Card Sanitization', () => {
    test('sanitizes credit card with spaces', () => {
      const input = 'Card: 4111 1111 1111 1111';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Card: [CARD]');
    });

    test('sanitizes credit card with dashes', () => {
      const input = 'Card: 4111-1111-1111-1111';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Card: [CARD]');
    });

    test('sanitizes credit card without separators', () => {
      const input = 'Card: 4111111111111111';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Card: [CARD]');
    });

    test('sanitizes multiple credit cards', () => {
      const input = '4111111111111111 and 5555555555554444';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('[CARD] and [CARD]');
    });

    test('sanitizes mixed format credit cards', () => {
      const input = 'Cards: 4111-1111-1111-1111 and 5555 5555 5555 4444';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Cards: [CARD] and [CARD]');
    });
  });

  // ============================================================================
  // PHONE NUMBER SANITIZATION TESTS
  // ============================================================================

  describe('Phone Number Sanit ization', () => {
    test('sanitizes phone with dashes', () => {
      const input = 'Call 555-123-4567';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Call [PHONE]');
    });

    test('sanitizes phone with dots', () => {
      const input = 'Call 555.123.4567';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Call [PHONE]');
    });

    test('sanitizes phone without separators', () => {
      const input = 'Call 5551234567';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Call [PHONE]');
    });

    test('sanitizes multiple phone numbers', () => {
      const input = 'Main: 555-123-4567, Alt: 555-987-6543';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('Main: [PHONE], Alt: [PHONE]');
    });
  });

  // ============================================================================
  // OBJECT SANITIZATION TESTS
  // ============================================================================

  describe('Object Sanitization', () => {
    test('sanitizes strings in object', () => {
      const input = {
        message: 'Contact user@example.com',
        phone: 'Call 555-123-4567',
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.message).toBe('Contact [EMAIL]');
      expect(result.phone).toBe('Call [PHONE]');
    });

    test('redacts sensitive keys entirely', () => {
      const input = {
        username: 'john',
        password: 'secret123',
        email: 'test@example.com',
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.username).toBe('john');
      expect(result.password).toBe('[REDACTED]');
      expect(result.email).toBe('[EMAIL]');
    });

    test('redacts token keys', () => {
      const input = {
        accessToken: 'abc123',
        refreshToken: 'xyz789',
        data: 'public info',
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.accessToken).toBe('[REDACTED]');
      expect(result.refreshToken).toBe('[REDACTED]');
      expect(result.data).toBe('public info');
    });

    test('redacts API key variations', () => {
      const input = {
        apiKey: 'key123',
        api_key: 'key456',
        APIKey: 'key789',
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.api_key).toBe('[REDACTED]');
      expect(result.APIKey).toBe('[REDACTED]');
    });

    test('sanitizes nested objects', () => {
      const input = {
        user: {
          name: 'John',
          email: 'john@example.com',
          credentials: {
            password: 'secret',
            apiKey: 'key123',
          },
        },
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.user.name).toBe('John');
      expect(result.user.email).toBe('[EMAIL]');
      expect(result.user.credentials.password).toBe('[REDACTED]');
      expect(result.user.credentials.apiKey).toBe('[REDACTED]');
    });

    test('handles deeply nested objects', () => {
      const input = {
        level1: {
          level2: {
            level3: {
              email: 'deep@example.com',
              secret: 'sensitive',
            },
          },
        },
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.level1.level2.level3.email).toBe('[EMAIL]');
      expect(result.level1.level2.level3.secret).toBe('[REDACTED]');
    });
  });

  // ============================================================================
  // ARRAY SANITIZATION TESTS
  // ============================================================================

  describe('Array Sanitization', () => {
    test('sanitizes array of strings', () => {
      const input = ['Contact user1@example.com', 'Call 555-123-4567', 'SSN: 123-45-6789'];
      const result = PIISanitizer.sanitize(input);

      expect(result[0]).toBe('Contact [EMAIL]');
      expect(result[1]).toBe('Call [PHONE]');
      expect(result[2]).toBe('SSN: [SSN]');
    });

    test('sanitizes array of objects', () => {
      const input = [
        { email: 'user1@example.com' },
        { email: 'user2@example.com' },
        { password: 'secret123' },
      ];
      const result = PIISanitizer.sanitize(input);

      expect(result[0].email).toBe('[EMAIL]');
      expect(result[1].email).toBe('[EMAIL]');
      expect(result[2].password).toBe('[REDACTED]');
    });

    test('sanitizes nested arrays', () => {
      const input = [
        ['user1@example.com', 'user2@example.com'],
        ['555-123-4567', '555-987-6543'],
      ];
      const result = PIISanitizer.sanitize(input);

      expect(result[0][0]).toBe('[EMAIL]');
      expect(result[0][1]).toBe('[EMAIL]');
      expect(result[1][0]).toBe('[PHONE]');
      expect(result[1][1]).toBe('[PHONE]');
    });
  });

  // ============================================================================
  // REQUEST SANITIZATION TESTS
  // ============================================================================

  describe('Request Sanitization', () => {
    test('sanitizes HTTP request object', () => {
      const req = {
        method: 'POST',
        url: '/api/users',
        ip: '192.168.1.100',
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };
      const result = PIISanitizer.sanitizeRequest(req);

      expect(result.method).toBe('POST');
      expect(result.url).toBe('/api/users');
      expect(result.ip).toBe('192.168.xxx.xxx');
      expect(result.headers.authorization).toBe('[REDACTED]');
      expect(result.headers['content-type']).toBe('application/json');
    });

    test('masks IP address in request', () => {
      const req = {
        method: 'GET',
        url: '/',
        ip: '10.0.0.5',
        headers: {},
      };
      const result = PIISanitizer.sanitizeRequest(req);

      expect(result.ip).toBe('10.0.xxx.xxx');
    });

    test('sanitizes cookie headers', () => {
      const req = {
        method: 'GET',
        url: '/',
        ip: '127.0.0.1',
        headers: {
          cookie: 'session=abc123; token=xyz789',
        },
      };
      const result = PIISanitizer.sanitizeRequest(req);

      expect(result.headers.cookie).toBe('[REDACTED]');
    });
  });

  // ============================================================================
  // SENSITIVE KEY DETECTION TESTS
  // ============================================================================

  describe('Sensitive Key Detection', () => {
    test('detects password variations', () => {
      const inputs = [
        { password: 'test' },
        { userPassword: 'test' },
        { PASSWORD: 'test' },
        { pass_word: 'test' },
      ];

      inputs.forEach((input) => {
        const result = PIISanitizer.sanitize(input);
        const key = Object.keys(input)[0];
        expect(result[key]).toBe('[REDACTED]');
      });
    });

    test('detects token variations', () => {
      const inputs = [
        { token: 'abc' },
        { accessToken: 'abc' },
        { TOKEN: 'abc' },
        { bearerToken: 'abc' },
      ];

      inputs.forEach((input) => {
        const result = PIISanitizer.sanitize(input);
        const key = Object.keys(input)[0];
        expect(result[key]).toBe('[REDACTED]');
      });
    });

    test('detects secret variations', () => {
      const inputs = [
        { secret: 'test' },
        { clientSecret: 'test' },
        { SECRET: 'test' },
        { api_secret: 'test' },
      ];

      inputs.forEach((input) => {
        const result = PIISanitizer.sanitize(input);
        const key = Object.keys(input)[0];
        expect(result[key]).toBe('[REDACTED]');
      });
    });

    test('detects private key variations', () => {
      const inputs = [{ privateKey: 'key' }, { private_key: 'key' }, { PRIVATEKEY: 'key' }];

      inputs.forEach((input) => {
        const result = PIISanitizer.sanitize(input);
        const key = Object.keys(input)[0];
        expect(result[key]).toBe('[REDACTED]');
      });
    });

    test('does not redact non-sensitive keys', () => {
      const input = {
        username: 'john',
        userId: '123',
        role: 'admin',
        data: 'public',
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.username).toBe('john');
      expect(result.userId).toBe('123');
      expect(result.role).toBe('admin');
      expect(result.data).toBe('public');
    });
  });

  // ============================================================================
  // EDGE CASES AND NULL HANDLING
  // ============================================================================

  describe('Edge Cases', () => {
    test('handles null input', () => {
      const result = PIISanitizer.sanitize(null);

      expect(result).toBeNull();
    });

    test('handles undefined input', () => {
      const result = PIISanitizer.sanitize(undefined);

      expect(result).toBeUndefined();
    });

    test('handles empty string', () => {
      const result = PIISanitizer.sanitize('');

      expect(result).toBe('');
    });

    test('handles empty object', () => {
      const result = PIISanitizer.sanitize({});

      expect(result).toEqual({});
    });

    test('handles empty array', () => {
      const result = PIISanitizer.sanitize([]);

      expect(result).toEqual([]);
    });

    test('handles numbers', () => {
      const result = PIISanitizer.sanitize(12345);

      expect(result).toBe(12345);
    });

    test('handles booleans', () => {
      const resultTrue = PIISanitizer.sanitize(true);
      const resultFalse = PIISanitizer.sanitize(false);

      expect(resultTrue).toBe(true);
      expect(resultFalse).toBe(false);
    });

    test('handles string with no PII', () => {
      const input = 'This is a normal string without any sensitive data';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe(input);
    });

    test('masks IPv4 addresses correctly', () => {
      const req = {
        method: 'GET',
        url: '/',
        ip: '255.255.255.255',
        headers: {},
      };
      const result = PIISanitizer.sanitizeRequest(req);

      expect(result.ip).toBe('255.255.xxx.xxx');
    });

    test('handles invalid IP address format', () => {
      const req = {
        method: 'GET',
        url: '/',
        ip: 'not-an-ip',
        headers: {},
      };
      const result = PIISanitizer.sanitizeRequest(req);

      expect(result.ip).toBe('[IP]');
    });

    test('handles IPv6 addresses', () => {
      const req = {
        method: 'GET',
        url: '/',
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        headers: {},
      };
      const result = PIISanitizer.sanitizeRequest(req);

      expect(result.ip).toBe('[IP]');
    });
  });

  // ============================================================================
  // COMBINED SCENARIOS
  // ============================================================================

  describe('Combined Scenarios', () => {
    test('sanitizes log entry with multiple PII types', () => {
      const input =
        'User john@example.com called from 555-123-4567 with SSN 123-45-6789 and card 4111-1111-1111-1111';
      const result = PIISanitizer.sanitize(input);

      expect(result).toBe('User [EMAIL] called from [PHONE] with SSN [SSN] and card [CARD]');
    });

    test('sanitizes complex nested structure', () => {
      const input = {
        user: {
          email: 'user@example.com',
          phone: '555-123-4567',
          payment: {
            card: '4111-1111-1111-1111',
            ssn: '123-45-6789',
          },
        },
        auth: {
          password: 'secret',
          token: 'bearer-token',
        },
        logs: ['Login from 192.168.1.1', 'Email sent to admin@example.com'],
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.user.email).toBe('[EMAIL]');
      expect(result.user.phone).toBe('[PHONE]');
      expect(result.user.payment.card).toBe('[CARD]');
      expect(result.user.payment.ssn).toBe('[SSN]');
      expect(result.auth.password).toBe('[REDACTED]');
      expect(result.auth.token).toBe('[REDACTED]');
      expect(result.logs[1]).toBe('Email sent to [EMAIL]');
    });

    test('preserves data structure while sanitizing', () => {
      const input = {
        metadata: {
          count: 5,
          active: true,
          tags: ['public', 'visible'],
        },
        sensitive: {
          apiKey: 'key123',
        },
      };
      const result = PIISanitizer.sanitize(input);

      expect(result.metadata.count).toBe(5);
      expect(result.metadata.active).toBe(true);
      expect(result.metadata.tags).toEqual(['public', 'visible']);
      expect(result.sensitive.apiKey).toBe('[REDACTED]');
    });
  });
});
