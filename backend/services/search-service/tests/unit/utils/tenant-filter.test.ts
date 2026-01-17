// @ts-nocheck
/**
 * Comprehensive Unit Tests for src/utils/tenant-filter.ts
 */

describe('src/utils/tenant-filter.ts - Comprehensive Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  // =============================================================================
  // addTenantFilter() - Cross-Tenant Access
  // =============================================================================

  describe('addTenantFilter() - Cross-Tenant Access', () => {
    it('should skip filter when allowCrossTenant is true', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: 'venue-1', allowCrossTenant: true };

      const result = addTenantFilter(query, options);

      expect(result).toEqual({ match_all: {} });
    });

    it('should return original query when cross-tenant allowed', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { term: { status: 'active' } };
      const options = { venueId: 'venue-1', allowCrossTenant: true };

      const result = addTenantFilter(query, options);

      expect(result).toBe(query);
    });

    it('should not add venue_id filter for admin with allowCrossTenant', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: 'venue-1', allowCrossTenant: true };

      const result = addTenantFilter(query, options);

      expect(result.bool?.filter).toBeUndefined();
    });
  });

  // =============================================================================
  // addTenantFilter() - VenueId Validation
  // =============================================================================

  describe('addTenantFilter() - VenueId Validation', () => {
    it('should throw when venueId is missing', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: '', allowCrossTenant: false };

      expect(() => addTenantFilter(query, options)).toThrow('venueId is required for tenant isolation');
    });

    it('should throw when venueId is null', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: null, allowCrossTenant: false };

      expect(() => addTenantFilter(query, options)).toThrow('venueId is required for tenant isolation');
    });

    it('should throw when venueId is undefined', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: undefined, allowCrossTenant: false };

      expect(() => addTenantFilter(query, options)).toThrow('venueId is required for tenant isolation');
    });

    it('should not throw when allowCrossTenant is true even without venueId', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: null, allowCrossTenant: true };

      expect(() => addTenantFilter(query, options)).not.toThrow();
    });
  });

  // =============================================================================
  // addTenantFilter() - Query Wrapping
  // =============================================================================

  describe('addTenantFilter() - Query Wrapping', () => {
    it('should wrap simple query without bool structure', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { term: { status: 'active' } };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(result.bool).toBeDefined();
      expect(result.bool.must).toEqual([{ term: { status: 'active' } }]);
    });

    it('should handle match_all query', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(result.bool.must).toEqual([]);
    });

    it('should preserve existing bool structure', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = {
        bool: {
          must: [{ term: { status: 'active' } }]
        }
      };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(result.bool.must).toEqual([{ term: { status: 'active' } }]);
    });

    it('should create filter array if missing', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = {
        bool: {
          must: [{ term: { status: 'active' } }]
        }
      };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(Array.isArray(result.bool.filter)).toBe(true);
    });

    it('should convert single filter object to array', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = {
        bool: {
          must: [],
          filter: { term: { status: 'active' } }
        }
      };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(Array.isArray(result.bool.filter)).toBe(true);
      expect(result.bool.filter).toContainEqual({ term: { status: 'active' } });
    });

    it('should preserve existing filters in array', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = {
        bool: {
          must: [],
          filter: [
            { term: { status: 'active' } },
            { range: { date: { gte: '2024-01-01' } } }
          ]
        }
      };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(result.bool.filter).toHaveLength(3);
      expect(result.bool.filter[0]).toEqual({ term: { status: 'active' } });
      expect(result.bool.filter[1]).toEqual({ range: { date: { gte: '2024-01-01' } } });
    });
  });

  // =============================================================================
  // addTenantFilter() - Venue Filter Addition
  // =============================================================================

  describe('addTenantFilter() - Venue Filter Addition', () => {
    it('should add venue_id term filter', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: 'venue-123' };

      const result = addTenantFilter(query, options);

      expect(result.bool.filter).toContainEqual({
        term: { venue_id: 'venue-123' }
      });
    });

    it('should use correct venueId value', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: 'my-custom-venue-id' };

      const result = addTenantFilter(query, options);

      const venueFilter = result.bool.filter.find(f => f.term?.venue_id);
      expect(venueFilter.term.venue_id).toBe('my-custom-venue-id');
    });

    it('should add filter to end of filter array', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = {
        bool: {
          filter: [{ term: { status: 'active' } }]
        }
      };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(result.bool.filter[result.bool.filter.length - 1]).toEqual({
        term: { venue_id: 'venue-1' }
      });
    });

    it('should return modified query object', () => {
      const { addTenantFilter } = require('../../../src/utils/tenant-filter');
      const query = { match_all: {} };
      const options = { venueId: 'venue-1' };

      const result = addTenantFilter(query, options);

      expect(result).toBeDefined();
      expect(result.bool).toBeDefined();
    });
  });

  // =============================================================================
  // validateVenueId() - Success Cases
  // =============================================================================

  describe('validateVenueId() - Success Cases', () => {
    it('should accept valid string venueId', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      const result = validateVenueId('venue-123');

      expect(result).toBe('venue-123');
    });

    it('should return the same venueId', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      const result = validateVenueId('my-venue');

      expect(result).toBe('my-venue');
    });

    it('should accept single character venueId', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      const result = validateVenueId('a');

      expect(result).toBe('a');
    });

    it('should accept 100 character venueId', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');
      const longId = 'a'.repeat(100);

      const result = validateVenueId(longId);

      expect(result).toBe(longId);
    });

    it('should accept UUID format', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      const result = validateVenueId('550e8400-e29b-41d4-a716-446655440000');

      expect(result).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  // =============================================================================
  // validateVenueId() - Error Cases
  // =============================================================================

  describe('validateVenueId() - Error Cases', () => {
    it('should throw for null venueId', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId(null)).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for undefined venueId', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId(undefined)).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for empty string', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId('')).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for number', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId(123)).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for object', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId({})).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for array', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId([])).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for boolean', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');

      expect(() => validateVenueId(true)).toThrow('Invalid venueId: must be a non-empty string');
    });

    it('should throw for venueId over 100 characters', () => {
      const { validateVenueId } = require('../../../src/utils/tenant-filter');
      const longId = 'a'.repeat(101);

      expect(() => validateVenueId(longId)).toThrow('Invalid venueId: length must be between 1 and 100 characters');
    });
  });

  // =============================================================================
  // canAccessCrossTenant() - Role Checks
  // =============================================================================

  describe('canAccessCrossTenant() - Role Checks', () => {
    it('should allow admin role', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('admin');

      expect(result).toBe(true);
    });

    it('should allow super-admin role', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('super-admin');

      expect(result).toBe(true);
    });

    it('should allow system role', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('system');

      expect(result).toBe(true);
    });

    it('should deny user role', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('user');

      expect(result).toBe(false);
    });

    it('should deny editor role', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('editor');

      expect(result).toBe(false);
    });

    it('should deny viewer role', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('viewer');

      expect(result).toBe(false);
    });

    it('should be case-insensitive for admin', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      expect(canAccessCrossTenant('ADMIN')).toBe(true);
      expect(canAccessCrossTenant('Admin')).toBe(true);
      expect(canAccessCrossTenant('aDmIn')).toBe(true);
    });

    it('should be case-insensitive for super-admin', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      expect(canAccessCrossTenant('SUPER-ADMIN')).toBe(true);
      expect(canAccessCrossTenant('Super-Admin')).toBe(true);
    });

    it('should be case-insensitive for system', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      expect(canAccessCrossTenant('SYSTEM')).toBe(true);
      expect(canAccessCrossTenant('System')).toBe(true);
    });

    it('should deny unknown roles', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      expect(canAccessCrossTenant('unknown')).toBe(false);
      expect(canAccessCrossTenant('moderator')).toBe(false);
      expect(canAccessCrossTenant('guest')).toBe(false);
    });

    it('should deny empty string', () => {
      const { canAccessCrossTenant } = require('../../../src/utils/tenant-filter');

      const result = canAccessCrossTenant('');

      expect(result).toBe(false);
    });
  });

  // =============================================================================
  // Module Exports
  // =============================================================================

  describe('Module Exports', () => {
    it('should export addTenantFilter', () => {
      const module = require('../../../src/utils/tenant-filter');

      expect(module.addTenantFilter).toBeDefined();
      expect(typeof module.addTenantFilter).toBe('function');
    });

    it('should export validateVenueId', () => {
      const module = require('../../../src/utils/tenant-filter');

      expect(module.validateVenueId).toBeDefined();
      expect(typeof module.validateVenueId).toBe('function');
    });

    it('should export canAccessCrossTenant', () => {
      const module = require('../../../src/utils/tenant-filter');

      expect(module.canAccessCrossTenant).toBeDefined();
      expect(typeof module.canAccessCrossTenant).toBe('function');
    });
  });
});
