import { FastifyInstance } from 'fastify';
import { cancelEvent } from '../controllers/cancellation.controller';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';

const eventIdParamSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const cancelEventBodySchema = {
  type: 'object',
  required: ['reason'],
  properties: {
    reason: { type: 'string', maxLength: 1000 },
    notifyCustomers: { type: 'boolean', default: true },
    refundPolicy: { 
      type: 'string', 
      enum: ['full', 'partial', 'none'],
      default: 'full'
    }
  },
  additionalProperties: false
};

export default async function cancellationRoutes(app: FastifyInstance) {
  // Cancel event endpoint
  app.post('/events/:eventId/cancel', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema,
      body: cancelEventBodySchema
    }
  }, cancelEvent as any);
}
