import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { analyticsService } from '../services/notification-metrics.service';
import { metricsAggregatorService } from '../services/metrics-aggregator.service';
import { logger } from '../config/logger';
import { authMiddleware } from '../middleware/auth.middleware';

// Helper to check admin role
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (request.user!.role !== 'admin') {
    logger.warn('Unauthorized analytics access attempt', {
      userId: request.user!.id,
      role: request.user!.role
    });
    return reply.status(403).send({
      error: 'Forbidden',
      message: 'Admin access required'
    });
  }
};

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // Get dashboard metrics (business metrics)
  fastify.get('/analytics/metrics/dashboard', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const metrics = await metricsAggregatorService.getDashboardMetrics();
      reply.send(metrics);
    } catch (error) {
      logger.error('Failed to get dashboard metrics', { error });
      reply.status(500).send({ error: 'Failed to get dashboard metrics' });
    }
  });

  // Get overall metrics
  fastify.get('/analytics/metrics', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        startDate?: string;
        endDate?: string;
        channel?: string;
      };

      const { startDate, endDate, channel } = query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const metrics = await analyticsService.getMetrics(start, end, channel);
      reply.send(metrics);
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      reply.status(500).send({ error: 'Failed to get metrics' });
    }
  });

  // Get channel breakdown
  fastify.get('/analytics/channels', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        startDate?: string;
        endDate?: string;
      };

      const { startDate, endDate } = query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const metrics = await analyticsService.getChannelMetrics(start, end);
      reply.send(metrics);
    } catch (error) {
      logger.error('Failed to get channel metrics', { error });
      reply.status(500).send({ error: 'Failed to get channel metrics' });
    }
  });

  // Get hourly breakdown
  fastify.get('/analytics/hourly/:date', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const params = request.params as { date: string };
      const query = request.query as { channel?: string };

      const { date } = params;
      const { channel } = query;

      const breakdown = await analyticsService.getHourlyBreakdown(
        new Date(date),
        channel
      );
      reply.send(breakdown);
    } catch (error) {
      logger.error('Failed to get hourly breakdown', { error });
      reply.status(500).send({ error: 'Failed to get hourly breakdown' });
    }
  });

  // Get top notification types
  fastify.get('/analytics/top-types', {
    preHandler: [authMiddleware, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        startDate?: string;
        endDate?: string;
        limit?: string;
      };

      const { startDate, endDate, limit } = query;

      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const types = await analyticsService.getTopNotificationTypes(
        start,
        end,
        parseInt(limit || '10')
      );
      reply.send(types);
    } catch (error) {
      logger.error('Failed to get top types', { error });
      reply.status(500).send({ error: 'Failed to get top types' });
    }
  });

  // Track email open
  fastify.get('/track/open/:trackingId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        n?: string;
        u?: string;
      };

      const { n: notificationId, u: userId } = query;

      if (notificationId && userId) {
        await analyticsService.trackEngagement({
          notificationId,
          userId,
          action: 'opened'
        });
      }

      // Return 1x1 transparent pixel
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      reply
        .code(200)
        .header('Content-Type', 'image/gif')
        .header('Content-Length', pixel.length)
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
        .send(pixel);
    } catch (error) {
      logger.error('Failed to track open', { error });
      const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      reply.code(200).send(pixel);
    }
  });

  // Track link click
  fastify.get('/track/click', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as {
        n?: string;
        u?: string;
        l?: string;
        url?: string;
      };

      const { n: notificationId, u: userId, l: linkId, url } = query;

      if (notificationId && userId && linkId && url) {
        await analyticsService.trackClick({
          notificationId,
          userId,
          linkId,
          originalUrl: url,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent']
        });
      }

      // Redirect to original URL
      reply.redirect(url || '/');
    } catch (error) {
      logger.error('Failed to track click', { error });
      const query = request.query as { url?: string };
      reply.redirect(query.url || '/');
    }
  });
}
