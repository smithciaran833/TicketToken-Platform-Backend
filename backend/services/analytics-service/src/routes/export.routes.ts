import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { exportController } from '../controllers/export.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get export history
router.get(
  '/venue/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('status').optional().isIn(['pending', 'processing', 'completed', 'failed']),
    query('type').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  exportController.getExports
);

// Get export status
router.get(
  '/:exportId',
  authorize(['analytics.read']),
  validateRequest([
    param('exportId').isUUID()
  ]),
  exportController.getExportStatus
);

// Create export
router.post(
  '/',
  authorize(['analytics.export']),
  validateRequest([
    body('venueId').isUUID(),
    body('type').isIn(['analytics_report', 'customer_list', 'financial_report', 'custom']),
    body('format').isIn(['csv', 'xlsx', 'pdf', 'json']),
    body('filters').optional().isObject(),
    body('dateRange').optional().isObject(),
    body('dateRange.startDate').optional().isISO8601(),
    body('dateRange.endDate').optional().isISO8601()
  ]),
  exportController.createExport
);

// Download export
router.get(
  '/:exportId/download',
  authorize(['analytics.export']),
  validateRequest([
    param('exportId').isUUID()
  ]),
  exportController.downloadExport
);

// Cancel export
router.post(
  '/:exportId/cancel',
  authorize(['analytics.export']),
  validateRequest([
    param('exportId').isUUID()
  ]),
  exportController.cancelExport
);

// Retry failed export
router.post(
  '/:exportId/retry',
  authorize(['analytics.export']),
  validateRequest([
    param('exportId').isUUID()
  ]),
  exportController.retryExport
);

export { router as exportRouter };
