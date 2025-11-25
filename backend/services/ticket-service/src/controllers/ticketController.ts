import { FastifyRequest, FastifyReply } from 'fastify';
import { container } from '../bootstrap/container';
import { cache } from '../services/cache-integration';

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
      data: ticketType
    });
  }

  async getTicketTypes(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { eventId } = request.params as any;
    const tenantId = (request as any).tenantId;
    const cacheKey = `ticket-types:${eventId}:${tenantId}`;

    let ticketTypes = await cache.get(cacheKey);

    if (ticketTypes) {
      reply.header('X-Cache', 'HIT');
      reply.send({
        success: true,
        data: ticketTypes
      });
      return;
    }

    ticketTypes = await this.ticketService.getTicketTypes(eventId, tenantId);

    await cache.set(cacheKey, ticketTypes, { ttl: 300 });

    reply.header('X-Cache', 'MISS');
    reply.send({
      success: true,
      data: ticketTypes
    });
  }

  async createReservation(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const user = (request as any).user;
    const body = request.body as any;
    
    if (!user?.id) {
      return reply.status(401).send({ error: "User not authenticated" });
    }

    const result = await this.ticketService.createReservation({
      ...body,
      userId: user.id
    });

    // Transform snake_case to camelCase for API response
    const response = {
      id: result.id,
      userId: result.user_id,
      eventId: result.event_id,
      ticketTypeId: result.ticket_type_id,
      totalQuantity: result.total_quantity,
      tickets: result.tickets,
      expiresAt: result.expires_at,
      status: result.status,
      typeName: result.type_name,
      createdAt: result.created_at
    };

    reply.send({
      success: true,
      data: response
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

    reply.send({
      success: true,
      data: result
    });
  }

  async getUserTickets(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const { userId } = request.params as any;
    const tenantId = (request as any).tenantId;
    const tickets = await this.ticketService.getUserTickets(userId, tenantId);

    reply.send({
      success: true,
      data: tickets
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
      data: ticketType
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
      data: ticketType
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

    reply.send({
      success: true,
      data: tickets
    });
  }
}

export const ticketController = new TicketController();
