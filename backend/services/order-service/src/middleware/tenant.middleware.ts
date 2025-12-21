import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { getDatabase } from '../config/database';

export async function tenantMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    // Extract tenant ID from JWT token (set by auth middleware)
    const user = request.user;
    if (!user || !user.tenantId) {
      logger.warn('Missing tenant context in request', {
        path: request.url,
        userId: user?.id,
      });
      return reply.status(403).send({
        error: 'Forbidden',
        message: 'Tenant context required',
      });
    }
    // Set tenant context on request
    request.tenant = {
      tenantId: user.tenantId,
      tenantName: user.tenantName,
    };
    // Set PostgreSQL session variable for RLS
    const pool = getDatabase();
    await pool.query('SET app.current_tenant = $1', [user.tenantId]);
    logger.debug('Tenant context set', {
      tenantId: user.tenantId,
      userId: user.id,
      path: request.url,
    });
  } catch (error) {
    logger.error('Error setting tenant context', {
      error,
      path: request.url,
    });
    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'Failed to set tenant context',
    });
  }
}
