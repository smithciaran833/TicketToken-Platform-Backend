import { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';
import { db } from '../config/database';

const log = logger.child({ component: 'TenantMiddleware' });

/**
 * SECURITY FIX (JM4-JM8/AE1): Dedicated tenant middleware
 * 
 * This middleware:
 * - Extracts tenant_id from verified JWT claims only
 * - Rejects requests without valid tenant context
 * - Sets tenant context for downstream use
 * - Provides consistent tenant handling across all routes
 * 
 * Replaces duplicated addTenantContext functions in controllers.
 */

export interface TenantContext {
  tenantId: string;
  tenantName?: string;
  tenantType?: string;
}

/**
 * Extend FastifyRequest to include tenant context
 */
declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext;
    tenantId?: string;
  }
}

/**
 * Strict tenant middleware - requires tenant context, fails if missing
 * Use this for all multi-tenant routes that require tenant isolation
 */
export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  
  // User must be authenticated first
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  // Extract tenant_id from verified JWT claims ONLY
  // SECURITY: Never fall back to default values
  const tenantId = user.tenant_id;
  
  if (!tenantId) {
    log.warn({
      userId: user.id,
      requestId: request.id,
      url: request.url,
    }, 'Missing tenant context in authenticated request');
    
    throw new UnauthorizedError('Missing tenant context');
  }

  // Validate tenant_id format (UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(tenantId)) {
    log.error({
      userId: user.id,
      tenantId,
      requestId: request.id,
    }, 'Invalid tenant_id format');
    
    throw new UnauthorizedError('Invalid tenant context');
  }

  // SECURITY FIX: Verify user belongs to the claimed tenant
  const server = request.server as any;
  const redis = server.container?.cradle?.redis;
  
  if (redis) {
    // Check cache first
    const cacheKey = `user_tenant:${user.id}`;
    const cachedTenantId = await redis.get(cacheKey);
    
    if (cachedTenantId) {
      if (cachedTenantId !== tenantId) {
        log.error({
          userId: user.id,
          claimedTenantId: tenantId,
          actualTenantId: cachedTenantId,
          requestId: request.id,
        }, 'User-tenant association mismatch (cached)');
        throw new ForbiddenError('Invalid tenant access');
      }
    } else {
      // Verify user-tenant association in database
      const userRecord = await db('users')
        .where({ id: user.id })
        .select('tenant_id')
        .first();
      
      if (!userRecord || userRecord.tenant_id !== tenantId) {
        log.error({
          userId: user.id,
          claimedTenantId: tenantId,
          actualTenantId: userRecord?.tenant_id,
          requestId: request.id,
        }, 'User-tenant association mismatch');
        throw new ForbiddenError('Invalid tenant access');
      }
      
      // Cache the validated association for 60 seconds
      await redis.setex(cacheKey, 60, tenantId);
    }
  }

  // SECURITY FIX: Verify tenant exists
  if (redis) {
    const tenantCacheKey = `tenant:${tenantId}`;
    const cachedTenant = await redis.get(tenantCacheKey);
    
    if (!cachedTenant) {
      const tenant = await db('tenants').where({ id: tenantId }).first();
      if (!tenant) {
        log.error({
          userId: user.id,
          tenantId,
          requestId: request.id,
        }, 'Tenant does not exist');
        throw new UnauthorizedError('Invalid tenant');
      }
      // Cache tenant existence for 5 minutes
      await redis.setex(tenantCacheKey, 300, JSON.stringify({ id: tenant.id, name: tenant.name }));
    }
  }

  // Set RLS context in database for this request
  try {
    await db.raw("SELECT set_config('app.current_tenant_id', ?, true)", [tenantId]);
  } catch (error) {
    log.error({
      userId: user.id,
      tenantId,
      error,
      requestId: request.id,
    }, 'Failed to set RLS context');
    
    // SECURITY FIX: Attempt to reset RLS context on error
    try {
      await db.raw("SELECT set_config('app.current_tenant_id', '', true)");
    } catch (resetError) {
      log.error({ resetError }, 'Failed to reset RLS context after error');
    }
    
    throw new UnauthorizedError('Failed to establish tenant context');
  }

  // SECURITY FIX: Set tenant context with defensive coding
  const tenantContext: TenantContext = {
    tenantId,
    tenantName: (typeof user.tenant_name === 'string' && user.tenant_name) ? user.tenant_name : undefined,
    tenantType: (typeof user.tenant_type === 'string' && user.tenant_type) ? user.tenant_type : undefined,
  };

  request.tenantContext = tenantContext;
  (request as any).tenantId = tenantId;

  log.debug({
    userId: user.id,
    tenantId,
    requestId: request.id,
  }, 'Tenant context established');
}

/**
 * Optional tenant middleware - extracts tenant if present but doesn't require it
 * Use for routes that can work with or without tenant context
 */
export async function extractTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  
  if (!user) {
    return; // No user, no tenant context
  }

  const tenantId = user.tenant_id;
  
  if (tenantId) {
    // Validate format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(tenantId)) {
      request.tenantContext = {
        tenantId,
        tenantName: user.tenant_name,
        tenantType: user.tenant_type,
      };
      (request as any).tenantId = tenantId;
    }
  }
}

/**
 * Verify tenant owns resource middleware factory
 * Use when accessing a specific resource that should belong to the user's tenant
 */
export function verifyTenantResource(
  getResourceTenantId: (request: FastifyRequest) => Promise<string | null>
) {
  return async function verifyTenantResourceMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const tenantId = (request as any).tenantId;
    
    if (!tenantId) {
      throw new UnauthorizedError('Missing tenant context');
    }

    const resourceTenantId = await getResourceTenantId(request);
    
    if (!resourceTenantId) {
      // Resource doesn't have tenant (might be system resource)
      return;
    }

    if (resourceTenantId !== tenantId) {
      log.warn({
        requestedTenantId: tenantId,
        resourceTenantId,
        requestId: request.id,
        url: request.url,
      }, 'Cross-tenant access attempt blocked');
      
      throw new ForbiddenError('Access denied to this resource');
    }
  };
}

/**
 * Set tenant context in database transaction
 * Call this at the start of any database transaction for RLS enforcement
 */
export async function setTenantInTransaction(
  trx: any,
  tenantId: string
): Promise<void> {
  // SECURITY FIX (KQ1-KQ2): Set RLS context for PostgreSQL
  await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}

/**
 * Helper to get tenant ID from request (for use in controllers/services)
 */
export function getTenantId(request: FastifyRequest): string {
  const tenantId = (request as any).tenantId;
  if (!tenantId) {
    throw new UnauthorizedError('Missing tenant context');
  }
  return tenantId;
}

/**
 * Helper to get full tenant context from request
 */
export function getTenantContext(request: FastifyRequest): TenantContext {
  const tenantContext = request.tenantContext;
  if (!tenantContext) {
    throw new UnauthorizedError('Missing tenant context');
  }
  return tenantContext;
}

// Export legacy function name for backward compatibility during migration
export const addTenantContext = requireTenant;
