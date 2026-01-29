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
import { cacheService } from '../services/cache.service';
import { query } from '../config/database';
import { getRedis } from '../config/redis';

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

    const tenantId = (request as any).tenantId;
    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    const cacheType = cache || 'all';
    let clearedPatterns: string[] = [];

    try {
      // SECURITY: Always scope cache clearing to tenant - NEVER clear global cache
      switch (cacheType) {
        case 'all':
          await cacheService.invalidate(`tenant:${tenantId}:*`);
          clearedPatterns.push(`tenant:${tenantId}:*`);
          break;
        case 'payments':
          await cacheService.invalidate(`tenant:${tenantId}:payment:*`);
          clearedPatterns.push(`tenant:${tenantId}:payment:*`);
          break;
        case 'fraud':
          await cacheService.invalidate(`tenant:${tenantId}:fraud:*`);
          clearedPatterns.push(`tenant:${tenantId}:fraud:*`);
          break;
        case 'rates':
          await cacheService.invalidate(`tenant:${tenantId}:rates:*`);
          clearedPatterns.push(`tenant:${tenantId}:rates:*`);
          break;
        case 'escrow':
          await cacheService.invalidate(`tenant:${tenantId}:escrow:*`);
          clearedPatterns.push(`tenant:${tenantId}:escrow:*`);
          break;
        default:
          return reply.status(400).send({
            error: 'Invalid cache type',
            validTypes: ['all', 'payments', 'fraud', 'rates', 'escrow']
          });
      }

      log.info({ tenantId, cacheType, clearedPatterns }, 'Cache cleared successfully');

      return reply.send({
        message: 'Cache cleared successfully',
        cache: cacheType,
        patterns: clearedPatterns,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error({ error: error.message, tenantId, cacheType }, 'Failed to clear cache');
      return reply.status(500).send({
        error: 'Failed to clear cache',
        details: error.message
      });
    }
  });

  /**
   * GET /admin/audit-log
   * Get recent payment audit log entries
   *
   * SECURITY: Uses explicit field list - excludes internal Stripe IDs from non-internal consumers
   */
  fastify.get('/audit-log', async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit = 100, offset = 0, event_type } = request.query as {
      limit?: number;
      offset?: number;
      event_type?: string;
    };
    const tenantId = (request as any).tenantId;

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    // Validate and cap limit
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 500);
    const safeOffset = Math.max(0, Number(offset) || 0);

    try {
      // SECURITY: Explicit field list - excludes stripe_event_id for external consumers
      const SAFE_AUDIT_FIELDS = 'id, event_type, transfer_id, payout_id, dispute_id, amount, metadata, created_at';

      let queryText = `
        SELECT ${SAFE_AUDIT_FIELDS}
        FROM payment_audit_log
        WHERE tenant_id = $1
      `;
      const params: any[] = [tenantId];

      // Optional filter by event type
      if (event_type) {
        queryText += ` AND event_type = $${params.length + 1}`;
        params.push(event_type);
      }

      queryText += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(safeLimit, safeOffset);

      const result = await query(queryText, params);

      // Get total count for pagination
      let countQuery = `SELECT COUNT(*) as total FROM payment_audit_log WHERE tenant_id = $1`;
      const countParams: any[] = [tenantId];
      if (event_type) {
        countQuery += ` AND event_type = $2`;
        countParams.push(event_type);
      }
      const countResult = await query(countQuery, countParams);
      const total = parseInt(countResult.rows[0]?.total || '0');

      log.info({ tenantId, limit: safeLimit, offset: safeOffset, count: result.rows.length }, 'Audit log retrieved');

      return reply.send({
        entries: result.rows.map(row => ({
          id: row.id,
          eventType: row.event_type,
          transferId: row.transfer_id,
          payoutId: row.payout_id,
          disputeId: row.dispute_id,
          amount: row.amount ? parseInt(row.amount) : null,
          metadata: row.metadata,
          createdAt: row.created_at,
        })),
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          total,
        },
      });
    } catch (error: any) {
      log.error({ error: error.message, tenantId }, 'Failed to retrieve audit log');
      return reply.status(500).send({
        type: 'https://api.tickettoken.io/problems/internal-error',
        title: 'Audit Log Error',
        status: 500,
        detail: 'Failed to retrieve audit log',
      });
    }
  });

  /**
   * POST /admin/maintenance/mode
   * Toggle maintenance mode for this tenant
   *
   * When enabled, non-admin requests return 503 (via maintenance middleware)
   */
  fastify.post('/maintenance/mode', async (request: FastifyRequest, reply: FastifyReply) => {
    const { enabled } = request.body as { enabled: boolean };
    const tenantId = (request as any).tenantId;

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    // Store in Redis with tenant scope
    const key = `maintenance:payment-service:${tenantId}`;

    try {
      const redis = getRedis();

      if (enabled) {
        // Set with 24-hour expiry as safety net
        await redis.set(key, 'true', 'EX', 86400);
        log.warn({ tenantId, userId: (request as any).user?.id }, 'Maintenance mode ENABLED');
      } else {
        await redis.del(key);
        log.info({ tenantId, userId: (request as any).user?.id }, 'Maintenance mode DISABLED');
      }

      return reply.send({
        message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
        enabled,
        tenantId,
        expiresIn: enabled ? '24 hours (safety)' : null,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error({ error: error.message, tenantId }, 'Failed to toggle maintenance mode');
      return reply.status(500).send({
        type: 'https://api.tickettoken.io/problems/internal-error',
        title: 'Maintenance Mode Error',
        status: 500,
        detail: 'Failed to toggle maintenance mode',
      });
    }
  });

  /**
   * GET /admin/maintenance/status
   * Check current maintenance mode status
   */
  fastify.get('/maintenance/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = (request as any).tenantId;

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }

    try {
      const redis = getRedis();
      const key = `maintenance:payment-service:${tenantId}`;
      const maintenanceMode = await redis.get(key);
      const ttl = maintenanceMode ? await redis.ttl(key) : null;

      return reply.send({
        enabled: maintenanceMode === 'true',
        tenantId,
        expiresInSeconds: ttl,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      log.error({ error: error.message, tenantId }, 'Failed to check maintenance status');
      return reply.status(500).send({ error: 'Failed to check maintenance status' });
    }
  });
}
