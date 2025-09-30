import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { alertsController } from '../controllers/alerts.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get alerts for a venue
router.get(
  '/venue/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('enabled').optional().isBoolean(),
    query('severity').optional().isIn(['info', 'warning', 'error', 'critical']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  alertsController.getAlerts
);

// Get a specific alert
router.get(
  '/:alertId',
  authorize(['analytics.read']),
  validateRequest([
    param('alertId').isUUID()
  ]),
  alertsController.getAlert
);

// Create an alert
router.post(
  '/',
  authorize(['analytics.write']),
  validateRequest([
    body('venueId').isUUID(),
    body('name').isString().notEmpty().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('type').isString().notEmpty(),
    body('severity').isIn(['info', 'warning', 'error', 'critical']),
    body('conditions').isArray().notEmpty(),
    body('actions').isArray().notEmpty(),
    body('enabled').optional().isBoolean(),
    body('schedule').optional().isObject()
  ]),
  alertsController.createAlert
);

// Update an alert
router.put(
  '/:alertId',
  authorize(['analytics.write']),
  validateRequest([
    param('alertId').isUUID(),
    body('name').optional().isString().notEmpty().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('severity').optional().isIn(['info', 'warning', 'error', 'critical']),
    body('conditions').optional().isArray(),
    body('actions').optional().isArray(),
    body('schedule').optional().isObject()
  ]),
  alertsController.updateAlert
);

// Delete an alert
router.delete(
  '/:alertId',
  authorize(['analytics.delete']),
  validateRequest([
    param('alertId').isUUID()
  ]),
  alertsController.deleteAlert
);

// Toggle alert enabled/disabled
router.post(
  '/:alertId/toggle',
  authorize(['analytics.write']),
  validateRequest([
    param('alertId').isUUID(),
    body('enabled').isBoolean()
  ]),
  alertsController.toggleAlert
);

// Get alert instances
router.get(
  '/:alertId/instances',
  authorize(['analytics.read']),
  validateRequest([
    param('alertId').isUUID(),
    query('status').optional().isIn(['active', 'acknowledged', 'resolved']),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  alertsController.getAlertInstances
);

// Acknowledge alert instance
router.post(
  '/instances/:instanceId/acknowledge',
  authorize(['analytics.write']),
  validateRequest([
    param('instanceId').isUUID(),
    body('notes').optional().isString()
  ]),
  alertsController.acknowledgeAlert
);

// Test alert
router.post(
  '/:alertId/test',
  authorize(['analytics.write']),
  validateRequest([
    param('alertId').isUUID()
  ]),
  alertsController.testAlert
);

export { router as alertsRouter };
