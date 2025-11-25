import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'TenantMiddleware' });

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const tenantId = request.headers['x-tenant-id'] as string;

    if (!tenantId) {
      log.warn('Request missing tenant ID');
      return reply.status(400).send({ error: 'Tenant ID required' });
    }

    (request as any).tenantId = tenantId;
  } catch (error) {
    log.error('Tenant middleware error:', error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
}

export async function webhookTenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  (request as any).tenantId = process.env.DEFAULT_TENANT_ID || '00000000-0000-0000-0000-000000000001';
}
