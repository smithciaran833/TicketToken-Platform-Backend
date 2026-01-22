import { FastifyRequest, FastifyReply } from 'fastify';
import { createProblemError } from '../middleware/error-handler';

/**
 * Pricing Controller
 * 
 * CRITICAL FIX for RH5: All errors use createProblemError() 
 * to ensure consistent RFC 7807 format via the global error handler.
 * 
 * HIGH PRIORITY FIX for Issue #6: Use DI container instead of direct instantiation
 */

export async function getEventPricing(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  const { eventId } = request.params;
  const tenantId = (request as any).tenantId;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const pricingService = container.resolve('pricingService');
  const pricing = await pricingService.getEventPricing(eventId, tenantId);

  return reply.send({ pricing });
}

export async function getPricingById(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const { id } = request.params;
  const tenantId = (request as any).tenantId;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const pricingService = container.resolve('pricingService');
  const pricing = await pricingService.getPricingById(id, tenantId);

  if (!pricing) {
    throw createProblemError(404, 'NOT_FOUND', 'Pricing not found');
  }

  return reply.send({ pricing });
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
  const { eventId } = request.params;
  const tenantId = (request as any).tenantId;
  const data = request.body;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const pricingService = container.resolve('pricingService');
  const pricing = await pricingService.createPricing(
    { ...data, event_id: eventId },
    tenantId
  );

  return reply.status(201).send({ pricing });
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
  const { id } = request.params;
  const tenantId = (request as any).tenantId;
  const data = request.body;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const pricingService = container.resolve('pricingService');
  const pricing = await pricingService.updatePricing(id, data, tenantId);

  if (!pricing) {
    throw createProblemError(404, 'NOT_FOUND', 'Pricing not found');
  }

  return reply.send({ pricing });
}

export async function calculatePrice(
  request: FastifyRequest<{ 
    Params: { id: string };
    Body: { quantity: number };
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
  const pricingService = container.resolve('pricingService');
  const calculation = await pricingService.calculatePrice(id, quantity, tenantId);

  if (!calculation) {
    throw createProblemError(404, 'NOT_FOUND', 'Pricing not found');
  }

  return reply.send(calculation);
}

export async function getActivePricing(
  request: FastifyRequest<{ Params: { eventId: string } }>,
  reply: FastifyReply
) {
  const { eventId } = request.params;
  const tenantId = (request as any).tenantId;

  // HIGH PRIORITY FIX for Issue #6: Use DI container
  const container = (request as any).container;
  const pricingService = container.resolve('pricingService');
  const pricing = await pricingService.getActivePricing(eventId, tenantId);

  return reply.send({ pricing });
}
