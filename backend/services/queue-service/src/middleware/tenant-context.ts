import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId =
    ((request as any).user)?.tenant_id ||
    ((request as any).user)?.tenantId ||
    request.tenantId ||
    DEFAULT_TENANT_ID;

  try {
    // Get database pool and set tenant context
    const pool = getPool();
    await pool.query('SET LOCAL app.current_tenant = $1', [tenantId]);

    request.tenantId = tenantId;
    request.log?.debug({ tenantId }, 'Tenant context set for queue service');
  } catch (error) {
    request.log?.error({ error, tenantId }, 'Failed to set tenant context');
    throw error;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    tenantId?: string;
  }
}
