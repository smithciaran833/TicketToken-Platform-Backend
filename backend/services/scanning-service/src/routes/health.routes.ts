import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../config/database';

export default async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'ok', service: 'scanning-service' });
  });

  // Database health check
  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const pool = getPool();
      await pool.query('SELECT 1');
      return reply.send({
        status: 'ok',
        database: 'connected',
        service: 'scanning-service'
      });
    } catch (error) {
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: (error as Error).message,
        service: 'scanning-service'
      });
    }
  });
}
