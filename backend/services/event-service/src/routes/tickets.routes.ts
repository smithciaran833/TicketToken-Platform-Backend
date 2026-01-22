import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import { idempotencyPreHandler } from '../middleware/idempotency.middleware';
import * as ticketsController from '../controllers/tickets.controller';

const eventIdParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const ticketTypeParamSchema = {
  type: 'object',
  required: ['id', 'typeId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    typeId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const createTicketTypeBodySchema = {
  type: 'object',
  required: ['name', 'price'],
  properties: {
    name: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    price: { type: 'number', minimum: 0 },
    currency: { type: 'string', pattern: '^[A-Z]{3}$', default: 'USD' },
    quantity: { type: 'integer', minimum: 0 },
    maxPerOrder: { type: 'integer', minimum: 1 },
    salesStartAt: { type: 'string', format: 'date-time' },
    salesEndAt: { type: 'string', format: 'date-time' },
    isActive: { type: 'boolean', default: true }
  },
  additionalProperties: false
};

const updateTicketTypeBodySchema = {
  type: 'object',
  properties: {
    name: { type: 'string', maxLength: 200 },
    description: { type: 'string', maxLength: 1000 },
    price: { type: 'number', minimum: 0 },
    quantity: { type: 'integer', minimum: 0 },
    maxPerOrder: { type: 'integer', minimum: 1 },
    salesStartAt: { type: 'string', format: 'date-time' },
    salesEndAt: { type: 'string', format: 'date-time' },
    isActive: { type: 'boolean' }
  },
  additionalProperties: false
};

export default async function ticketsRoutes(app: FastifyInstance) {
  // Get ticket types for event
  app.get('/events/:id/ticket-types', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, ticketsController.getTicketTypes as any);

  // Create ticket type
  app.post('/events/:id/ticket-types', {
    preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
    schema: {
      params: eventIdParamSchema,
      body: createTicketTypeBodySchema
    }
  }, ticketsController.createTicketType as any);

  // Update ticket type
  app.put('/events/:id/ticket-types/:typeId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: ticketTypeParamSchema,
      body: updateTicketTypeBodySchema
    }
  }, ticketsController.updateTicketType as any);
}
