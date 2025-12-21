import { FastifyRequest, FastifyReply } from 'fastify';

interface CreateEventBody {
  name: string;
  description?: string;
  venue_id: string;
  starts_at?: string;
  ends_at?: string;
  event_date?: string;
  doors_open?: string;
  timezone?: string;
  capacity?: number;
  tiers?: Array<{
    name: string;
    price_cents: number;
    currency: string;
    total_qty: number;
  }>;
}

export async function createEvent(
  request: FastifyRequest<{ Body: CreateEventBody }>,
  reply: FastifyReply
) {
  try {
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id || null;
    const tenantId = (request as any).tenantId; // From tenant middleware

    if (!userId) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant ID required' });
    }

    const eventData = request.body;

    // Use EventService from dependency container
    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    // Create event with tenant context
    const event = await eventService.createEvent(
      eventData,
      authToken,
      userId,
      tenantId, // Pass tenantId
      {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      }
    );

    return reply.status(201).send({ event });
  } catch (error: any) {
    // Handle custom errors with statusCode
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError' || error.message?.includes('Validation')) {
      return reply.status(422).send({
        error: error.message || 'Validation failed',
        details: error.details
      });
    }

    // Handle not found errors
    if (error.name === 'NotFoundError' || error.message?.includes('not found')) {
      return reply.status(404).send({
        error: error.message
      });
    }

    // Handle unauthorized/forbidden errors
    if (error.name === 'UnauthorizedError' || error.message?.includes('Unauthorized')) {
      return reply.status(401).send({
        error: error.message
      });
    }

    if (error.name === 'ForbiddenError' || error.message?.includes('Forbidden') || error.message?.includes('no access')) {
      return reply.status(403).send({
        error: error.message
      });
    }

    // Log and return 500 for unexpected errors (don't leak error message in production)
    request.log.error('Error creating event:', error);
    return reply.status(500).send({
      error: 'Failed to create event'
    });
  }
}

export async function getEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const tenantId = (request as any).tenantId;

    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    const event = await eventService.getEvent(id, tenantId);
    return reply.send({ event });
  } catch (error: any) {
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code
      });
    }

    if (error.message === 'Event not found' || error.name === 'NotFoundError') {
      return reply.status(404).send({ error: 'Event not found' });
    }

    request.log.error('Error getting event:', error);
    return reply.status(500).send({ error: 'Failed to get event' });
  }
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  try {
    const tenantId = (request as any).tenantId;
    const { status, limit = 20, offset = 0 } = request.query;

    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    const result = await eventService.listEvents(tenantId, { status, limit, offset });
    return reply.send(result);
  } catch (error: any) {
    request.log.error('Error listing events:', error);
    return reply.status(500).send({ error: 'Failed to list events' });
  }
}

export async function updateEvent(
  request: FastifyRequest<{ Params: { id: string }; Body: Partial<CreateEventBody> }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id;
    const tenantId = (request as any).tenantId;

    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    const event = await eventService.updateEvent(
      id,
      request.body,
      authToken,
      userId,
      tenantId,
      {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      }
    );

    return reply.send({ event });
  } catch (error: any) {
    // Handle custom errors with statusCode
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    if (error.message === 'Event not found' || error.name === 'NotFoundError') {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (error.name === 'ForbiddenError' || error.message?.includes('no access')) {
      return reply.status(403).send({ error: error.message || 'Access denied' });
    }

    request.log.error('Error updating event:', error);
    return reply.status(500).send({ error: 'Failed to update event' });
  }
}

export async function deleteEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const authToken = request.headers.authorization as string;
    const userId = (request as any).user?.id;
    const tenantId = (request as any).tenantId;

    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    await eventService.deleteEvent(id, authToken, userId, tenantId, {
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });

    return reply.status(204).send();
  } catch (error: any) {
    // Handle custom errors with statusCode
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
        details: error.details
      });
    }

    if (error.message === 'Event not found' || error.name === 'NotFoundError') {
      return reply.status(404).send({ error: 'Event not found' });
    }

    if (error.name === 'ForbiddenError' || error.message?.includes('no access')) {
      return reply.status(403).send({ error: error.message || 'Access denied' });
    }

    request.log.error('Error deleting event:', error);
    return reply.status(500).send({ error: 'Failed to delete event' });
  }
}

export async function publishEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const userId = (request as any).user?.id;
    const tenantId = (request as any).tenantId;

    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    const event = await eventService.publishEvent(id, userId, tenantId);
    return reply.send({ event });
  } catch (error: any) {
    if (error.statusCode) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code
      });
    }

    if (error.message === 'Event not found' || error.name === 'NotFoundError') {
      return reply.status(404).send({ error: 'Event not found' });
    }

    request.log.error('Error publishing event:', error);
    return reply.status(500).send({ error: 'Failed to publish event' });
  }
}

export async function getVenueEvents(
  request: FastifyRequest<{ Params: { venueId: string } }>,
  reply: FastifyReply
) {
  try {
    const { venueId } = request.params;
    const tenantId = (request as any).tenantId;

    const container = (request as any).container;
    const eventService = container.resolve('eventService');

    const events = await eventService.getVenueEvents(venueId, tenantId);
    return reply.send({ events });
  } catch (error: any) {
    request.log.error('Error getting venue events:', error);
    return reply.status(500).send({ error: 'Failed to get venue events' });
  }
}
