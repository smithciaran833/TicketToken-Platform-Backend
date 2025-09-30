import { FastifyInstance } from 'fastify';
import { venueRoutes } from '../controllers/venues.controller';

// ISSUE #27 FIX: Remove phantom/commented routes
async function routes(fastify: FastifyInstance) {
  await fastify.register(venueRoutes, { prefix: '/venues' });
  
  // Note: V2 routes should only be registered when actually implemented
  // Don't leave phantom route registrations commented out
}

export default routes;
