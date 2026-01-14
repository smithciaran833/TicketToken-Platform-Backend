/**
 * Tenant Context Middleware
 * 
 * AUDIT FIX: MT-1,2,3 - Multi-tenancy isolation
 * Extracts tenant context from JWT or headers and ensures proper isolation
 */

import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { logger } from '../utils/logger';
import { BadRequestError, ForbiddenError, TenantMismatchError, TenantRequiredError } from '../errors';

// =============================================================================
// Types
// =============================================================================

export interface TenantContext {
  tenantId: string;
  organizationId?: string;
  venueId?: string;
  userId?: string;
  permissions?: string[];
  isSystemAdmin?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext;
  }
}

// =============================================================================
// Constants
// =============================================================================

const TENANT_HEADER = 'x-tenant-id';
const ORGANIZATION_HEADER = 'x-organization-id';
const VENUE_HEADER = 'x-venue-id';

// System admin tenant ID (for platform-wide operations)
const SYSTEM_TENANT_ID = '__system__';

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate tenant ID format
 * Must be a valid UUID or the system tenant ID
 */
function isValidTenantId(tenantId: string): boolean {
  if (tenantId === SYSTEM_TENANT_ID) {
    return true;
  }
  
  // UUID v4 format
  const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
  return uuidRegex.test(tenantId);
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Tenant context middleware
 * Extracts tenant information from JWT claims or headers
 */
export async function tenantContextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // Try to get tenant from JWT claims first (set by auth middleware)
  const user = (request as any).user;
  const jwtTenantId = user?.tenant_id || user?.tenantId;
  const jwtOrgId = user?.organization_id || user?.organizationId;
  const jwtVenueId = user?.venue_id || user?.venueId;
  const jwtUserId = user?.id || user?.userId || user?.sub;
  const jwtPermissions = user?.permissions || [];
  const isSystemAdmin = user?.is_system_admin || user?.isSystemAdmin;

  // Fallback to headers (for internal service calls)
  const headerTenantId = request.headers[TENANT_HEADER] as string;
  const headerOrgId = request.headers[ORGANIZATION_HEADER] as string;
  const headerVenueId = request.headers[VENUE_HEADER] as string;

  // Determine tenant ID (JWT takes precedence)
  const tenantId = jwtTenantId || headerTenantId;

  // If no tenant ID found, leave context empty (will be validated by requireTenant)
  if (!tenantId) {
    request.tenantContext = undefined;
    return;
  }

  // Validate tenant ID format
  if (!isValidTenantId(tenantId)) {
    logger.warn({
      event: 'invalid_tenant_id',
      tenantId: tenantId.substring(0, 50), // Truncate for safety
      requestId: request.id,
    }, 'Invalid tenant ID format');
    
    throw new BadRequestError('Invalid tenant ID format', 'INVALID_TENANT_ID');
  }

  // Security check: Header tenant must match JWT tenant if both present
  if (jwtTenantId && headerTenantId && jwtTenantId !== headerTenantId) {
    logger.warn({
      event: 'tenant_mismatch',
      jwtTenantId,
      headerTenantId,
      requestId: request.id,
    }, 'Tenant ID mismatch between JWT and header');
    
    throw new TenantMismatchError();
  }

  // Build tenant context
  request.tenantContext = {
    tenantId,
    organizationId: jwtOrgId || headerOrgId,
    venueId: jwtVenueId || headerVenueId,
    userId: jwtUserId,
    permissions: jwtPermissions,
    isSystemAdmin: isSystemAdmin === true,
  };

  logger.debug({
    event: 'tenant_context_set',
    tenantId,
    organizationId: request.tenantContext.organizationId,
    venueId: request.tenantContext.venueId,
    userId: request.tenantContext.userId,
    hasPermissions: jwtPermissions.length > 0,
  }, 'Tenant context established');
}

/**
 * Require tenant context - rejects requests without valid tenant
 */
export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Run tenant context middleware if not already run
  if (request.tenantContext === undefined) {
    await tenantContextMiddleware(request, reply);
  }

  if (!request.tenantContext?.tenantId) {
    throw new TenantRequiredError();
  }
}

/**
 * Require system admin access
 */
export async function requireSystemAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Ensure tenant context is set
  await requireTenant(request, reply);

  if (!request.tenantContext?.isSystemAdmin) {
    throw new ForbiddenError(
      'System administrator access required',
      'SYSTEM_ADMIN_REQUIRED'
    );
  }
}

/**
 * Require specific permission
 */
export function requirePermission(permission: string) {
  return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await requireTenant(request, reply);

    const hasPermission = 
      request.tenantContext?.isSystemAdmin || 
      request.tenantContext?.permissions?.includes(permission);

    if (!hasPermission) {
      throw new ForbiddenError(
        `Permission '${permission}' is required for this operation`,
        'PERMISSION_DENIED',
        { requiredPermission: permission }
      );
    }
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get tenant ID from request (convenience function)
 * Throws if tenant context not available
 */
export function getTenantId(request: FastifyRequest): string {
  if (!request.tenantContext?.tenantId) {
    throw new TenantRequiredError();
  }
  return request.tenantContext.tenantId;
}

/**
 * Get user ID from request (convenience function)
 */
export function getUserId(request: FastifyRequest): string | undefined {
  return request.tenantContext?.userId;
}

/**
 * Get tenant context from request (convenience function)
 * Returns undefined if not available
 */
export function getTenantContext(request: FastifyRequest): TenantContext | undefined {
  return request.tenantContext;
}

/**
 * Check if request is from a specific tenant
 */
export function isTenant(request: FastifyRequest, tenantId: string): boolean {
  return request.tenantContext?.tenantId === tenantId;
}

/**
 * Check if request is from system admin
 */
export function isSystemAdminRequest(request: FastifyRequest): boolean {
  return request.tenantContext?.isSystemAdmin === true;
}

// =============================================================================
// Database Helper - Set tenant context for RLS
// =============================================================================

/**
 * Set tenant context for PostgreSQL RLS
 * Call this before database operations
 */
export async function setDatabaseTenantContext(
  db: any, // Knex instance or Pool
  tenantId: string
): Promise<void> {
  if (!tenantId) {
    throw new Error('Tenant ID is required for database operations');
  }

  // Set the tenant_id for row-level security
  await db.raw(`SET LOCAL app.tenant_id = ?`, [tenantId]);
  
  logger.debug({
    event: 'database_tenant_context_set',
    tenantId,
  }, 'Database tenant context set for RLS');
}

/**
 * Generate tenant-prefixed storage key
 * Used for S3 paths to ensure tenant isolation
 */
export function getTenantStorageKey(tenantId: string, key: string): string {
  if (!tenantId) {
    throw new TenantRequiredError('Tenant ID is required for storage operations');
  }
  
  // Ensure key doesn't start with /
  const normalizedKey = key.startsWith('/') ? key.slice(1) : key;
  
  return `tenants/${tenantId}/${normalizedKey}`;
}

/**
 * Extract tenant ID from storage key
 */
export function extractTenantFromStorageKey(key: string): string | null {
  const match = key.match(/^tenants\/([^\/]+)\//);
  return match?.[1] ?? null;
}

/**
 * Alias for tenantContextMiddleware (for compatibility with routes/index.ts)
 */
export const setTenantContext = tenantContextMiddleware;

// =============================================================================
// Fastify Plugin Registration
// =============================================================================

export async function registerTenantContext(fastify: FastifyInstance): Promise<void> {
  fastify.decorateRequest('tenantContext', null);
}

export default {
  tenantContextMiddleware,
  requireTenant,
  requireSystemAdmin,
  requirePermission,
  getTenantId,
  getUserId,
  getTenantContext,
  isTenant,
  isSystemAdminRequest,
  setDatabaseTenantContext,
  getTenantStorageKey,
  extractTenantFromStorageKey,
  registerTenantContext,
};
