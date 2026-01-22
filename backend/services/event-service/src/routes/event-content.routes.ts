import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { EventContentController } from '../controllers/event-content.controller';
import { authenticateFastify } from '../middleware/auth';
import { tenantHook } from '../middleware/tenant';

// Schemas for validation
const eventIdParamSchema = {
  type: 'object',
  required: ['eventId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const contentIdParamSchema = {
  type: 'object',
  required: ['eventId', 'contentId'],
  properties: {
    eventId: { type: 'string', format: 'uuid' },
    contentId: { type: 'string', format: 'uuid' }
  },
  additionalProperties: false
};

const createContentBodySchema = {
  type: 'object',
  required: ['type', 'data'],
  properties: {
    type: { 
      type: 'string', 
      enum: ['gallery', 'lineup', 'schedule', 'performer', 'other'] 
    },
    data: { type: 'object' },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] }
  },
  additionalProperties: false
};

const updateContentBodySchema = {
  type: 'object',
  properties: {
    type: { 
      type: 'string', 
      enum: ['gallery', 'lineup', 'schedule', 'performer', 'other'] 
    },
    data: { type: 'object' },
    status: { type: 'string', enum: ['draft', 'published', 'archived'] }
  },
  additionalProperties: false
};

export default async function eventContentRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new EventContentController();

  // Content CRUD
  fastify.post('/:eventId/content', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema,
      body: createContentBodySchema
    }
  }, controller.createContent);

  fastify.get('/:eventId/content', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getEventContent);

  fastify.get('/:eventId/content/:contentId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: contentIdParamSchema
    }
  }, controller.getContent);

  fastify.put('/:eventId/content/:contentId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: contentIdParamSchema,
      body: updateContentBodySchema
    }
  }, controller.updateContent);

  fastify.delete('/:eventId/content/:contentId', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: contentIdParamSchema
    }
  }, controller.deleteContent);

  // Content actions
  fastify.post('/:eventId/content/:contentId/publish', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: contentIdParamSchema
    }
  }, controller.publishContent);

  fastify.post('/:eventId/content/:contentId/archive', {
    preHandler: [authenticateFastify, tenantHook],
    schema: {
      params: contentIdParamSchema
    }
  }, controller.archiveContent);

  // Event-specific endpoints (public read access)
  fastify.get('/:eventId/gallery', {
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getGallery);

  fastify.get('/:eventId/lineup', {
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getLineup);

  fastify.get('/:eventId/schedule', {
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getSchedule);

  fastify.get('/:eventId/performers', {
    schema: {
      params: eventIdParamSchema
    }
  }, controller.getPerformers);
}
