import { FastifyInstance } from 'fastify';
import { ticketController } from '../controllers/ticketController';
import { validate, ticketSchemas } from '../utils/validation';
import { authMiddleware, requireRole } from '../middleware/auth';
import { rateLimiters } from '../middleware/rate-limit';

export default async function ticketRoutes(fastify: FastifyInstance) {
  // Ticket type management (admin/venue manager only)
  fastify.post('/types', {
    preHandler: [rateLimiters.write, requireRole(['admin', 'venue_manager']), validate(ticketSchemas.createTicketType)]
  }, (request, reply) => ticketController.createTicketType(request, reply));

  // Public endpoint - read ticket types for an event
  fastify.get('/events/:eventId/types', {
    preHandler: [rateLimiters.read]
  }, (request, reply) => ticketController.getTicketTypes(request, reply));

  // Ticket purchasing (requires authentication + strict rate limit)
  fastify.post('/purchase', {
    preHandler: [rateLimiters.purchase, authMiddleware, validate(ticketSchemas.purchaseTickets)]
  }, (request, reply) => ticketController.createReservation(request, reply));

  // Confirm purchase (strict rate limit)
  fastify.post('/reservations/:reservationId/confirm', {
    preHandler: [rateLimiters.purchase, authMiddleware]
  }, (request, reply) => ticketController.confirmPurchase(request, reply));

  // Release reservation (requires authentication)
  fastify.delete('/reservations/:reservationId', {
    preHandler: [rateLimiters.write, authMiddleware]
  }, (request, reply) => ticketController.releaseReservation(request, reply));

  // Generate QR (requires authentication)
  fastify.get('/:ticketId/qr', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => ticketController.generateQR(request, reply));

  // Validate QR (requires authentication - for venue staff/scanners)
  fastify.post('/validate-qr', {
    preHandler: [rateLimiters.qrScan, authMiddleware, requireRole(['admin', 'venue_manager', 'venue_staff'])]
  }, (request, reply) => ticketController.validateQR(request, reply));

  // Ticket viewing (requires authentication + ownership validation)
  // SECURITY FIX: Users should only view their own tickets
  fastify.get('/users/:userId', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => ticketController.getUserTickets(request, reply));

  // Get specific ticket type by ID (public read)
  fastify.get('/types/:id', {
    preHandler: [rateLimiters.read]
  }, (request, reply) => ticketController.getTicketType(request, reply));

  // Update ticket type by ID (admin only)
  fastify.put('/types/:id', {
    preHandler: [rateLimiters.write, requireRole(['admin', 'venue_manager'])]
  }, (request, reply) => ticketController.updateTicketType(request, reply));

  // List current user's tickets (requires authentication)
  fastify.get('/', {
    preHandler: [rateLimiters.read, authMiddleware]
  }, (request, reply) => ticketController.getCurrentUserTickets(request, reply));
}
