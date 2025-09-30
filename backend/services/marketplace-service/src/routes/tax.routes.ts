import { Router } from 'express';
import { taxController } from '../controllers/tax.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

// All tax routes require authentication
router.use(authMiddleware);

// Get reportable transactions
router.get('/transactions', taxController.getTransactions);

// Get yearly report
router.get('/report/:year', taxController.getYearlyReport);

// Generate 1099-K
router.get('/1099k/:year', taxController.generate1099K);

export default router;
