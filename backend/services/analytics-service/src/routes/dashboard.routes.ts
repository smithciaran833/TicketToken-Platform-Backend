import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, param } from 'express-validator';
import { dashboardController } from '../controllers/dashboard.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get all dashboards for a venue
router.get(
  '/venue/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  dashboardController.getDashboards
);

// Get a specific dashboard
router.get(
  '/:dashboardId',
  authorize(['analytics.read']),
  validateRequest([
    param('dashboardId').isUUID()
  ]),
  dashboardController.getDashboard
);

// Create a dashboard
router.post(
  '/',
  authorize(['analytics.write']),
  validateRequest([
    body('venueId').isUUID(),
    body('name').isString().notEmpty().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('type').isIn(['overview', 'sales', 'customer', 'operations', 'custom']),
    body('isDefault').optional().isBoolean(),
    body('isPublic').optional().isBoolean(),
    body('config').optional().isObject()
  ]),
  dashboardController.createDashboard
);

// Update a dashboard
router.put(
  '/:dashboardId',
  authorize(['analytics.write']),
  validateRequest([
    param('dashboardId').isUUID(),
    body('name').optional().isString().notEmpty().isLength({ max: 100 }),
    body('description').optional().isString().isLength({ max: 500 }),
    body('isPublic').optional().isBoolean(),
    body('config').optional().isObject()
  ]),
  dashboardController.updateDashboard
);

// Delete a dashboard
router.delete(
  '/:dashboardId',
  authorize(['analytics.delete']),
  validateRequest([
    param('dashboardId').isUUID()
  ]),
  dashboardController.deleteDashboard
);

// Clone a dashboard
router.post(
  '/:dashboardId/clone',
  authorize(['analytics.write']),
  validateRequest([
    param('dashboardId').isUUID(),
    body('name').isString().notEmpty().isLength({ max: 100 }),
    body('venueId').optional().isUUID()
  ]),
  dashboardController.cloneDashboard
);

// Share a dashboard
router.post(
  '/:dashboardId/share',
  authorize(['analytics.share']),
  validateRequest([
    param('dashboardId').isUUID(),
    body('userIds').isArray().notEmpty(),
    body('userIds.*').isUUID(),
    body('permissions').isArray(),
    body('permissions.*').isIn(['view', 'edit'])
  ]),
  dashboardController.shareDashboard
);

// Get dashboard permissions
router.get(
  '/:dashboardId/permissions',
  authorize(['analytics.read']),
  validateRequest([
    param('dashboardId').isUUID()
  ]),
  dashboardController.getDashboardPermissions
);

export { router as dashboardRouter };
