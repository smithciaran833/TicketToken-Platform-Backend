import { Router } from 'express';
import { qrController } from '../controllers/qrController';

const router = Router();

// Generate QR code for ticket
router.get(
  '/:ticketId/generate',
  qrController.generateQR.bind(qrController)
);

// Validate QR code (for venue staff)
router.post(
  '/validate',
  qrController.validateQR.bind(qrController)
);

export default router;
