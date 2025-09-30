import { Router } from 'express';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation';
import { body, query, param } from 'express-validator';
import { campaignController } from '../controllers/campaign.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Get campaigns
router.get(
  '/venue/:venueId',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('status').optional().isIn(['draft', 'active', 'paused', 'completed']),
    query('type').optional().isString(),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 })
  ]),
  campaignController.getCampaigns
);

// Get campaign details
router.get(
  '/:campaignId',
  authorize(['analytics.read']),
  validateRequest([
    param('campaignId').isUUID()
  ]),
  campaignController.getCampaign
);

// Get campaign performance
router.get(
  '/:campaignId/performance',
  authorize(['analytics.read']),
  validateRequest([
    param('campaignId').isUUID(),
    query('startDate').optional().isISO8601(),
    query('endDate').optional().isISO8601()
  ]),
  campaignController.getCampaignPerformance
);

// Get campaign attribution
router.get(
  '/:campaignId/attribution',
  authorize(['analytics.read']),
  validateRequest([
    param('campaignId').isUUID(),
    query('model').optional().isIn(['first_touch', 'last_touch', 'linear', 'time_decay', 'data_driven'])
  ]),
  campaignController.getCampaignAttribution
);

// Get channel performance
router.get(
  '/venue/:venueId/channels',
  authorize(['analytics.read']),
  validateRequest([
    param('venueId').isUUID(),
    query('startDate').isISO8601(),
    query('endDate').isISO8601()
  ]),
  campaignController.getChannelPerformance
);

// Track touchpoint
router.post(
  '/touchpoint',
  authorize(['analytics.write']),
  validateRequest([
    body('venueId').isUUID(),
    body('customerId').isString().notEmpty(),
    body('channel').isString().notEmpty(),
    body('action').isString().notEmpty(),
    body('value').optional().isNumeric(),
    body('campaign').optional().isString(),
    body('metadata').optional().isObject()
  ]),
  campaignController.trackTouchpoint
);

// Get ROI analysis
router.get(
  '/:campaignId/roi',
  authorize(['analytics.read']),
  validateRequest([
    param('campaignId').isUUID()
  ]),
  campaignController.getCampaignROI
);

export { router as campaignRouter };
