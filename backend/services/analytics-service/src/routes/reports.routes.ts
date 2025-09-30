import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { reportsController } from '../controllers/reports.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get available report templates
router.get(
  '/templates',
  authorize(['analytics.read']),
  reportsController.getReportTemplates
);

// Get reports for a venue
router.get(
  '/venue/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('type').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  reportsController.getReports
);

// Get a specific report
router.get(
  '/:reportId',
  authorize(['analytics.read']),
  validateRequest([
    param('reportId').isUUID()
  ]),
  reportsController.getReport
);

// Generate a report
router.post(
  '/generate',
  authorize(['analytics.write']),
  validateRequest([
    body('venueId').isUUID(),
    body('templateId').isUUID(),
    body('name').isString().notEmpty().isLength({ max: 100 }),
    body('parameters').isObject(),
    body('format').isIn(['pdf', 'xlsx', 'csv']),
    body('schedule').optional().isObject()
  ]),
  reportsController.generateReport
);

// Schedule a report
router.post(
  '/schedule',
  authorize(['analytics.write']),
  validateRequest([
    body('venueId').isUUID(),
    body('templateId').isUUID(),
    body('name').isString().notEmpty().isLength({ max: 100 }),
    body('schedule').isObject(),
    body('schedule.frequency').isIn(['daily', 'weekly', 'monthly']),
    body('schedule.time').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
    body('recipients').isArray().notEmpty(),
    body('recipients.*.email').isEmail()
  ]),
  reportsController.scheduleReport
);

// Update report schedule
router.put(
  '/:reportId/schedule',
  authorize(['analytics.write']),
  validateRequest([
    param('reportId').isUUID(),
    body('schedule').isObject(),
    body('recipients').optional().isArray()
  ]),
  reportsController.updateReportSchedule
);

// Delete a report
router.delete(
  '/:reportId',
  authorize(['analytics.delete']),
  validateRequest([
    param('reportId').isUUID()
  ]),
  reportsController.deleteReport
);

// Get scheduled reports
router.get(
  '/venue/:venueId/scheduled',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  reportsController.getScheduledReports
);

// Pause/resume scheduled report
router.post(
  '/:reportId/schedule/:action',
  authorize(['analytics.write']),
  validateRequest([
    param('reportId').isUUID(),
    param('action').isIn(['pause', 'resume'])
  ]),
  reportsController.toggleScheduledReport
);

export { router as reportsRouter };
