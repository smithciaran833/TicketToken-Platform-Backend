import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as ticketsController from '../controllers/tickets.controller';

export default async function ticketsRoutes(app: FastifyInstance) {
  // Get ticket types for event
  app.get('/events/:id/ticket-types', {
    preHandler: [authenticateFastify, tenantHook]
  }, ticketsController.getTicketTypes as any);

  // Create ticket type
  app.post('/events/:id/ticket-types', {
    preHandler: [authenticateFastify, tenantHook]
  }, ticketsController.createTicketType as any);

  // Update ticket type
  app.put('/events/:id/ticket-types/:typeId', {
    preHandler: [authenticateFastify, tenantHook]
  }, ticketsController.updateTicketType as any);
}
