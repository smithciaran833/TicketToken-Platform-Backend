import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { EventContentController } from '../controllers/event-content.controller';

export default async function eventContentRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  const controller = new EventContentController();

  // Content CRUD
  fastify.post('/:eventId/content', controller.createContent);
  fastify.get('/:eventId/content', controller.getEventContent);
  fastify.get('/:eventId/content/:contentId', controller.getContent);
  fastify.put('/:eventId/content/:contentId', controller.updateContent);
  fastify.delete('/:eventId/content/:contentId', controller.deleteContent);

  // Content actions
  fastify.post('/:eventId/content/:contentId/publish', controller.publishContent);
  fastify.post('/:eventId/content/:contentId/archive', controller.archiveContent);

  // Event-specific endpoints
  fastify.get('/:eventId/gallery', controller.getGallery);
  fastify.get('/:eventId/lineup', controller.getLineup);
  fastify.get('/:eventId/schedule', controller.getSchedule);
  fastify.get('/:eventId/performers', controller.getPerformers);
}
