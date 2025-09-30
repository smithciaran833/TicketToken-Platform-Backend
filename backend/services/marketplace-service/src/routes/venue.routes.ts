import { Router } from 'express';
import { venueSettingsController } from '../controllers/venue-settings.controller';
import { authMiddleware, requireVenueOwner } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const updateSettingsSchema = Joi.object({
  allowResale: Joi.boolean().optional(),
  maxMarkupPercentage: Joi.number().min(0).max(500).optional(),
  minPricePercentage: Joi.number().min(0).max(100).optional(),
  royaltyPercentage: Joi.number().min(0).max(50).optional(),
});

// All venue routes require authentication and venue owner role
router.use(authMiddleware);
router.use(requireVenueOwner);

// Get venue marketplace settings - SECURED
router.get(
  '/:venueId/settings',
  venueSettingsController.getSettings.bind(venueSettingsController)
);

// Update venue marketplace settings - SECURED
router.put(
  '/:venueId/settings',
  validate(updateSettingsSchema),
  venueSettingsController.updateSettings.bind(venueSettingsController)
);

// Get venue listings - SECURED
router.get(
  '/:venueId/listings',
  venueSettingsController.getVenueListings.bind(venueSettingsController)
);

// Get venue sales report - SECURED
router.get(
  '/:venueId/sales-report',
  venueSettingsController.getSalesReport.bind(venueSettingsController)
);

export default router;
