import { Router } from 'express';
import { AlertsController } from '../controllers/alerts.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const alertsController = new AlertsController();

// All alerts require authentication
router.use(authenticate);

// Get recent alerts
router.get('/', alertsController.getAlerts.bind(alertsController));

// Acknowledge alert
router.post(
  '/:id/acknowledge',
  alertsController.acknowledgeAlert.bind(alertsController)
);

// Test alert system (admin only)
router.post(
  '/test',
  authorize('admin'),
  alertsController.testAlert.bind(alertsController)
);

export default router;
