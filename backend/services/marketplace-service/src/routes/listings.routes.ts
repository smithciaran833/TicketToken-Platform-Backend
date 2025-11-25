import { FastifyInstance } from 'fastify';
import { listingController } from '../controllers/listing.controller';
import { authMiddleware, verifyListingOwnership } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

// Validation schemas
const createListingSchema = Joi.object({
  ticketId: Joi.string().uuid().required(),
  eventId: Joi.string().uuid().required(),
  venueId: Joi.string().uuid().required(),
  price: Joi.number().positive().required(),
  originalFaceValue: Joi.number().positive().required(),
  eventStartTime: Joi.date().iso().required(),
});

const updatePriceSchema = Joi.object({
  price: Joi.number().positive().required(),
});

export default async function listingsRoutes(fastify: FastifyInstance) {
  // Public routes
  fastify.get('/:id', listingController.getListing.bind(listingController));

  // Get user's own listings - requires auth
  fastify.get('/my-listings', {
    preHandler: [authMiddleware]
  }, listingController.getMyListings.bind(listingController));

  // Create listing - requires auth + wallet
  fastify.post('/', {
    preHandler: [authMiddleware, walletMiddleware, validate(createListingSchema)]
  }, listingController.createListing.bind(listingController));

  // Update listing price - requires auth + wallet + ownership
  fastify.put('/:id/price', {
    preHandler: [authMiddleware, walletMiddleware, verifyListingOwnership, validate(updatePriceSchema)]
  }, listingController.updateListingPrice.bind(listingController));

  // Cancel listing - requires auth + wallet + ownership
  fastify.delete('/:id', {
    preHandler: [authMiddleware, walletMiddleware, verifyListingOwnership]
  }, listingController.cancelListing.bind(listingController));
}
