import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Tenant middleware for public routes
 * Extracts tenant_id from x-tenant-id header
 * For authenticated routes, auth middleware already sets tenantId from JWT
 */
export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  // If tenantId already set by auth middleware, skip
  if ((request as any).tenantId) {
    return;
  }

  // Try to get tenant from header
  const tenantId = request.headers['x-tenant-id'] as string;
  
  if (tenantId) {
    (request as any).tenantId = tenantId;
  }
}
