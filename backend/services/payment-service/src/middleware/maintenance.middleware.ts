/**
 * Maintenance Mode Middleware
 *
 * Blocks non-admin requests when maintenance mode is enabled for a tenant.
 * Maintenance mode is stored in Redis with key: maintenance:payment-service:{tenantId}
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'MaintenanceMiddleware' });

export async function maintenanceMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tenantId = (request as any).tenantId;
  const user = (request as any).user;

  // Skip check if no tenant context (shouldn't happen in normal flow)
  if (!tenantId) {
    return;
  }

  // Skip for health check endpoints
  if (request.url.startsWith('/health') || request.url.startsWith('/ready')) {
    return;
  }

  try {
    const redis = getRedis();
    const key = `maintenance:payment-service:${tenantId}`;
    const maintenanceMode = await redis.get(key);

    if (maintenanceMode === 'true') {
      // Allow admin requests through
      const isAdmin = user?.roles?.includes('admin') || user?.is_admin === true;

      if (!isAdmin) {
        log.warn({
          tenantId,
          path: request.url,
          method: request.method,
          userId: user?.id,
        }, 'Request blocked - maintenance mode');

        return reply.status(503).send({
          type: 'https://api.tickettoken.io/problems/service-unavailable',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Payment service is under maintenance. Please try again shortly.',
          maintenance: true,
          retryAfter: 300, // Suggest retry in 5 minutes
        });
      }

      // Admin - log that they bypassed maintenance
      log.info({
        tenantId,
        path: request.url,
        userId: user?.id,
      }, 'Admin bypassed maintenance mode');
    }
  } catch (error: any) {
    // If Redis fails, log but don't block requests
    log.error({ error: error.message, tenantId }, 'Maintenance check failed - allowing request');
    // Fail open - don't block legitimate traffic due to Redis issues
  }
}
