import {
  stripHtml,
  escapeHtml,
  sanitizeName,
  sanitizeObject,
  USER_SANITIZE_FIELDS
} from '../../src/utils/sanitize';

/**
 * INTEGRATION TESTS FOR SANITIZE UTILITY
 * 
 * These tests verify HTML sanitization functions:
 * - Strip HTML tags
 * - Escape HTML entities
 * - Sanitize names and objects
 * - Pure functions (no mocks needed)
 */

describe('Sanitize Utility Integration Tests', () => {
  describe('stripHtml()', () => {
    it('should return input unchanged if not string', () => {
      expect(stripHtml(123 as any)).toBe(123);
      expect(stripHtml(null as any)).toBe(null);
      expect(stripHtml(undefined as any)).toBe(undefined);
      expect(stripHtml({} as any)).toEqual({});
    });

    it('should remove <b> tags', () => {
      const input = '<b>Bold text</b>';
      const result = stripHtml(input);

      expect(result).toBe('Bold text');
      expect(result).not.toContain('<b>');
      expect(result).not.toContain('</b>');
    });

    it('should remove <script> tags', () => {
      const input = '<script>alert("xss")</script>Hello';
      const result = stripHtml(input);

      expect(result).toBe('Hello');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('alert');
    });

    it('should remove all HTML tags', () => {
      const input = '<div><p>Text with <span>multiple</span> tags</p></div>';
      const result = stripHtml(input);

      expect(result).toBe('Text with multiple tags');
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should trim whitespace', () => {
      const input = '  <p>  Text with spaces  </p>  ';
      const result = stripHtml(input);

      expect(result).toBe('Text with spaces');
    });

    it('should handle nested tags', () => {
      const input = '<div><p><span><strong>Nested</strong></span></p></div>';
      const result = stripHtml(input);

      expect(result).toBe('Nested');
    });

    it('should handle self-closing tags', () => {
      const input = 'Text<br/>More<img src="x"/>Text';
      const result = stripHtml(input);

      expect(result).toBe('TextMoreText');
    });

    it('should handle malformed HTML', () => {
      const input = '<div>Unclosed tag';
      const result = stripHtml(input);

      expect(result).toBe('Unclosed tag');
    });

    it('should preserve plain text without tags', () => {
      const input = 'Just plain text';
      const result = stripHtml(input);

      expect(result).toBe('Just plain text');
    });
  });

  describe('escapeHtml()', () => {
    it('should return input unchanged if not string', () => {
      expect(escapeHtml(123 as any)).toBe(123);
      expect(escapeHtml(null as any)).toBe(null);
      expect(escapeHtml(undefined as any)).toBe(undefined);
    });

    it('should escape & to &amp;', () => {
      const input = 'AT&T';
      const result = escapeHtml(input);

      expect(result).toBe('AT&amp;T');
    });

    it('should escape < to &lt;', () => {
      const input = '5 < 10';
      const result = escapeHtml(input);

      expect(result).toBe('5 &lt; 10');
    });

    it('should escape > to &gt;', () => {
      const input = '10 > 5';
      const result = escapeHtml(input);

      expect(result).toBe('10 &gt; 5');
    });

    it('should escape " to &quot;', () => {
      const input = 'Say "hello"';
      const result = escapeHtml(input);

      expect(result).toBe('Say &quot;hello&quot;');
    });

    it("should escape ' to &#x27;", () => {
      const input = "It's a test";
      const result = escapeHtml(input);

      expect(result).toBe('It&#x27;s a test');
    });

    it('should escape multiple characters', () => {
      const input = '<script>alert("XSS & more")</script>';
      const result = escapeHtml(input);

      expect(result).toBe('&lt;script&gt;alert(&quot;XSS &amp; more&quot;)&lt;/script&gt;');
    });

    it('should preserve plain text', () => {
      const input = 'Plain text without special chars';
      const result = escapeHtml(input);

      expect(result).toBe('Plain text without special chars');
    });
  });

  describe('sanitizeName()', () => {
    it('should call stripHtml on input', () => {
      const input = '<b>John</b>';
      const result = sanitizeName(input);

      expect(result).toBe('John');
    });

    it('should strip HTML from names', () => {
      const input = '<script>alert("xss")</script>Jane Doe';
      const result = sanitizeName(input);

      expect(result).toBe('Jane Doe');
      expect(result).not.toContain('<script>');
    });

    it('should preserve legitimate name characters', () => {
      const input = "John O'Brien-Smith";
      const result = sanitizeName(input);

      expect(result).toBe("John O'Brien-Smith");
    });
  });

  describe('sanitizeObject()', () => {
    it('should sanitize specified string fields', () => {
      const obj = {
        firstName: '<b>John</b>',
        lastName: '<script>alert("xss")</script>Doe',
        email: 'john@example.com'
      };

      const result = sanitizeObject(obj, ['firstName', 'lastName']);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Doe');
      expect(result.email).toBe('john@example.com');
    });

    it('should leave non-string fields unchanged', () => {
      const obj = {
        name: '<b>Test</b>',
        age: 25,
        active: true,
        metadata: { key: 'value' }
      };

      const result = sanitizeObject(obj, ['name', 'age', 'active']);

      expect(result.name).toBe('Test');
      expect(result.age).toBe(25);
      expect(result.active).toBe(true);
      expect(result.metadata).toEqual({ key: 'value' });
    });

    it('should not modify fields not in list', () => {
      const obj = {
        name: '<b>Test</b>',
        bio: '<script>xss</script>',
        email: '<i>email</i>'
      };

      const result = sanitizeObject(obj, ['name']);

      expect(result.name).toBe('Test');
      expect(result.bio).toBe('<script>xss</script>'); // Not sanitized
      expect(result.email).toBe('<i>email</i>'); // Not sanitized
    });

    it('should not throw for missing fields', () => {
      const obj = {
        name: 'John'
      };

      expect(() => {
        sanitizeObject(obj, ['name', 'nonexistent']);
      }).not.toThrow();
    });

    it('should return new object (not mutate original)', () => {
      const obj = {
        name: '<b>Test</b>'
      };

      const result = sanitizeObject(obj, ['name']);

      expect(result).not.toBe(obj);
      expect(result.name).toBe('Test');
      expect(obj.name).toBe('<b>Test</b>'); // Original unchanged
    });

    it('should handle empty fields array', () => {
      const obj = {
        name: '<b>Test</b>',
        email: 'test@example.com'
      };

      const result = sanitizeObject(obj, []);

      expect(result).toEqual(obj);
      expect(result).not.toBe(obj); // Still returns new object
    });

    it('should handle complex objects', () => {
      const obj = {
        profile: {
          firstName: '<b>John</b>',
          lastName: 'Doe'
        },
        displayName: '<script>alert("xss")</script>'
      };

      const result = sanitizeObject(obj, ['displayName']);

      expect(result.displayName).toBe('');
      expect(result.profile.firstName).toBe('<b>John</b>'); // Nested not affected
    });
  });

  describe('USER_SANITIZE_FIELDS', () => {
    it('should include firstName and lastName', () => {
      expect(USER_SANITIZE_FIELDS).toContain('firstName');
      expect(USER_SANITIZE_FIELDS).toContain('lastName');
    });

    it('should include first_name and last_name', () => {
      expect(USER_SANITIZE_FIELDS).toContain('first_name');
      expect(USER_SANITIZE_FIELDS).toContain('last_name');
    });

    it('should include display_name, bio, and username', () => {
      expect(USER_SANITIZE_FIELDS).toContain('display_name');
      expect(USER_SANITIZE_FIELDS).toContain('bio');
      expect(USER_SANITIZE_FIELDS).toContain('username');
    });

    it('should be an array', () => {
      expect(Array.isArray(USER_SANITIZE_FIELDS)).toBe(true);
    });

    it('should have at least 7 fields', () => {
      expect(USER_SANITIZE_FIELDS.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('XSS prevention scenarios', () => {
    it('should prevent script injection in user names', () => {
      const maliciousName = '<script>document.cookie</script>John';
      const safe = stripHtml(maliciousName);

      expect(safe).toBe('John');
      expect(safe).not.toContain('script');
    });

    it('should prevent event handler injection', () => {
      const malicious = '<img src=x onerror=alert("xss")>';
      const safe = stripHtml(malicious);

      expect(safe).toBe('');
      expect(safe).not.toContain('onerror');
    });

    it('should prevent iframe injection', () => {
      const malicious = '<iframe src="evil.com"></iframe>';
      const safe = stripHtml(malicious);

      expect(safe).toBe('');
      expect(safe).not.toContain('iframe');
    });

    it('should sanitize user profile object', () => {
      const userProfile = {
        firstName: '<script>alert("xss")</script>John',
        lastName: '<b onload=alert("xss")>Doe</b>',
        bio: 'Software <strong>engineer</strong>',
        email: 'john@example.com'
      };

      const safe = sanitizeObject(userProfile, USER_SANITIZE_FIELDS);

      expect(safe.firstName).toBe('John');
      expect(safe.lastName).toBe('Doe');
      expect(safe.bio).toBe('Software engineer');
      expect(safe.email).toBe('john@example.com');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty strings', () => {
      expect(stripHtml('')).toBe('');
      expect(escapeHtml('')).toBe('');
    });

    it('should handle strings with only tags', () => {
      expect(stripHtml('<div></div>')).toBe('');
      expect(stripHtml('<br/><hr/>')).toBe('');
    });

    it('should handle very long strings', () => {
      const longString = 'a'.repeat(10000);
      const withTags = `<div>${longString}</div>`;

      const result = stripHtml(withTags);

      expect(result).toBe(longString);
      expect(result.length).toBe(10000);
    });

    it('should handle unicode characters', () => {
      const unicode = '你好 <script>alert("xss")</script> мир';
      const result = stripHtml(unicode);

      expect(result).toBe('你好  мир');
    });

    it('should handle special characters in escapeHtml', () => {
      const special = '&<>"\' all together';
      const result = escapeHtml(special);

      expect(result).toBe('&amp;&lt;&gt;&quot;&#x27; all together');
    });
  });
});
