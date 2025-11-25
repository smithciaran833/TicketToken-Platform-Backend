import { FastifyInstance } from 'fastify';
import { purchaseController } from '../controllers/purchaseController';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant';

export default async function purchaseRoutes(fastify: FastifyInstance) {
  // Purchase route - requires auth AND tenant context
  fastify.post('/', {
    preHandler: [authMiddleware, tenantMiddleware]
  }, (request, reply) => purchaseController.createOrder(request, reply));
}
