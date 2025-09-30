import { Router } from 'express';
import { listingController } from '../controllers/listing.controller';
import { authMiddleware, verifyListingOwnership } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

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

// Public routes (still need some level of rate limiting in production)
router.get('/:id', listingController.getListing.bind(listingController));

// All other routes require authentication
router.use(authMiddleware);

// Get user's own listings
router.get('/my-listings', listingController.getMyListings.bind(listingController));

// Routes requiring wallet connection
router.use(walletMiddleware);

// Create listing - SECURED
router.post(
  '/',
  validate(createListingSchema),
  listingController.createListing.bind(listingController)
);

// Update listing price - SECURED with ownership check
router.put(
  '/:id/price',
  verifyListingOwnership,
  validate(updatePriceSchema),
  listingController.updateListingPrice.bind(listingController)
);

// Cancel listing - SECURED with ownership check
router.delete(
  '/:id',
  verifyListingOwnership,
  listingController.cancelListing.bind(listingController)
);

export default router;
