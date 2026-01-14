import { Knex } from 'knex';
import { Pool, PoolClient } from 'pg';
import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// UUID regex for validation (version 4 UUID)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate tenant ID format to prevent SQL injection
 */
export function isValidTenantId(tenantId: string): boolean {
  return UUID_REGEX.test(tenantId);
}

/**
 * Execute a function within a tenant context (RLS enabled) using Knex
 * Sets the PostgreSQL session variable for Row Level Security
 * 
 * @param db - Knex instance
 * @param tenantId - The tenant UUID
 * @param fn - Function to execute within the tenant context
 * @returns The result of the function
 */
export async function withTenantContext<T>(
  db: Knex,
  tenantId: string,
  fn: (trx: Knex.Transaction) => Promise<T>
): Promise<T> {
  // Validate tenant ID format to prevent injection
  if (!isValidTenantId(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }

  return db.transaction(async (trx) => {
    // Set the tenant context for RLS policies
    await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    
    logger.debug('RLS tenant context set (Knex)', { tenantId });
    
    return fn(trx);
  });
}

/**
 * Execute a function within a tenant context using pg Pool
 * Sets the PostgreSQL session variable for Row Level Security
 * 
 * @param pool - pg Pool instance
 * @param tenantId - The tenant UUID
 * @param fn - Function to execute within the tenant context
 * @returns The result of the function
 */
export async function withTenantContextPg<T>(
  pool: Pool,
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  // Validate tenant ID format to prevent injection
  if (!isValidTenantId(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Set the tenant context for RLS policies
    await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
    
    logger.debug('RLS tenant context set (pg)', { tenantId });
    
    const result = await fn(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Set tenant context on an existing pg client
 * Use this when you're already inside a transaction
 */
export async function setTenantContextPg(client: PoolClient, tenantId: string): Promise<void> {
  if (!isValidTenantId(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }
  
  await client.query('SET LOCAL app.current_tenant_id = $1', [tenantId]);
}

/**
 * Set tenant context on an existing Knex transaction
 * Use this when you're already inside a transaction
 */
export async function setTenantContextKnex(trx: Knex.Transaction, tenantId: string): Promise<void> {
  if (!isValidTenantId(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }
  
  await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}

/**
 * Middleware to extract and validate tenant context from request
 * Sets request.tenantId for use in route handlers
 * 
 * SECURITY: Only accepts tenant from verified JWT - NO header fallback
 */
export async function tenantContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get tenant from authenticated user (JWT only)
  const tenantId = (request as any).user?.tenant_id || (request as any).user?.tenantId;

  if (!tenantId) {
    logger.warn('Request without tenant context', {
      ip: request.ip,
      path: request.url,
      method: request.method,
      userId: (request as any).user?.id
    });
    return reply.code(401).send({
      error: 'UNAUTHORIZED',
      message: 'Missing tenant context - valid JWT with tenant_id required'
    });
  }

  // Validate UUID format
  if (!isValidTenantId(tenantId)) {
    logger.warn('Invalid tenant ID format in request', {
      tenantId: tenantId.substring(0, 8) + '...', // Don't log full ID
      userId: (request as any).user?.id,
      ip: request.ip
    });
    return reply.code(400).send({
      error: 'INVALID_TENANT',
      message: 'Invalid tenant ID format'
    });
  }

  // Store validated tenant ID on request for easy access
  request.tenantId = tenantId;
  
  logger.debug('Tenant context validated', { tenantId });
}

/**
 * Middleware for routes that allow unauthenticated access
 * Extracts tenant but doesn't require it
 * Used for public health checks, metrics, etc.
 */
export async function optionalTenantContextMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Get tenant from authenticated user (JWT only) - but don't require it
  const tenantId = (request as any).user?.tenant_id || (request as any).user?.tenantId;

  if (tenantId && isValidTenantId(tenantId)) {
    request.tenantId = tenantId;
    logger.debug('Optional tenant context set', { tenantId });
  }
  // If no tenant or invalid, continue without setting - route handler decides
}

/**
 * Check if user is a platform-level admin (can access all tenants)
 */
export function isPlatformAdmin(request: FastifyRequest): boolean {
  const user = (request as any).user;
  if (!user?.role) return false;
  
  const platformRoles = ['super_admin', 'platform_admin'];
  return platformRoles.includes(user.role);
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
    if (queryTenantId && isValidTenantId(queryTenantId)) {
      logger.debug('Platform admin using override tenant', { 
        adminId: (request as any).user?.id,
        targetTenant: queryTenantId 
      });
      return queryTenantId;
    }
    // Platform admin without specific tenant - return null to indicate "all tenants"
    if (!queryTenantId) {
      return null; // Indicates cross-tenant query is allowed
    }
  }

  // Regular users get their own tenant
  return request.tenantId || null;
}

/**
 * Extract tenant ID for queue job payloads
 * Always requires tenant - throws if missing
 */
export function extractTenantForJob(request: FastifyRequest): string {
  const tenantId = request.tenantId;
  
  if (!tenantId) {
    throw new Error('Cannot create job without tenant context');
  }
  
  return tenantId;
}

// Extend FastifyRequest type to include tenantId
declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}
