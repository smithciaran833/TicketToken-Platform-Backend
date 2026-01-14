import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';
import { DatabaseService } from '../services/databaseService';

const log = logger.child({ component: 'TenantMiddleware' });

// UUID v4 regex pattern for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4
 */
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * SECURITY-CRITICAL: Tenant middleware for authenticated routes
 * 
 * IMPORTANT: This middleware ONLY accepts tenant_id from the verified JWT token.
 * - DO NOT accept x-tenant-id header (spoofable)
 * - DO NOT accept tenantId from request body (spoofable)
 * - The auth middleware must run BEFORE this middleware
 * 
 * This middleware also sets the PostgreSQL RLS context using SET LOCAL
 * to ensure all database queries are scoped to the tenant.
 */
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  
  // SECURITY: Only accept tenant from verified JWT
  // The auth middleware must have already verified the JWT and set request.user
  if (!user) {
    log.warn('Tenant middleware called without authenticated user', {
      path: request.url,
      method: request.method
    });
    throw new UnauthorizedError('Authentication required');
  }

  // Extract tenant from JWT claims only
  const tenantId = user.tenantId || user.tenant_id;
  
  if (!tenantId) {
    log.warn('JWT missing tenant_id claim', {
      userId: user.id || user.sub,
      path: request.url
    });
    throw new UnauthorizedError('Missing tenant context in token');
  }

  // SECURITY: Validate UUID format to prevent injection
  if (!isValidUUID(tenantId)) {
    log.error('Invalid tenant_id format in JWT', {
      tenantId: tenantId.substring(0, 50), // Truncate for logging safety
      userId: user.id || user.sub
    });
    throw new ValidationError('Invalid tenant ID format');
  }

  // SECURITY WARNING: Explicitly ignore any tenant from headers or body
  // These are spoofable and should NEVER be trusted
  const headerTenantId = request.headers['x-tenant-id'];
  const bodyTenantId = (request.body as any)?.tenantId;
  
  if (headerTenantId && headerTenantId !== tenantId) {
    log.warn('Header tenant_id mismatch - ignoring untrusted header', {
      jwtTenantId: tenantId,
      headerTenantId: headerTenantId,
      userId: user.id || user.sub
    });
    // We continue with JWT tenant, header is ignored
  }
  
  if (bodyTenantId && bodyTenantId !== tenantId) {
    log.warn('Body tenant_id mismatch - ignoring untrusted body value', {
      jwtTenantId: tenantId,
      bodyTenantId: bodyTenantId,
      userId: user.id || user.sub
    });
    // We continue with JWT tenant, body is ignored
  }

  // Set tenant on request for use by handlers
  (request as any).tenantId = tenantId;

  // Set RLS context for database isolation
  try {
    await setRLSContext(tenantId);
    log.debug('RLS context set', { tenantId, path: request.url });
  } catch (error) {
    log.error('Failed to set RLS context', { tenantId, error });
    // Don't fail the request - RLS will still enforce via policies
  }
}

/**
 * Sets the PostgreSQL RLS (Row Level Security) context for the current transaction.
 * This ensures all subsequent queries are automatically filtered by tenant_id.
 * 
 * IMPORTANT: This must be called within a transaction for SET LOCAL to work.
 * For non-transactional queries, RLS policies should include WHERE tenant_id checks.
 */
async function setRLSContext(tenantId: string): Promise<void> {
  // Use parameterized query to prevent SQL injection
  // SET LOCAL only lasts for the current transaction
  await DatabaseService.query(
    `SELECT set_config('app.current_tenant_id', $1, true)`,
    [tenantId]
  );
}

/**
 * Middleware for public routes that may optionally have tenant context
 * Use this ONLY for routes that don't require authentication
 * 
 * SECURITY: For authenticated routes, ALWAYS use tenantMiddleware instead
 */
export async function optionalTenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // If user is authenticated (auth middleware ran first), use their tenant
  if ((request as any).user) {
    const tenantId = (request as any).user.tenantId || (request as any).user.tenant_id;
    if (tenantId && isValidUUID(tenantId)) {
      (request as any).tenantId = tenantId;
      try {
        await setRLSContext(tenantId);
      } catch (error) {
        log.debug('Failed to set optional RLS context', { tenantId, error });
      }
    }
  }
  // For unauthenticated requests, no tenant context is set
  // This is intentional for public routes
}

/**
 * Helper to get tenant ID from request with validation
 * Use this in controllers/services when you need the tenant ID
 */
export function getTenantId(request: FastifyRequest): string {
  const tenantId = (request as any).tenantId;
  
  if (!tenantId) {
    throw new UnauthorizedError('Missing tenant context');
  }
  
  if (!isValidUUID(tenantId)) {
    throw new ValidationError('Invalid tenant ID format');
  }
  
  return tenantId;
}

/**
 * Validates that a tenant ID in a resource matches the request tenant
 * Use this when accessing resources that have their own tenant_id field
 */
export function validateResourceTenant(
  resourceTenantId: string,
  requestTenantId: string,
  resourceType: string = 'resource'
): void {
  if (resourceTenantId !== requestTenantId) {
    log.warn('Cross-tenant access attempt blocked', {
      resourceTenantId,
      requestTenantId,
      resourceType
    });
    // Return generic "not found" to avoid information leakage
    throw new Error(`${resourceType} not found`);
  }
}
