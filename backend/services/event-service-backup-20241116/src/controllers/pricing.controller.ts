import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { PricingService } from '../services/pricing.service';

export async function getEventPricing(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  try {
    const { eventId } = request.params;
    const tenantId = (request as any).tenantId;

    const pricingService = new PricingService(db);
    const pricing = await pricingService.getEventPricing(eventId, tenantId);

    return reply.send({ pricing });
  } catch (error: any) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error getting event pricing');
    return reply.status(500).send({ 
      error: 'Failed to get pricing',
      message: error.message 
    });
  }
}

export async function getPricingById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const tenantId = (request as any).tenantId;

    const pricingService = new PricingService(db);
    const pricing = await pricingService.getPricingById(id, tenantId);

    return reply.send({ pricing });
  } catch (error: any) {
    if (error.message === 'Pricing not found') {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    request.log.error({ error: error.message, stack: error.stack }, 'Error getting pricing');
    return reply.status(500).send({ 
      error: 'Failed to get pricing',
      message: error.message 
    });
  }
}

export async function createPricing(
  request: FastifyRequest<{ 
    Params: { eventId: string };
    Body: {
      name: string;
      base_price: number;
      capacity_id?: string;
      schedule_id?: string;
      tier?: string;
      service_fee?: number;
      facility_fee?: number;
      tax_rate?: number;
    }
  }>,
  reply: FastifyReply
) {
  try {
    const { eventId } = request.params;
    const tenantId = (request as any).tenantId;
    const data = request.body;

    const pricingService = new PricingService(db);
    const pricing = await pricingService.createPricing(
      { ...data, event_id: eventId },
      tenantId
    );

    return reply.status(201).send({ pricing });
  } catch (error: any) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error creating pricing');
    return reply.status(500).send({ 
      error: 'Failed to create pricing',
      message: error.message 
    });
  }
}

export async function updatePricing(
  request: FastifyRequest<{ 
    Params: { id: string };
    Body: Partial<{
      name: string;
      base_price: number;
      current_price: number;
      service_fee: number;
      facility_fee: number;
      tax_rate: number;
      is_active: boolean;
    }>;
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const tenantId = (request as any).tenantId;
    const data = request.body;

    const pricingService = new PricingService(db);
    const pricing = await pricingService.updatePricing(id, data, tenantId);

    return reply.send({ pricing });
  } catch (error: any) {
    if (error.message === 'Pricing not found') {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    request.log.error({ error: error.message, stack: error.stack }, 'Error updating pricing');
    return reply.status(500).send({ 
      error: 'Failed to update pricing',
      message: error.message 
    });
  }
}

export async function calculatePrice(
  request: FastifyRequest<{ 
    Params: { id: string };
    Body: { quantity: number };
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params;
    const { quantity } = request.body;
    const tenantId = (request as any).tenantId;

    if (!quantity || quantity < 1) {
      return reply.status(400).send({ error: 'Invalid quantity' });
    }

    const pricingService = new PricingService(db);
    const calculation = await pricingService.calculatePrice(id, quantity, tenantId);

    return reply.send(calculation);
  } catch (error: any) {
    if (error.message === 'Pricing not found') {
      return reply.status(404).send({ error: 'Pricing not found' });
    }
    request.log.error({ error: error.message, stack: error.stack }, 'Error calculating price');
    return reply.status(500).send({ 
      error: 'Failed to calculate price',
      message: error.message 
    });
  }
}

export async function getActivePricing(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  try {
    const { eventId } = request.params;
    const tenantId = (request as any).tenantId;

    const pricingService = new PricingService(db);
    const pricing = await pricingService.getActivePricing(eventId, tenantId);

    return reply.send({ pricing });
  } catch (error: any) {
    request.log.error({ error: error.message, stack: error.stack }, 'Error getting active pricing');
    return reply.status(500).send({ 
      error: 'Failed to get active pricing',
      message: error.message 
    });
  }
}
