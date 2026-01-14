/**
 * Tenant Context Middleware for Integration Service
 * 
 * Extracts and sets tenant context from JWT or headers for multi-tenant operations.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

// Extend FastifyRequest to include tenant context
declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
    venueId?: string;
  }
}

/**
 * Set tenant context from request
 */
export async function setTenantContext(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  try {
    // Try to extract tenant ID from JWT user
    const user = (request as any).user;
    if (user?.tenantId) {
      request.tenantId = user.tenantId;
    }
    
    // Try to extract from headers
    const headerTenantId = request.headers['x-tenant-id'];
    if (headerTenantId && typeof headerTenantId === 'string') {
      request.tenantId = headerTenantId;
    }
    
    // Extract venue ID if present
    const headerVenueId = request.headers['x-venue-id'];
    if (headerVenueId && typeof headerVenueId === 'string') {
      request.venueId = headerVenueId;
    }
    
    // Try to get venue ID from user
    if (user?.venueId) {
      request.venueId = user.venueId;
    }
    
    // Log context for debugging
    if (request.tenantId || request.venueId) {
      logger.debug('Tenant context set', {
        tenantId: request.tenantId,
        venueId: request.venueId,
        requestId: request.id
      });
    }
  } catch (error) {
    logger.warn('Failed to set tenant context', {
      error: (error as Error).message,
      requestId: request.id
    });
  }
}

/**
 * Tenant context middleware as Fastify hook
 */
export function tenantContext(
  request: FastifyRequest,
  _reply: FastifyReply,
  done: () => void
): void {
  setTenantContext(request, _reply)
    .then(() => done())
    .catch((error) => {
      logger.error('Tenant context middleware error', { error: (error as Error).message });
      done();
    });
}

/**
 * Require tenant context - throws if not present
 */
export async function requireTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await setTenantContext(request, reply);
  
  if (!request.tenantId) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Tenant context is required',
      statusCode: 400
    });
  }
}

/**
 * Require venue context - throws if not present
 */
export async function requireVenueContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  await setTenantContext(request, reply);
  
  if (!request.venueId) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Venue context is required',
      statusCode: 400
    });
  }
}

export default {
  setTenantContext,
  tenantContext,
  requireTenantContext,
  requireVenueContext
};
