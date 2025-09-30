import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authMiddleware, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// All admin routes require authentication and admin role
router.use(authMiddleware);
router.use(requireAdmin);

// Statistics
router.get('/stats', adminController.getStats);

// Disputes management
router.get('/disputes', adminController.getDisputes);
router.put('/disputes/:disputeId/resolve', adminController.resolveDispute);

// User management
router.get('/flagged-users', adminController.getFlaggedUsers);
router.post('/ban-user', adminController.banUser);

export default router;
