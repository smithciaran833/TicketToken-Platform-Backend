import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, param } from 'express-validator';
import { predictionController } from '../controllers/prediction.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Predict demand
router.post(
  '/demand',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('eventId').isUUID(),
    body('daysAhead').optional().isInt({ min: 1, max: 365 })
  ]),
  predictionController.predictDemand
);

// Optimize pricing
router.post(
  '/pricing',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('eventId').isUUID(),
    body('ticketTypeId').isUUID(),
    body('currentPrice').isNumeric()
  ]),
  predictionController.optimizePricing
);

// Predict churn
router.post(
  '/churn',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('customerId').isString().notEmpty()
  ]),
  predictionController.predictChurn
);

// Predict customer lifetime value
router.post(
  '/clv',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('customerId').isString().notEmpty()
  ]),
  predictionController.predictCLV
);

// Predict no-show
router.post(
  '/no-show',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('ticketId').isUUID(),
    body('customerId').isString().notEmpty(),
    body('eventId').isUUID()
  ]),
  predictionController.predictNoShow
);

// Run what-if scenario
router.post(
  '/what-if',
  authorize(['analytics.read']),
  validateRequest([
    body('venueId').isUUID(),
    body('scenario').isObject(),
    body('scenario.type').isIn(['pricing', 'capacity', 'marketing']),
    body('scenario.parameters').isObject()
  ]),
  predictionController.runWhatIfScenario
);

// Get model performance
router.get(
  '/models/:modelType/performance',
  authorize(['analytics.admin']),
  validateRequest([
    param('modelType').isIn(['demand', 'pricing', 'churn', 'clv', 'no_show'])
  ]),
  predictionController.getModelPerformance
);

export { router as predictionRouter };
