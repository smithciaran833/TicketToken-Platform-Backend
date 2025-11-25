import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import * as eventsController from '../controllers/events.controller';

export default async function eventsRoutes(app: FastifyInstance) {
  // List events
  app.get('/events', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, eventsController.listEvents as any);

  // Get single event
  app.get('/events/:id', {
    preHandler: [authenticateFastify, tenantHook]
  }, eventsController.getEvent as any);

  // Create event
  app.post('/events', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'venue_id'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          venue_id: { type: 'string' }
        }
      }
    }
  }, eventsController.createEvent as any);

  // Update event
  app.put('/events/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          venue_id: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'CANCELLED'] }
        }
      }
    }
  }, eventsController.updateEvent as any);

  // Delete event
  app.delete('/events/:id', {
    preHandler: [authenticateFastify, tenantHook]
  }, eventsController.deleteEvent as any);

  // Publish event
  app.post('/events/:id/publish', {
    preHandler: [authenticateFastify, tenantHook]
  }, eventsController.publishEvent as any);

  // Get events by venue
  app.get('/venues/:venueId/events', {
    preHandler: [authenticateFastify, tenantHook]
  }, eventsController.getVenueEvents as any);
}
