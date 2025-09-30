import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { getPool } from '../config/database.config';
import { getRedisClient } from '../config/redis.config';
import { QueueFactory } from '../queues/factories/queue.factory';
import { logger } from '../utils/logger';

export class HealthController {
  async checkHealth(req: Request, res: Response): Promise<void> {
    try {
      const checks = {
        service: 'healthy',
        database: 'unknown',
        redis: 'unknown',
        queues: 'unknown'
      };
      
      // Check database
      try {
        const pool = getPool();
        await pool.query('SELECT 1');
        checks.database = 'healthy';
      } catch (error) {
        checks.database = 'unhealthy';
        logger.error('Database health check failed:', error);
      }
      
      // Check Redis
      try {
        const redis = getRedisClient();
        await redis.ping();
        checks.redis = 'healthy';
      } catch (error) {
        checks.redis = 'unhealthy';
        logger.error('Redis health check failed:', error);
      }
      
      // Check queues
      try {
        await QueueFactory.getQueueMetrics('money');
        checks.queues = 'healthy';
      } catch (error) {
        checks.queues = 'unhealthy';
        logger.error('Queue health check failed:', error);
      }
      
      const isHealthy = Object.values(checks).every(status => status === 'healthy');
      
      res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'healthy' : 'degraded',
        checks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: 'Health check failed'
      });
    }
  }
  
  async checkReadiness(req: Request, res: Response): Promise<void> {
    try {
      // Check if service is ready to accept traffic
      const pool = getPool();
      await pool.query('SELECT 1');
      
      const redis = getRedisClient();
      await redis.ping();
      
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        status: 'not ready',
        error: 'Service not ready'
      });
    }
  }
}
