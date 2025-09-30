import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Admin routes
router.get('/admin/pending', requireAdmin, AdminController.getPendingReviews);
router.post('/admin/approve/:id', AdminController.approveVerification);
router.post('/admin/reject/:id', AdminController.rejectVerification);

export default router;
