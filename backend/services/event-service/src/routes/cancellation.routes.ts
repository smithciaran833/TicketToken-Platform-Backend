import { FastifyInstance } from 'fastify';
import { cancelEvent } from '../controllers/cancellation.controller';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';

export default async function cancellationRoutes(app: FastifyInstance) {
  // Cancel event endpoint
  app.post('/events/:eventId/cancel', {
    preHandler: [authenticateFastify, tenantHook]
  }, cancelEvent as any);
}
