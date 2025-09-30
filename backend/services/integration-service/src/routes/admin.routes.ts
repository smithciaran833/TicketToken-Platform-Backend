import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const adminRoutes = Router();

// ALL admin routes require authentication AND admin role
adminRoutes.use(authenticate);
adminRoutes.use(authorize('admin'));

adminRoutes.get('/all-venues', adminController.getAllVenueIntegrations);
adminRoutes.get('/health-summary', adminController.getHealthSummary);
adminRoutes.get('/costs', adminController.getCostAnalysis);
adminRoutes.post('/force-sync', adminController.forceSync);
adminRoutes.post('/clear-queue', adminController.clearQueue);
adminRoutes.post('/process-dead-letter', adminController.processDeadLetter);
adminRoutes.post('/recover-stale', adminController.recoverStale);
adminRoutes.get('/queue-metrics', adminController.getQueueMetrics);
