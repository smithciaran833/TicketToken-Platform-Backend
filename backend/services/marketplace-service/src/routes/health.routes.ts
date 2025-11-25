import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../config/database';
import { blockchainService } from '../services/blockchain.service';

export default async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
    // Aggregate health check
    const health: any = {
      status: 'ok',
      service: 'marketplace-service',
      timestamp: new Date().toISOString()
    };

    try {
      // Check database
      await db.raw('SELECT 1');
      health.database = 'connected';
    } catch (error) {
      health.database = 'disconnected';
      health.status = 'degraded';
    }

    try {
      // Check blockchain (with timeout)
      const blockHeight = await Promise.race([
        blockchainService.getConnection().getBlockHeight(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
      ]);
      health.blockchain = 'connected';
      health.blockHeight = blockHeight;
    } catch (error) {
      health.blockchain = 'disconnected';
      health.status = 'degraded';
    }

    const statusCode = health.status === 'ok' ? 200 : 503;
    reply.status(statusCode).send(health);
  });

  fastify.get('/health/db', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await db.raw('SELECT 1');
      reply.send({
        status: 'ok',
        database: 'connected',
        service: 'marketplace-service'
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        database: 'disconnected',
        error: error.message,
        service: 'marketplace-service'
      });
    }
  });

  fastify.get('/health/blockchain', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check blockchain connectivity with timeout
      const blockHeight = await Promise.race([
        blockchainService.getConnection().getBlockHeight(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Blockchain RPC timeout after 3 seconds')), 3000)
        )
      ]);

      reply.send({
        status: 'ok',
        blockchain: 'connected',
        blockHeight: blockHeight,
        service: 'marketplace-service',
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      reply.status(503).send({
        status: 'error',
        blockchain: 'disconnected',
        error: error.message,
        service: 'marketplace-service',
        timestamp: new Date().toISOString()
      });
    }
  });
}
