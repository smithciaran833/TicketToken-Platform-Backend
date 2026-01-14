import {
  stripHtml,
  escapeHtml,
  sanitizeName,
  sanitizeObject,
  USER_SANITIZE_FIELDS,
} from '../../../src/utils/sanitize';

describe('sanitize utils', () => {
  describe('stripHtml', () => {
    it('returns plain text unchanged', () => {
      expect(stripHtml('hello world')).toBe('hello world');
    });

    it('removes script tags', () => {
      expect(stripHtml("<script>alert('xss')</script>")).toBe("alert('xss')");
    });

    it('removes div tags', () => {
      expect(stripHtml('<div>content</div>')).toBe('content');
    });

    it('removes tags with event handlers', () => {
      expect(stripHtml("<img onerror='alert(1)'>")).toBe('');
      expect(stripHtml("<a onclick='bad()'>link</a>")).toBe('link');
    });

    it('removes self-closing tags', () => {
      expect(stripHtml('no<br>break')).toBe('nobreak');
      expect(stripHtml('line<br/>break')).toBe('linebreak');
    });

    it('trims whitespace', () => {
      expect(stripHtml('  spaced  ')).toBe('spaced');
    });

    it('returns non-string input unchanged', () => {
      expect(stripHtml(123 as any)).toBe(123);
      expect(stripHtml({} as any)).toEqual({});
    });

    it('handles null and undefined', () => {
      expect(stripHtml(null as any)).toBe(null);
      expect(stripHtml(undefined as any)).toBe(undefined);
    });

    it('handles nested tags', () => {
      expect(stripHtml('<div><span>nested</span></div>')).toBe('nested');
    });

    it('handles malformed tags', () => {
      expect(stripHtml('<div>unclosed')).toBe('unclosed');
      expect(stripHtml('text<>empty')).toBe('textempty');
    });
  });

  describe('escapeHtml', () => {
    it('returns plain text unchanged', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });

    it('escapes < and >', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    });

    it('escapes &', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes double quotes', () => {
      expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
    });

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe('it&#x27;s');
    });

    it('escapes multiple special chars in one string', () => {
      expect(escapeHtml('<div class="x">')).toBe('&lt;div class=&quot;x&quot;&gt;');
    });

    it('returns non-string input unchanged', () => {
      expect(escapeHtml(123 as any)).toBe(123);
      expect(escapeHtml(null as any)).toBe(null);
      expect(escapeHtml(undefined as any)).toBe(undefined);
    });

    it('handles string with all special characters', () => {
      expect(escapeHtml('<>&"\'')).toBe('&lt;&gt;&amp;&quot;&#x27;');
    });
  });

  describe('sanitizeName', () => {
    it('returns plain name unchanged', () => {
      expect(sanitizeName('John')).toBe('John');
    });

    it('strips HTML tags from name', () => {
      expect(sanitizeName('<b>John</b>')).toBe('John');
    });

    it('preserves apostrophes', () => {
      expect(sanitizeName("O'Connor")).toBe("O'Connor");
    });

    it('preserves hyphens', () => {
      expect(sanitizeName('Mary-Jane')).toBe('Mary-Jane');
    });

    it('preserves accented characters', () => {
      expect(sanitizeName('José')).toBe('José');
      expect(sanitizeName('François')).toBe('François');
      expect(sanitizeName('Müller')).toBe('Müller');
    });

    it('preserves spaces', () => {
      expect(sanitizeName('John Doe')).toBe('John Doe');
    });
  });

  describe('sanitizeObject', () => {
    it('returns object with clean values unchanged', () => {
      const obj = { name: 'John', email: 'john@test.com' };
      expect(sanitizeObject(obj, ['name'])).toEqual({ name: 'John', email: 'john@test.com' });
    });

    it('strips HTML from specified string fields', () => {
      const obj = { name: '<b>John</b>' };
      expect(sanitizeObject(obj, ['name'])).toEqual({ name: 'John' });
    });

    it('leaves non-specified fields unchanged', () => {
      const obj = { name: 'John', bio: '<script>bad</script>' };
      expect(sanitizeObject(obj, ['name'])).toEqual({ name: 'John', bio: '<script>bad</script>' });
    });

    it('ignores fields not present in object', () => {
      const obj = { name: 'John' };
      expect(sanitizeObject(obj, ['name', 'email'])).toEqual({ name: 'John' });
    });

    it('ignores non-string field values', () => {
      const obj = { name: 'John', age: 30, active: true };
      expect(sanitizeObject(obj, ['name', 'age', 'active'])).toEqual({ name: 'John', age: 30, active: true });
    });

    it('sanitizes multiple fields', () => {
      const obj = { firstName: '<i>John</i>', lastName: '<b>Doe</b>' };
      expect(sanitizeObject(obj, ['firstName', 'lastName'])).toEqual({ firstName: 'John', lastName: 'Doe' });
    });

    it('does not mutate original object', () => {
      const obj = { name: '<b>John</b>' };
      const result = sanitizeObject(obj, ['name']);
      expect(obj.name).toBe('<b>John</b>');
      expect(result.name).toBe('John');
    });
  });

  describe('USER_SANITIZE_FIELDS', () => {
    it('contains expected field names', () => {
      expect(USER_SANITIZE_FIELDS).toContain('firstName');
      expect(USER_SANITIZE_FIELDS).toContain('lastName');
      expect(USER_SANITIZE_FIELDS).toContain('first_name');
      expect(USER_SANITIZE_FIELDS).toContain('last_name');
      expect(USER_SANITIZE_FIELDS).toContain('display_name');
      expect(USER_SANITIZE_FIELDS).toContain('bio');
      expect(USER_SANITIZE_FIELDS).toContain('username');
    });

    it('has exactly 7 fields', () => {
      expect(USER_SANITIZE_FIELDS).toHaveLength(7);
    });

    it('is an array', () => {
      expect(Array.isArray(USER_SANITIZE_FIELDS)).toBe(true);
    });
  });
});
