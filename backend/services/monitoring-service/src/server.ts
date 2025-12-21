import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { register } from 'prom-client';
import { registerRoutes } from './routes/index';
import { metricsCollector } from './metrics.collector';
import { alertingService } from './alerting.service';
import { logger } from './logger';
import grafanaRoutes from './routes/grafana.routes';
import analyticsRoutes from './routes/analytics.routes';
import { metricsAuth } from './middleware/metrics-auth.middleware';
import { authenticate, authorize } from './middleware/auth.middleware';
import { setTenantContext } from './middleware/tenant-context';

export async function createServer() {
  const app = Fastify({
    logger: false,
    disableRequestLogging: true,
  });

  // Register plugins
  await app.register(cors);
  await app.register(helmet);

  // Tenant isolation middleware
  app.addHook('onRequest', async (request, reply) => {
    try {
      await setTenantContext(request, reply);
    } catch (error) {
      logger.error('Failed to set tenant context', error);
    }
  });
  
  // Configure rate limiting
  await app.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    redis: process.env.REDIS_URL ? require('ioredis').createClient(process.env.REDIS_URL) : undefined,
  });

  // Prometheus metrics endpoint (secured with IP whitelist or Basic auth)
  app.get('/metrics', { preHandler: metricsAuth }, async (request, reply) => {
    try {
      reply.header('Content-Type', register.contentType);
      const metrics = await metricsCollector.getMetrics();
      reply.send(metrics);
    } catch (error) {
      reply.code(500).send();
    }
  });

  // Business metrics API (requires JWT authentication)
  app.get('/api/business-metrics', { preHandler: authenticate }, async (request, reply) => {
    try {
      const metrics = await metricsCollector.getBusinessMetrics();
      reply.send(metrics);
    } catch (error) {
      reply.code(500).send({ error: 'Failed to fetch metrics' });
    }
  });

  // Alert status endpoint (requires JWT authentication)
  app.get('/api/alerts', { preHandler: authenticate }, async (request, reply) => {
    const alerts = (alertingService as any).getAlertStatus();
    reply.send(alerts);
  });

  // Register all API routes (includes /health via health.routes.ts)
  await registerRoutes(app);

  // Register Grafana routes
  await app.register(grafanaRoutes, { prefix: '/grafana' });

  // Register Analytics routes
  await app.register(analyticsRoutes, { prefix: '/api/v1/analytics' });

  // 404 handler
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: 'Not Found',
      message: 'Route not found',
      path: request.url,
    });
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Server error:', error);
    reply.code(500).send({
      error: 'Internal Server Error',
      message: error.message,
    });
  });

  return app;
}

// Start monitoring loops
export function startMonitoring() {
  // Check alerts every minute
  setInterval(async () => {
    try {
      // Calculate actual payment failure rate from metrics
      const paymentMetrics = await register.getSingleMetric('payment_success_total');
      const failureMetrics = await register.getSingleMetric('payment_failure_total');
      
      if (paymentMetrics && failureMetrics) {
        const successValues = await paymentMetrics.get();
        const failureValues = await failureMetrics.get();
        
        const totalSuccess = successValues.values.reduce((sum, v) => sum + v.value, 0);
        const totalFailures = failureValues.values.reduce((sum, v) => sum + v.value, 0);
        const totalPayments = totalSuccess + totalFailures;
        
        if (totalPayments > 0) {
          const paymentFailureRate = totalFailures / totalPayments;
          await alertingService.checkAlert('payment_failure_spike', paymentFailureRate);
        }
      }

      // Check other alert conditions
      const errorMetrics = await register.getSingleMetric('errors_total');
      if (errorMetrics) {
        const errorValues = await errorMetrics.get();
        const totalErrors = errorValues.values.reduce((sum, v) => sum + v.value, 0);
        // Calculate error rate if we have a way to get total requests
        // This is a placeholder - would need actual request count
        if (totalErrors > 100) { // Simple threshold check
          await alertingService.checkAlert('api_error_rate_high', totalErrors / 1000);
        }
      }
    } catch (error) {
      logger.error('Alert check failed:', error);
    }
  }, 60000);

  // Note: System metrics (activeUsers, queueSize, cacheHitRate) should be updated
  // by the actual services that track these values, not by random generation.
  // These metrics are set by:
  // - Services pushing metrics via API calls
  // - Queue services updating queue sizes
  // - Cache services reporting hit rates
  // - Session management tracking active users
  
  logger.info('Monitoring loops started');
}

// Listen for critical errors
metricsCollector.on('critical_error', async (error) => {
  logger.error('Critical error detected:', error);
  await alertingService.checkAlert('api_error_rate_high', 1);
});
