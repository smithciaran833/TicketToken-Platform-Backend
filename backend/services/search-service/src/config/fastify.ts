import { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { AwilixContainer } from 'awilix';
import { searchRoutes } from '../controllers/search.controller';
import { professionalSearchRoutes } from '../controllers/professional-search.controller';
import { setTenantContext } from '../middleware/tenant-context';

export async function configureFastify(
  fastify: FastifyInstance,
  container: AwilixContainer
) {
  // Make database connection available to middleware
  // Assuming the container hasdb or knex instance
  const db = container.resolve('db' as any) || container.resolve('knex' as any);
  if (db) {
    fastify.decorate('db', db);
  }

  // CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true
  });

  // Security
  await fastify.register(helmet);

  // ====================================
  // TENANT ISOLATION MIDDLEWARE
  // ====================================
  // This middleware sets the PostgreSQL session variable for Row Level Security
  // IMPORTANT: Register AFTER authentication middleware (when added)
  fastify.addHook('onRequest', async (request, reply) => {
    try {
      await setTenantContext(request, reply);
    } catch (error) {
      fastify.log.error({ error }, 'Failed to set tenant context');
      // Allow request to proceed - RLS will block unauthorized access
    }
  });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'search-service' };
  });

  // Register routes
  await fastify.register(searchRoutes, { prefix: '/api/v1/search' });
  await fastify.register(professionalSearchRoutes, { prefix: '/api/v1/pro' });
}
