import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { metricsController } from '../controllers/metrics.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Record a metric
router.post(
  '/',
  authorize(['analytics.write']),
  validateRequest([
    body('metricType').isString().notEmpty(),
    body('value').isNumeric(),
    body('venueId').isUUID(),
    body('dimensions').optional().isObject(),
    body('metadata').optional().isObject()
  ]),
  metricsController.recordMetric
);

// Bulk record metrics
router.post(
  '/bulk',
  authorize(['analytics.write']),
  validateRequest([
    body('metrics').isArray().notEmpty(),
    body('metrics.*.metricType').isString().notEmpty(),
    body('metrics.*.value').isNumeric(),
    body('metrics.*.venueId').isUUID()
  ]),
  metricsController.bulkRecordMetrics
);

// Get metrics
router.get(
  '/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('metricType').isString().notEmpty(),
    query('startDate').isISO8601(),
    query('endDate').isISO8601(),
    query('granularity').optional().isString()
  ]),
  metricsController.getMetrics
);

// Get real-time metrics
router.get(
  '/:venueId/realtime',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  metricsController.getRealTimeMetrics
);

// Get metric trends
router.get(
  '/:venueId/trends',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('metricType').isString().notEmpty(),
    query('periods').isInt({ min: 1, max: 100 }),
    query('periodUnit').isIn(['hour', 'day', 'week', 'month'])
  ]),
  metricsController.getMetricTrends
);

// Compare metrics
router.get(
  '/:venueId/compare',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('metricType').isString().notEmpty(),
    query('currentStartDate').isISO8601(),
    query('currentEndDate').isISO8601(),
    query('previousStartDate').isISO8601(),
    query('previousEndDate').isISO8601()
  ]),
  metricsController.compareMetrics
);

// Get aggregated metrics
router.get(
  '/:venueId/aggregate',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('metricType').isString().notEmpty(),
    query('startDate').isISO8601(),
    query('endDate').isISO8601(),
    query('aggregation').isIn(['sum', 'avg', 'min', 'max', 'count'])
  ]),
  metricsController.getAggregatedMetric
);

export { router as metricsRouter };
