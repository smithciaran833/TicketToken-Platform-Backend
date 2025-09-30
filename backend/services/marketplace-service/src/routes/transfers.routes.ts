import { Router } from 'express';
import { transferController } from '../controllers/transfer.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Validation schemas
const purchaseListingSchema = Joi.object({
  listingId: Joi.string().uuid().required(),
  paymentMethodId: Joi.string().optional(),
});

const directTransferSchema = Joi.object({
  ticketId: Joi.string().uuid().required(),
  recipientWallet: Joi.string().required(),
});

// All transfer routes require authentication
router.use(authMiddleware);
router.use(walletMiddleware);

// Purchase listing - SECURED
router.post(
  '/purchase',
  validate(purchaseListingSchema),
  transferController.purchaseListing.bind(transferController)
);

// Direct transfer - SECURED
router.post(
  '/direct',
  validate(directTransferSchema),
  transferController.directTransfer.bind(transferController)
);

// Get transfer history - SECURED
router.get(
  '/history',
  transferController.getTransferHistory.bind(transferController)
);

// Get transfer by ID - SECURED
router.get(
  '/:id',
  transferController.getTransfer.bind(transferController)
);

// Cancel pending transfer - SECURED
router.post(
  '/:id/cancel',
  transferController.cancelTransfer.bind(transferController)
);

export default router;
