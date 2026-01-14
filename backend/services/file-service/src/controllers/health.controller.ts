import { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database.config';

export class HealthController {
  async check(_request: FastifyRequest, reply: FastifyReply) {
    try {
      // Check database
      const pool = getPool();
      let dbHealthy = false;
      
      if (pool) {
        await pool.query('SELECT 1');
        dbHealthy = true;
      }
      
      return reply.send({
        status: 'healthy',
        service: 'file-service',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbHealthy ? 'healthy' : 'unavailable'
        }
      });
      
    } catch (error) {
      return reply.status(503).send({
        status: 'unhealthy',
        service: 'file-service',
        timestamp: new Date().toISOString()
      });
    }
  }
}

export const healthController = new HealthController();
