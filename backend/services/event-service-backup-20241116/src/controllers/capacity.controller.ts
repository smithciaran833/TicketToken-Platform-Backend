import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { CapacityService } from '../services/capacity.service';
import { IEventCapacity } from '../models';

export async function getEventCapacity(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  try {
    const { eventId } = request.params;
    const tenantId = (request as any).tenantId;

    const capacityService = new CapacityService(db);
    const sections = await capacityService.getEventCapacity(eventId, tenantId);

    return reply.send({ capacity: sections });
  } catch (error: any) {
    request.log.error({ error: error.message }, 'Error getting event capacity');
    return reply.status(500).send({
      error: 'Failed to get event capacity',
      message: error.message
    });
  }
}

export async function getTotalCapacity(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  try {
    const { eventId } = request.params;
    const tenantId = (request as any).tenantId;

    const capacityService = new CapacityService(db);
    const sections = await capacityService.getEventCapacity(eventId, tenantId);

    const totals = sections.reduce((acc, section) => ({
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
  } catch (error: any) {
    request.log.error({ error: error.message }, 'Error getting total capacity');
    return reply.status(500).send({
      error: 'Failed to get total capacity',
      message: error.message
    });
  }
}

export async function getCapacityById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const tenantId = (request as any).tenantId;

    const capacityService = new CapacityService(db);
    const capacity = await capacityService.getCapacityById(id, tenantId);

    return reply.send({ capacity });
  } catch (error: any) {
    if (error.message === 'Capacity not found') {
      return reply.status(404).send({ error: 'Capacity not found' });
    }
    request.log.error({ error: error.message }, 'Error getting capacity');
    return reply.status(500).send({
      error: 'Failed to get capacity',
      message: error.message
    });
  }
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
  try {
    const { eventId } = request.params;
    const tenantId = (request as any).tenantId;
    const authToken = request.headers.authorization || '';
    const data = request.body;

    const capacityService = new CapacityService(db);
    const capacity = await capacityService.createCapacity(
      { ...data, event_id: eventId },
      tenantId,
      authToken
    );

    return reply.status(201).send({ capacity });
  } catch (error: any) {
    if (error.details || (error.errors && Array.isArray(error.errors))) {
      const details = error.details || error.errors;
      const errorMessage = details.length > 0 && details[0].message 
        ? details[0].message 
        : 'Validation failed';
      
      return reply.status(422).send({
        error: errorMessage,
        details: details
      });
    }
    request.log.error({ error: error.message, stack: error.stack }, 'Error creating capacity');
    return reply.status(500).send({
      error: 'Failed to create capacity',
      message: error.message
    });
  }
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
  try {
    const { id } = request.params;
    const tenantId = (request as any).tenantId;
    const data = request.body;

    const capacityService = new CapacityService(db);
    const capacity = await capacityService.updateCapacity(id, data, tenantId);

    return reply.send({ capacity });
  } catch (error: any) {
    if (error.message === 'Capacity not found') {
      return reply.status(404).send({ error: 'Capacity not found' });
    }
    request.log.error({ error: error.message }, 'Error updating capacity');
    return reply.status(500).send({
      error: 'Failed to update capacity',
      message: error.message
    });
  }
}

export async function checkAvailability(
  request: FastifyRequest<{
    Params: { id: string };
    Body: { quantity: number }
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { quantity } = request.body;
    const tenantId = (request as any).tenantId;

    const capacityService = new CapacityService(db);
    const available = await capacityService.checkAvailability(id, quantity, tenantId);

    return reply.send({ available, quantity });
  } catch (error: any) {
    request.log.error({ error: error.message }, 'Error checking availability');
    return reply.status(500).send({
      error: 'Failed to check availability',
      message: error.message
    });
  }
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
  try {
    const { id } = request.params;
    const { quantity, reservation_minutes = 15, pricing_id } = request.body;
    const tenantId = (request as any).tenantId;
    const authToken = request.headers.authorization || '';

    const capacityService = new CapacityService(db);
    const capacity = await capacityService.reserveCapacity(
      id,
      quantity,
      tenantId,
      reservation_minutes,
      pricing_id,
      authToken
    );

    // Get locked price if pricing_id was provided and price was locked
    let lockedPrice = null;
    if (pricing_id && capacity.locked_price_data) {
      lockedPrice = await capacityService.getLockedPrice(id, tenantId);
    }

    return reply.send({ 
      message: 'Capacity reserved successfully',
      capacity,
      locked_price: lockedPrice
    });
  } catch (error: any) {
    // Handle ValidationError with details (like insufficient capacity)
    if (error.details || (error.errors && Array.isArray(error.errors))) {
      const details = error.details || error.errors;
      const errorMessage = details.length > 0 && details[0].message 
        ? details[0].message 
        : 'Validation failed';
      
      return reply.status(400).send({
        error: errorMessage,
        details: details
      });
    }
    
    request.log.error({ error: error.message }, 'Error reserving capacity');
    return reply.status(500).send({
      error: 'Failed to reserve capacity',
      message: error.message
    });
  }
}
