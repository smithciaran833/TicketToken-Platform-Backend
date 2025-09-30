import { Router } from 'express';
import { MetricsController } from '../controllers/metrics.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();
const metricsController = new MetricsController();

// All metrics require authentication (sensitive business data)
router.use(authenticate);

// Prometheus metrics endpoint (for Grafana) - requires admin
router.get('/prometheus', 
  authorize('admin', 'monitoring'),
  metricsController.getPrometheusMetrics.bind(metricsController)
);

// JSON metrics summary
router.get('/summary', metricsController.getMetricsSummary.bind(metricsController));

// Throughput metrics
router.get('/throughput', metricsController.getThroughput.bind(metricsController));

// Failure analysis
router.get('/failures', metricsController.getFailureAnalysis.bind(metricsController));

export default router;
