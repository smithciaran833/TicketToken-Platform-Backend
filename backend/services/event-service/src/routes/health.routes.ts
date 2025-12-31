import { FastifyInstance } from 'fastify';
import { register } from '../utils/metrics';
import { HealthCheckService } from '../services/healthCheck.service';
import { DatabaseService } from '../services/databaseService';
import { getRedis } from '../config/redis';

const healthCheckService = new HealthCheckService();

export default async function healthRoutes(app: FastifyInstance) {
  /**
   * Kubernetes Liveness Probe
   * 
   * GET /health/live
   * 
   * CRITICAL FIX: Must be <100ms and do NO dependency checks.
   * Only confirms the process is alive and can respond.
   * Does NOT check database, Redis, or any external services.
   * 
   * Use for: livenessProbe in Kubernetes
   */
  app.get('/health/live', async (_request, reply) => {
    // CRITICAL: NO async operations, NO database checks, NO Redis checks
    // This must return immediately (<100ms) to prevent pod restarts
    return reply.status(200).send({
      status: 'ok',
      timestamp: Date.now(),
      service: 'event-service',
    });
  });

  /**
   * Kubernetes Readiness Probe
   * 
   * GET /health/ready
   * 
   * Checks if the service can handle requests (local dependencies only).
   * Does NOT check external services to prevent cascading failures.
   * 
   * Use for: readinessProbe in Kubernetes
   */
  app.get('/health/ready', async (request, reply) => {
    try {
      const db = DatabaseService.getPool();
      const redis = getRedis();

      const result = await healthCheckService.performReadinessCheck(db, redis);
      const statusCode = result.status === 'ready' ? 200 : 503;

      return reply.status(statusCode).send(result);
    } catch (error: any) {
      return reply.status(503).send({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: 'HEALTH_CHECK_ERROR',
      });
    }
  });

  /**
   * Kubernetes Startup Probe
   * 
   * GET /health/startup
   * 
   * Used to check if the application has finished initialization.
   * Kubernetes uses this to know when to start liveness/readiness checks.
   * 
   * Use for: startupProbe in Kubernetes
   */
  app.get('/health/startup', async (request, reply) => {
    try {
      const db = DatabaseService.getPool();
      const redis = getRedis();

      const result = await healthCheckService.performStartupCheck(db, redis);
      const statusCode = result.ready ? 200 : 503;

      return reply.status(statusCode).send(result);
    } catch (error: any) {
      return reply.status(503).send({
        ready: false,
        message: 'Service not initialized',
      });
    }
  });

  /**
   * Comprehensive Health Check (for monitoring dashboards)
   * 
   * GET /health
   * 
   * CRITICAL FIX: External service checks are REMOVED by default to prevent
   * cascading failures. Add ?include_deps=true to include them for debugging.
   * 
   * External service status does NOT affect the overall health status.
   */
  app.get('/health', async (request, reply) => {
    try {
      const db = DatabaseService.getPool();
      const redis = getRedis();
      
      // Parse query parameter for including external dependencies
      const includeExternalDeps = (request.query as any)?.include_deps === 'true';

      const healthCheck = await healthCheckService.performHealthCheck(
        db,
        redis,
        includeExternalDeps
      );

      const statusCode = healthCheck.status === 'healthy' ? 200 : 
                        healthCheck.status === 'degraded' ? 200 : 503;

      return reply.status(statusCode).send(healthCheck);
    } catch (error: any) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'HEALTH_CHECK_FAILED',
      });
    }
  });

  /**
   * Prometheus Metrics Endpoint
   * 
   * GET /metrics
   * 
   * Returns Prometheus-formatted metrics for scraping.
   */
  app.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });

  /**
   * Dependencies Status (for debugging)
   * 
   * GET /health/dependencies
   * 
   * Returns status of external dependencies without affecting health.
   * This is useful for debugging connectivity issues.
   */
  app.get('/health/dependencies', async (request, reply) => {
    try {
      const db = DatabaseService.getPool();
      const redis = getRedis();

      // Get full health check with external dependencies
      const healthCheck = await healthCheckService.performHealthCheck(
        db,
        redis,
        true // Include external dependencies
      );

      return reply.status(200).send({
        timestamp: new Date().toISOString(),
        local: {
          database: healthCheck.checks.database,
          redis: healthCheck.checks.redis,
        },
        external: healthCheck.dependencies || {},
      });
    } catch (error: any) {
      return reply.status(500).send({
        timestamp: new Date().toISOString(),
        error: 'DEPENDENCY_CHECK_FAILED',
      });
    }
  });
}
