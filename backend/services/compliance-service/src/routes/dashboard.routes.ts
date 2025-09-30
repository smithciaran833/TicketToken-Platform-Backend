import { Router } from 'express';
import { DashboardController } from '../controllers/dashboard.controller';

const router = Router();

// Dashboard routes
router.get('/dashboard', DashboardController.getComplianceOverview);

export default router;
