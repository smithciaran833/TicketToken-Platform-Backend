import { Router } from 'express';
import { syncController } from '../controllers/sync.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const syncRoutes = Router();

// All sync routes require authentication
syncRoutes.use(authenticate);

syncRoutes.post('/:provider/sync', authorize('admin', 'venue_admin'), syncController.triggerSync);
syncRoutes.post('/:provider/sync/stop', authorize('admin', 'venue_admin'), syncController.stopSync);
syncRoutes.get('/:provider/sync/status', syncController.getSyncStatus);
syncRoutes.get('/:provider/sync/history', syncController.getSyncHistory);
syncRoutes.post('/:provider/sync/retry', authorize('admin', 'venue_admin'), syncController.retryFailed);
