import { FastifyInstance } from 'fastify';
import { venueSettingsController } from '../controllers/venue-settings.controller';
import { authMiddleware, requireVenueOwner } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

// Validation schemas
const updateSettingsSchema = Joi.object({
  allowResale: Joi.boolean().optional(),
  maxMarkupPercentage: Joi.number().min(0).max(500).optional(),
  minPricePercentage: Joi.number().min(0).max(100).optional(),
  royaltyPercentage: Joi.number().min(0).max(50).optional(),
});

export default async function venueRoutes(fastify: FastifyInstance) {
  // All venue routes require authentication and venue owner role
  const venueOwnerPreHandler = [authMiddleware, requireVenueOwner];

  // Get venue marketplace settings
  fastify.get('/:venueId/settings', {
    preHandler: venueOwnerPreHandler
  }, venueSettingsController.getSettings.bind(venueSettingsController));

  // Update venue marketplace settings
  fastify.put('/:venueId/settings', {
    preHandler: [...venueOwnerPreHandler, validate(updateSettingsSchema)]
  }, venueSettingsController.updateSettings.bind(venueSettingsController));

  // Get venue listings
  fastify.get('/:venueId/listings', {
    preHandler: venueOwnerPreHandler
  }, venueSettingsController.getVenueListings.bind(venueSettingsController));

  // Get venue sales report
  fastify.get('/:venueId/sales-report', {
    preHandler: venueOwnerPreHandler
  }, venueSettingsController.getSalesReport.bind(venueSettingsController));
}
