import { FastifyInstance } from 'fastify';
import eventsRoutes from './events.routes';

export default async function routes(app: FastifyInstance) {
  // Register event routes
  await app.register(eventsRoutes, { prefix: '/' });
  
  // Health check
  app.get('/health', async (_request, _reply) => {
    return { status: 'healthy', service: 'event-service' };
  });
}
