import { FastifyInstance } from 'fastify';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middleware/auth.middleware';

export default async function dashboardRoutes(server: FastifyInstance) {
  // All dashboard routes require authentication
  server.addHook('preHandler', authenticate);

  // Get dashboard overview
  server.get('/overview', dashboardController.getOverview);

  // Get SLA metrics
  server.get('/sla', dashboardController.getSLAMetrics);

  // Get performance metrics
  server.get('/performance', dashboardController.getPerformanceMetrics);

  // Get business metrics
  server.get('/business', dashboardController.getBusinessMetrics);

  // Get incidents
  server.get('/incidents', dashboardController.getIncidents);
}
