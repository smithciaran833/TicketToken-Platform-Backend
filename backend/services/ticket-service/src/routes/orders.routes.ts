import { FastifyInstance } from 'fastify';
import { ordersController } from '../controllers/orders.controller';

export default async function orderRoutes(fastify: FastifyInstance) {
  // GET /orders/:orderId
  fastify.get('/:orderId', 
    (request, reply) => ordersController.getOrderById(request, reply)
  );
}
