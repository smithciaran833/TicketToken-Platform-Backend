import { Router } from 'express';
import { disputeController } from '../controllers/dispute.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All dispute routes require authentication
router.use(authMiddleware);

// Create dispute
router.post('/', disputeController.create);

// Get user's disputes
router.get('/my-disputes', disputeController.getMyDisputes);

// Get specific dispute
router.get('/:disputeId', disputeController.getById);

// Add evidence to dispute
router.post('/:disputeId/evidence', disputeController.addEvidence);

export default router;
