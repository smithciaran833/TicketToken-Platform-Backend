import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import { idempotencyPreHandler } from '../middleware/idempotency.middleware';
import * as pricingController from '../controllers/pricing.controller';
import {
  pricingIdParamSchema,
  eventIdParamSchema,
  createPricingBodySchema,
  updatePricingBodySchema,
  calculatePriceBodySchema,
  pricingRouteResponses,
  pricingListRouteResponses,
  priceCalculationRouteResponses
} from '../schemas/pricing.schema';

/**
 * Pricing routes with comprehensive validation.
 * 
 * Audit Fixes:
 * - RD5: Response schemas defined to prevent data leakage
 * - SD4: Date validation with format: date-time
 * - SD9: Reusable schema definitions (DRY)
 */

export default async function pricingRoutes(app: FastifyInstance) {
  // Get event pricing
  app.get('/events/:eventId/pricing', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, (request, reply) => pricingController.getEventPricing(request as any, reply));

  // Get active pricing for an event
  app.get('/events/:eventId/pricing/active', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, (request, reply) => pricingController.getActivePricing(request as any, reply));

  // Get single pricing
  app.get('/pricing/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: pricingIdParamSchema
    }
  }, (request, reply) => pricingController.getPricingById(request as any, reply));

  // Create pricing - with idempotency support
  app.post('/events/:eventId/pricing', {
    preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
    schema: {
      params: eventIdParamSchema,
      body: createPricingBodySchema
    }
  }, (request, reply) => pricingController.createPricing(request as any, reply));

  // Update pricing
  app.put('/pricing/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: pricingIdParamSchema,
      body: updatePricingBodySchema
    }
  }, (request, reply) => pricingController.updatePricing(request as any, reply));

  // Calculate price
  app.post('/pricing/:id/calculate', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: pricingIdParamSchema,
      body: calculatePriceBodySchema
    }
  }, (request, reply) => pricingController.calculatePrice(request as any, reply));
}
