import { FastifyInstance } from 'fastify';
import { pool } from '../utils/database';

export default async function healthRoutes(fastify: FastifyInstance, options: any): Promise<void> {
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', service: 'blockchain-indexer' };
  });

  fastify.get('/health/db', async (request, reply) => {
    try {
      await pool.query('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        service: 'blockchain-indexer'
      };
    } catch (error) {
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: (error as Error).message,
        service: 'blockchain-indexer'
      });
    }
  });
}
