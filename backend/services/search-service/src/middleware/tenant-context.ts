import { FastifyRequest, FastifyReply } from 'fastify';

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001';

export async function setTenantContext(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId =
    request.user?.tenant_id ||
    request.user?.venueId ||
    (request as any).tenantId ||
    DEFAULT_TENANT_ID;

  try {
    const db = (request as any).db || (request.server as any).db;

    if (db) {
      if (db.raw) {
        await db.raw('SET LOCAL app.current_tenant = ?', [tenantId]);
      } else if (db.query) {
        await db.query('SET LOCAL app.current_tenant = $1', [tenantId]);
      }
    }

    (request as any).tenantId = tenantId;
    request.log?.debug({ tenantId }, 'Tenant context set for search service');
  } catch (error) {
    request.log?.error({ error, tenantId }, 'Failed to set tenant context');
    throw error;
  }
}
