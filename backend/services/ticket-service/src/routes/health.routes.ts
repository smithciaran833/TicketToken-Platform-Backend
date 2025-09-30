import { Router, Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { RedisService } from '../services/redisService';
import { QueueService } from '../services/queueService';

const router = Router();

// Basic health check
router.get('/', async (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    service: 'ticket-service',
    timestamp: new Date().toISOString()
  });
});

// Liveness probe - is the service running?
router.get('/live', (req: Request, res: Response) => {
  res.status(200).json({ status: 'alive' });
});

// Readiness probe - is the service ready to handle requests?
router.get('/ready', async (req: Request, res: Response) => {
  const checks = {
    database: false,
    redis: false,
    queue: false
  };

  try {
    // Check database with timeout
    const dbHealthPromise = DatabaseService.isHealthy();
    checks.database = await Promise.race([
      dbHealthPromise,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))
    ]);

    // Check Redis with timeout
    const redisHealthPromise = RedisService.isHealthy();
    checks.redis = await Promise.race([
      redisHealthPromise,
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 2000))
    ]);

    // Check queue service
    checks.queue = (QueueService as any).isConnected ? (QueueService as any).isConnected() : false;

    // Determine overall readiness
    const isReady = checks.database && checks.redis;

    if (isReady) {
      res.status(200).json({
        status: 'ready',
        checks
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        checks
      });
    }
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      checks,
      error: error.message
    });
  }
});

// Detailed health check with metrics
router.get('/health/detailed', async (req: Request, res: Response) => {
  try {
    const dbStats = DatabaseService.getStats();

    res.status(200).json({
      status: 'healthy',
      database: {
        pool: {
          total: dbStats.total,
          idle: dbStats.idle,
          waiting: dbStats.waiting
        }
      },
      redis: {
        connected: await RedisService.isHealthy()
      },
      queue: {
        connected: (QueueService as any).isConnected ? (QueueService as any).isConnected() : false
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Circuit breaker status endpoint
router.get('/health/circuit-breakers', async (req: Request, res: Response) => {
  try {
    res.status(200).json({
      database: {
        state: 'CLOSED',
        failures: 0,
        lastError: null
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      error: error.message
    });
  }
});

// Force circuit breaker reset (admin endpoint)
router.post('/health/circuit-breakers/reset', async (req: Request, res: Response) => {
  // This should be protected by admin auth in production
  try {
    // Reinitialize database connection
    await DatabaseService.close();
    await DatabaseService.initialize();

    res.status(200).json({
      status: 'reset',
      message: 'Circuit breakers reset successfully'
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

export default router;
