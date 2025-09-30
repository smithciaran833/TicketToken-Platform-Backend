import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplace.controller';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

const router = Router();
const controller = new MarketplaceController();

// Create resale listing
router.post(
  '/listings',
  authenticate,
  validateRequest('createListing'),
  (req, res, next) => controller.createListing(req, res, next)
);

// Purchase resale ticket
router.post(
  '/purchase',
  authenticate,
  validateRequest('purchaseResale'),
  (req, res, next) => controller.purchaseResaleTicket(req, res, next)
);

// Confirm transfer
router.post(
  '/escrow/:escrowId/confirm',
  authenticate,
  (req, res, next) => controller.confirmTransfer(req, res, next)
);

// Get royalty report
router.get(
  '/venues/:venueId/royalties',
  authenticate,
  (req, res, next) => controller.getRoyaltyReport(req, res, next)
);

// Get pricing analytics
router.get(
  '/venues/:venueId/pricing-analytics',
  authenticate,
  (req, res, next) => controller.getPricingAnalytics(req, res, next)
);

export default router;
