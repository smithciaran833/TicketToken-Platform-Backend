import { Router } from 'express';
import { RateLimitController } from '../controllers/rate-limit.controller';

const router = Router();
const rateLimitController = new RateLimitController();

// Get current rate limit status
router.get(
  '/status/:key',
  rateLimitController.getStatus.bind(rateLimitController)
);

// Reset rate limit for a key
router.post(
  '/reset/:key',
  rateLimitController.resetLimit.bind(rateLimitController)
);

// Temporarily commented out - methods not implemented yet
/*
// Update rate limit settings
router.put(
  '/update/:key',
  rateLimitController.updateLimit.bind(rateLimitController)
);

// Disable rate limiting for a key
router.delete(
  '/disable/:key', 
  rateLimitController.disableLimit.bind(rateLimitController)
);
*/

export default router;
