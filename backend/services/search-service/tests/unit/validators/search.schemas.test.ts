// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/validators/search.schemas.ts
 */

describe('src/validators/search.schemas.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  // =============================================================================
  // searchQuerySchema - Valid Cases
  // =============================================================================

  describe('searchQuerySchema - Valid Cases', () => {
    it('should accept valid search query', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ q: 'test', limit: 20 });

      expect(error).toBeUndefined();
    });

    it('should accept empty query string', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ q: '' });

      expect(error).toBeUndefined();
    });

    it('should accept query without q parameter', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ limit: 10 });

      expect(error).toBeUndefined();
    });

    it('should accept venues type', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ type: 'venues' });

      expect(error).toBeUndefined();
    });

    it('should accept events type', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ type: 'events' });

      expect(error).toBeUndefined();
    });

    it('should apply default limit of 20', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { value } = searchQuerySchema.validate({});

      expect(value.limit).toBe(20);
    });

    it('should apply default offset of 0', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { value } = searchQuerySchema.validate({});

      expect(value.offset).toBe(0);
    });

    it('should accept limit at minimum (1)', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ limit: 1 });

      expect(error).toBeUndefined();
    });

    it('should accept limit at maximum (100)', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ limit: 100 });

      expect(error).toBeUndefined();
    });

    it('should accept offset at minimum (0)', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ offset: 0 });

      expect(error).toBeUndefined();
    });

    it('should accept offset at maximum (10000)', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ offset: 10000 });

      expect(error).toBeUndefined();
    });

    it('should strip unknown fields', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { value } = searchQuerySchema.validate({ q: 'test', unknown: 'field' });

      expect(value.unknown).toBeUndefined();
    });
  });

  // =============================================================================
  // searchQuerySchema - Invalid Cases
  // =============================================================================

  describe('searchQuerySchema - Invalid Cases', () => {
    it('should reject query longer than 200 characters', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');
      const longQuery = 'a'.repeat(201);

      const { error } = searchQuerySchema.validate({ q: longQuery });

      expect(error).toBeDefined();
    });

    it('should reject invalid type', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ type: 'invalid' });

      expect(error).toBeDefined();
    });

    it('should reject limit below minimum', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ limit: 0 });

      expect(error).toBeDefined();
    });

    it('should reject limit above maximum', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ limit: 101 });

      expect(error).toBeDefined();
    });

    it('should reject non-integer limit', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ limit: 10.5 });

      expect(error).toBeDefined();
    });

    it('should reject negative offset', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ offset: -1 });

      expect(error).toBeDefined();
    });

    it('should reject offset above maximum', () => {
      const { searchQuerySchema } = require('../../../src/validators/search.schemas');

      const { error } = searchQuerySchema.validate({ offset: 10001 });

      expect(error).toBeDefined();
    });
  });

  // =============================================================================
  // venueSearchSchema - Valid Cases
  // =============================================================================

  describe('venueSearchSchema - Valid Cases', () => {
    it('should accept valid venue search', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ q: 'stadium', city: 'NYC' });

      expect(error).toBeUndefined();
    });

    it('should accept capacity_min', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ capacity_min: 1000 });

      expect(error).toBeUndefined();
    });

    it('should accept capacity_max', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ capacity_max: 5000 });

      expect(error).toBeUndefined();
    });

    it('should accept city filter', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ city: 'Los Angeles' });

      expect(error).toBeUndefined();
    });

    it('should apply default limit', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { value } = venueSearchSchema.validate({});

      expect(value.limit).toBe(20);
    });
  });

  // =============================================================================
  // venueSearchSchema - Invalid Cases
  // =============================================================================

  describe('venueSearchSchema - Invalid Cases', () => {
    it('should reject city longer than 100 characters', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ city: 'a'.repeat(101) });

      expect(error).toBeDefined();
    });

    it('should reject negative capacity_min', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ capacity_min: -1 });

      expect(error).toBeDefined();
    });

    it('should reject negative capacity_max', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ capacity_max: -1 });

      expect(error).toBeDefined();
    });

    it('should reject non-integer capacity', () => {
      const { venueSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = venueSearchSchema.validate({ capacity_min: 100.5 });

      expect(error).toBeDefined();
    });
  });

  // =============================================================================
  // eventSearchSchema - Valid Cases
  // =============================================================================

  describe('eventSearchSchema - Valid Cases', () => {
    it('should accept valid event search', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ q: 'concert', category: 'music' });

      expect(error).toBeUndefined();
    });

    it('should accept date_from', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ date_from: '2024-01-01' });

      expect(error).toBeUndefined();
    });

    it('should accept date_to after date_from', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({
        date_from: '2024-01-01',
        date_to: '2024-12-31'
      });

      expect(error).toBeUndefined();
    });

    it('should accept category filter', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ category: 'sports' });

      expect(error).toBeUndefined();
    });

    it('should accept venue_id filter', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ venue_id: 'venue-123' });

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // eventSearchSchema - Invalid Cases
  // =============================================================================

  describe('eventSearchSchema - Invalid Cases', () => {
    it('should reject date_to before date_from', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({
        date_from: '2024-12-31',
        date_to: '2024-01-01'
      });

      expect(error).toBeDefined();
    });

    it('should reject invalid ISO date', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ date_from: 'not-a-date' });

      expect(error).toBeDefined();
    });

    it('should reject category longer than 50 characters', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ category: 'a'.repeat(51) });

      expect(error).toBeDefined();
    });

    it('should reject venue_id longer than 100 characters', () => {
      const { eventSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = eventSearchSchema.validate({ venue_id: 'a'.repeat(101) });

      expect(error).toBeDefined();
    });
  });

  // =============================================================================
  // suggestSchema - Valid Cases
  // =============================================================================

  describe('suggestSchema - Valid Cases', () => {
    it('should accept valid suggest query', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'rock' });

      expect(error).toBeUndefined();
    });

    it('should accept query at minimum length (1)', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'a' });

      expect(error).toBeUndefined();
    });

    it('should accept query at maximum length (100)', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'a'.repeat(100) });

      expect(error).toBeUndefined();
    });

    it('should apply default limit of 10', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { value } = suggestSchema.validate({ q: 'test' });

      expect(value.limit).toBe(10);
    });

    it('should accept custom limit', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'test', limit: 15 });

      expect(error).toBeUndefined();
    });

    it('should accept limit at maximum (20)', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'test', limit: 20 });

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // suggestSchema - Invalid Cases
  // =============================================================================

  describe('suggestSchema - Invalid Cases', () => {
    it('should reject missing query', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({});

      expect(error).toBeDefined();
    });

    it('should reject empty query', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: '' });

      expect(error).toBeDefined();
    });

    it('should reject query longer than 100 characters', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'a'.repeat(101) });

      expect(error).toBeDefined();
    });

    it('should reject limit above maximum', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'test', limit: 21 });

      expect(error).toBeDefined();
    });

    it('should reject limit below minimum', () => {
      const { suggestSchema } = require('../../../src/validators/search.schemas');

      const { error } = suggestSchema.validate({ q: 'test', limit: 0 });

      expect(error).toBeDefined();
    });
  });

  // =============================================================================
  // geoSearchSchema - Valid Cases
  // =============================================================================

  describe('geoSearchSchema - Valid Cases', () => {
    it('should accept valid coordinates', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 40.7128, lon: -74.0060 });

      expect(error).toBeUndefined();
    });

    it('should accept latitude at minimum (-90)', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: -90, lon: 0 });

      expect(error).toBeUndefined();
    });

    it('should accept latitude at maximum (90)', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 90, lon: 0 });

      expect(error).toBeUndefined();
    });

    it('should accept longitude at minimum (-180)', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: -180 });

      expect(error).toBeUndefined();
    });

    it('should accept longitude at maximum (180)', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 180 });

      expect(error).toBeUndefined();
    });

    it('should apply default radius of 10', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { value } = geoSearchSchema.validate({ lat: 0, lon: 0 });

      expect(value.radius).toBe(10);
    });

    it('should accept custom radius', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 0, radius: 50 });

      expect(error).toBeUndefined();
    });

    it('should accept radius at minimum (0.1)', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 0, radius: 0.1 });

      expect(error).toBeUndefined();
    });

    it('should accept radius at maximum (100)', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 0, radius: 100 });

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // geoSearchSchema - Invalid Cases
  // =============================================================================

  describe('geoSearchSchema - Invalid Cases', () => {
    it('should reject missing latitude', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lon: 0 });

      expect(error).toBeDefined();
    });

    it('should reject missing longitude', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0 });

      expect(error).toBeDefined();
    });

    it('should reject latitude below -90', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: -91, lon: 0 });

      expect(error).toBeDefined();
    });

    it('should reject latitude above 90', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 91, lon: 0 });

      expect(error).toBeDefined();
    });

    it('should reject longitude below -180', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: -181 });

      expect(error).toBeDefined();
    });

    it('should reject longitude above 180', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 181 });

      expect(error).toBeDefined();
    });

    it('should reject radius below minimum', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 0, radius: 0.05 });

      expect(error).toBeDefined();
    });

    it('should reject radius above maximum', () => {
      const { geoSearchSchema } = require('../../../src/validators/search.schemas');

      const { error } = geoSearchSchema.validate({ lat: 0, lon: 0, radius: 101 });

      expect(error).toBeDefined();
    });
  });

  // =============================================================================
  // filterSchema - Valid Cases
  // =============================================================================

  describe('filterSchema - Valid Cases', () => {
    it('should accept valid price filters', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ priceMin: 10, priceMax: 100 });

      expect(error).toBeUndefined();
    });

    it('should accept valid date filters', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31'
      });

      expect(error).toBeUndefined();
    });

    it('should accept categories array', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ categories: ['music', 'sports'] });

      expect(error).toBeUndefined();
    });

    it('should accept venues array', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ venues: ['venue-1', 'venue-2'] });

      expect(error).toBeUndefined();
    });

    it('should accept capacity filters', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ capacityMin: 100, capacityMax: 1000 });

      expect(error).toBeUndefined();
    });

    it('should accept valid status', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ status: 'active' });

      expect(error).toBeUndefined();
    });

    it('should accept type filter', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ type: 'event' });

      expect(error).toBeUndefined();
    });
  });

  // =============================================================================
  // filterSchema - Invalid Cases
  // =============================================================================

  describe('filterSchema - Invalid Cases', () => {
    it('should reject negative priceMin', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ priceMin: -1 });

      expect(error).toBeDefined();
    });

    it('should reject negative priceMax', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ priceMax: -1 });

      expect(error).toBeDefined();
    });

    it('should reject invalid date format', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ dateFrom: 'invalid' });

      expect(error).toBeDefined();
    });

    it('should reject categories array exceeding max', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');
      const largeArray = Array.from({ length: 11 }, (_, i) => `cat${i}`);

      const { error } = filterSchema.validate({ categories: largeArray });

      expect(error).toBeDefined();
    });

    it('should reject category string longer than 50 characters', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ categories: ['a'.repeat(51)] });

      expect(error).toBeDefined();
    });

    it('should reject venues array exceeding max', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');
      const largeArray = Array.from({ length: 11 }, (_, i) => `venue${i}`);

      const { error } = filterSchema.validate({ venues: largeArray });

      expect(error).toBeDefined();
    });

    it('should reject venue string longer than 100 characters', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ venues: ['a'.repeat(101)] });

      expect(error).toBeDefined();
    });

    it('should reject negative capacityMin', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ capacityMin: -1 });

      expect(error).toBeDefined();
    });

    it('should reject invalid status', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ status: 'invalid' });

      expect(error).toBeDefined();
    });

    it('should reject type longer than 50 characters', () => {
      const { filterSchema } = require('../../../src/validators/search.schemas');

      const { error } = filterSchema.validate({ type: 'a'.repeat(51) });

      expect(error).toBeDefined();
    });
  });

  // =============================================================================
  // validateSearchQuery() Function
  // =============================================================================

  describe('validateSearchQuery() Function', () => {
    it('should return no error for valid data', () => {
      const { validateSearchQuery } = require('../../../src/validators/search.schemas');

      const { error } = validateSearchQuery({ q: 'test', limit: 20 });

      expect(error).toBeUndefined();
    });

    it('should return error for invalid data', () => {
      const { validateSearchQuery } = require('../../../src/validators/search.schemas');

      const { error } = validateSearchQuery({ limit: -1 });

      expect(error).toBeDefined();
    });

    it('should return validated value', () => {
      const { validateSearchQuery } = require('../../../src/validators/search.schemas');

      const { value } = validateSearchQuery({ q: 'test' });

      expect(value).toBeDefined();
      expect(value.q).toBe('test');
    });

    it('should not abort early on multiple errors', () => {
      const { validateSearchQuery } = require('../../../src/validators/search.schemas');

      const { error } = validateSearchQuery({ limit: -1, offset: -1 });

      expect(error.details.length).toBeGreaterThan(1);
    });
  });

  // =============================================================================
  // validateVenueSearch() Function
  // =============================================================================

  describe('validateVenueSearch() Function', () => {
    it('should return no error for valid data', () => {
      const { validateVenueSearch } = require('../../../src/validators/search.schemas');

      const { error } = validateVenueSearch({ q: 'stadium', city: 'NYC' });

      expect(error).toBeUndefined();
    });

    it('should return error for invalid data', () => {
      const { validateVenueSearch } = require('../../../src/validators/search.schemas');

      const { error } = validateVenueSearch({ capacity_min: -1 });

      expect(error).toBeDefined();
    });

    it('should return validated value', () => {
      const { validateVenueSearch } = require('../../../src/validators/search.schemas');

      const { value } = validateVenueSearch({ city: 'NYC' });

      expect(value.city).toBe('NYC');
    });
  });

  // =============================================================================
  // validateEventSearch() Function
  // =============================================================================

  describe('validateEventSearch() Function', () => {
    it('should return no error for valid data', () => {
      const { validateEventSearch } = require('../../../src/validators/search.schemas');

      const { error } = validateEventSearch({ q: 'concert', category: 'music' });

      expect(error).toBeUndefined();
    });

    it('should return error for invalid data', () => {
      const { validateEventSearch } = require('../../../src/validators/search.schemas');

      const { error } = validateEventSearch({
        date_from: '2024-12-31',
        date_to: '2024-01-01'
      });

      expect(error).toBeDefined();
    });

    it('should return validated value', () => {
      const { validateEventSearch } = require('../../../src/validators/search.schemas');

      const { value } = validateEventSearch({ category: 'sports' });

      expect(value.category).toBe('sports');
    });
  });

  // =============================================================================
  // validateSuggest() Function
  // =============================================================================

  describe('validateSuggest() Function', () => {
    it('should return no error for valid data', () => {
      const { validateSuggest } = require('../../../src/validators/search.schemas');

      const { error } = validateSuggest({ q: 'rock' });

      expect(error).toBeUndefined();
    });

    it('should return error for missing query', () => {
      const { validateSuggest } = require('../../../src/validators/search.schemas');

      const { error } = validateSuggest({});

      expect(error).toBeDefined();
    });

    it('should return validated value', () => {
      const { validateSuggest } = require('../../../src/validators/search.schemas');

      const { value } = validateSuggest({ q: 'rock' });

      expect(value.q).toBe('rock');
      expect(value.limit).toBe(10);
    });
  });

  // =============================================================================
  // validateGeoSearch() Function
  // =============================================================================

  describe('validateGeoSearch() Function', () => {
    it('should return no error for valid data', () => {
      const { validateGeoSearch } = require('../../../src/validators/search.schemas');

      const { error } = validateGeoSearch({ lat: 40.7128, lon: -74.0060 });

      expect(error).toBeUndefined();
    });

    it('should return error for missing coordinates', () => {
      const { validateGeoSearch } = require('../../../src/validators/search.schemas');

      const { error } = validateGeoSearch({ lat: 40.7128 });

      expect(error).toBeDefined();
    });

    it('should return validated value', () => {
      const { validateGeoSearch } = require('../../../src/validators/search.schemas');

      const { value } = validateGeoSearch({ lat: 40.7128, lon: -74.0060 });

      expect(value.lat).toBe(40.7128);
      expect(value.lon).toBe(-74.006);
      expect(value.radius).toBe(10);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export all schemas', () => {
      const module = require('../../../src/validators/search.schemas');

      expect(module.searchQuerySchema).toBeDefined();
      expect(module.venueSearchSchema).toBeDefined();
      expect(module.eventSearchSchema).toBeDefined();
      expect(module.suggestSchema).toBeDefined();
      expect(module.geoSearchSchema).toBeDefined();
      expect(module.filterSchema).toBeDefined();
    });

    it('should export all validation functions', () => {
      const module = require('../../../src/validators/search.schemas');

      expect(module.validateSearchQuery).toBeDefined();
      expect(module.validateVenueSearch).toBeDefined();
      expect(module.validateEventSearch).toBeDefined();
      expect(module.validateSuggest).toBeDefined();
      expect(module.validateGeoSearch).toBeDefined();
    });

    it('should have all functions as functions', () => {
      const module = require('../../../src/validators/search.schemas');

      expect(typeof module.validateSearchQuery).toBe('function');
      expect(typeof module.validateVenueSearch).toBe('function');
      expect(typeof module.validateEventSearch).toBe('function');
      expect(typeof module.validateSuggest).toBe('function');
      expect(typeof module.validateGeoSearch).toBe('function');
    });
  });
});
