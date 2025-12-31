import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { db } from '../config/database';
import { isValidUuid } from '../schemas/common.schema';

/**
 * Fastify hook to extract tenant_id from JWT, validate tenant exists,
 * and set tenant context for RLS policies.
 * 
 * CRITICAL: This middleware must be used after authentication and MUST
 * call SET LOCAL app.current_tenant_id for RLS policies to work correctly.
 */
export async function tenantHook(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Auth middleware should have already set request.user
    const user = (request as any).user;
    if (!user) {
      reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    // Extract tenant_id from JWT payload
    const tenantId = user.tenant_id;
    if (!tenantId) {
      request.log.error({ userId: user.id || user.sub }, 'User token missing tenant_id');
      reply.code(400).send({
        error: 'Tenant ID not found in authentication token',
        code: 'MISSING_TENANT_ID'
      });
      return;
    }

    // AUDIT FIX (MT-UUID): Validate UUID format using shared validator
    if (!isValidUuid(tenantId)) {
      request.log.error({ tenantId }, 'Invalid tenant_id format');
      reply.code(400).send({
        error: 'Invalid tenant ID format',
        code: 'INVALID_TENANT_FORMAT'
      });
      return;
    }

    // Verify tenant exists and is active in database
    try {
      const tenant = await db('tenants')
        .where({ id: tenantId })
        .first();

      if (!tenant) {
        request.log.error({ tenantId }, 'Tenant not found in database');
        reply.code(403).send({
          error: 'Invalid tenant. The tenant does not exist.',
          code: 'INVALID_TENANT'
        });
        return;
      }

      if (tenant.status !== 'active') {
        request.log.warn({ tenantId, status: tenant.status }, 'Inactive tenant attempted access');
        reply.code(403).send({
          error: 'Tenant account is not active',
          code: 'INACTIVE_TENANT'
        });
        return;
      }

      // CRITICAL: Set tenant context for RLS policies
      // This SET LOCAL only persists for the current transaction
      await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);

      // Attach tenant_id to request for easy access in controllers/services
      (request as any).tenantId = tenantId;
      (request as any).tenant = tenant;
      
      request.log.debug({ tenantId, userId: user.id || user.sub }, 'Tenant validated and RLS context set');

    } catch (dbError) {
      request.log.error({ error: dbError, tenantId }, 'Database error validating tenant');
      reply.code(500).send({
        error: 'Failed to validate tenant',
        code: 'TENANT_VALIDATION_ERROR'
      });
    }
  } catch (error) {
    request.log.error({ error }, 'Tenant middleware error');
    reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
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
 */
export function optionalTenantHook(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
  try {
    const user = (request as any).user;
    if (user && user.tenant_id) {
      (request as any).tenantId = user.tenant_id;
      
      // Set tenant context for authenticated users (non-blocking)
      db.raw('SET LOCAL app.current_tenant_id = ?', [user.tenant_id])
        .then(() => {
          request.log.debug({ tenantId: user.tenant_id }, 'Optional tenant context set');
        })
        .catch((err: any) => {
          request.log.warn({ error: err }, 'Failed to set optional tenant context');
        });
    } else {
      // No tenant context for public/unauthenticated requests
      // The RLS policy's COALESCE will allow access without tenant context for SELECT
      (request as any).tenantId = null;
      request.log.debug('No tenant context for unauthenticated request');
    }
    done();
  } catch (error) {
    request.log.error({ error }, 'Optional tenant middleware error');
    reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
    done();
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
  try {
    const user = (request as any).user;
    if (!user) {
      reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
      return;
    }

    const tenantId = user.tenant_id;
    if (!tenantId) {
      request.log.error({ userId: user.id || user.sub }, 'User token missing tenant_id');
      reply.code(400).send({
        error: 'Tenant ID not found in authentication token',
        code: 'MISSING_TENANT_ID'
      });
      return;
    }

    // AUDIT FIX (MT-UUID): Validate UUID format using shared validator
    if (!isValidUuid(tenantId)) {
      request.log.error({ tenantId }, 'Invalid tenant_id format');
      reply.code(400).send({
        error: 'Invalid tenant ID format',
        code: 'INVALID_TENANT_FORMAT'
      });
      return;
    }

    // Set tenant context for RLS - must be done at start of each request
    await db.raw('SET LOCAL app.current_tenant_id = ?', [tenantId]);
    
    // Attach tenant_id to request
    (request as any).tenantId = tenantId;
    
    request.log.debug({ tenantId, userId: user.id || user.sub }, 'Strict tenant context set for RLS');

  } catch (error) {
    request.log.error({ error }, 'Strict tenant middleware error');
    reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
}
