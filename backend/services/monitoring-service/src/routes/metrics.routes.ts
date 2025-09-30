import { FastifyInstance } from 'fastify';
import { metricsController } from '../controllers/metrics.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export default async function metricsRoutes(server: FastifyInstance) {
  // Get all recent metrics - requires auth
  server.get('/', {
    preHandler: authenticate
  }, metricsController.getMetrics);

  // Get latest value for each metric
  server.get('/latest', {
    preHandler: authenticate
  }, metricsController.getLatestMetrics);

  // Get metrics for specific service
  server.get('/service/:service', {
    preHandler: authenticate
  }, metricsController.getMetricsByService as any);

  // Push new metrics - requires admin
  server.post('/', {
    preHandler: [authenticate, authorize('admin', 'monitoring')]
  }, metricsController.pushMetrics);

  // Prometheus export - special auth for Prometheus scraper
  server.get('/export', metricsController.exportPrometheusMetrics);
}
