import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { realtimeController } from '../controllers/realtime.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get real-time metrics
router.get(
  '/venue/:venueId/metrics',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('metrics').optional().isString()
  ]),
  realtimeController.getRealTimeMetrics
);

// Subscribe to metrics (WebSocket upgrade)
router.get(
  '/venue/:venueId/subscribe',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('metrics').isString()
  ]),
  realtimeController.subscribeToMetrics
);

// Get active sessions
router.get(
  '/venue/:venueId/sessions',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  realtimeController.getActiveSessions
);

// Get live dashboard stats
router.get(
  '/venue/:venueId/dashboard/:dashboardId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('dashboardId').isUUID()
  ]),
  realtimeController.getLiveDashboardStats
);

// Update counter
router.post(
  '/venue/:venueId/counter',
  authorize(['analytics.write']),
  validateRequest([
    param('venueId').isUUID(),
    body('counterType').isString().notEmpty(),
    body('increment').optional().isInt()
  ]),
  realtimeController.updateCounter
);

// Get counter value
router.get(
  '/venue/:venueId/counter/:counterType',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('counterType').isString().notEmpty()
  ]),
  realtimeController.getCounter
);

export { router as realtimeRouter };
