import { FastifyPluginAsync } from 'fastify';
import { metricsService } from '../services/metrics.service';
import { logger } from '../utils/logger';

/**
 * Metrics Routes
 * Exposes Prometheus metrics and queue statistics
 */

const metricsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /metrics
   * Prometheus metrics endpoint (Prometheus format)
   */
  fastify.get('/metrics', async (request, reply) => {
    try {
      const metrics = await metricsService.getMetrics();
      return reply
        .code(200)
        .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
        .send(metrics);
    } catch (error: any) {
      logger.error('Failed to get metrics', { error: error.message });
      return reply.code(500).send({ error: 'Failed to retrieve metrics' });
    }
  });

  /**
   * GET /metrics/json
   * Metrics in JSON format (for dashboards/debugging)
   */
  fastify.get('/metrics/json', async (request, reply) => {
    try {
      const metrics = await metricsService.getMetricsJSON();
      return reply.code(200).send({
        timestamp: new Date().toISOString(),
        metrics,
      });
    } catch (error: any) {
      logger.error('Failed to get JSON metrics', { error: error.message });
      return reply.code(500).send({ error: 'Failed to retrieve metrics' });
    }
  });

  /**
   * GET /metrics/queue-stats
   * Detailed queue statistics
   */
  fastify.get('/metrics/queue-stats', async (request, reply) => {
    try {
      // In a real implementation, you would query Bull queues here
      // For now, return a structure showing what would be available
      const stats = {
        timestamp: new Date().toISOString(),
        queues: {
          payment: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: false,
          },
          refund: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: false,
          },
          mint: {
            waiting: 0,
            active: 0,
            completed: 0,
            failed: 0,
            delayed: 0,
            paused: false,
          },
        },
      };

      return reply.code(200).send(stats);
    } catch (error: any) {
      logger.error('Failed to get queue stats', { error: error.message });
      return reply.code(500).send({ error: 'Failed to retrieve queue statistics' });
    }
  });

  /**
   * GET /metrics/system
   * System-level metrics
   */
  fastify.get('/metrics/system', async (request, reply) => {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();

      const stats = {
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        process: {
          pid: process.pid,
          version: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      };

      return reply.code(200).send(stats);
    } catch (error: any) {
      logger.error('Failed to get system metrics', { error: error.message });
      return reply.code(500).send({ error: 'Failed to retrieve system metrics' });
    }
  });
};

export default metricsRoutes;
