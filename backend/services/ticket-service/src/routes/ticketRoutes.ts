import { Router } from 'express';
import { ticketController } from '../controllers/ticketController';
import { validate, ticketSchemas } from '../utils/validation';
import { requireRole } from '../middleware/auth';

const router = Router();

// Ticket type management (admin/venue manager only)
router.post(
  '/types',
  requireRole(['admin', 'venue_manager']),
  validate(ticketSchemas.createTicketType),
  ticketController.createTicketType.bind(ticketController)
);

router.get(
  '/events/:eventId/types',
  ticketController.getTicketTypes.bind(ticketController)
);

// Ticket purchasing
router.post(
  '/purchase',
  validate(ticketSchemas.purchaseTickets),
  ticketController.createReservation.bind(ticketController)
);

router.post(
  '/reservations/:reservationId/confirm',
  ticketController.confirmPurchase.bind(ticketController)
);

// NEW: Release reservation (L2.1-018)
router.delete(
  '/reservations/:reservationId',
  ticketController.releaseReservation.bind(ticketController)
);

// NEW: Generate QR (L2.1-020)
router.get(
  '/:ticketId/qr',
  ticketController.generateQR.bind(ticketController)
);

// NEW: Validate QR (L2.1-019)
router.post(
  '/validate-qr',
  ticketController.validateQR.bind(ticketController)
);

// Ticket viewing
router.get(
  '/users/:userId',
  ticketController.getUserTickets.bind(ticketController)
);

export default router;
