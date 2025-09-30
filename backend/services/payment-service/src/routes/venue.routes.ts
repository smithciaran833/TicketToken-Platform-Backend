import { Router } from 'express';
import { VenueController } from '../controllers/venue.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new VenueController();

router.get('/:venueId/balance', authenticate, (req, res, next) => controller.getBalance(req, res, next));
router.post('/:venueId/payout', authenticate, (req, res, next) => controller.requestPayout(req, res, next));
router.get('/:venueId/payouts', authenticate, (req, res, next) => controller.getPayoutHistory(req, res, next));

export default router;
