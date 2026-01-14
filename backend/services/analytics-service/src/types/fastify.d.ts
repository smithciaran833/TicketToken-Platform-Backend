/**
 * Fastify Request Type Extensions
 * 
 * This file extends the FastifyRequest interface with custom properties
 * that are added by middleware (auth, tenant-context, etc.)
 * 
 * This eliminates the need for `as any` type casts when accessing
 * request.user, request.venue, and request.tenantContext
 */

import 'fastify';

/**
 * User object populated by auth middleware from JWT claims
 */
export interface RequestUser {
  id: string;
  role: string;
  tenantId?: string;
  tenant_id?: string;
  organizationId?: string;
  organization_id?: string;
  venueId?: string;
  venue_id?: string;
  permissions?: string[];
  is_system_admin?: boolean;
  isSystemAdmin?: boolean;
}

/**
 * Venue object populated by middleware
 */
export interface RequestVenue {
  id: string;
  name?: string;
  organizationId?: string;
}

/**
 * Tenant context populated by tenant-context middleware
 */
export interface TenantContext {
  tenantId: string;
  organizationId?: string;
  venueId?: string;
  permissions?: string[];
  isSystemAdmin?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * User object populated by auth middleware from JWT claims
     */
    user?: RequestUser;
    
    /**
     * Venue context populated by middleware
     */
    venue?: RequestVenue;
    
    /**
     * Tenant context populated by tenant-context middleware
     */
    tenantContext?: TenantContext;
    
    /**
     * Idempotency key from request headers
     */
    idempotencyKey?: string;
  }
}
