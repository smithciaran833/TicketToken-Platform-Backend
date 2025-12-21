import { FastifyInstance } from 'fastify';
import { transferController } from '../controllers/transferController';
import { validate, ticketSchemas } from '../utils/validation';
import { authMiddleware } from '../middleware/auth';
import { rateLimiters } from '../middleware/rate-limit';

export default async function transferRoutes(fastify: FastifyInstance) {
  // Transfer a ticket (requires authentication)
  fastify.post('/', {
    preHandler: [rateLimiters.write, authMiddleware, validate(ticketSchemas.transferTicket)]
  }, (request, reply) => transferController.transferTicket(request, reply));

  // Get transfer history for a ticket (requires authentication)
  fastify.get('/:ticketId/history', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => transferController.getTransferHistory(request, reply));

  // Validate transfer before executing (requires authentication)
  fastify.post('/validate', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => transferController.validateTransfer(request, reply));
}
