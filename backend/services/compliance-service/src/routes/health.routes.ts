import { FastifyInstance } from 'fastify';
import { db } from '../services/database.service';
import { redis } from '../services/redis.service';
import { logger } from '../utils/logger';

export async function healthRoutes(fastify: FastifyInstance) {
  // Health check routes - NO AUTH for monitoring/load balancers
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      service: 'compliance-service',
      timestamp: new Date().toISOString()
    };
  });

  fastify.get('/ready', async (request, reply) => {
    const checks = {
      database: false,
      redis: false,
      ofacData: false
    };
    
    try {
      // Check database connectivity
      await db.query('SELECT 1');
      checks.database = true;
      
      // Check Redis connectivity
      const redisClient = redis.getClient();
      if (redisClient) {
        await redisClient.ping();
        checks.redis = true;
      } else {
        checks.redis = false;
      }
      
      // Check OFAC data exists and is reasonably recent
      const result = await db.query(
        `SELECT COUNT(*) as count, MAX(created_at) as last_update 
         FROM ofac_sdn_list`
      );
      const count = parseInt(result.rows[0]?.count || '0');
      const lastUpdate = result.rows[0]?.last_update;
      checks.ofacData = count > 0;
      
      // Service is ready if database and redis are up
      // OFAC data is nice to have but not required for basic operation
      const ready = checks.database && checks.redis;
      
      return reply.status(ready ? 200 : 503).send({
        ready,
        checks,
        ofacRecords: count,
        ofacLastUpdate: lastUpdate
      });
    } catch (error: any) {
      logger.error({ error }, 'Health check failed:');
      return reply.status(503).send({
        ready: false,
        checks,
        error: error.message
      });
    }
  });
}
