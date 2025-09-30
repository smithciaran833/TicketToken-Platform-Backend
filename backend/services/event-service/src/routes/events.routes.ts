import { authenticate } from "../middleware/authenticate";
import { FastifyInstance } from 'fastify';
import * as eventsController from '../controllers/events.controller';

export default async function eventsRoutes(app: FastifyInstance) {
  // Create event
  app.post('/events', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'starts_at', 'ends_at', 'venue_id', 'tiers'],
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          starts_at: { type: 'string', format: 'date-time' },
          ends_at: { type: 'string', format: 'date-time' },
          venue_id: { type: 'string' },
          tiers: {
            type: 'array',
            items: {
              type: 'object',
              required: ['name', 'price_cents', 'currency', 'total_qty'],
              properties: {
                name: { type: 'string' },
                price_cents: { type: 'integer', minimum: 0 },
                currency: { type: 'string', default: 'USD' },
                total_qty: { type: 'integer', minimum: 1 }
              }
            }
          }
        }
      }
    }
  }, eventsController.createEvent as any);

  // Get single event
  app.get('/events/:id', eventsController.getEvent);

  // Update event (NEW ENDPOINT)
  app.put('/events/:id', {
    preHandler: authenticate,
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          starts_at: { type: 'string', format: 'date-time' },
          ends_at: { type: 'string', format: 'date-time' },
          venue_id: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'CANCELLED'] },
          total_tickets: { type: 'integer', minimum: 0 },
          available_tickets: { type: 'integer', minimum: 0 }
        }
      }
    }
  }, eventsController.updateEvent as any);

  // List events
  app.get('/events', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['DRAFT', 'PUBLISHED', 'CANCELLED'] },
          limit: { type: 'integer', default: 20 },
          offset: { type: 'integer', default: 0 }
        }
      }
    }
  }, eventsController.listEvents);

  // Publish event
  app.post('/events/:id/publish', {
    preHandler: authenticate
  }, eventsController.publishEvent as any);
}
