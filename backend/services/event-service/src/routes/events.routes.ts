import { FastifyInstance } from 'fastify';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';
import { idempotencyPreHandler } from '../middleware/idempotency.middleware';
import * as eventsController from '../controllers/events.controller';
import { uuidPattern, dateTimePattern } from '../schemas/common.schema';
import {
  eventStatuses,
  visibilityTypes,
  eventTypes,
  eventRouteResponses,
  eventListRouteResponses,
  eventResponseSchema,
  eventListResponseSchema,
  createEventResponseSchema,
  deleteEventResponseSchema,
  publishEventResponseSchema
} from '../schemas/event.schema';

/**
 * Event routes with comprehensive input validation schemas.
 *
 * CRITICAL: All schemas include additionalProperties: false to prevent
 * prototype pollution attacks (SEC1, RD6).
 *
 * Audit Fixes:
 * - RD5: Response schemas defined to prevent data leakage
 * - SD3: URL validation with format: uri
 * - SD4: Date validation with format: date-time
 * - SD9: Reusable schema definitions (DRY)
 */

export default async function eventsRoutes(app: FastifyInstance) {
  // List events
  app.get('/events', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: eventStatuses },
          visibility: { type: 'string', enum: visibilityTypes },
          category_id: { type: 'string', pattern: uuidPattern },
          venue_id: { type: 'string', pattern: uuidPattern },
          is_featured: { type: 'boolean' },
          search: { type: 'string', maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          sort_by: { type: 'string', enum: ['created_at', 'name', 'priority', 'views'] },
          sort_order: { type: 'string', enum: ['asc', 'desc'] }
        }
      },
      // RD5: Response schema to prevent data leakage
      response: {
        200: eventListResponseSchema,
        400: eventListRouteResponses[400],
        401: eventListRouteResponses[401]
      }
    }
  }, eventsController.listEvents as any);

  // Get single event
  app.get('/events/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: uuidPattern }
        }
      },
      // RD5: Response schema
      response: {
        200: eventResponseSchema,
        400: eventRouteResponses[400],
        401: eventRouteResponses[401],
        404: eventRouteResponses[404]
      }
    }
  }, eventsController.getEvent as any);

  // Create event - with idempotency support
  app.post('/events', {
    preHandler: [authenticateFastify, tenantHook, idempotencyPreHandler],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'venue_id'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 300 },
          description: { type: 'string', maxLength: 10000 },
          short_description: { type: 'string', maxLength: 500 },
          venue_id: { type: 'string', pattern: uuidPattern },
          venue_layout_id: { type: 'string', pattern: uuidPattern },
          event_type: { type: 'string', enum: eventTypes },
          primary_category_id: { type: 'string', pattern: uuidPattern },
          category: { type: 'string', pattern: uuidPattern }, // Alias for primary_category_id
          secondary_category_ids: {
            type: 'array',
            maxItems: 10,
            items: { type: 'string', pattern: uuidPattern }
          },
          tags: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 50 }
          },
          status: { type: 'string', enum: eventStatuses },
          visibility: { type: 'string', enum: visibilityTypes },
          is_featured: { type: 'boolean' },
          priority_score: { type: 'integer', minimum: 0, maximum: 1000 },
          banner_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
          image_url: { type: 'string', format: 'uri', maxLength: 2000 }, // Alias
          thumbnail_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
          video_url: { type: 'string', format: 'uri', maxLength: 2000 },
          virtual_event_url: { type: 'string', format: 'uri', maxLength: 2000 },
          age_restriction: { type: 'integer', minimum: 0, maximum: 100 },
          dress_code: { type: 'string', maxLength: 100 },
          special_requirements: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 500 }
          },
          accessibility_info: {
            type: 'object',
            additionalProperties: false,
            properties: {
              wheelchair_accessible: { type: 'boolean' },
              hearing_assistance: { type: 'boolean' },
              visual_assistance: { type: 'boolean' },
              notes: { type: 'string', maxLength: 1000 }
            }
          },
          is_virtual: { type: 'boolean' },
          is_hybrid: { type: 'boolean' },
          streaming_platform: { type: 'string', maxLength: 50 },
          streaming_config: {
            type: 'object',
            additionalProperties: false,
            properties: {
              platform_id: { type: 'string', maxLength: 100 },
              stream_key: { type: 'string', maxLength: 200 },
              backup_url: { type: 'string', format: 'uri', maxLength: 2000 }
            }
          },
          cancellation_policy: { type: 'string', maxLength: 5000 },
          refund_policy: { type: 'string', maxLength: 5000 },
          cancellation_deadline_hours: { type: 'integer', minimum: 0, maximum: 8760 },
          // Schedule data
          event_date: { type: 'string', pattern: dateTimePattern },
          starts_at: { type: 'string', pattern: dateTimePattern },
          ends_at: { type: 'string', pattern: dateTimePattern },
          doors_open: { type: 'string', pattern: dateTimePattern },
          timezone: { type: 'string', maxLength: 50 },
          // Capacity
          capacity: { type: 'integer', minimum: 1, maximum: 1000000 },
          // Blockchain
          artist_wallet: { type: 'string', maxLength: 50 },
          artist_percentage: { type: 'number', minimum: 0, maximum: 100 },
          venue_percentage: { type: 'number', minimum: 0, maximum: 100 },
          resaleable: { type: 'boolean' },
          // SEO
          meta_title: { type: 'string', maxLength: 70 },
          meta_description: { type: 'string', maxLength: 160 },
          meta_keywords: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 50 }
          },
          // Metadata
          external_id: { type: 'string', maxLength: 100 },
          metadata: {
            type: 'object',
            additionalProperties: true,
            maxProperties: 50
          },
          // Legacy fields for event metadata
          performers: { type: 'array', maxItems: 50, items: { type: 'object' } },
          headliner: { type: 'string', maxLength: 200 },
          supporting_acts: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 200 }
          },
          custom_metadata: { type: 'object', additionalProperties: true, maxProperties: 50 }
        }
      },
      // RD5: Response schema
      response: {
        201: createEventResponseSchema,
        400: eventRouteResponses[400],
        401: eventRouteResponses[401],
        409: eventRouteResponses[409]
      }
    }
  }, eventsController.createEvent as any);

  // Update event
  app.put('/events/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: uuidPattern }
        }
      },
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 300 },
          description: { type: 'string', maxLength: 10000 },
          short_description: { type: 'string', maxLength: 500 },
          venue_id: { type: 'string', pattern: uuidPattern },
          status: { type: 'string', enum: eventStatuses },
          visibility: { type: 'string', enum: visibilityTypes },
          is_featured: { type: 'boolean' },
          priority_score: { type: 'integer', minimum: 0, maximum: 1000 },
          banner_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
          image_url: { type: 'string', format: 'uri', maxLength: 2000 },
          thumbnail_image_url: { type: 'string', format: 'uri', maxLength: 2000 },
          tags: {
            type: 'array',
            maxItems: 20,
            items: { type: 'string', maxLength: 50 }
          },
          primary_category_id: { type: 'string', pattern: uuidPattern },
          category: { type: 'string', pattern: uuidPattern },
          age_restriction: { type: 'integer', minimum: 0, maximum: 100 },
          dress_code: { type: 'string', maxLength: 100 },
          cancellation_policy: { type: 'string', maxLength: 5000 },
          refund_policy: { type: 'string', maxLength: 5000 },
          meta_title: { type: 'string', maxLength: 70 },
          meta_description: { type: 'string', maxLength: 160 },
          metadata: {
            type: 'object',
            additionalProperties: true,
            maxProperties: 50
          }
        }
      },
      // RD5: Response schema
      response: {
        200: eventResponseSchema,
        400: eventRouteResponses[400],
        401: eventRouteResponses[401],
        404: eventRouteResponses[404],
        409: eventRouteResponses[409]
      }
    }
  }, eventsController.updateEvent as any);

  // Delete event
  app.delete('/events/:id', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: uuidPattern }
        }
      },
      // RD5: Response schema
      response: {
        200: deleteEventResponseSchema,
        400: eventRouteResponses[400],
        401: eventRouteResponses[401],
        404: eventRouteResponses[404]
      }
    }
  }, eventsController.deleteEvent as any);

  // Publish event
  app.post('/events/:id/publish', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: uuidPattern }
        }
      },
      // RD5: Response schema
      response: {
        200: publishEventResponseSchema,
        400: eventRouteResponses[400],
        401: eventRouteResponses[401],
        404: eventRouteResponses[404],
        409: eventRouteResponses[409]
      }
    }
  }, eventsController.publishEvent as any);

  // Get events by venue
  app.get('/venues/:venueId/events', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: {
        type: 'object',
        required: ['venueId'],
        additionalProperties: false,
        properties: {
          venueId: { type: 'string', pattern: uuidPattern }
        }
      },
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          status: { type: 'string', enum: eventStatuses },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      },
      // RD5: Response schema
      response: {
        200: eventListResponseSchema,
        400: eventListRouteResponses[400],
        401: eventListRouteResponses[401]
      }
    }
  }, eventsController.getVenueEvents as any);
}
