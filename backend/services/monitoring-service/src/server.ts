import express from 'express';
import { register } from 'prom-client';
import { metricsCollector } from './metrics.collector';
import { alertingService } from './alerting.service';
import { logger } from './logger';

const app = express();
const PORT = process.env.PORT || 9090;

// Prometheus metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    const metrics = await metricsCollector.getMetrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Business metrics API
app.get('/api/business-metrics', async (req, res) => {
  try {
    const metrics = await metricsCollector.getBusinessMetrics();
    res.json(metrics);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

// Alert status endpoint
app.get('/api/alerts', (req, res) => {
  const alerts = (alertingService as any).getAlertStatus();
  res.json(alerts);
});

// Start monitoring loops
function startMonitoring() {
  // Check alerts every minute
  setInterval(async () => {
    try {
      // Example: Check payment failure rate
      const paymentFailureRate = 0.05; // Would calculate from actual metrics
      await alertingService.checkAlert('payment_failure_spike', paymentFailureRate);
      
      // Check other alerts...
    } catch (error) {
      logger.error('Alert check failed:', error);
    }
  }, 60000);

  // Collect system metrics every 10 seconds
  setInterval(() => {
    // Update gauge metrics
    metricsCollector.activeUsers.set({ type: 'buyer' }, Math.random() * 1000);
    metricsCollector.queueSize.set({ queue_name: 'payment' }, Math.random() * 100);
    metricsCollector.cacheHitRate.set({ cache_type: 'redis' }, Math.random() * 100);
  }, 10000);
}

// Listen for critical errors
metricsCollector.on('critical_error', async (error) => {
  logger.error('Critical error detected:', error);
  await alertingService.checkAlert('api_error_rate_high', 1);
});

app.listen(PORT, () => {
  logger.info(`Monitoring service running on port ${PORT}`);
  logger.info(`Metrics available at http://0.0.0.0:${PORT}/metrics`);
  startMonitoring();
});

export { app };
