import { FastifyPluginAsync } from 'fastify';
import { logger } from '../utils/logger';

/**
 * Health Check Routes
 * Provides health and readiness endpoints for monitoring
 */

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    redis?: { status: string; latency?: number };
    stripe?: { status: string };
    solana?: { status: string };
    email?: { status: string };
  };
}

const healthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Liveness probe - Is the service running?
   */
  fastify.get('/health/live', async (request, reply) => {
    return reply.code(200).send({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  /**
   * Readiness probe - Is the service ready to handle requests?
   */
  fastify.get('/health/ready', async (request, reply) => {
    const checks: HealthResponse['checks'] = {};
    let overallStatus: HealthResponse['status'] = 'healthy';

    try {
      // Check Redis connection (queue backend)
      const redisStart = Date.now();
      try {
        // Assuming we have access to Redis client through fastify decorator
        if ((fastify as any).redis) {
          await (fastify as any).redis.ping();
          checks.redis = {
            status: 'healthy',
            latency: Date.now() - redisStart,
          };
        } else {
          checks.redis = { status: 'not_configured' };
        }
      } catch (error: any) {
        checks.redis = { status: 'unhealthy' };
        overallStatus = 'degraded';
        logger.error('Redis health check failed', { error: error.message });
      }

      // Check Stripe configuration
      try {
        const { stripeService } = await import('../services/stripe.service');
        const config = stripeService.getConfig();
        checks.stripe = {
          status: config.webhookConfigured ? 'configured' : 'partial',
        };
      } catch (error: any) {
        checks.stripe = { status: 'error' };
        logger.error('Stripe health check failed', { error: error.message });
      }

      // Check Solana configuration
      try {
        const { nftService } = await import('../services/nft.service');
        const balance = await nftService.getWalletBalance();
        checks.solana = {
          status: balance > 0.01 ? 'healthy' : 'low_balance',
        };
        if (balance <= 0.01) {
          overallStatus = 'degraded';
        }
      } catch (error: any) {
        checks.solana = { status: 'error' };
        overallStatus = 'degraded';
        logger.error('Solana health check failed', { error: error.message });
      }

      // Check Email configuration
      try {
        const { emailService } = await import('../services/email.service');
        const emailOk = await emailService.testConnection();
        checks.email = { status: emailOk ? 'healthy' : 'unhealthy' };
        if (!emailOk) {
          overallStatus = 'degraded';
        }
      } catch (error: any) {
        checks.email = { status: 'not_configured' };
        logger.warn('Email not configured');
      }

      const response: HealthResponse = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        checks,
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      return reply.code(statusCode).send(response);
    } catch (error: any) {
      logger.error('Health check failed', { error: error.message });
      return reply.code(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        checks,
        error: error.message,
      });
    }
  });

  /**
   * Startup probe - Has the service finished starting up?
   */
  fastify.get('/health/startup', async (request, reply) => {
    // Service is started if we can respond
    const uptimeSeconds = process.uptime();
    const isStarted = uptimeSeconds > 5; // Consider started after 5 seconds

    if (isStarted) {
      return reply.code(200).send({
        status: 'started',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
      });
    } else {
      return reply.code(503).send({
        status: 'starting',
        timestamp: new Date().toISOString(),
        uptime: uptimeSeconds,
      });
    }
  });
};

export default healthRoutes;
