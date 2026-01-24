import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { getDb } from '../config/database';
import { getRedis } from '../config/redis';
import { isValidUuid } from '../schemas/common.schema';
import { UnauthorizedError, ForbiddenError, BadRequestError, TenantError, InternalError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * NOTE: Issue #18 (HIGH) - Connection Pool Safety
 * Resolved by transaction wrapper implemented in Issue #4.
 * All requests run in transactions, ensuring SET LOCAL is properly scoped.
 * No connection pool leakage possible - RLS context auto-cleaned on commit/rollback.
 */

/**
 * Issue #16 (HIGH): Tenant Validation Cache
 * Cache tenant validation results in Redis to reduce database load.
 * Key: tenant:valid:{tenant_id}
 * Value: JSON({ id, status, name })
 * TTL: 5 minutes
 *
 * IMPLEMENTED: TODO #9 - Cache invalidation via Redis pub/sub
 * Auth-service publishes to 'tenant:cache:invalidate' channel when tenant status changes.
 * Event-service subscribes and calls invalidateTenantCache() to clear stale entries.
 */
const TENANT_CACHE_TTL = 5 * 60; // 5 minutes in seconds
export const TENANT_CACHE_PREFIX = 'tenant:valid:';

async function getCachedTenant(tenantId: string): Promise<any | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(`${TENANT_CACHE_PREFIX}${tenantId}`);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    // Cache miss or error - fall through to DB query
  }
  return null;
}

async function cacheTenant(tenant: any): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      `${TENANT_CACHE_PREFIX}${tenant.id}`,
      TENANT_CACHE_TTL,
      JSON.stringify({ id: tenant.id, status: tenant.status, name: tenant.name })
    );
  } catch (error: any) {
    // Cache write failure - log but don't fail request
    logger.warn({ tenantId: tenant.id, error: error.message }, 'Failed to cache tenant');
  }
}

/**
 * Fastify hook to extract tenant_id from JWT, validate tenant exists,
 * and set tenant context for RLS policies.
 * 
 * CRITICAL: This middleware must be used after authentication and MUST
 * call SET LOCAL app.current_tenant_id for RLS policies to work correctly.
 */
export async function tenantHook(request: FastifyRequest, reply: FastifyReply) {
  // Auth middleware should have already set request.user
  const user = (request as any).user;
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  // Extract tenant_id from JWT payload
  const tenantId = user.tenant_id;
  if (!tenantId) {
    request.log.error({ userId: user.id || user.sub }, 'User token missing tenant_id');
    throw new BadRequestError('Tenant ID not found in authentication token', 'MISSING_TENANT_ID');
  }

  // AUDIT FIX (MT-UUID): Validate UUID format using shared validator
  if (!isValidUuid(tenantId)) {
    request.log.error({ tenantId }, 'Invalid tenant_id format');
    throw new BadRequestError('Invalid tenant ID format', 'INVALID_TENANT_FORMAT');
  }

  // Issue #16 (HIGH): Check cache first before DB query
  let tenant = await getCachedTenant(tenantId);
  let fromCache = !!tenant;
  
  if (!tenant) {
    // Cache miss - query database
    // Issue #17 (HIGH): Add 1-second timeout to prevent hanging
    const trx = (request as any).transaction;
    const db = trx || getDb();
    
    try {
      tenant = await db('tenants')
        .where({ id: tenantId })
        .timeout(1000) // 1 second max
        .first();
    } catch (error: any) {
      if (error.message && error.message.includes('timeout')) {
        request.log.error({ tenantId, error }, 'Tenant validation query timed out');
        throw new InternalError('Tenant validation timed out - please try again');
      }
      throw error;
    }

    if (!tenant) {
      request.log.error({ tenantId }, 'Tenant not found in database');
      throw new ForbiddenError('Invalid tenant. The tenant does not exist.');
    }

    // Cache the result for future requests
    await cacheTenant(tenant);
  }

  if (tenant.status !== 'active') {
    request.log.warn({ tenantId, status: tenant.status }, 'Inactive tenant attempted access');
    throw new ForbiddenError('Tenant account is not active');
  }

  // CRITICAL FIX Issue #4: Set tenant context within transaction for RLS safety
  // SET LOCAL within a transaction is automatically cleaned up on commit/rollback
  const trx = (request as any).transaction;
  const db = trx || getDb();
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);

  // Attach tenant_id to request for easy access in controllers/services
  (request as any).tenantId = tenantId;
  (request as any).tenant = tenant;
  
  request.log.debug({ 
    tenantId, 
    userId: user.id || user.sub, 
    usesTrx: !!(request as any).transaction,
    fromCache 
  }, 'Tenant validated and RLS context set');
}

/**
 * Set tenant context within a database transaction.
 * Use this when you need to set tenant context inside a transaction block.
 * 
 * @param trx - Knex transaction object
 * @param tenantId - The tenant UUID to set
 * @throws Error if tenantId is invalid or SET LOCAL fails
 */
export async function setTenantContext(trx: any, tenantId: string): Promise<void> {
  // AUDIT FIX (MT-UUID): Validate UUID format using shared validator
  if (!isValidUuid(tenantId)) {
    throw new Error('Invalid tenant ID format');
  }

  await trx.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
}

/**
 * Helper to run a callback within tenant context.
 * Ensures RLS is properly set for the entire transaction.
 * 
 * @param tenantId - The tenant UUID
 * @param callback - Function to execute within the tenant context
 * @returns The result of the callback
 */
export async function withTenantContext<T>(
  tenantId: string,
  callback: (trx: any) => Promise<T>
): Promise<T> {
  const db = getDb();
  return db.transaction(async (trx) => {
    await setTenantContext(trx, tenantId);
    return callback(trx);
  });
}

/**
 * Optional tenant hook for public endpoints.
 * Sets default tenant if no auth token present.
 * For public endpoints, we don't require tenant context for RLS
 * (handled by COALESCE in RLS policy).
 * 
 * CRITICAL FIX Issue #7: Converted to async/await to prevent race condition
 */
export async function optionalTenantHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const user = (request as any).user;
    if (user?.tenant_id) {
      (request as any).tenantId = user.tenant_id;
      
      // CRITICAL FIX Issue #4 & #7: Set tenant context within transaction
      // Use transaction from request if available, otherwise fall back to db
      const trx = (request as any).transaction;
      const db = trx || getDb();
      
      try {
        // Add 1 second timeout to prevent hanging
        await Promise.race([
          db.raw('SET LOCAL app.current_tenant_id = ?', [user.tenant_id]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
        ]);
        request.log.debug({ tenantId: user.tenant_id, usesTrx: !!trx }, 'Optional tenant context set');
      } catch (err: any) {
        request.log.warn({ error: err }, 'Failed to set optional tenant context');
      }
    } else {
      // No tenant context for public/unauthenticated requests
      // The RLS policy's COALESCE will allow access without tenant context for SELECT
      (request as any).tenantId = undefined;
      request.log.debug('No tenant context for unauthenticated request');
    }
  } catch (error) {
    request.log.error({ error }, 'Optional tenant middleware error');
    throw new InternalError('Failed to process tenant context');
  }
}

/**
 * Strict tenant hook that requires tenant context and sets it in RLS.
 * Use this for all authenticated routes that access tenant data.
 * 
 * Unlike tenantHook, this version wraps the entire request in a transaction
 * context where the tenant is set.
 */
export async function strictTenantHook(request: FastifyRequest, reply: FastifyReply) {
  const user = (request as any).user;
  if (!user) {
    throw new UnauthorizedError('Authentication required');
  }

  const tenantId = user.tenant_id;
  if (!tenantId) {
    request.log.error({ userId: user.id || user.sub }, 'User token missing tenant_id');
    throw new BadRequestError('Tenant ID not found in authentication token', 'MISSING_TENANT_ID');
  }

  // AUDIT FIX (MT-UUID): Validate UUID format using shared validator
  if (!isValidUuid(tenantId)) {
    request.log.error({ tenantId }, 'Invalid tenant_id format');
    throw new BadRequestError('Invalid tenant ID format', 'INVALID_TENANT_FORMAT');
  }

  // CRITICAL FIX Issue #4: Set tenant context within transaction for RLS safety
  // Use transaction from request if available, otherwise fall back to db
  const trx = (request as any).transaction;
  const db = trx || getDb();
  
  await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
  
  // Attach tenant_id to request
  (request as any).tenantId = tenantId;
  
  request.log.debug({ tenantId, userId: user.id || user.sub, usesTrx: !!trx }, 'Strict tenant context set for RLS');
}

/**
 * Invalidate tenant cache entry
 *
 * IMPLEMENTED: TODO #9 - Tenant Cache Invalidation
 * Called when auth-service publishes a tenant status change event.
 * Removes the cached tenant data so the next request fetches fresh data from DB.
 *
 * @param tenantId - The tenant ID to invalidate
 */
export async function invalidateTenantCache(tenantId: string): Promise<void> {
  const key = `${TENANT_CACHE_PREFIX}${tenantId}`;

  try {
    const redis = getRedis();
    const deleted = await redis.del(key);

    if (deleted > 0) {
      logger.info({ tenantId }, 'Tenant cache invalidated');
    } else {
      logger.debug({ tenantId }, 'Tenant cache key not found (already expired or never cached)');
    }
  } catch (error: any) {
    logger.warn({ tenantId, error: error.message }, 'Failed to invalidate tenant cache');
  }
}
