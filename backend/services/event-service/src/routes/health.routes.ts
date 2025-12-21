import { FastifyInstance } from 'fastify';
import { register } from '../utils/metrics';
import { HealthCheckService } from '../services/healthCheck.service';
import { DatabaseService } from '../services/databaseService';
import { getRedis } from '../config/redis';

const healthCheckService = new HealthCheckService();

export default async function healthRoutes(app: FastifyInstance) {
  // Comprehensive health check endpoint
  app.get('/health', async (request, reply) => {
    try {
      const db = DatabaseService.getPool();
      const redis = getRedis();

      const healthCheck = await healthCheckService.performHealthCheck(db, redis);

      const statusCode = healthCheck.status === 'healthy' ? 200 : 
                        healthCheck.status === 'degraded' ? 200 : 503;

      return reply.status(statusCode).send(healthCheck);
    } catch (error: any) {
      return reply.status(503).send({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
        message: error.message,
      });
    }
  });

  // Prometheus metrics endpoint
  app.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });
}
