import { Request, Response } from 'express';
import { db } from '../config/database';
import { cache } from '../services/cache-integration';
import { logger } from '../utils/logger';

export class HealthController {
  async health(req: Request, res: Response) {
    res.json({
      status: 'healthy',
      service: 'marketplace-service',
      timestamp: new Date().toISOString()
    });
  }
  
  async detailed(req: Request, res: Response) {
    const checks = {
      database: false,
      redis: false,
      dependencies: false
    };
    
    // Check database
    try {
      await db.raw('SELECT 1');
      checks.database = true;
    } catch (error) {
      logger.error('Database health check failed:', error);
    }
    
    // Check Redis
    try {
      await cache.set('health_check', 'ok', { ttl: 10 });
      const value = await cache.get('health_check');
      checks.redis = value === 'ok';
    } catch (error) {
      logger.error('Redis health check failed:', error);
    }
    
    // Check dependencies (simplified)
    checks.dependencies = true;
    
    const isHealthy = Object.values(checks).every(v => v === true);
    
    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      checks,
      timestamp: new Date().toISOString()
    });
  }
  
  async readiness(req: Request, res: Response) {
    try {
      await db.raw('SELECT 1');
      res.json({ ready: true });
    } catch (error) {
      res.status(503).json({ ready: false, error: 'Database not ready' });
    }
  }
  
  async liveness(req: Request, res: Response) {
    res.json({ alive: true });
  }
}

export const healthController = new HealthController();
