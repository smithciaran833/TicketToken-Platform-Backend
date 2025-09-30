import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { query, param } from 'express-validator';
import { customerController } from '../controllers/customer.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get customer segments
router.get(
  '/venue/:venueId/segments',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID()
  ]),
  customerController.getCustomerSegments
);

// Get customer profile
router.get(
  '/venue/:venueId/:customerId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('customerId').isString().notEmpty()
  ]),
  customerController.getCustomerProfile
);

// Get customer insights
router.get(
  '/venue/:venueId/:customerId/insights',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('customerId').isString().notEmpty()
  ]),
  customerController.getCustomerInsights
);

// Get customer journey
router.get(
  '/venue/:venueId/:customerId/journey',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('customerId').isString().notEmpty(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ]),
  customerController.getCustomerJourney
);

// Get RFM analysis
router.get(
  '/venue/:venueId/:customerId/rfm',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('customerId').isString().notEmpty()
  ]),
  customerController.getRFMAnalysis
);

// Get customer lifetime value
router.get(
  '/venue/:venueId/:customerId/clv',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('customerId').isString().notEmpty()
  ]),
  customerController.getCustomerLifetimeValue
);

// Search customers
router.get(
  '/venue/:venueId/search',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('q').isString().notEmpty(),
    query('segment').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  customerController.searchCustomers
);

// Get segment analysis
router.get(
  '/venue/:venueId/segments/:segment/analysis',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    param('segment').isString().notEmpty()
  ]),
  customerController.getSegmentAnalysis
);

export { router as customerRouter };
