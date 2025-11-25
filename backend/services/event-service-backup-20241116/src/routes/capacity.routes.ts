import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as capacityController from '../controllers/capacity.controller';

export default async function capacityRoutes(app: FastifyInstance) {
  // Get event capacity
  app.get('/events/:eventId/capacity', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.getEventCapacity(request as any, reply));

  // Get total capacity for event
  app.get('/events/:eventId/capacity/total', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.getTotalCapacity(request as any, reply));

  // Get single capacity section
  app.get('/capacity/:id', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.getCapacityById(request as any, reply));

  // Create capacity section
  app.post('/events/:eventId/capacity', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.createCapacity(request as any, reply));

  // Update capacity section
  app.put('/capacity/:id', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.updateCapacity(request as any, reply));

  // Check availability
  app.post('/capacity/:id/check', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.checkAvailability(request as any, reply));

  // Reserve capacity (for cart)
  app.post('/capacity/:id/reserve', {
    preHandler: [authenticateFastify, tenantHook]
  }, (request, reply) => capacityController.reserveCapacity(request as any, reply));
}

