/**
 * Sanitizer Utility Tests
 * Tests for input sanitization and validation
 */

import { SearchSanitizer } from '../../../src/utils/sanitizer';

describe('SearchSanitizer', () => {
  describe('sanitizeQuery', () => {
    it('should return empty string for null or undefined', () => {
      expect(SearchSanitizer.sanitizeQuery(null as any)).toBe('');
      expect(SearchSanitizer.sanitizeQuery(undefined as any)).toBe('');
    });

    it('should trim whitespace', () => {
      expect(SearchSanitizer.sanitizeQuery('  test  ')).toBe('test');
      expect(SearchSanitizer.sanitizeQuery('\n test \t')).toBe('test');
    });

    it('should remove HTML tags', () => {
      expect(SearchSanitizer.sanitizeQuery('<script>alert("xss")</script>')).toBe('scriptalertxssscript');
      expect(SearchSanitizer.sanitizeQuery('hello<b>world</b>')).toBe('hellobworldb');
      expect(SearchSanitizer.sanitizeQuery('<img src=x onerror=alert(1)>')).toBe('img srcx onerroralert1');
    });

    it('should remove dangerous characters', () => {
      expect(SearchSanitizer.sanitizeQuery("test' OR '1'='1")).toBe('test OR 11');
      expect(SearchSanitizer.sanitizeQuery('test"; DROP TABLE users;--')).toBe('test DROP TABLE users--');
    });

    it('should remove command injection characters', () => {
      expect(SearchSanitizer.sanitizeQuery('test && rm -rf /')).toBe('test  rm -rf /');
      expect(SearchSanitizer.sanitizeQuery('test; ls -la')).toBe('test ls -la');
      expect(SearchSanitizer.sanitizeQuery('test | cat /etc/passwd')).toBe('test  cat /etc/passwd');
    });

    it('should remove null bytes', () => {
      expect(SearchSanitizer.sanitizeQuery('test\x00malicious')).toBe('testmalicious');
    });

    it('should enforce maximum length', () => {
      const longString = 'a'.repeat(300);
      const result = SearchSanitizer.sanitizeQuery(longString);
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should handle normal queries correctly', () => {
      expect(SearchSanitizer.sanitizeQuery('rock concert')).toBe('rock concert');
      expect(SearchSanitizer.sanitizeQuery('New York')).toBe('New York');
      expect(SearchSanitizer.sanitizeQuery('concert-2024')).toBe('concert-2024');
    });

    it('should remove brackets and escape characters', () => {
      expect(SearchSanitizer.sanitizeQuery('test{malicious}')).toBe('testmalicious');
      expect(SearchSanitizer.sanitizeQuery('test[array]')).toBe('testarray');
      expect(SearchSanitizer.sanitizeQuery('test\\escape')).toBe('testescape');
    });
  });

  describe('sanitizeQueryWithValidation', () => {
    it('should return valid result for good input', () => {
      const result = SearchSanitizer.sanitizeQueryWithValidation('test query');
      expect(result.query).toBe('test query');
      expect(result.isValid).toBe(true);
      expect(result.originalLength).toBe(10);
    });

    it('should return invalid result for empty input', () => {
      const result = SearchSanitizer.sanitizeQueryWithValidation('');
      expect(result.query).toBe('');
      expect(result.isValid).toBe(false);
      expect(result.originalLength).toBe(0);
    });

    it('should track original length before sanitization', () => {
      const result = SearchSanitizer.sanitizeQueryWithValidation('<script>test</script>');
      expect(result.originalLength).toBe(21);
      expect(result.query).not.toBe('');
    });
  });

  describe('sanitizeNumber', () => {
    it('should return default for invalid inputs', () => {
      expect(SearchSanitizer.sanitizeNumber('abc', 10, 1, 100)).toBe(10);
      expect(SearchSanitizer.sanitizeNumber(null as any, 10, 1, 100)).toBe(10);
      expect(SearchSanitizer.sanitizeNumber(undefined, 10, 1, 100)).toBe(10);
    });

    it('should parse string numbers', () => {
      expect(SearchSanitizer.sanitizeNumber('42', 10, 1, 100)).toBe(42);
      expect(SearchSanitizer.sanitizeNumber('0', 10, 0, 100)).toBe(0);
    });

    it('should enforce minimum value', () => {
      expect(SearchSanitizer.sanitizeNumber(5, 10, 10, 100)).toBe(10);
      expect(SearchSanitizer.sanitizeNumber(-5, 10, 0, 100)).toBe(0);
    });

    it('should enforce maximum value', () => {
      expect(SearchSanitizer.sanitizeNumber(150, 10, 1, 100)).toBe(100);
      expect(SearchSanitizer.sanitizeNumber(1000, 10, 1, 100)).toBe(100);
    });

    it('should handle valid numbers within range', () => {
      expect(SearchSanitizer.sanitizeNumber(50, 10, 1, 100)).toBe(50);
      expect(SearchSanitizer.sanitizeNumber(1, 10, 1, 100)).toBe(1);
      expect(SearchSanitizer.sanitizeNumber(100, 10, 1, 100)).toBe(100);
    });

    it('should handle float conversion to int', () => {
      expect(SearchSanitizer.sanitizeNumber(42.7, 10, 1, 100)).toBe(42);
      expect(SearchSanitizer.sanitizeNumber('42.7', 10, 1, 100)).toBe(42);
    });
  });

  describe('sanitizeCoordinate', () => {
    it('should validate latitude range', () => {
      expect(SearchSanitizer.sanitizeCoordinate(45.5, 'lat')).toBe(45.5);
      expect(SearchSanitizer.sanitizeCoordinate(100, 'lat')).toBeNull();
      expect(SearchSanitizer.sanitizeCoordinate(-100, 'lat')).toBeNull();
    });

    it('should validate longitude range', () => {
      expect(SearchSanitizer.sanitizeCoordinate(-122.4, 'lon')).toBe(-122.4);
      expect(SearchSanitizer.sanitizeCoordinate(200, 'lon')).toBeNull();
      expect(SearchSanitizer.sanitizeCoordinate(-200, 'lon')).toBeNull();
    });

    it('should handle edge cases', () => {
      expect(SearchSanitizer.sanitizeCoordinate(90, 'lat')).toBe(90);
      expect(SearchSanitizer.sanitizeCoordinate(-90, 'lat')).toBe(-90);
      expect(SearchSanitizer.sanitizeCoordinate(180, 'lon')).toBe(180);
      expect(SearchSanitizer.sanitizeCoordinate(-180, 'lon')).toBe(-180);
    });

    it('should return null for invalid inputs', () => {
      expect(SearchSanitizer.sanitizeCoordinate('abc' as any, 'lat')).toBeNull();
      expect(SearchSanitizer.sanitizeCoordinate(NaN, 'lat')).toBeNull();
      expect(SearchSanitizer.sanitizeCoordinate(Infinity, 'lat')).toBeNull();
    });
  });

  describe('sanitizeFilters', () => {
    it('should return empty object for non-objects', () => {
      expect(SearchSanitizer.sanitizeFilters('not an object' as any)).toEqual({});
      expect(SearchSanitizer.sanitizeFilters(null as any)).toEqual({});
      expect(SearchSanitizer.sanitizeFilters(undefined as any)).toEqual({});
    });

    it('should sanitize whitelisted string fields', () => {
      const input = {
        status: 'active<script>',
        type: 'concert'
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result.status).toBe('activescript');
      expect(result.type).toBe('concert');
    });

    it('should preserve numeric fields', () => {
      const input = {
        priceMin: 100,
        priceMax: 500,
        capacityMin: 1000
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result.priceMin).toBe(100);
      expect(result.priceMax).toBe(500);
      expect(result.capacityMin).toBe(1000);
    });

    it('should sanitize array fields', () => {
      const input = {
        categories: ['music<script>', 'sports', 'theater'],
        venues: ['venue1', 'venue2']
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result.categories).toEqual(['musicscript', 'sports', 'theater']);
      expect(result.venues).toEqual(['venue1', 'venue2']);
    });

    it('should limit array sizes', () => {
      const input = {
        categories: Array(100).fill('test')
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result.categories).toHaveLength(50);
    });

    it('should ignore non-whitelisted fields', () => {
      const input = {
        status: 'active',
        maliciousField: 'should not appear',
        __proto__: 'dangerous',
        constructor: 'bad'
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result.status).toBe('active');
      expect(result).not.toHaveProperty('maliciousField');
      expect(result).not.toHaveProperty('__proto__');
      expect(result).not.toHaveProperty('constructor');
    });

    it('should handle date fields', () => {
      const input = {
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31'
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result.dateFrom).toBe('2024-01-01');
      expect(result.dateTo).toBe('2024-12-31');
    });

    it('should skip null and undefined values', () => {
      const input = {
        status: null,
        type: undefined,
        priceMin: 100
      };
      const result = SearchSanitizer.sanitizeFilters(input);
      expect(result).not.toHaveProperty('status');
      expect(result).not.toHaveProperty('type');
      expect(result.priceMin).toBe(100);
    });
  });

  describe('Edge cases and security', () => {
    it('should handle very long strings efficiently', () => {
      const longString = 'x'.repeat(1000);
      const start = Date.now();
      const result = SearchSanitizer.sanitizeQuery(longString);
      const duration = Date.now() - start;
      
      expect(result.length).toBeLessThanOrEqual(200);
      expect(duration).toBeLessThan(100); // Should complete quickly
    });

    it('should handle multiple dangerous characters together', () => {
      const malicious = '<script>alert(1)</script>"\';&|$\\';
      const result = SearchSanitizer.sanitizeQuery(malicious);
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
      expect(result).not.toContain('"');
      expect(result).not.toContain("'");
      expect(result).not.toContain(';');
      expect(result).not.toContain('&');
      expect(result).not.toContain('|');
      expect(result).not.toContain('$');
      expect(result).not.toContain('\\');
    });

    it('should handle empty strings correctly', () => {
      expect(SearchSanitizer.sanitizeQuery('')).toBe('');
      expect(SearchSanitizer.sanitizeQuery('   ')).toBe('');
    });

    it('should handle non-string types gracefully', () => {
      expect(SearchSanitizer.sanitizeQuery(123 as any)).toBe('');
      expect(SearchSanitizer.sanitizeQuery({} as any)).toBe('');
      expect(SearchSanitizer.sanitizeQuery([] as any)).toBe('');
    });
  });
});
