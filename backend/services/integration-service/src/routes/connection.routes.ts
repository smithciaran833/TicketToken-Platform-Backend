import { Router } from 'express';
import { connectionController } from '../controllers/connection.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

export const connectionRoutes = Router();

// All routes require authentication
connectionRoutes.use(authenticate);

connectionRoutes.get('/', connectionController.listIntegrations);
connectionRoutes.get('/:provider', connectionController.getIntegration);
connectionRoutes.post('/connect/:provider', authorize('admin', 'venue_admin'), connectionController.connectIntegration);
connectionRoutes.post('/:provider/disconnect', authorize('admin', 'venue_admin'), connectionController.disconnectIntegration);
connectionRoutes.post('/:provider/reconnect', authorize('admin', 'venue_admin'), connectionController.reconnectIntegration);
connectionRoutes.post('/:provider/api-key', authorize('admin', 'venue_admin'), connectionController.validateApiKey);
