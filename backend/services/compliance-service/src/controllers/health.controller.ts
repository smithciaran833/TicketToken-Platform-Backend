import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';
import { redis } from '../services/redis.service';

export class HealthController {
  static async checkHealth(req: Request, res: Response) {
    res.json({
      status: 'healthy',
      service: 'compliance-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV
    });
  }

  static async checkReadiness(req: Request, res: Response) {
    const checks: any = {
      database: false,
      redis: false
    };

    // Check database
    try {
      await db.query('SELECT 1');
      checks.database = true;
    } catch (error) {
      checks.database = false;
    }

    // Check Redis
    try {
      const redisClient = redis.getClient();
      if (redisClient) {
        await redisClient.ping();
        checks.redis = true;
      }
    } catch (error) {
      checks.redis = false;
    }

    const ready = checks.database; // Redis is optional

    res.status(ready ? 200 : 503).json({
      ready,
      service: 'compliance-service',
      checks
    });
  }
}
