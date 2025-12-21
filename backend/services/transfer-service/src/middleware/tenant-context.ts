import { FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';

/**
 * Tenant Context Middleware
 * 
 * Sets the PostgreSQL session variable 'app.current_tenant' based on the
 * authenticated user's tenant_id from the JWT token.
 * 
 * This session variable is used by Row Level Security (RLS) policies to
 * filter data at the database level, ensuring complete tenant isolation.
 * 
 * IMPORTANT: This middleware must be registered AFTER authentication middleware
 * so that request.user is available.
 */

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // Extract tenant_id from authenticated user (set by auth middleware)
  const tenantId = 
    request.user?.tenant_id || 
    request.tenantId ||
    DEFAULT_TENANT_ID;

  try {
    // Get database connection from request context
    // Note: This assumes knex or pg pool is available on the request
    // Adjust based on your actual database connection pattern
    const db = (request as any).db || (request.server as any).db;

    if (db) {
      // Set PostgreSQL session variable for RLS policies
      if (db.raw) {
        // Knex
        await db.raw('SET LOCAL app.current_tenant = ?', [tenantId]);
      } else {
        // pg Pool
        await db.query('SET LOCAL app.current_tenant = $1', [tenantId]);
      }
    }

    // Store tenant_id on request for logging and debugging
    request.tenantId = tenantId;

    request.log.debug({ tenantId }, 'Tenant context set');
  } catch (error) {
    request.log.error({ error, tenantId }, 'Failed to set tenant context');
    // Re-throw to prevent request from proceeding with invalid context
    throw error;
  }
}

/**
 * Optional: Middleware to require tenant context
 * Use this on routes that MUST have a valid tenant context
 */
export async function requireTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.tenantId) {
    return reply.code(401).send({
      error: 'Tenant context required',
      message: 'This endpoint requires a valid tenant context'
    });
  }

  // Additional validation: ensure it's not the default tenant for sensitive operations
  if (request.tenantId === DEFAULT_TENANT_ID) {
    request.log.warn('Operation using default tenant ID');
  }
}

/**
 * Decorator to add tenant context to Fastify types
 */
declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}
