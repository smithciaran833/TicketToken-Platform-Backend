import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as pricingController from '../controllers/pricing.controller';

export default async function pricingRoutes(app: FastifyInstance) {
  // Get event pricing
  app.get('/events/:eventId/pricing', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => pricingController.getEventPricing(request as any, reply));

  // Get active pricing for an event
  app.get('/events/:eventId/pricing/active', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => pricingController.getActivePricing(request as any, reply));

  // Get single pricing
  app.get('/pricing/:id', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => pricingController.getPricingById(request as any, reply));

  // Create pricing
  app.post('/events/:eventId/pricing', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => pricingController.createPricing(request as any, reply));

  // Update pricing
  app.put('/pricing/:id', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => pricingController.updatePricing(request as any, reply));

  // Calculate price
  app.post('/pricing/:id/calculate', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => pricingController.calculatePrice(request as any, reply));
}
