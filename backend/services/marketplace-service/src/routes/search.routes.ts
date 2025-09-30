import { Router } from 'express';
import { searchController } from '../controllers/search.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

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

// Public search (rate limited in production)
router.get(
  '/',
  validate(searchSchema),
  searchController.searchListings.bind(searchController)
);

// Authenticated search with personalized results
router.use(authMiddleware);

router.get(
  '/recommended',
  searchController.getRecommended.bind(searchController)
);

router.get(
  '/watchlist',
  searchController.getWatchlist.bind(searchController)
);

export default router;
