import { Knex } from 'knex';
import { FastifyRequest, FastifyReply } from 'fastify';
import { db as knex } from '../config/database';
import logger from '../utils/logger';

// UUID regex for validation
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Execute a function within a tenant context (RLS enabled)
 * Sets the PostgreSQL session variable for Row Level Security
 * 
 * @param tenantId - The tenant UUID
 * @param fn - Function to execute within the tenant context
 * @returns The result of the function
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  // Validate tenant ID format to prevent injection
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }

  return knex.transaction(async (trx) => {
    // Set the tenant context for RLS policies
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    
    logger.debug('RLS tenant context set', { tenantId });
    
    return fn(trx);
  });
}

/**
 * Execute a function within a tenant context using a custom Knex instance
 * Useful when you already have a database connection
 */
export async function withTenantContextKnex<T>(
  db: Knex,
  tenantId: string,
  fn: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }

  return db.transaction(async (trx) => {
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    return fn(trx);
  });
}

/**
 * Set tenant context on an existing transaction
 * Use this when you're already inside a transaction
 */
export async function setTenantContext(trx: Knex.Transaction, tenantId: string): Promise<void> {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }
  
  await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}

/**
 * Middleware to extract and validate tenant context from request
 * Sets request.tenantId for use in route handlers
 */
export async function tenantContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get tenant from authenticated user (JWT)
  const tenantId = request.user?.tenant_id;

  if (!tenantId) {
    logger.warn('Request without tenant context', {
      ip: request.ip,
      path: request.url,
      userId: request.user?.id
    });
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Missing tenant context'
    });
  }

  // Validate format
  if (!UUID_REGEX.test(tenantId)) {
    logger.warn('Invalid tenant ID format in request', {
      tenantId,
      userId: request.user?.id
    });
    return reply.code(400).send({
      error: 'INVALID_TENANT',
      message: 'Invalid tenant ID format'
    });
  }

  // Store validated tenant ID on request for easy access
  (request as any).tenantId = tenantId;
}

/**
 * Check if user is a platform-level admin (can access all tenants)
 */
export function isPlatformAdmin(request: FastifyRequest): boolean {
  const platformRoles = ['super_admin', 'platform_admin'];
  return request.user?.role ? platformRoles.includes(request.user.role) : false;
}

/**
 * Get tenant ID from request, with platform admin override
 * Platform admins can optionally specify a tenant_id query param
 * Regular users always use their own tenant
 */
export function getTenantIdFromRequest(
  request: FastifyRequest,
  allowPlatformOverride = true
): string | null {
  // For platform admins, allow querying other tenants via query param
  if (allowPlatformOverride && isPlatformAdmin(request)) {
    const queryTenantId = (request.query as any)?.tenant_id;
    if (queryTenantId && UUID_REGEX.test(queryTenantId)) {
      return queryTenantId;
    }
    // Platform admin without specific tenant - return null to indicate "all tenants"
    if (!queryTenantId) {
      return null; // Indicates cross-tenant query is allowed
    }
  }

  // Regular users get their own tenant
  return request.user?.tenant_id || null;
}

// Extend FastifyRequest type to include tenantId
declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}
