import { FastifyInstance } from 'fastify';
import { qrController } from '../controllers/qrController';
import { validate, ticketSchemas } from '../utils/validation';

export default async function validationRoutes(fastify: FastifyInstance) {
  // Public endpoint for QR validation (used by scanner devices)
  fastify.post('/qr', {
    preHandler: [validate(ticketSchemas.validateQR)]
  }, (request, reply) => qrController.validateQR(request, reply));
}
