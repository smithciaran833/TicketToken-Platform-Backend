import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';
import { db } from '../config/database';
/**
 * Fastify hook to extract tenant_id from JWT and validate tenant exists
 * Should be used after authentication
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
      // Attach tenant_id to request for easy access in controllers/services
      (request as any).tenantId = tenantId;
      (request as any).tenant = tenant; // Optionally attach full tenant object
      request.log.debug({ tenantId, userId: user.id || user.sub }, 'Tenant validated and context set');
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
 * Optional tenant hook for public endpoints
 * Sets default tenant if no auth token present
 */
export function optionalTenantHook(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
  try {
    const user = (request as any).user;
    if (user && user.tenant_id) {
      (request as any).tenantId = user.tenant_id;
    } else {
      // Use default tenant for public/unauthenticated requests
      (request as any).tenantId = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
      request.log.debug('Using default tenant for unauthenticated request');
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
