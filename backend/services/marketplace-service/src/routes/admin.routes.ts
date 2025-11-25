import { FastifyInstance } from 'fastify';
import { adminController } from '../controllers/admin.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';

export default async function adminRoutes(fastify: FastifyInstance) {
  // All admin routes require authentication and admin role
  const adminPreHandler = [authMiddleware, requireAdmin];

  // Statistics
  fastify.get('/stats', {
    preHandler: adminPreHandler
  }, adminController.getStats.bind(adminController));

  // Disputes management
  fastify.get('/disputes', {
    preHandler: adminPreHandler
  }, adminController.getDisputes.bind(adminController));

  fastify.put('/disputes/:disputeId/resolve', {
    preHandler: adminPreHandler
  }, adminController.resolveDispute.bind(adminController));

  // User management
  fastify.get('/flagged-users', {
    preHandler: adminPreHandler
  }, adminController.getFlaggedUsers.bind(adminController));

  fastify.post('/ban-user', {
    preHandler: adminPreHandler
  }, adminController.banUser.bind(adminController));
}
