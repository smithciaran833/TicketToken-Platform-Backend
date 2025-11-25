import { FastifyInstance } from 'fastify';
import { qrController } from '../controllers/qrController';

export default async function qrRoutes(fastify: FastifyInstance) {
  // Generate QR code for ticket
  fastify.get('/:ticketId/generate',
    (request, reply) => qrController.generateQR(request, reply)
  );

  // Validate QR code (for venue staff)
  fastify.post('/validate',
    (request, reply) => qrController.validateQR(request, reply)
  );

  // Refresh QR code
  fastify.post('/refresh',
    (request, reply) => qrController.refreshQR(request, reply)
  );
}
