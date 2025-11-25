import { FastifyInstance } from 'fastify';
import { register } from '../utils/metrics';
import { orderCacheService } from '../services/order-cache.service';

export async function metricsRoutes(fastify: FastifyInstance) {
  // Prometheus metrics endpoint
  fastify.get('/metrics', async (_request, reply) => {
    const metrics = await register.metrics();
    
    reply
      .header('Content-Type', 'text/plain; version=0.0.4')
      .send(metrics);
  });

  // Cache metrics endpoint (JSON format)
  fastify.get('/cache/stats', async (_request, reply) => {
    const stats = orderCacheService.getStats();
    
    reply
      .header('Content-Type', 'application/json')
      .send({
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      });
  });

  // Reset cache metrics (admin only - add auth middleware in production)
  fastify.post('/cache/stats/reset', async (_request, reply) => {
    orderCacheService.resetMetrics();
    
    reply
      .header('Content-Type', 'application/json')
      .send({
        success: true,
        message: 'Cache metrics reset',
        timestamp: new Date().toISOString(),
      });
  });
}
