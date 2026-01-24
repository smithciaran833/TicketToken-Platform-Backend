import { FastifyRequest, FastifyReply } from 'fastify';
import { container } from '../bootstrap/container';
import { cache } from '../services/cache-integration';
import {
  serializeTicket,
  serializeTicketForOwner,
  serializeTickets,
  serializeTicketsForOwner,
  serializeTicketType,
  serializeTicketTypes,
  serializeReservationForOwner,
} from '../serializers';

export class TicketController {
  private ticketService = container.services.ticketService;
  private qrService = container.services.qrService;

  async createTicketType(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const tenantId = (request as any).tenantId;
    const body = request.body as any;

    const ticketType = await this.ticketService.createTicketType({
      ...body,
      tenant_id: tenantId
    });

    await cache.delete([
      `ticket-types:${body.eventId}`,
      `event:${body.eventId}:availability`
    ]);

    reply.status(201).send({
      success: true,
      data: serializeTicketType(ticketType)
    });
  }

  async getTicketTypes(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { eventId } = request.params as any;
    const tenantId = (request as any).tenantId;
    const cacheKey = `ticket-types:${eventId}:${tenantId}`;

    const cachedTypes = await cache.get(cacheKey);

    if (cachedTypes && Array.isArray(cachedTypes)) {
      reply.header('X-Cache', 'HIT');
      // Cached data is already serialized - return directly
      reply.send({
        success: true,
        data: cachedTypes
      });
      return;
    }

    const ticketTypes = await this.ticketService.getTicketTypes(eventId, tenantId);

    // Cache serialized data to prevent data leakage from cache
    const serializedTypes = serializeTicketTypes(ticketTypes as Record<string, any>[]);
    await cache.set(cacheKey, serializedTypes, { ttl: 300 });

    reply.header('X-Cache', 'MISS');
    reply.send({
      success: true,
      data: serializedTypes
    });
  }

  async createReservation(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;
    const tenantId = (request as any).tenantId;
    const body = request.body as any;

    if (!user?.id) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const result = await this.ticketService.createReservation({
      ...body,
      userId: user.id,
      tenantId
    });

    // Use serializer to transform and filter safe fields only
    reply.send({
      success: true,
      data: serializeReservationForOwner(result)
    });
  }

  async confirmPurchase(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;

    if (!user?.id) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const { reservationId } = request.params as any;
    const result = await this.ticketService.confirmPurchase(reservationId, user.id);

    // Serialize tickets for owner (includes userId since they are the owner)
    reply.send({
      success: true,
      data: serializeTicketsForOwner(result)
    });
  }

  async getUserTickets(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { userId } = request.params as any;
    const tenantId = (request as any).tenantId;
    const authenticatedUser = (request as any).user;

    // SECURITY FIX: Prevent users from viewing other users' tickets
    // Only allow if: 1) userId matches authenticated user, OR 2) user is admin
    if (authenticatedUser.id !== userId && authenticatedUser.role !== 'admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You can only view your own tickets'
      });
    }

    const tickets = await this.ticketService.getUserTickets(userId, tenantId);

    // Serialize for owner since they own these tickets
    reply.send({
      success: true,
      data: serializeTicketsForOwner(tickets)
    });
  }

  async releaseReservation(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;

    if (!user?.id) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const { reservationId } = request.params as any;
    const result = await this.ticketService.releaseReservation(reservationId, user.id);

    await cache.delete([
      `reservation:${reservationId}`,
      `user:${user.id}:reservations`
    ]);

    reply.send({
      success: true,
      message: "Reservation released",
      data: result
    });
  }

  async getTicketById(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId } = request.params as any;
    const tenantId = (request as any).tenantId;
    const user = (request as any).user;

    const ticket = await this.ticketService.getTicket(ticketId, tenantId);

    if (!ticket) {
      return reply.status(404).send({
        error: 'NOT_FOUND',
        message: 'Ticket not found'
      });
    }

    // Security: Only owner or admin can view ticket
    if (ticket.user_id !== user?.id && user?.role !== 'admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You do not own this ticket'
      });
    }

    // Serialize for owner - includes userId since they verified ownership
    reply.send({
      success: true,
      data: serializeTicketForOwner(ticket)
    });
  }

  async generateQR(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { ticketId } = request.params as any;
    const tenantId = (request as any).tenantId;
    const user = (request as any).user;

    const ticket = await this.ticketService.getTicket(ticketId, tenantId);

    if (ticket.user_id !== user?.id && user?.role !== 'admin') {
      return reply.status(403).send({
        error: 'FORBIDDEN',
        message: 'You do not own this ticket'
      });
    }

    const result = await this.qrService.generateRotatingQR(ticketId);

    reply.send({
      success: true,
      data: {
        qrCode: result.qrCode,
        qrImage: result.qrImage,
        expiresIn: 30
      }
    });
  }

  async validateQR(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { qrData } = request.body as any;
    const user = (request as any).user;
    const body = request.body as any;

    const validation = await this.qrService.validateQR(qrData, {
      eventId: body.eventId || '',
      entrance: body.entrance,
      deviceId: body.deviceId,
      validatorId: user?.id
    });

    reply.send({
      valid: validation.isValid,
      data: {
        ticketId: validation.ticketId,
        eventId: validation.eventId,
        validatedAt: validation.validatedAt
      }
    });
  }

  async getTicketType(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { id } = request.params as any;
    const tenantId = (request as any).tenantId;
    const ticketType = await this.ticketService.getTicketType(id, tenantId);

    if (!ticketType) {
      return reply.status(404).send({ error: 'Ticket type not found' });
    }

    reply.send({
      success: true,
      data: serializeTicketType(ticketType)
    });
  }

  async updateTicketType(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { id } = request.params as any;
    const tenantId = (request as any).tenantId;
    const ticketType = await this.ticketService.updateTicketType(id, request.body, tenantId);

    await cache.delete([
      `ticket-types:${ticketType.event_id}:${tenantId}`,
      `event:${ticketType.event_id}:availability`
    ]);

    reply.send({
      success: true,
      data: serializeTicketType(ticketType)
    });
  }

  async getCurrentUserTickets(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;

    if (!user?.id) {
      return reply.status(401).send({ error: 'User not authenticated' });
    }

    const tenantId = (request as any).tenantId;
    const tickets = await this.ticketService.getUserTickets(user.id, tenantId);

    // Serialize for owner since this is their own tickets
    reply.send({
      success: true,
      data: serializeTicketsForOwner(tickets)
    });
  }
}

export const ticketController = new TicketController();
