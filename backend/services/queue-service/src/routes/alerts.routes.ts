import { FastifyInstance } from 'fastify';
import { AlertsController } from '../controllers/alerts.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const alertsController = new AlertsController();

async function alertsRoutes(fastify: FastifyInstance) {
  // Get recent alerts
  fastify.get(
    '/',
    {
      preHandler: [authenticate]
    },
    alertsController.getAlerts.bind(alertsController)
  );

  // Acknowledge alert
  fastify.post(
    '/:id/acknowledge',
    {
      preHandler: [authenticate]
    },
    alertsController.acknowledgeAlert.bind(alertsController)
  );

  // Test alert system (admin only)
  fastify.post(
    '/test',
    {
      preHandler: [authenticate, authorize(['admin'])]
    },
    alertsController.testAlert.bind(alertsController)
  );
}

export default alertsRoutes;
