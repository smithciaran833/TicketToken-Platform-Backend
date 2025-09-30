import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { AwilixContainer } from 'awilix';
import { searchRoutes } from '../controllers/search.controller';
import { professionalSearchRoutes } from '../controllers/professional-search.controller';

export async function configureFastify(
  fastify: FastifyInstance,
  _container: AwilixContainer
) {
  // CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true
  });

  // Security
  await fastify.register(helmet);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'search-service' };
  });

  // Register routes
  await fastify.register(searchRoutes, { prefix: '/api/v1/search' });
  await fastify.register(professionalSearchRoutes, { prefix: '/api/v1/pro' });
}
