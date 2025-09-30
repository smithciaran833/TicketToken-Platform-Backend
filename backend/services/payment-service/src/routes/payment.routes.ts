import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { rateLimiter } from '../middleware/rate-limiter';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();
const controller = new PaymentController();

// Configure idempotency with 30 minute TTL
const idempotency = idempotencyMiddleware({ 
  ttlMs: 30 * 60 * 1000  // 30 minutes
});

// Process payment
router.post(
  '/process',
  authenticate,
  idempotency,
  rateLimiter('payment', 10, 60), // 10 requests per minute
  validateRequest('processPayment'),
  (req, res, next) => controller.processPayment(req, res, next)
);

// Calculate fees (idempotent but less critical)
router.post(
  '/calculate-fees',
  authenticate,
  idempotency,
  validateRequest('calculateFees'),
  (req, res, next) => controller.calculateFees(req, res, next)
);

// Get transaction status (GET - no idempotency needed)
router.get(
  '/transaction/:transactionId',
  authenticate,
  (req, res, next) => controller.getTransactionStatus(req, res, next)
);

// Refund transaction (CRITICAL - needs idempotency)
router.post(
  '/transaction/:transactionId/refund',
  authenticate,
  idempotency,
  validateRequest('refundTransaction'),
  (req, res, next) => controller.refundTransaction(req, res, next)
);

export default router;
