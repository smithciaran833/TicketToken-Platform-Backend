import { FastifyInstance } from 'fastify';
import healthRoutes from './health.routes';
import metricsRoutes from './metrics.routes';
import alertRoutes from './alert.routes';
import dashboardRoutes from './dashboard.routes';
import statusRoutes from './status.routes';

export async function registerRoutes(server: FastifyInstance) {
  await server.register(healthRoutes, { prefix: '/health' });
  await server.register(statusRoutes, { prefix: '/status' });
  await server.register(metricsRoutes, { prefix: '/api/v1/monitoring/metrics' });
  await server.register(alertRoutes, { prefix: '/api/v1/monitoring/alerts' });
  await server.register(dashboardRoutes, { prefix: '/api/v1/monitoring/dashboard' });
  
  // Cache management endpoints - Fastify style
  server.get('/cache/stats', async (req, res) => {
    const { serviceCache } = require('../services/cache-integration');
    const stats = serviceCache.getStats();
    return stats;
  });
  
  server.delete('/cache/flush', async (req, res) => {
    const { serviceCache } = require('../services/cache-integration');
    await serviceCache.flush();
    return { success: true, message: 'Cache flushed' };
  });
}
