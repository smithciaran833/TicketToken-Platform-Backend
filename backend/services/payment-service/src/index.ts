import { DatabaseService } from './services/databaseService';
import { RedisService } from './services/redisService';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Bull from 'bull';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3006;

// Initialize database
(async () => {
  try {
    await DatabaseService.initialize();
    console.log("Database initialized");
    
    await RedisService.initialize();
    console.log("RedisService initialized");
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
})();
const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';

// Import services and workers
const PaymentService = require('./services/paymentService');
//const ReconciliationService = require('./services/reconciliation/reconciliation-service');
const { webhookProcessor } = require('./workers/webhook.processor');
const { startWebhookConsumer } = require('./workers/webhook.consumer');
const routes = require('./routes/index').default || require('./routes/index');

// Initialize services
const paymentService = PaymentService;
//const reconciliationService = new ReconciliationService();

// Start webhook processor (only once)
webhookProcessor.start();
console.log("Webhook processor started");

// Start webhook consumer
startWebhookConsumer()
  .then(() => console.log("Webhook consumer started"))
  .catch((err: any) => console.error("Failed to start webhook consumer:", err));

// Setup Bull Dashboard (optional - comment out if causing issues)
let serverAdapter: any;
try {
  const { createBullBoard } = require('@bull-board/api');
  const { BullAdapter } = require('@bull-board/api/bullAdapter');
  const { ExpressAdapter } = require('@bull-board/express');

  serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = [
    new Bull('payment-processing', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    }),
    new Bull('webhook-processing', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    }),
    new Bull('reconciliation', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    }),
    new Bull('notifications', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    })
  ];

  createBullBoard({
    queues: queues.map((q: any) => new BullAdapter(q)),
    serverAdapter
  });
} catch (error) {
  console.log('Bull Board not available, continuing without dashboard');
}

// Middleware
app.use(cors());
app.use((req, res, next) => {
  if (req.path === '/api/v1/webhooks/stripe') {
    next(); // Skip JSON parsing for Stripe webhooks
  } else {
    express.json()(req, res, next);
  }
});

// Add queue dashboard if available
if (serverAdapter) {
  app.use('/admin/queues', serverAdapter.getRouter());
}

// Health endpoint with detailed status
app.get('/health', async (req, res) => {

// ISSUE #29 FIX: Metrics endpoint for monitoring
app.get('/metrics', async (req, res) => {
  const { register } = await import('./utils/metrics');
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
  try {
    // Check database connection
    const dbHealthy = await DatabaseService.getPool().query('SELECT 1');

    // Check Redis connection
    const testQueue = new Bull('health-check', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    });
    await testQueue.add('test', {});
    await testQueue.close();

    res.json({
      status: 'healthy',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      components: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: 'healthy',
        processor: process.env.PAYMENT_PROCESSOR || 'mock'
      }
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: SERVICE_NAME,
      error: error?.message || 'Unknown error'
    });
  }
});

// Service info endpoint
app.get('/info', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    port: PORT,
    processor: process.env.PAYMENT_PROCESSOR || 'mock',
    features: {
      stripe: true,
      square: false,
      webhooks: true,
      reconciliation: true,
      nftIntegration: true,
      notifications: true,
      fraudDetection: true,
      queueDashboard: serverAdapter ? `/admin/queues` : 'disabled'
    },
    status: 'running'
  });
});

// Admin endpoints
app.get('/admin/stats', async (req, res) => {
  try {
    const stats = await DatabaseService.getPool().query(`
      SELECT
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_revenue
      FROM payment_intents
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    res.json({
      last24Hours: stats.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Stats query failed' });
  }
});

// Manual reconciliation endpoint
// app.post('/admin/reconcile', async (req, res) => {
//   try {
//     const report = await reconciliationService.manualReconcile();
//     res.json(report);
//   } catch (error: any) {
//     res.status(500).json({ error: error?.message || 'Reconciliation failed' });
//   }
// });

// Payment routes
app.use('/api/v1', routes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err?.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});

export default app;
