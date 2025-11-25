import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Tenant Middleware - Extracts and validates tenant_id from JWT
 * 
 * CRITICAL: Ensures all requests have a valid tenant context
 * Prevents cross-tenant data access
 */

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // tenant_id should already be set by auth middleware
  // This middleware validates and logs it
  
  const tenantId = request.tenantId;
  
  if (!tenantId) {
    logger.error(`Request missing tenant_id: ${request.method} ${request.url}`);
    
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Tenant context required'
    });
  }
  
  // Validate tenant_id format (should be UUID)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(tenantId)) {
    logger.error(`Invalid tenant_id format: ${tenantId} for ${request.method} ${request.url}`);
    
    return reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid tenant ID format'
    });
  }
  
  // Log tenant context for audit trail
  logger.debug(`Tenant context established: ${tenantId} for ${request.method} ${request.url}`);
  
  // Tenant is valid, continue with request
}

/**
 * Get tenant ID from request
 * Throws error if tenant ID is missing
 */
export function requireTenantId(request: FastifyRequest): string {
  const tenantId = request.tenantId;
  
  if (!tenantId) {
    throw new Error('Tenant ID is required but not found in request');
  }
  
  return tenantId;
}

/**
 * Safely get tenant ID (returns undefined if not present)
 */
export function getTenantId(request: FastifyRequest): string | undefined {
  return request.tenantId;
}
