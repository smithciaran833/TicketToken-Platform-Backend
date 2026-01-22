import { FastifyInstance } from 'fastify';
import { verificationRoutes } from '../controllers/verification.controller';

async function routes(fastify: FastifyInstance) {
  await fastify.register(verificationRoutes, { prefix: '/verification' });
}

export default routes;
