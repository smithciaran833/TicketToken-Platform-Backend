// import { serviceCache } from '../services/cache-integration';
import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';

export async function professionalSearchRoutes(fastify: FastifyInstance) {
  const { professionalSearchService } = (fastify as any).container.cradle;

  // Advanced search - requires auth
  fastify.post('/advanced', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const results = await professionalSearchService.search(request.body);
    return results;
  });

  // Near me search - requires auth
  fastify.get('/near-me', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const { lat, lon, distance, type } = request.query as any;

    if (!lat || !lon) {
      return _reply.status(400).send({ error: 'lat and lon required' });
    }

    const results = await professionalSearchService.searchNearMe(
      parseFloat(lat),
      parseFloat(lon),
      distance,
      type
    );
    return results;
  });

  // Trending searches - requires auth
  fastify.get('/trending', {
    preHandler: authenticate
  }, async (_request, _reply) => {
    const trending = await professionalSearchService.getTrending();
    return { trending };
  });

  // Similar items - requires auth
  fastify.get('/:index/:id/similar', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const { index, id } = request.params as any;
    const similar = await professionalSearchService.findSimilar(index, id);
    return { similar };
  });
}
