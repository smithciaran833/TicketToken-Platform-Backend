import { FastifyInstance } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';

export async function adminRoutes(fastify: FastifyInstance) {
  const adminController = new AdminController();

  // Admin routes
  fastify.get('/admin/pending', {
    onRequest: requireAdmin
  }, adminController.getPendingReviews);

  fastify.post('/admin/approve/:id', adminController.approveVerification);
  fastify.post('/admin/reject/:id', adminController.rejectVerification);
}
