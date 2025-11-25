import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    return { status: 'ok', service: 'search-service' };
  });

  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await db.raw('SELECT 1');
      return {
        status: 'ok',
        database: 'connected',
        service: 'search-service'
      };
    } catch (error: any) {
      return reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'search-service'
      });
    }
  });
}
