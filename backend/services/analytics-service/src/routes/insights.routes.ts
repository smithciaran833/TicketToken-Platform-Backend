import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { insightsController } from '../controllers/insights.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get insights for a venue
router.get(
  '/venue/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('type').optional().isString(),
    query('priority').optional().isIn(['low', 'medium', 'high']),
    query('actionable').optional().isBoolean(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  insightsController.getInsights
);

// Get customer insights
router.get(
  '/venue/:venueId/customers/:customerId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('customerId').isString().notEmpty()
  ]),
  insightsController.getCustomerInsights
);

// Get a specific insight
router.get(
  '/:insightId',
  authorize(['analytics.read']),
  validateRequest([
    param('insightId').isUUID()
  ]),
  insightsController.getInsight
);

// Dismiss an insight
router.post(
  '/:insightId/dismiss',
  authorize(['analytics.write']),
  validateRequest([
    param('insightId').isUUID(),
    body('reason').optional().isString()
  ]),
  insightsController.dismissInsight
);

// Take action on an insight
router.post(
  '/:insightId/action',
  authorize(['analytics.write']),
  validateRequest([
    param('insightId').isUUID(),
    body('action').isString().notEmpty(),
    body('parameters').optional().isObject()
  ]),
  insightsController.takeAction
);

// Get insight statistics
router.get(
  '/venue/:venueId/stats',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  insightsController.getInsightStats
);

// Refresh insights
router.post(
  '/venue/:venueId/refresh',
  authorize(['analytics.write']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  insightsController.refreshInsights
);

export { router as insightsRouter };
