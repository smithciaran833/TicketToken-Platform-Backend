import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify';

/**
 * Fastify hook to extract tenant_id from JWT
 * Should be used after authentication
 */
export function tenantHook(request: FastifyRequest, reply: FastifyReply, done: HookHandlerDoneFunction) {
  try {
    // Auth middleware should have already set request.user
    const user = (request as any).user;

    if (!user) {
      reply.code(401).send({
        error: 'Authentication required',
        code: 'UNAUTHORIZED'
      });
      return done();
    }

    // Extract tenant_id from JWT payload
    const tenantId = user.tenant_id;

    if (!tenantId) {
      request.log.error({ userId: user.id || user.sub }, 'User token missing tenant_id');
      reply.code(400).send({
        error: 'Tenant ID not found in authentication token',
        code: 'MISSING_TENANT_ID'
      });
      return done();
    }

    // Attach tenant_id to request for easy access in controllers/services
    (request as any).tenantId = tenantId;

    request.log.debug({ tenantId, userId: user.id || user.sub }, 'Tenant context set');

    done();
  } catch (error) {
    request.log.error({ error }, 'Tenant middleware error');
    reply.code(500).send({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
    done();
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
