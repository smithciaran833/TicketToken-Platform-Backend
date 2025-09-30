import { Router } from 'express';
import { purchaseController } from '../controllers/purchaseController';
import { authMiddleware } from '../middleware/auth';
import { tenantMiddleware } from '../middleware/tenant-simple';

const router = Router();

// Purchase route - requires auth AND tenant context
router.post('/', 
  authMiddleware,
  tenantMiddleware,
  purchaseController.createOrder.bind(purchaseController)
);

export default router;
