/**
 * Unit Tests for src/utils/xss.ts
 */

// Mock logger before imports
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      warn: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import {
  encodeHtml,
  decodeHtml,
  encodeAttribute,
  encodeJavaScript,
  encodeUrl,
  encodeCss,
  sanitizeHtml,
  sanitizeUrl,
  stripHtmlTags,
  sanitizeJson,
  containsDangerousContent,
  validateAndSanitize,
  STRICT_SANITIZE_CONFIG,
  RICH_TEXT_SANITIZE_CONFIG,
} from '../../../src/utils/xss';

describe('utils/xss', () => {
  describe('encodeHtml', () => {
    it('returns empty string for null/undefined', () => {
      expect(encodeHtml(null as any)).toBe('');
      expect(encodeHtml(undefined as any)).toBe('');
    });

    it('encodes & to &amp;', () => {
      expect(encodeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('encodes < to &lt;', () => {
      expect(encodeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('encodes > to &gt;', () => {
      expect(encodeHtml('a > b')).toBe('a &gt; b');
    });

    it('encodes " to &quot;', () => {
      expect(encodeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it("encodes ' to &#x27;", () => {
      expect(encodeHtml("it's")).toBe("it&#x27;s");
    });

    it('encodes / to &#x2F;', () => {
      expect(encodeHtml('a/b')).toBe('a&#x2F;b');
    });

    it('encodes ` to &#x60;', () => {
      expect(encodeHtml('`code`')).toBe('&#x60;code&#x60;');
    });

    it('encodes = to &#x3D;', () => {
      expect(encodeHtml('a=b')).toBe('a&#x3D;b');
    });
  });

  describe('decodeHtml', () => {
    it('returns empty string for null/undefined', () => {
      expect(decodeHtml(null as any)).toBe('');
      expect(decodeHtml(undefined as any)).toBe('');
    });

    it('decodes all HTML entities back', () => {
      const encoded = '&amp;&lt;&gt;&quot;&#x27;&#x2F;&#x60;&#x3D;';
      expect(decodeHtml(encoded)).toBe('&<>"\'/`=');
    });

    it('decodes alternative entity formats', () => {
      expect(decodeHtml('&#39;')).toBe("'");
      expect(decodeHtml('&#47;')).toBe('/');
    });
  });

  describe('encodeAttribute', () => {
    it('returns empty string for null/undefined', () => {
      expect(encodeAttribute(null as any)).toBe('');
      expect(encodeAttribute(undefined as any)).toBe('');
    });

    it('encodes all non-alphanumeric characters', () => {
      expect(encodeAttribute('hello')).toBe('hello');
      expect(encodeAttribute('a b')).toContain('&#x20;');
      expect(encodeAttribute('a<b')).toContain('&#x3c;');
    });
  });

  describe('encodeJavaScript', () => {
    it('returns empty string for null/undefined', () => {
      expect(encodeJavaScript(null as any)).toBe('');
      expect(encodeJavaScript(undefined as any)).toBe('');
    });

    it('escapes backslash', () => {
      expect(encodeJavaScript('a\\b')).toBe('a\\\\b');
    });

    it('escapes quotes', () => {
      expect(encodeJavaScript("'test'")).toBe("\\'test\\'");
      expect(encodeJavaScript('"test"')).toBe('\\"test\\"');
    });

    it('escapes angle brackets', () => {
      expect(encodeJavaScript('<script>')).toBe('\\u003Cscript\\u003E');
    });

    it('escapes newlines and line/paragraph separators', () => {
      expect(encodeJavaScript('a\nb')).toBe('a\\nb');
      expect(encodeJavaScript('a\rb')).toBe('a\\rb');
      expect(encodeJavaScript('a\u2028b')).toBe('a\\u2028b');
      expect(encodeJavaScript('a\u2029b')).toBe('a\\u2029b');
    });
  });

  describe('encodeUrl', () => {
    it('returns empty string for null/undefined', () => {
      expect(encodeUrl(null as any)).toBe('');
      expect(encodeUrl(undefined as any)).toBe('');
    });

    it('uses encodeURIComponent', () => {
      expect(encodeUrl('hello world')).toBe('hello%20world');
      expect(encodeUrl('a=b&c=d')).toBe('a%3Db%26c%3Dd');
    });
  });

  describe('encodeCss', () => {
    it('returns empty string for null/undefined', () => {
      expect(encodeCss(null as any)).toBe('');
      expect(encodeCss(undefined as any)).toBe('');
    });

    it('escapes non-alphanumeric with backslash hex', () => {
      expect(encodeCss('hello')).toBe('hello');
      expect(encodeCss('a b')).toContain('\\20 ');
    });
  });

  describe('sanitizeHtml', () => {
    it('returns empty string for null/undefined', () => {
      expect(sanitizeHtml(null as any)).toBe('');
      expect(sanitizeHtml(undefined as any)).toBe('');
    });

    it('strips script tags and content', () => {
      const input = 'Hello<script>alert("xss")</script>World';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('script');
      expect(result).not.toContain('alert');
    });

    it('strips style tags and content', () => {
      const input = 'Hello<style>body{display:none}</style>World';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('style');
      expect(result).not.toContain('display');
    });

    it('removes event handlers (onclick, onerror)', () => {
      const input = '<div onclick="alert(1)">test</div>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('onclick');
    });

    it('blocks javascript: URLs', () => {
      const input = '<a href="javascript:alert(1)">click</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:');
    });

    it('blocks data: URLs', () => {
      const input = '<img src="data:text/html,<script>alert(1)</script>">';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('data:');
    });

    it('blocks vbscript: URLs', () => {
      const input = '<a href="vbscript:msgbox(1)">click</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('vbscript:');
    });

    it('encodes disallowed tags', () => {
      const input = '<div>test</div>';
      const result = sanitizeHtml(input);
      expect(result).toContain('&lt;div&gt;');
    });

    it('preserves allowed tags', () => {
      const input = '<b>bold</b> <i>italic</i>';
      const result = sanitizeHtml(input);
      expect(result).toContain('<b>');
      expect(result).toContain('<i>');
    });

    it('applies maxLength', () => {
      const input = '<b>This is a long string</b>';
      const result = sanitizeHtml(input, { maxLength: 10 });
      expect(result.length).toBeLessThanOrEqual(20); // Accounting for tags
    });

    it('strips all tags when stripAllTags=true', () => {
      const input = '<b>bold</b> <i>italic</i>';
      const result = sanitizeHtml(input, { stripAllTags: true });
      expect(result).not.toContain('<b>');
      expect(result).not.toContain('<i>');
    });
  });

  describe('sanitizeUrl', () => {
    it('returns empty for javascript: URLs', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('returns empty for data: URLs', () => {
      expect(sanitizeUrl('data:text/html,<script>')).toBe('');
    });

    it('returns empty for disallowed schemes', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBe('');
    });

    it('allows http/https schemes', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('allows relative URLs starting with /', () => {
      expect(sanitizeUrl('/path/to/page')).toBe('/path/to/page');
    });

    it('allows fragment identifiers starting with #', () => {
      expect(sanitizeUrl('#section')).toBe('#section');
    });
  });

  describe('stripHtmlTags', () => {
    it('returns empty string for null/undefined', () => {
      expect(stripHtmlTags(null as any)).toBe('');
      expect(stripHtmlTags(undefined as any)).toBe('');
    });

    it('removes all HTML tags', () => {
      const input = '<div><b>Hello</b> <i>World</i></div>';
      const result = stripHtmlTags(input);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('decodes then re-encodes entities', () => {
      const input = '&lt;script&gt;';
      const result = stripHtmlTags(input);
      expect(result).toBe('&lt;script&gt;');
    });
  });

  describe('sanitizeJson', () => {
    it('returns null/undefined as-is', () => {
      expect(sanitizeJson(null)).toBeNull();
      expect(sanitizeJson(undefined)).toBeUndefined();
    });

    it('encodes string values', () => {
      expect(sanitizeJson('<script>')).toBe('&lt;script&gt;');
    });

    it('recursively sanitizes arrays', () => {
      const input = ['<b>', '<i>'];
      const result = sanitizeJson(input);
      expect(result).toEqual(['&lt;b&gt;', '&lt;i&gt;']);
    });

    it('recursively sanitizes nested objects', () => {
      const input = { a: { b: '<script>' } };
      const result = sanitizeJson(input);
      expect(result).toEqual({ a: { b: '&lt;script&gt;' } });
    });

    it('encodes object keys', () => {
      const input = { '<key>': 'value' };
      const result = sanitizeJson(input);
      expect(result).toHaveProperty('&lt;key&gt;');
    });
  });

  describe('containsDangerousContent', () => {
    it('returns false for null/undefined', () => {
      expect(containsDangerousContent(null as any)).toBe(false);
      expect(containsDangerousContent(undefined as any)).toBe(false);
    });

    it('detects script tags', () => {
      expect(containsDangerousContent('<script>')).toBe(true);
    });

    it('detects javascript: URLs', () => {
      expect(containsDangerousContent('javascript:alert(1)')).toBe(true);
    });

    it('detects event handlers', () => {
      expect(containsDangerousContent('onclick=alert(1)')).toBe(true);
      expect(containsDangerousContent('onerror=foo')).toBe(true);
    });

    it('detects iframe/object/embed tags', () => {
      expect(containsDangerousContent('<iframe>')).toBe(true);
      expect(containsDangerousContent('<object>')).toBe(true);
      expect(containsDangerousContent('<embed>')).toBe(true);
    });

    it('detects CSS expressions', () => {
      expect(containsDangerousContent('expression(alert(1))')).toBe(true);
    });

    it('returns false for safe content', () => {
      expect(containsDangerousContent('Hello World')).toBe(false);
    });
  });

  describe('validateAndSanitize', () => {
    it('returns null for oversized input', () => {
      const longInput = 'a'.repeat(20000);
      expect(validateAndSanitize(longInput, { maxLength: 10000 })).toBeNull();
    });

    it('returns null for dangerous content when allowHtml=false', () => {
      expect(validateAndSanitize('<script>alert(1)</script>')).toBeNull();
    });

    it('sanitizes HTML when allowHtml=true', () => {
      const result = validateAndSanitize('<b>bold</b><script>bad</script>', { allowHtml: true });
      expect(result).toContain('<b>');
      expect(result).not.toContain('script');
    });

    it('encodes when allowHtml=false', () => {
      const result = validateAndSanitize('Hello & World');
      expect(result).toBe('Hello &amp; World');
    });

    it('returns empty string for empty input', () => {
      expect(validateAndSanitize('')).toBe('');
    });
  });

  describe('Config exports', () => {
    it('STRICT_SANITIZE_CONFIG strips all tags', () => {
      expect(STRICT_SANITIZE_CONFIG.stripAllTags).toBe(true);
      expect(STRICT_SANITIZE_CONFIG.allowedTags).toEqual([]);
    });

    it('RICH_TEXT_SANITIZE_CONFIG allows formatting tags', () => {
      expect(RICH_TEXT_SANITIZE_CONFIG.allowedTags).toContain('p');
      expect(RICH_TEXT_SANITIZE_CONFIG.allowedTags).toContain('b');
      expect(RICH_TEXT_SANITIZE_CONFIG.allowedTags).toContain('a');
    });
  });
});
