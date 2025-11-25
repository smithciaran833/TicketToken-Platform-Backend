import { FastifyInstance } from 'fastify';
import { searchController } from '../controllers/search.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

// Validation schemas
const searchSchema = Joi.object({
  eventId: Joi.string().uuid().optional(),
  venueId: Joi.string().uuid().optional(),
  minPrice: Joi.number().positive().optional(),
  maxPrice: Joi.number().positive().optional(),
  date: Joi.date().iso().optional(),
  limit: Joi.number().integer().min(1).max(100).default(20),
  offset: Joi.number().integer().min(0).default(0),
});

export default async function searchRoutes(fastify: FastifyInstance) {
  // Public search (rate limited in production)
  fastify.get('/', {
    preHandler: [validate(searchSchema)]
  }, searchController.searchListings.bind(searchController));

  // Authenticated search with personalized results
  fastify.get('/recommended', {
    preHandler: [authMiddleware]
  }, searchController.getRecommended.bind(searchController));

  fastify.get('/watchlist', {
    preHandler: [authMiddleware]
  }, searchController.getWatchlist.bind(searchController));
}
