import { FastifyRequest, FastifyReply } from 'fastify';
import { createProblemError } from '../middleware/error-handler';
import { serializeCapacity, serializeCapacities } from '../serializers';

/**
 * Capacity Controller
 * 
 * CRITICAL FIX for RH5: All errors use createProblemError() 
 * to ensure consistent RFC 7807 format via the global error handler.
 * 
 * HIGH PRIORITY FIX for Issue #6: Use DI container instead of direct instantiation
 */

export async function getEventCapacity(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  const { eventId } = request.params;
  const tenantId = (request as any).tenantId;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const sections = await capacityService.getEventCapacity(eventId, tenantId);

  return reply.send({ capacity: serializeCapacities(sections) });
}

export async function getTotalCapacity(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  const { eventId } = request.params;
  const tenantId = (request as any).tenantId;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const sections = await capacityService.getEventCapacity(eventId, tenantId);

  const totals = sections.reduce((acc: any, section: any) => ({
    total_capacity: acc.total_capacity + (section.total_capacity || 0),
    available_capacity: acc.available_capacity + (section.available_capacity || 0),
    reserved_capacity: acc.reserved_capacity + (section.reserved_capacity || 0),
    sold_count: acc.sold_count + (section.sold_count || 0)
  }), {
    total_capacity: 0,
    available_capacity: 0,
    reserved_capacity: 0,
    sold_count: 0
  });

  return reply.send(totals);
}

export async function getCapacityById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const tenantId = (request as any).tenantId;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const capacity = await capacityService.getCapacityById(id, tenantId);

  if (!capacity) {
    throw createProblemError(404, 'NOT_FOUND', 'Capacity not found');
  }

  return reply.send({ capacity: serializeCapacity(capacity) });
}

export async function createCapacity(
  request: FastifyRequest<{
    Params: { eventId: string };
    Body: {
      section_name: string;
      section_code?: string;
      total_capacity: number;
      schedule_id?: string;
    }
  }>,
  reply: FastifyReply
) {
  const { eventId } = request.params;
  const tenantId = (request as any).tenantId;
  const authToken = request.headers.authorization || '';
  const data = request.body;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const capacity = await capacityService.createCapacity(
    { ...data, event_id: eventId },
    tenantId,
    authToken
  );

  return reply.status(201).send({ capacity: serializeCapacity(capacity) });
}

export async function updateCapacity(
  request: FastifyRequest<{
    Params: { id: string };
    Body: Partial<{
      section_name: string;
      total_capacity: number;
      is_active: boolean;
    }>;
  }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const tenantId = (request as any).tenantId;
  const data = request.body;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const capacity = await capacityService.updateCapacity(id, data, tenantId);

  if (!capacity) {
    throw createProblemError(404, 'NOT_FOUND', 'Capacity not found');
  }

  return reply.send({ capacity: serializeCapacity(capacity) });
}

export async function checkAvailability(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { quantity: number }
  }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { quantity } = request.body;
  const tenantId = (request as any).tenantId;

  if (!quantity || quantity < 1) {
    throw createProblemError(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');
  }

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const available = await capacityService.checkAvailability(id, quantity, tenantId);

  return reply.send({ available, quantity });
}

export async function reserveCapacity(
  request: FastifyRequest<{
    Params: { id: string };
    Body: {
      quantity: number;
      reservation_minutes?: number;
      pricing_id?: string;
    }
  }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const { quantity, reservation_minutes = 15, pricing_id } = request.body;
  const tenantId = (request as any).tenantId;
  const authToken = request.headers.authorization || '';

  if (!quantity || quantity < 1) {
    throw createProblemError(400, 'INVALID_QUANTITY', 'Quantity must be at least 1');
  }

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const capacityService = container.resolve('capacityService');
  const capacity = await capacityService.reserveCapacity(
    id,
    quantity,
    tenantId,
    reservation_minutes,
    pricing_id,
    authToken
  );

  if (!capacity) {
    throw createProblemError(404, 'NOT_FOUND', 'Capacity not found');
  }

  // Get locked price if pricing_id was provided and price was locked
  let lockedPrice = null;
  if (pricing_id && capacity.locked_price_data) {
    lockedPrice = await capacityService.getLockedPrice(id, tenantId);
  }

  return reply.send({
    message: 'Capacity reserved successfully',
    capacity: serializeCapacity(capacity),
    locked_price: lockedPrice
  });
}
