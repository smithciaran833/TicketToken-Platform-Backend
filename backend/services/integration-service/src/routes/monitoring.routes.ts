/**
 * Monitoring Routes
 * 
 * Provides endpoints for monitoring service health, metrics,
 * and operational insights
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { performanceMetricsService } from '../services/performance-metrics.service';
import { deadLetterQueueService } from '../services/dead-letter-queue.service';
import { idempotencyService } from '../services/idempotency.service';
import { circuitBreakerManager } from '../utils/circuit-breaker.util';
import { healthCheckService } from '../services/health-check.service';

export async function monitoringRoutes(app: FastifyInstance) {
  /**
   * GET /monitoring/metrics
   * Get comprehensive service metrics
   */
  app.get('/monitoring/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const performanceStats = performanceMetricsService.getPerformanceSummary();
      const dlqStats = deadLetterQueueService.getStats();
      const idempotencyStats = idempotencyService.getStats();
      const circuitBreakerStats = circuitBreakerManager.getAllStats();
      
      return reply.code(200).send({
        success: true,
        metrics: {
          performance: performanceStats,
          deadLetterQueue: dlqStats,
          idempotency: idempotencyStats,
          circuitBreakers: circuitBreakerStats,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve metrics',
      });
    }
  });

  /**
   * GET /monitoring/performance
   * Get detailed performance metrics
   */
  app.get('/monitoring/performance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const summary = performanceMetricsService.getPerformanceSummary();
      const slowOperations = performanceMetricsService.getSlowOperations();

      return reply.code(200).send({
        success: true,
        data: {
          summary,
          slowOperations,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve performance metrics',
      });
    }
  });

  /**
   * GET /monitoring/dlq
   * Get dead letter queue status
   */
  app.get('/monitoring/dlq', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = deadLetterQueueService.getStats();
      const failurePatterns = deadLetterQueueService.getFailurePatterns();
      const jobsNeedingAttention = deadLetterQueueService.getJobsNeedingAttention();

      return reply.code(200).send({
        success: true,
        data: {
          stats,
          failurePatterns,
          jobsNeedingAttention: jobsNeedingAttention.length,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve DLQ status',
      });
    }
  });

  /**
   * GET /monitoring/circuit-breakers
   * Get circuit breaker status
   */
  app.get('/monitoring/circuit-breakers', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = circuitBreakerManager.getAllStats();
      const openCount = circuitBreakerManager.getOpenCount();
      const hasOpenCircuits = circuitBreakerManager.hasOpenCircuits();

      return reply.code(200).send({
        success: true,
        data: {
          stats,
          openCount,
          hasOpenCircuits,
        },
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve circuit breaker status',
      });
    }
  });

  /**
   * GET /monitoring/health/deep
   * Deep health check with dependency verification
   */
  app.get('/monitoring/health/deep', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const hasOpenCircuits = circuitBreakerManager.hasOpenCircuits();
      const circuitBreakerStats = circuitBreakerManager.getAllStats();
      const dlqStats = deadLetterQueueService.getStats();
      
      // Consider unhealthy if circuit breakers are open or DLQ has too many failures
      const isHealthy = !hasOpenCircuits && dlqStats.recentFailures < 10;
      const statusCode = isHealthy ? 200 : 503;

      return reply.code(statusCode).send({
        success: isHealthy,
        status: isHealthy ? 'healthy' : 'degraded',
        circuitBreakers: circuitBreakerStats,
        deadLetterQueue: {
          total: dlqStats.total,
          recentFailures: dlqStats.recentFailures,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.code(503).send({
        success: false,
        status: 'unhealthy',
        error: 'Health check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /monitoring/health/live
   * Kubernetes liveness probe
   */
  app.get('/monitoring/health/live', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      status: 'alive',
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /monitoring/health/ready
   * Kubernetes readiness probe
   */
  app.get('/monitoring/health/ready', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check if any circuit breakers are open
      if (circuitBreakerManager.hasOpenCircuits()) {
        return reply.code(503).send({
          status: 'not ready',
          reason: 'Circuit breakers open',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.code(200).send({
        status: 'ready',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return reply.code(503).send({
        status: 'not ready',
        error: 'Readiness check failed',
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * GET /monitoring/idempotency
   * Get idempotency service stats
   */
  app.get('/monitoring/idempotency', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = idempotencyService.getStats();

      return reply.code(200).send({
        success: true,
        data: stats,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to retrieve idempotency stats',
      });
    }
  });

  /**
   * POST /monitoring/circuit-breakers/:name/reset
   * Manually reset a circuit breaker
   */
  app.post('/monitoring/circuit-breakers/:name/reset', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { name } = request.params as { name: string };
      const breaker = circuitBreakerManager.get(name);

      if (!breaker) {
        return reply.code(404).send({
          success: false,
          error: `Circuit breaker '${name}' not found`,
        });
      }

      breaker.forceClose();

      return reply.code(200).send({
        success: true,
        message: `Circuit breaker '${name}' has been reset`,
      });
    } catch (error) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to reset circuit breaker',
      });
    }
  });
}
