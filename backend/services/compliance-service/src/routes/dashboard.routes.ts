import { FastifyInstance } from 'fastify';
import { DashboardController } from '../controllers/dashboard.controller';

export async function dashboardRoutes(fastify: FastifyInstance) {
  const dashboardController = new DashboardController();

  // Dashboard routes
  fastify.get('/dashboard', dashboardController.getComplianceOverview);
}
