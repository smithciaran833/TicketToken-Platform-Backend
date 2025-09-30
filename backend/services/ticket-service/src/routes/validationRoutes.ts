import { Router } from 'express';
import { qrController } from '../controllers/qrController';
import { validate, ticketSchemas } from '../utils/validation';

const router = Router();

// Public endpoint for QR validation (used by scanner devices)
router.post(
  '/qr',
  validate(ticketSchemas.validateQR),
  qrController.validateQR.bind(qrController)
);

export default router;
