/**
 * Admin Routes for Payment Service
 * 
 * HIGH FIX: Implements admin-only endpoints with:
 * - Admin role enforcement
 * - Circuit breaker stats
 * - Manual escrow release
 * - Transfer retry management
 * - Health/status information
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { circuitBreakerRegistry } from '../utils/circuit-breaker';
import { processPendingTransfers, getTransferStatus } from '../jobs/transfer-retry.job';
import { escrowService } from '../services/escrow.service';
import { metricsRegistry } from './metrics.routes';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'AdminRoutes' });

// =============================================================================
// ADMIN AUTH MIDDLEWARE
// =============================================================================

async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const user = (request as any).user;
  
  if (!user || !user.roles || !user.roles.includes('admin')) {
    reply.status(403).send({
      type: 'https://api.tickettoken.io/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'Admin access required',
    });
    return;
  }
}

// =============================================================================
// ROUTES
// =============================================================================

export default async function adminRoutes(fastify: FastifyInstance) {
  // Apply admin auth to all routes in this plugin
  fastify.addHook('preHandler', requireAdmin);

  /**
   * GET /admin/status
   * Get service status overview
   */
  fastify.get('/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const circuitStats = circuitBreakerRegistry.getAllStats();
    
    return reply.send({
      service: 'payment-service',
      version: process.env.SERVICE_VERSION || '1.0.0',
      environment: process.env.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      circuitBreakers: circuitStats,
      memory: process.memoryUsage(),
    });
  });

  /**
   * GET /admin/circuit-breakers
   * Get circuit breaker status
   */
  fastify.get('/circuit-breakers', async (request: FastifyRequest, reply: FastifyReply) => {
    const stats = circuitBreakerRegistry.getAllStats();
    
    return reply.send({
      breakers: stats,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * POST /admin/circuit-breakers/:name/reset
   * Reset a specific circuit breaker
   */
  fastify.post(
    '/circuit-breakers/:name/reset',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      
      const breakers = circuitBreakerRegistry.getAll();
      const breaker = breakers.get(name);
      
      if (!breaker) {
        return reply.status(404).send({
          type: 'https://api.tickettoken.io/problems/not-found',
          title: 'Circuit Breaker Not Found',
          status: 404,
          detail: `Circuit breaker '${name}' not found`,
        });
      }

      breaker.reset();
      
      log.info({ breakerName: name, userId: (request as any).user?.id }, 'Circuit breaker reset by admin');

      return reply.send({
        message: `Circuit breaker '${name}' has been reset`,
        stats: breaker.getStats(),
      });
    }
  );

  /**
   * POST /admin/circuit-breakers/:name/open
   * Force open a circuit breaker
   */
  fastify.post(
    '/circuit-breakers/:name/open',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { name } = request.params as { name: string };
      
      const breakers = circuitBreakerRegistry.getAll();
      const breaker = breakers.get(name);
      
      if (!breaker) {
        return reply.status(404).send({
          type: 'https://api.tickettoken.io/problems/not-found',
          title: 'Circuit Breaker Not Found',
          status: 404,
        });
      }

      breaker.forceOpen();
      
      log.warn({ breakerName: name, userId: (request as any).user?.id }, 'Circuit breaker force opened by admin');

      return reply.send({
        message: `Circuit breaker '${name}' has been force opened`,
        stats: breaker.getStats(),
      });
    }
  );

  /**
   * POST /admin/transfers/process
   * Manually trigger transfer retry processing
   */
  fastify.post('/transfers/process', async (request: FastifyRequest, reply: FastifyReply) => {
    log.info({ userId: (request as any).user?.id }, 'Manual transfer processing triggered');

    try {
      await processPendingTransfers();
      
      return reply.send({
        message: 'Transfer processing completed',
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error({ error: error.message }, 'Transfer processing failed');
      
      return reply.status(500).send({
        type: 'https://api.tickettoken.io/problems/internal-error',
        title: 'Processing Failed',
        status: 500,
        detail: error.message,
      });
    }
  });

  /**
   * GET /admin/transfers/:id/status
   * Get status of a pending transfer
   */
  fastify.get(
    '/transfers/:id/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      
      const status = await getTransferStatus(id);
      
      if (!status) {
        return reply.status(404).send({
          type: 'https://api.tickettoken.io/problems/not-found',
          title: 'Transfer Not Found',
          status: 404,
        });
      }

      return reply.send(status);
    }
  );

  /**
   * POST /admin/escrow/:escrowId/force-release
   * Force release an escrow (admin override)
   */
  fastify.post(
    '/escrow/:escrowId/force-release',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { escrowId } = request.params as { escrowId: string };
      const tenantId = (request as any).tenantId;
      const body = request.body as { reason: string };

      log.warn({
        escrowId,
        userId: (request as any).user?.id,
        reason: body.reason,
      }, 'Admin force release of escrow');

      try {
        const escrow = await escrowService.releaseEscrow({
          escrowId,
          tenantId,
          reason: `ADMIN OVERRIDE: ${body.reason}`,
        });

        return reply.send({
          message: 'Escrow force released',
          escrow,
        });
      } catch (error: any) {
        return reply.status(400).send({
          type: 'https://api.tickettoken.io/problems/release-failed',
          title: 'Release Failed',
          status: 400,
          detail: error.message,
        });
      }
    }
  );

  /**
   * POST /admin/escrow/process-ready
   * Process all escrows ready for release
   */
  fastify.post('/escrow/process-ready', async (request: FastifyRequest, reply: FastifyReply) => {
    log.info({ userId: (request as any).user?.id }, 'Manual escrow processing triggered');

    try {
      const processedCount = await escrowService.processReadyEscrows();

      return reply.send({
        message: 'Escrow processing completed',
        processedCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return reply.status(500).send({
        type: 'https://api.tickettoken.io/problems/internal-error',
        title: 'Processing Failed',
        status: 500,
        detail: error.message,
      });
    }
  });

  /**
   * GET /admin/metrics/summary
   * Get metrics summary (not full Prometheus format)
   */
  fastify.get('/metrics/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const metrics = metricsRegistry.getAllMetrics();
    
    return reply.send({
      metrics,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * POST /admin/cache/clear
   * Clear caches (dangerous, use carefully)
   */
  fastify.post('/cache/clear', async (request: FastifyRequest, reply: FastifyReply) => {
    const { cache } = request.body as { cache?: string };

    log.warn({
      userId: (request as any).user?.id,
      cache,
    }, 'Admin clearing cache');

    // TODO: Implement cache clearing based on cache type
    // For now, just acknowledge the request

    return reply.send({
      message: 'Cache clear requested',
      cache: cache || 'all',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /admin/audit-log
   * Get recent payment audit log entries
   */
  fastify.get('/audit-log', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = 100, offset = 0 } = request.query as { limit?: number; offset?: number };
    
    // TODO: Implement database query for audit log
    // This is a placeholder response
    
    return reply.send({
      entries: [],
      pagination: {
        limit,
        offset,
        total: 0,
      },
    });
  });

  /**
   * POST /admin/maintenance/mode
   * Toggle maintenance mode
   */
  fastify.post('/maintenance/mode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { enabled } = request.body as { enabled: boolean };

    log.warn({
      userId: (request as any).user?.id,
      maintenanceMode: enabled,
    }, 'Maintenance mode changed');

    // TODO: Implement maintenance mode toggle
    // This would typically set a flag that middleware checks

    return reply.send({
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      enabled,
      timestamp: new Date().toISOString(),
    });
  });
}
