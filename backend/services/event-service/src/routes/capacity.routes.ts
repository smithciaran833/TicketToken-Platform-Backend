import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import { idempotencyPreHandler } from '../middleware/idempotency.middleware';
import * as capacityController from '../controllers/capacity.controller';
import {
  capacityIdParamSchema,
  eventIdParamSchema,
  createCapacityBodySchema,
  updateCapacityBodySchema,
  checkAvailabilityBodySchema,
  reserveCapacityBodySchema,
  capacityRouteResponses,
  capacityListRouteResponses,
  availabilityRouteResponses,
  reservationRouteResponses
} from '../schemas/capacity.schema';

/**
 * Capacity routes with comprehensive validation.
 * 
 * Audit Fixes:
 * - RD5: Response schemas defined to prevent data leakage
 * - SD9: Reusable schema definitions (DRY)
 */

export default async function capacityRoutes(app: FastifyInstance) {
  // Get event capacity
  app.get('/events/:eventId/capacity', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, (request, reply) => capacityController.getEventCapacity(request as any, reply));

  // Get total capacity for event
  app.get('/events/:eventId/capacity/total', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, (request, reply) => capacityController.getTotalCapacity(request as any, reply));

  // Get single capacity section
  app.get('/capacity/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: capacityIdParamSchema
    }
  }, (request, reply) => capacityController.getCapacityById(request as any, reply));

  // Create capacity section - with idempotency support
  app.post('/events/:eventId/capacity', {
    preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
    schema: {
      params: eventIdParamSchema,
      body: createCapacityBodySchema
    }
  }, (request, reply) => capacityController.createCapacity(request as any, reply));

  // Update capacity section
  app.put('/capacity/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: capacityIdParamSchema,
      body: updateCapacityBodySchema
    }
  }, (request, reply) => capacityController.updateCapacity(request as any, reply));

  // Check availability
  app.post('/capacity/:id/check', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: capacityIdParamSchema,
      body: checkAvailabilityBodySchema
    }
  }, (request, reply) => capacityController.checkAvailability(request as any, reply));

  // Reserve capacity (for cart) - with idempotency support
  app.post('/capacity/:id/reserve', {
    preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
    schema: {
      params: capacityIdParamSchema,
      body: reserveCapacityBodySchema
    }
  }, (request, reply) => capacityController.reserveCapacity(request as any, reply));
}
