import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { VenueContentController } from '../controllers/venue-content.controller';

export default async function venueContentRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
) {
  const controller = new VenueContentController();

  // Content CRUD
  fastify.post('/:venueId/content', controller.createContent);
  fastify.get('/:venueId/content', controller.getVenueContent);
  fastify.get('/:venueId/content/:contentId', controller.getContent);
  fastify.put('/:venueId/content/:contentId', controller.updateContent);
  fastify.delete('/:venueId/content/:contentId', controller.deleteContent);

  // Content actions
  fastify.post('/:venueId/content/:contentId/publish', controller.publishContent);
  fastify.post('/:venueId/content/:contentId/archive', controller.archiveContent);

  // Seating chart
  fastify.get('/:venueId/seating-chart', controller.getSeatingChart);
  fastify.put('/:venueId/seating-chart', controller.updateSeatingChart);

  // Photos
  fastify.get('/:venueId/photos', controller.getPhotos);
  fastify.post('/:venueId/photos', controller.addPhoto);

  // Venue info
  fastify.get('/:venueId/amenities', controller.getAmenities);
  fastify.get('/:venueId/accessibility', controller.getAccessibility);
  fastify.get('/:venueId/parking', controller.getParkingInfo);
  fastify.get('/:venueId/policies', controller.getPolicies);
}
