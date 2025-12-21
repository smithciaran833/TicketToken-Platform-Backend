import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { pool } from '../config/database';

export default async function healthRoutes(
  fastify: FastifyInstance,
  opts: FastifyPluginOptions
): Promise<void> {
  fastify.get('/health', async (req, reply) => {
    return reply.send({ status: 'ok', service: 'file-service' });
  });

  fastify.get('/health/db', async (req, reply) => {
    try {
      await pool.query('SELECT 1');
      return reply.send({ 
        status: 'ok', 
        database: 'connected',
        service: 'file-service' 
      });
    } catch (error: any) {
      return reply.status(503).send({ 
        status: 'error', 
        database: 'disconnected',
        error: error.message,
        service: 'file-service'
      });
    }
  });
}
