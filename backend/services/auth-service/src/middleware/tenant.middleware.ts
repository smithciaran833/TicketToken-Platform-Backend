import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticatedRequest } from '../types';

/**
 * Tenant Validation Middleware
 * 
 * Ensures all authenticated requests include valid tenant context.
 * Prevents cross-tenant data access by validating tenant_id.
 * 
 * Usage: Apply to all authenticated routes that access tenant-specific data
 */
export async function validateTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authRequest = request as AuthenticatedRequest;

  // Ensure user is authenticated
  if (!authRequest.user) {
    return reply.status(401).send({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  // Ensure tenant_id exists in JWT
  if (!authRequest.user.tenant_id) {
    request.log.error({
      userId: authRequest.user.id,
      email: authRequest.user.email
    }, 'User missing tenant_id in JWT');

    return reply.status(403).send({
      success: false,
      error: 'Invalid tenant context',
      code: 'MISSING_TENANT_ID'
    });
  }

  // Tenant context is valid - request can proceed
  request.log.debug({
    userId: authRequest.user.id,
    tenantId: authRequest.user.tenant_id
  }, 'Tenant validation passed');
}

/**
 * Validates that a resource belongs to the user's tenant
 * 
 * @param userTenantId - tenant_id from JWT
 * @param resourceTenantId - tenant_id from database resource
 * @returns true if tenant matches, false otherwise
 */
export function validateResourceTenant(
  userTenantId: string,
  resourceTenantId: string
): boolean {
  return userTenantId === resourceTenantId;
}

/**
 * Helper to add tenant filter to database queries
 * 
 * Usage:
 * ```typescript
 * const users = await db('users')
 *   .where(addTenantFilter(request.user.tenant_id))
 *   .select('*');
 * ```
 */
export function addTenantFilter(tenantId: string) {
  return { tenant_id: tenantId };
}

/**
 * Tenant isolation error - thrown when cross-tenant access is attempted
 */
export class TenantIsolationError extends Error {
  statusCode = 403;
  code = 'TENANT_ISOLATION_VIOLATION';

  constructor(message: string = 'Cross-tenant access denied') {
    super(message);
    this.name = 'TenantIsolationError';
  }
}
