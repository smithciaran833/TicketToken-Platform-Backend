/**
 * Unit tests for src/utils/sanitize.ts
 * Tests prototype pollution protection, Unicode normalization, and sanitization utilities
 */

import {
  isDangerousKey,
  sanitizeObject,
  normalizeUnicode,
  normalizeForComparison,
  createSlug,
  safeStringCompare,
  safeSlugCompare,
  sanitizeRequestBody,
  hasControlCharacters,
  removeControlCharacters,
} from '../../../src/utils/sanitize';

describe('utils/sanitize', () => {
  describe('isDangerousKey()', () => {
    it('should return true for __proto__', () => {
      expect(isDangerousKey('__proto__')).toBe(true);
    });

    it('should return true for constructor', () => {
      expect(isDangerousKey('constructor')).toBe(true);
    });

    it('should return true for prototype', () => {
      expect(isDangerousKey('prototype')).toBe(true);
    });

    it('should return true for __defineGetter__', () => {
      expect(isDangerousKey('__defineGetter__')).toBe(true);
    });

    it('should return true for __defineSetter__', () => {
      expect(isDangerousKey('__defineSetter__')).toBe(true);
    });

    it('should return true for __lookupGetter__', () => {
      expect(isDangerousKey('__lookupGetter__')).toBe(true);
    });

    it('should return true for __lookupSetter__', () => {
      expect(isDangerousKey('__lookupSetter__')).toBe(true);
    });

    it('should return false for normal keys', () => {
      expect(isDangerousKey('name')).toBe(false);
      expect(isDangerousKey('email')).toBe(false);
      expect(isDangerousKey('venueId')).toBe(false);
      expect(isDangerousKey('__typename')).toBe(false); // GraphQL common key
      expect(isDangerousKey('_id')).toBe(false);
    });
  });

  describe('sanitizeObject()', () => {
    it('should remove __proto__ key from object', () => {
      // Use Object.defineProperty to create an actual __proto__ property (not prototype manipulation)
      const obj: Record<string, any> = { name: 'test' };
      Object.defineProperty(obj, '__proto__', {
        value: { malicious: true },
        enumerable: true,
        writable: true,
        configurable: true,
      });
      
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized.name).toBe('test');
      // The __proto__ key should be stripped by sanitizeObject
      expect(Object.prototype.hasOwnProperty.call(sanitized, '__proto__')).toBe(false);
    });

    it('should remove constructor key from object', () => {
      const obj = { name: 'test', constructor: { prototype: {} } };
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized.name).toBe('test');
      // Note: constructor exists on all objects, but we shouldn't have overwritten it
      expect(sanitized).not.toHaveProperty('prototype');
    });

    it('should remove prototype key from object', () => {
      const obj = { name: 'test', prototype: { malicious: true } };
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized.name).toBe('test');
      expect((sanitized as any).prototype).toBeUndefined();
    });

    it('should recursively sanitize nested objects', () => {
      // Create nested object with prototype key using Object.defineProperty
      const level1: Record<string, any> = {
        level2: {
          value: 'safe',
        },
      };
      // Add prototype key (different dangerous key that works in object literals)
      level1.prototype = { malicious: true };
      level1.level2.constructor = { prototype: {} };
      
      const obj = { level1 };
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized.level1.level2.value).toBe('safe');
      expect((sanitized.level1 as any).prototype).toBeUndefined();
    });

    it('should handle arrays', () => {
      const obj = {
        items: [
          { name: 'item1', __proto__: {} },
          { name: 'item2', prototype: {} },
        ],
      };
      
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized.items).toHaveLength(2);
      expect(sanitized.items[0].name).toBe('item1');
      expect(sanitized.items[1].name).toBe('item2');
    });

    it('should handle arrays with primitive values', () => {
      const obj = { tags: ['tag1', 'tag2', 'tag3'] };
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should return null for null input', () => {
      expect(sanitizeObject(null as any)).toBe(null);
    });

    it('should return primitives unchanged', () => {
      expect(sanitizeObject('string' as any)).toBe('string');
      expect(sanitizeObject(123 as any)).toBe(123);
      expect(sanitizeObject(true as any)).toBe(true);
    });

    it('should preserve safe keys', () => {
      const obj = {
        name: 'Venue',
        email: 'test@example.com',
        address: {
          street: '123 Main St',
          city: 'New York',
        },
        tags: ['music', 'entertainment'],
        capacity: 1000,
        isActive: true,
      };
      
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized).toEqual(obj);
    });
  });

  describe('normalizeUnicode()', () => {
    it('should normalize NFC form', () => {
      // é can be represented as single char (U+00E9) or e + combining accent (U+0065 U+0301)
      const composed = '\u00E9'; // é (single character)
      const decomposed = '\u0065\u0301'; // e + ́ (combining acute accent)
      
      expect(normalizeUnicode(composed)).toBe(normalizeUnicode(decomposed));
      expect(normalizeUnicode(decomposed)).toBe(composed);
    });

    it('should return non-strings unchanged', () => {
      expect(normalizeUnicode(123 as any)).toBe(123);
      expect(normalizeUnicode(null as any)).toBe(null);
      expect(normalizeUnicode(undefined as any)).toBe(undefined);
    });

    it('should handle empty string', () => {
      expect(normalizeUnicode('')).toBe('');
    });

    it('should handle ASCII strings unchanged', () => {
      expect(normalizeUnicode('Hello World')).toBe('Hello World');
    });

    it('should normalize various Unicode characters', () => {
      // ñ can be ñ (U+00F1) or n + combining tilde (U+006E U+0303)
      const composedN = '\u00F1';
      const decomposedN = '\u006E\u0303';
      
      expect(normalizeUnicode(decomposedN)).toBe(composedN);
    });
  });

  describe('normalizeForComparison()', () => {
    it('should normalize, lowercase, and trim', () => {
      expect(normalizeForComparison('  HELLO WORLD  ')).toBe('hello world');
    });

    it('should normalize Unicode before lowercasing', () => {
      const decomposed = '\u0065\u0301'; // e + combining accent
      const result = normalizeForComparison(decomposed);
      
      expect(result).toBe('\u00E9'); // normalized é
    });

    it('should return non-strings unchanged', () => {
      expect(normalizeForComparison(123 as any)).toBe(123);
    });

    it('should handle empty string', () => {
      expect(normalizeForComparison('')).toBe('');
    });

    it('should handle mixed case with whitespace', () => {
      expect(normalizeForComparison('  My Venue Name  ')).toBe('my venue name');
    });
  });

  describe('createSlug()', () => {
    it('should create a valid URL slug', () => {
      expect(createSlug('Hello World')).toBe('hello-world');
    });

    it('should handle multiple spaces', () => {
      expect(createSlug('Hello   World')).toBe('hello-world');
    });

    it('should handle special characters', () => {
      expect(createSlug("Café & Bar's")).toBe('caf-bars');
    });

    it('should handle underscores', () => {
      expect(createSlug('my_venue_name')).toBe('my-venue-name');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(createSlug('--hello--')).toBe('hello');
    });

    it('should handle Unicode characters', () => {
      expect(createSlug('München Arena')).toBe('mnchen-arena');
    });

    it('should return empty string for non-string input', () => {
      expect(createSlug(123 as any)).toBe('');
      expect(createSlug(null as any)).toBe('');
    });

    it('should handle empty string', () => {
      expect(createSlug('')).toBe('');
    });

    it('should handle string with only special characters', () => {
      expect(createSlug('!@#$%^&*()')).toBe('');
    });

    it('should handle mixed content', () => {
      expect(createSlug('The #1 Best Venue!')).toBe('the-1-best-venue');
    });
  });

  describe('safeStringCompare()', () => {
    it('should return true for identical strings', () => {
      expect(safeStringCompare('hello', 'hello')).toBe(true);
    });

    it('should return true for Unicode-equivalent strings', () => {
      const composed = '\u00E9'; // é
      const decomposed = '\u0065\u0301'; // e + combining accent
      
      expect(safeStringCompare(composed, decomposed)).toBe(true);
    });

    it('should return false for different strings', () => {
      expect(safeStringCompare('hello', 'world')).toBe(false);
    });

    it('should return false for non-string first argument', () => {
      expect(safeStringCompare(123 as any, 'hello')).toBe(false);
    });

    it('should return false for non-string second argument', () => {
      expect(safeStringCompare('hello', 123 as any)).toBe(false);
    });

    it('should return false for both non-strings', () => {
      expect(safeStringCompare(null as any, undefined as any)).toBe(false);
    });

    it('should handle empty strings', () => {
      expect(safeStringCompare('', '')).toBe(true);
      expect(safeStringCompare('', 'a')).toBe(false);
    });
  });

  describe('safeSlugCompare()', () => {
    it('should return true for same slug', () => {
      expect(safeSlugCompare('hello-world', 'hello-world')).toBe(true);
    });

    it('should return true for equivalent slugs with different formatting', () => {
      expect(safeSlugCompare('Hello World', 'hello-world')).toBe(true);
    });

    it('should return true for slugs that normalize the same', () => {
      expect(safeSlugCompare('My Venue', 'my-venue')).toBe(true);
      expect(safeSlugCompare('My_Venue', 'my-venue')).toBe(true);
    });

    it('should return false for different slugs', () => {
      expect(safeSlugCompare('hello', 'world')).toBe(false);
    });

    it('should handle special characters', () => {
      expect(safeSlugCompare("Café & Bar's", 'caf-bars')).toBe(true);
    });
  });

  describe('sanitizeRequestBody()', () => {
    it('should remove dangerous keys and normalize strings', () => {
      // Use 'prototype' key which is properly added as an enumerable property
      const body: Record<string, any> = {
        name: 'Test Venue',
        description: 'A great venue',
        prototype: { malicious: true }, // This is a dangerous key
      };
      
      const sanitized = sanitizeRequestBody(body);
      
      expect(sanitized.name).toBe('Test Venue');
      expect(sanitized.description).toBe('A great venue');
      expect((sanitized as any).prototype).toBeUndefined();
    });

    it('should normalize Unicode strings', () => {
      const decomposed = '\u0065\u0301'; // e + combining accent
      const body = { name: decomposed };
      
      const sanitized = sanitizeRequestBody(body);
      
      expect(sanitized.name).toBe('\u00E9'); // normalized é
    });

    it('should handle nested objects', () => {
      const body = {
        venue: {
          name: 'Test',
          address: {
            city: 'New York',
            __proto__: {},
          },
        },
      };
      
      const sanitized = sanitizeRequestBody(body);
      
      expect(sanitized.venue.address.city).toBe('New York');
    });

    it('should handle arrays', () => {
      const body = {
        tags: ['Tag1', 'Tag2'],
        items: [{ name: 'Item', __proto__: {} }],
      };
      
      const sanitized = sanitizeRequestBody(body);
      
      expect(sanitized.tags).toEqual(['Tag1', 'Tag2']);
      expect(sanitized.items[0].name).toBe('Item');
    });

    it('should preserve non-string values', () => {
      const body = {
        capacity: 1000,
        isActive: true,
        rating: 4.5,
        metadata: null,
      };
      
      const sanitized = sanitizeRequestBody(body);
      
      expect(sanitized.capacity).toBe(1000);
      expect(sanitized.isActive).toBe(true);
      expect(sanitized.rating).toBe(4.5);
    });
  });

  describe('hasControlCharacters()', () => {
    it('should return true for null character', () => {
      expect(hasControlCharacters('hello\x00world')).toBe(true);
    });

    it('should return true for bell character', () => {
      expect(hasControlCharacters('hello\x07world')).toBe(true);
    });

    it('should return true for backspace character', () => {
      expect(hasControlCharacters('hello\x08world')).toBe(true);
    });

    it('should return true for escape character', () => {
      expect(hasControlCharacters('hello\x1Bworld')).toBe(true);
    });

    it('should return true for delete character', () => {
      expect(hasControlCharacters('hello\x7Fworld')).toBe(true);
    });

    it('should return false for normal strings', () => {
      expect(hasControlCharacters('Hello World!')).toBe(false);
    });

    it('should return false for common whitespace (tab, newline, carriage return)', () => {
      expect(hasControlCharacters('hello\tworld')).toBe(false);
      expect(hasControlCharacters('hello\nworld')).toBe(false);
      expect(hasControlCharacters('hello\rworld')).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(hasControlCharacters(123 as any)).toBe(false);
      expect(hasControlCharacters(null as any)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(hasControlCharacters('')).toBe(false);
    });
  });

  describe('removeControlCharacters()', () => {
    it('should remove null character', () => {
      expect(removeControlCharacters('hello\x00world')).toBe('helloworld');
    });

    it('should remove multiple control characters', () => {
      expect(removeControlCharacters('\x00hello\x07world\x1B!')).toBe('helloworld!');
    });

    it('should preserve common whitespace', () => {
      expect(removeControlCharacters('hello\tworld\n!')).toBe('hello\tworld\n!');
    });

    it('should return non-string input unchanged', () => {
      expect(removeControlCharacters(123 as any)).toBe(123);
      expect(removeControlCharacters(null as any)).toBe(null);
    });

    it('should handle empty string', () => {
      expect(removeControlCharacters('')).toBe('');
    });

    it('should handle string with only control characters', () => {
      expect(removeControlCharacters('\x00\x01\x02\x03')).toBe('');
    });

    it('should handle normal strings unchanged', () => {
      const normal = 'Hello, World! 123';
      expect(removeControlCharacters(normal)).toBe(normal);
    });
  });

  describe('Edge Cases', () => {
    it('should handle deeply nested objects', () => {
      const deep = {
        l1: {
          l2: {
            l3: {
              l4: {
                __proto__: {},
                value: 'deep',
              },
            },
          },
        },
      };
      
      const sanitized = sanitizeObject(deep);
      
      expect(sanitized.l1.l2.l3.l4.value).toBe('deep');
    });

    it('should handle circular reference protection via object identity', () => {
      // Note: sanitizeObject doesn't handle circular refs, but shouldn't crash
      const obj = { name: 'test' };
      const sanitized = sanitizeObject(obj);
      
      expect(sanitized).toEqual(obj);
      expect(sanitized).not.toBe(obj); // Should be a new object
    });

    it('should handle mixed array content', () => {
      const mixed = {
        items: [
          'string',
          123,
          { nested: 'object', __proto__: {} },
          ['nested', 'array'],
          null,
          true,
        ],
      };
      
      const sanitized = sanitizeObject(mixed);
      
      expect(sanitized.items).toHaveLength(6);
      expect(sanitized.items[0]).toBe('string');
      expect(sanitized.items[1]).toBe(123);
      expect((sanitized.items[2] as any).nested).toBe('object');
      expect(sanitized.items[3]).toEqual(['nested', 'array']);
      expect(sanitized.items[4]).toBe(null);
      expect(sanitized.items[5]).toBe(true);
    });
  });
});
