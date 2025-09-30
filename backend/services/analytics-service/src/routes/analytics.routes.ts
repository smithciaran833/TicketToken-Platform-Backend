import { Router } from 'express';
import { analyticsController } from '../controllers/analytics.controller';
import { authenticate, authorize } from "../middleware/auth.middleware";
import { validateRequest } from '../middleware/validation.middleware';
import { analyticsValidators } from '../validators/analytics.validators';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Apply authentication to all routes

// Revenue endpoints
router.get('/revenue/summary',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.dateRange),
  analyticsController.getRevenueSummary
);

router.get('/revenue/by-channel',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.dateRange),
  analyticsController.getRevenueByChannel
);

router.get('/revenue/projections',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.projection),
  analyticsController.getRevenueProjections
);

// Customer analytics endpoints
router.get('/customers/lifetime-value',
  authorize(['analytics.read']),
  analyticsController.getCustomerLifetimeValue
);

router.get('/customers/segments',
  authorize(['analytics.read']),
  analyticsController.getCustomerSegments
);

router.get('/customers/churn-risk',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.churnRisk),
  analyticsController.getChurnRiskAnalysis
);

// Sales metrics endpoints
router.get('/sales/metrics',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.salesMetrics),
  analyticsController.getSalesMetrics
);

router.get('/sales/trends',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.dateRange),
  analyticsController.getSalesTrends
);

// Event performance endpoints
router.get('/events/performance',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.dateRange),
  analyticsController.getEventPerformance
);

router.get('/events/top-performing',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.topEvents),
  analyticsController.getTopPerformingEvents
);

// Real-time metrics endpoint
router.get('/realtime/summary',
  authorize(['analytics.read']),
  analyticsController.getRealtimeSummary
);

// Conversion metrics
router.get('/conversions/funnel',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.dateRange),
  analyticsController.getConversionFunnel
);

// Custom query endpoint for complex analytics
router.post('/query',
  authorize(['analytics.read', 'analytics.write']),
  validateRequest(analyticsValidators.customQuery),
  analyticsController.executeCustomQuery
);

// Dashboard endpoint - aggregates multiple metrics
router.get('/dashboard',
  authorize(['analytics.read']),
  validateRequest(analyticsValidators.dashboard),
  analyticsController.getDashboardData
);

export default router;
