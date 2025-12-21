import { serviceCache } from '../services/cache-integration';
import { FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../services/database.service';
import { redis } from '../services/redis.service';

export class HealthController {
  static async checkHealth(req: FastifyRequest, reply: FastifyReply) {
    return reply.send({
      status: 'healthy',
      service: 'compliance-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV
    });
  }

  static async checkReadiness(req: FastifyRequest, reply: FastifyReply) {
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

    return reply.status(ready ? 200 : 503).send({
      ready,
      service: 'compliance-service',
      checks
    });
  }
}
