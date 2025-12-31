import { FastifyRequest, FastifyReply } from 'fastify';
import { createProblemError } from '../middleware/error-handler';

/**
 * Events Controller
 * 
 * CRITICAL FIX for RH5: All errors use createProblemError() 
 * to ensure consistent RFC 7807 format via the global error handler.
 * 
 * Errors bubble up to the global error handler which formats them
 * consistently as RFC 7807 Problem Details responses.
 */

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
  const authToken = request.headers.authorization as string;
  const userId = (request as any).user?.id || null;
  const tenantId = (request as any).tenantId;

  if (!userId) {
    throw createProblemError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  if (!tenantId) {
    throw createProblemError(400, 'TENANT_REQUIRED', 'Tenant ID required');
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
    tenantId,
    {
      ip: request.ip,
      userAgent: request.headers['user-agent']
    }
  );

  return reply.status(201).send({ event });
}

export async function getEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const tenantId = (request as any).tenantId;

  const container = (request as any).container;
  const eventService = container.resolve('eventService');

  const event = await eventService.getEvent(id, tenantId);
  
  if (!event) {
    throw createProblemError(404, 'NOT_FOUND', 'Event not found');
  }

  return reply.send({ event });
}

export async function listEvents(
  request: FastifyRequest<{ Querystring: { status?: string; limit?: number; offset?: number } }>,
  reply: FastifyReply
) {
  const tenantId = (request as any).tenantId;
  const { status, limit = 20, offset = 0 } = request.query;

  const container = (request as any).container;
  const eventService = container.resolve('eventService');

  const result = await eventService.listEvents(tenantId, { status, limit, offset });
  return reply.send(result);
}

export async function updateEvent(
  request: FastifyRequest<{ Params: { id: string }; Body: Partial<CreateEventBody> }>,
  reply: FastifyReply
) {
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

  if (!event) {
    throw createProblemError(404, 'NOT_FOUND', 'Event not found');
  }

  return reply.send({ event });
}

export async function deleteEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
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
}

export async function publishEvent(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const userId = (request as any).user?.id;
  const tenantId = (request as any).tenantId;

  const container = (request as any).container;
  const eventService = container.resolve('eventService');

  const event = await eventService.publishEvent(id, userId, tenantId);
  
  if (!event) {
    throw createProblemError(404, 'NOT_FOUND', 'Event not found');
  }

  return reply.send({ event });
}

export async function getVenueEvents(
  request: FastifyRequest<{ Params: { venueId: string } }>,
  reply: FastifyReply
) {
  const { venueId } = request.params;
  const tenantId = (request as any).tenantId;

  const container = (request as any).container;
  const eventService = container.resolve('eventService');

  const events = await eventService.getVenueEvents(venueId, tenantId);
  return reply.send({ events });
}
