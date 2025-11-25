/**
 * Tenant Filter Utility
 * Provides reusable functions to add tenant isolation to Elasticsearch queries
 * This is a CRITICAL security component - all search queries MUST use this
 */

export interface TenantFilterOptions {
  venueId: string;
  allowCrossTenant?: boolean; // Only for admin/super-admin roles
}

/**
 * Adds venue_id filter to Elasticsearch query to enforce tenant isolation
 * This prevents users from one venue seeing data from another venue
 */
export function addTenantFilter(query: any, options: TenantFilterOptions): any {
  // If cross-tenant access is explicitly allowed (admin only), skip filter
  if (options.allowCrossTenant) {
    return query;
  }

  // Ensure we have a valid venueId
  if (!options.venueId) {
    throw new Error('venueId is required for tenant isolation');
  }

  // If query doesn't have a bool structure, wrap it
  if (!query.bool) {
    query = {
      bool: {
        must: query.match_all ? [] : [query],
        filter: []
      }
    };
  }

  // Ensure filter array exists
  if (!query.bool.filter) {
    query.bool.filter = [];
  }

  // Convert filter to array if it's a single object
  if (!Array.isArray(query.bool.filter)) {
    query.bool.filter = [query.bool.filter];
  }

  // Add venue_id term filter
  query.bool.filter.push({
    term: { venue_id: options.venueId }
  });

  return query;
}

/**
 * Validates that a venueId is present and valid
 */
export function validateVenueId(venueId: any): string {
  if (!venueId || typeof venueId !== 'string') {
    throw new Error('Invalid venueId: must be a non-empty string');
  }

  // Basic UUID format validation (adjust if your IDs use different format)
  if (venueId.length < 1 || venueId.length > 100) {
    throw new Error('Invalid venueId: length must be between 1 and 100 characters');
  }

  return venueId;
}

/**
 * Checks if a role is allowed cross-tenant access
 */
export function canAccessCrossTenant(role: string): boolean {
  const crossTenantRoles = ['admin', 'super-admin', 'system'];
  return crossTenantRoles.includes(role.toLowerCase());
}
