/**
 * Tenant Filter Utility Tests
 * Tests for tenant isolation in Elasticsearch queries
 */

import { addTenantFilter, canAccessCrossTenant } from '../../../src/utils/tenant-filter';

describe('Tenant Filter Utility', () => {
  describe('canAccessCrossTenant', () => {
    it('should allow cross-tenant access for admin role', () => {
      expect(canAccessCrossTenant('admin')).toBe(true);
    });

    it('should allow cross-tenant access for super_admin role', () => {
      expect(canAccessCrossTenant('super_admin')).toBe(true);
    });

    it('should deny cross-tenant access for user role', () => {
      expect(canAccessCrossTenant('user')).toBe(false);
    });

    it('should deny cross-tenant access for manager role', () => {
      expect(canAccessCrossTenant('manager')).toBe(false);
    });

    it('should deny cross-tenant access for undefined role', () => {
      expect(canAccessCrossTenant(undefined as any)).toBe(false);
    });

    it('should deny cross-tenant access for empty string role', () => {
      expect(canAccessCrossTenant('')).toBe(false);
    });
  });

  describe('addTenantFilter', () => {
    const venueId = 'venue-123';

    it('should add tenant filter to simple query', () => {
      const query = { match: { name: 'test' } };
      const result = addTenantFilter(query, { venueId });

      expect(result).toEqual({
        bool: {
          must: [
            { match: { name: 'test' } },
            { term: { venue_id: venueId } }
          ]
        }
      });
    });

    it('should add tenant filter to bool query with must', () => {
      const query = {
        bool: {
          must: [
            { match: { name: 'test' } }
          ]
        }
      };
      const result = addTenantFilter(query, { venueId });

      expect(result.bool.must).toHaveLength(2);
      expect(result.bool.must[1]).toEqual({ term: { venue_id: venueId } });
    });

    it('should add tenant filter to bool query with should', () => {
      const query = {
        bool: {
          should: [
            { match: { name: 'test' } }
          ]
        }
      };
      const result = addTenantFilter(query, { venueId });

      expect(result.bool.must).toEqual([{ term: { venue_id: venueId } }]);
      expect(result.bool.should).toHaveLength(1);
    });

    it('should not add tenant filter for cross-tenant access', () => {
      const query = { match: { name: 'test' } };
      const result = addTenantFilter(query, { venueId, allowCrossTenant: true });

      expect(result).toEqual(query);
    });

    it('should not add duplicate tenant filters', () => {
      const query = {
        bool: {
          must: [
            { match: { name: 'test' } },
            { term: { venue_id: venueId } }
          ]
        }
      };
      const result = addTenantFilter(query, { venueId });

      // Should still only have 2 items in must array
      expect(result.bool.must).toHaveLength(2);
    });

    it('should handle match_all query', () => {
      const query = { match_all: {} };
      const result = addTenantFilter(query, { venueId });

      expect(result).toEqual({
        bool: {
          must: [
            { match_all: {} },
            { term: { venue_id: venueId } }
          ]
        }
      });
    });

    it('should preserve existing filters', () => {
      const query = {
        bool: {
          must: [{ match: { name: 'test' } }],
          filter: [{ range: { date: { gte: '2024-01-01' } } }]
        }
      };
      const result = addTenantFilter(query, { venueId });

      expect(result.bool.filter).toEqual(query.bool.filter);
      expect(result.bool.must).toHaveLength(2);
    });

    it('should throw error if venueId is missing and cross-tenant not allowed', () => {
      const query = { match: { name: 'test' } };
      
      expect(() => {
        addTenantFilter(query, { venueId: '', allowCrossTenant: false });
      }).toThrow('venueId is required for tenant isolation');
    });

    it('should handle complex nested bool queries', () => {
      const query = {
        bool: {
          must: [
            {
              bool: {
                should: [
                  { match: { name: 'test1' } },
                  { match: { name: 'test2' } }
                ]
              }
            }
          ]
        }
      };
      const result = addTenantFilter(query, { venueId });

      expect(result.bool.must).toHaveLength(2);
      expect(result.bool.must[0]).toEqual(query.bool.must[0]);
      expect(result.bool.must[1]).toEqual({ term: { venue_id: venueId } });
    });
  });
});
