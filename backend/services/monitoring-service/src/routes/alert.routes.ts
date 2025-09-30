import { FastifyInstance } from 'fastify';
import { alertController } from '../controllers/alert.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export default async function alertRoutes(server: FastifyInstance) {
  // All alert routes require authentication
  server.addHook('preHandler', authenticate);

  // Get active alerts
  server.get('/', alertController.getActiveAlerts);

  // Get alert by ID
  server.get('/:id', alertController.getAlert);

  // Acknowledge alert - requires elevated permissions
  server.post('/:id/acknowledge', {
    preHandler: authorize('admin', 'operator')
  }, alertController.acknowledgeAlert as any);

  // Resolve alert - requires elevated permissions
  server.post('/:id/resolve', {
    preHandler: authorize('admin', 'operator')
  }, alertController.resolveAlert as any);

  // Get alert history
  server.get('/history', alertController.getAlertHistory);

  // Alert rules - admin only
  server.get('/rules', alertController.getAlertRules);
  server.post('/rules', {
    preHandler: authorize('admin')
  }, alertController.createAlertRule);
  server.put('/rules/:id', {
    preHandler: authorize('admin')
  }, alertController.updateAlertRule as any);
  server.delete('/rules/:id', {
    preHandler: authorize('admin')
  }, alertController.deleteAlertRule as any);
}
