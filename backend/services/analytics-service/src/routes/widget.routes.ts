import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { widgetController } from '../controllers/widget.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get widgets for a dashboard
router.get(
  '/dashboard/:dashboardId',
  authorize(['analytics.read']),
  validateRequest([
    param('dashboardId').isUUID()
  ]),
  widgetController.getWidgets
);

// Get a specific widget
router.get(
  '/:widgetId',
  authorize(['analytics.read']),
  validateRequest([
    param('widgetId').isUUID()
  ]),
  widgetController.getWidget
);

// Get widget data
router.get(
  '/:widgetId/data',
  authorize(['analytics.read']),
  validateRequest([
    param('widgetId').isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601(),
    query('refresh').optional().isBoolean()
  ]),
  widgetController.getWidgetData
);

// Create a widget
router.post(
  '/',
  authorize(['analytics.write']),
  validateRequest([
    body('dashboardId').isUUID(),
    body('type').isString().notEmpty(),
    body('title').isString().notEmpty().isLength({ max: 100 }),
    body('config').isObject(),
    body('position').isObject(),
    body('position.x').isInt({ min: 0 }),
    body('position.y').isInt({ min: 0 }),
    body('size').isObject(),
    body('size.width').isInt({ min: 1, max: 12 }),
    body('size.height').isInt({ min: 1, max: 12 })
  ]),
  widgetController.createWidget
);

// Update a widget
router.put(
  '/:widgetId',
  authorize(['analytics.write']),
  validateRequest([
    param('widgetId').isUUID(),
    body('title').optional().isString().notEmpty().isLength({ max: 100 }),
    body('config').optional().isObject(),
    body('position').optional().isObject(),
    body('size').optional().isObject()
  ]),
  widgetController.updateWidget
);

// Delete a widget
router.delete(
  '/:widgetId',
  authorize(['analytics.delete']),
  validateRequest([
    param('widgetId').isUUID()
  ]),
  widgetController.deleteWidget
);

// Move widget to another dashboard
router.post(
  '/:widgetId/move',
  authorize(['analytics.write']),
  validateRequest([
    param('widgetId').isUUID(),
    body('targetDashboardId').isUUID(),
    body('position').optional().isObject()
  ]),
  widgetController.moveWidget
);

// Duplicate a widget
router.post(
  '/:widgetId/duplicate',
  authorize(['analytics.write']),
  validateRequest([
    param('widgetId').isUUID(),
    body('targetDashboardId').optional().isUUID()
  ]),
  widgetController.duplicateWidget
);

// Export widget data
router.post(
  '/:widgetId/export',
  authorize(['analytics.export']),
  validateRequest([
    param('widgetId').isUUID(),
    body('format').isIn(['csv', 'xlsx', 'json']),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601()
  ]),
  widgetController.exportWidgetData
);

export { router as widgetRouter };
