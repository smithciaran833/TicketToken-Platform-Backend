import { Router } from 'express';
import { transferController } from '../controllers/transferController';
import { validate, ticketSchemas } from '../utils/validation';

const router = Router();

// Transfer a ticket
router.post(
  '/',
  validate(ticketSchemas.transferTicket),
  transferController.transferTicket.bind(transferController)
);

// Get transfer history for a ticket
router.get(
  '/:ticketId/history',
  transferController.getTransferHistory.bind(transferController)
);

// Validate transfer before executing
router.post(
  '/validate',
  transferController.validateTransfer.bind(transferController)
);

export default router;
