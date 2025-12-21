import { FastifyInstance } from 'fastify';
import { ordersController } from '../controllers/orders.controller';
import { authMiddleware } from '../middleware/auth';
import { rateLimiters } from '../middleware/rate-limit';

export default async function orderRoutes(fastify: FastifyInstance) {
  // GET /orders - get user's orders (must be before /:orderId to avoid conflict)
  fastify.get('/', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => ordersController.getUserOrders(request, reply));

  // GET /orders/tickets - get user's tickets
  fastify.get('/tickets', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => ordersController.getUserTickets(request, reply));

  // GET /orders/:orderId - get specific order
  fastify.get('/:orderId', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => ordersController.getOrderById(request, reply));
}
