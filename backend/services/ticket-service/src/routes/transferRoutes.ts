import { FastifyInstance } from 'fastify';
import { transferController } from '../controllers/transferController';
import { validate, ticketSchemas } from '../utils/validation';

export default async function transferRoutes(fastify: FastifyInstance) {
  // Transfer a ticket
  fastify.post('/', {
    preHandler: [validate(ticketSchemas.transferTicket)]
  }, (request, reply) => transferController.transferTicket(request, reply));

  // Get transfer history for a ticket
  fastify.get('/:ticketId/history',
    (request, reply) => transferController.getTransferHistory(request, reply)
  );

  // Validate transfer before executing
  fastify.post('/validate',
    (request, reply) => transferController.validateTransfer(request, reply)
  );
}
