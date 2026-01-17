// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/sanitizer.ts
 */

describe('src/utils/sanitizer.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  // =============================================================================
  // sanitizeQuery() - Success Cases
  // =============================================================================

  describe('sanitizeQuery() - Success Cases', () => {
    it('should return clean query unchanged', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('hello world');

      expect(result).toBe('hello world');
    });

    it('should trim whitespace', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('  hello world  ');

      expect(result).toBe('hello world');
    });

    it('should handle alphanumeric input', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test123');

      expect(result).toBe('test123');
    });

    it('should handle spaces in query', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('rock concert tickets');

      expect(result).toBe('rock concert tickets');
    });

    it('should handle hyphens and underscores', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test-query_string');

      expect(result).toBe('test-query_string');
    });
  });

  // =============================================================================
  // sanitizeQuery() - Dangerous Character Removal
  // =============================================================================

  describe('sanitizeQuery() - Dangerous Character Removal', () => {
    it('should remove HTML tags', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('<script>alert("xss")</script>');

      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should remove curly braces', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test{malicious}');

      expect(result).not.toContain('{');
      expect(result).not.toContain('}');
    });

    it('should remove square brackets', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test[array]');

      expect(result).not.toContain('[');
      expect(result).not.toContain(']');
    });

    it('should remove backslashes', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test\\escape');

      expect(result).not.toContain('\\');
    });

    it('should remove single quotes', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery("test'quote");

      expect(result).not.toContain("'");
    });

    it('should remove double quotes', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test"quote');

      expect(result).not.toContain('"');
    });

    it('should remove semicolons', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test;command');

      expect(result).not.toContain(';');
    });

    it('should remove pipes', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test|command');

      expect(result).not.toContain('|');
    });

    it('should remove ampersands', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test&command');

      expect(result).not.toContain('&');
    });

    it('should remove dollar signs', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test$variable');

      expect(result).not.toContain('$');
    });

    it('should remove null bytes', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('test\0null');

      expect(result).not.toContain('\0');
    });
  });

  // =============================================================================
  // sanitizeQuery() - Edge Cases
  // =============================================================================

  describe('sanitizeQuery() - Edge Cases', () => {
    it('should return empty string for null', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery(null);

      expect(result).toBe('');
    });

    it('should return empty string for undefined', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery(undefined);

      expect(result).toBe('');
    });

    it('should return empty string for empty string', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery('');

      expect(result).toBe('');
    });

    it('should return empty string for number', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery(123);

      expect(result).toBe('');
    });

    it('should return empty string for object', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery({});

      expect(result).toBe('');
    });

    it('should return empty string for array', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQuery([]);

      expect(result).toBe('');
    });

    it('should truncate to max length', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');
      const longQuery = 'a'.repeat(300);

      const result = SearchSanitizer.sanitizeQuery(longQuery);

      expect(result.length).toBe(200);
    });

    it('should handle query at exact max length', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');
      const query = 'a'.repeat(200);

      const result = SearchSanitizer.sanitizeQuery(query);

      expect(result.length).toBe(200);
    });
  });

  // =============================================================================
  // sanitizeQueryWithValidation() - Return Structure
  // =============================================================================

  describe('sanitizeQueryWithValidation() - Return Structure', () => {
    it('should return object with query, isValid, originalLength', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation('test');

      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('originalLength');
    });

    it('should return sanitized query', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation('hello<world>');

      expect(result.query).toBe('helloworld');
    });

    it('should mark valid query as valid', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation('hello');

      expect(result.isValid).toBe(true);
    });

    it('should mark empty result as invalid', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation('');

      expect(result.isValid).toBe(false);
    });

    it('should return original length', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation('hello world');

      expect(result.originalLength).toBe(11);
    });

    it('should track original length before sanitization', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation('test<>{}');

      expect(result.originalLength).toBe(8);
      expect(result.query.length).toBeLessThan(8);
    });

    it('should handle null input', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeQueryWithValidation(null);

      expect(result.originalLength).toBe(0);
      expect(result.isValid).toBe(false);
    });
  });

  // =============================================================================
  // sanitizeFilters() - Whitelist Validation
  // =============================================================================

  describe('sanitizeFilters() - Whitelist Validation', () => {
    it('should return empty object for null', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters(null);

      expect(result).toEqual({});
    });

    it('should return empty object for undefined', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters(undefined);

      expect(result).toEqual({});
    });

    it('should return empty object for non-object', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters('not an object');

      expect(result).toEqual({});
    });

    it('should only include whitelisted fields', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');
      const filters = {
        priceMin: 10,
        maliciousField: 'bad',
        categories: ['music']
      };

      const result = SearchSanitizer.sanitizeFilters(filters);

      expect(result).toHaveProperty('priceMin');
      expect(result).toHaveProperty('categories');
      expect(result).not.toHaveProperty('maliciousField');
    });

    it('should include priceMin field', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMin: 10 });

      expect(result.priceMin).toBe(10);
    });

    it('should include priceMax field', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMax: 100 });

      expect(result.priceMax).toBe(100);
    });

    it('should include dateFrom field', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ dateFrom: '2024-01-01' });

      expect(result.dateFrom).toBe('2024-01-01');
    });

    it('should include dateTo field', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ dateTo: '2024-12-31' });

      expect(result.dateTo).toBe('2024-12-31');
    });

    it('should include categories field', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ categories: ['music', 'sports'] });

      expect(result.categories).toEqual(['music', 'sports']);
    });
  });

  // =============================================================================
  // sanitizeFilters() - Type Handling
  // =============================================================================

  describe('sanitizeFilters() - Type Handling', () => {
    it('should sanitize string values', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ status: 'test<script>' });

      expect(result.status).not.toContain('<');
    });

    it('should accept valid numbers', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMin: 50 });

      expect(result.priceMin).toBe(50);
    });

    it('should reject non-finite numbers', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMin: Infinity });

      expect(result.priceMin).toBeUndefined();
    });

    it('should reject NaN', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMin: NaN });

      expect(result.priceMin).toBeUndefined();
    });

    it('should sanitize array elements', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({
        categories: ['test<script>', 'valid']
      });

      expect(result.categories[0]).not.toContain('<');
      expect(result.categories[1]).toBe('valid');
    });

    it('should filter null from arrays', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({
        categories: ['valid', null, 'also valid']
      });

      expect(result.categories).toEqual(['valid', 'also valid']);
    });

    it('should filter undefined from arrays', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({
        categories: ['valid', undefined, 'also valid']
      });

      expect(result.categories).toEqual(['valid', 'also valid']);
    });

    it('should limit array size to 50', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');
      const largeArray = new Array(100).fill('item');

      const result = SearchSanitizer.sanitizeFilters({ categories: largeArray });

      expect(result.categories).toHaveLength(50);
    });

    it('should skip null filter values', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMin: null });

      expect(result.priceMin).toBeUndefined();
    });

    it('should skip undefined filter values', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeFilters({ priceMin: undefined });

      expect(result.priceMin).toBeUndefined();
    });
  });

  // =============================================================================
  // sanitizeNumber() - Success Cases
  // =============================================================================

  describe('sanitizeNumber() - Success Cases', () => {
    it('should parse valid number string', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber('42', 10, 0, 100);

      expect(result).toBe(42);
    });

    it('should pass through valid number', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(42, 10, 0, 100);

      expect(result).toBe(42);
    });

    it('should clamp to minimum', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(-10, 10, 0, 100);

      expect(result).toBe(0);
    });

    it('should clamp to maximum', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(200, 10, 0, 100);

      expect(result).toBe(100);
    });

    it('should allow value at minimum', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(0, 10, 0, 100);

      expect(result).toBe(0);
    });

    it('should allow value at maximum', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(100, 10, 0, 100);

      expect(result).toBe(100);
    });

    it('should return default for NaN', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber('invalid', 10, 0, 100);

      expect(result).toBe(10);
    });

    it('should return default for null', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(null, 20, 0, 100);

      expect(result).toBe(20);
    });

    it('should return default for undefined', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeNumber(undefined, 30, 0, 100);

      expect(result).toBe(30);
    });
  });

  // =============================================================================
  // sanitizeCoordinate() - Latitude
  // =============================================================================

  describe('sanitizeCoordinate() - Latitude', () => {
    it('should accept valid latitude', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate('40.7128', 'lat');

      expect(result).toBe(40.7128);
    });

    it('should accept latitude at minimum (-90)', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(-90, 'lat');

      expect(result).toBe(-90);
    });

    it('should accept latitude at maximum (90)', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(90, 'lat');

      expect(result).toBe(90);
    });

    it('should reject latitude below -90', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(-91, 'lat');

      expect(result).toBeNull();
    });

    it('should reject latitude above 90', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(91, 'lat');

      expect(result).toBeNull();
    });

    it('should return null for invalid latitude', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate('invalid', 'lat');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // sanitizeCoordinate() - Longitude
  // =============================================================================

  describe('sanitizeCoordinate() - Longitude', () => {
    it('should accept valid longitude', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate('-74.0060', 'lon');

      expect(result).toBe(-74.006);
    });

    it('should accept longitude at minimum (-180)', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(-180, 'lon');

      expect(result).toBe(-180);
    });

    it('should accept longitude at maximum (180)', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(180, 'lon');

      expect(result).toBe(180);
    });

    it('should reject longitude below -180', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(-181, 'lon');

      expect(result).toBeNull();
    });

    it('should reject longitude above 180', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate(181, 'lon');

      expect(result).toBeNull();
    });

    it('should return null for invalid longitude', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      const result = SearchSanitizer.sanitizeCoordinate('invalid', 'lon');

      expect(result).toBeNull();
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export SearchSanitizer class', () => {
      const module = require('../../../src/utils/sanitizer');

      expect(module.SearchSanitizer).toBeDefined();
    });

    it('should have sanitizeQuery static method', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      expect(typeof SearchSanitizer.sanitizeQuery).toBe('function');
    });

    it('should have sanitizeQueryWithValidation static method', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      expect(typeof SearchSanitizer.sanitizeQueryWithValidation).toBe('function');
    });

    it('should have sanitizeFilters static method', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      expect(typeof SearchSanitizer.sanitizeFilters).toBe('function');
    });

    it('should have sanitizeNumber static method', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      expect(typeof SearchSanitizer.sanitizeNumber).toBe('function');
    });

    it('should have sanitizeCoordinate static method', () => {
      const { SearchSanitizer } = require('../../../src/utils/sanitizer');

      expect(typeof SearchSanitizer.sanitizeCoordinate).toBe('function');
    });
  });
});
