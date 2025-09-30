// import { serviceCache } from '../services/cache-integration';
import { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/auth.middleware';

export async function searchRoutes(fastify: FastifyInstance) {
  const { searchService, autocompleteService } = (fastify as any).container.cradle;

  // Main search - requires auth
  fastify.get('/', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const { q, type, limit = 20 } = request.query as any;
    return await searchService.search(q || '', type, Number(limit));
  });

  // Venues only - requires auth
  fastify.get('/venues', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const { q } = request.query as any;
    return await searchService.searchVenues(q || '');
  });

  // Events only - requires auth
  fastify.get('/events', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const { q, date_from, date_to } = request.query as any;
    if (date_from || date_to) {
      return await searchService.searchEventsByDate(date_from, date_to);
    }
    return await searchService.searchEvents(q || '');
  });

  // Autocomplete - requires auth
  fastify.get('/suggest', {
    preHandler: authenticate
  }, async (request, _reply) => {
    const { q } = request.query as any;
    const suggestions = await autocompleteService.getSuggestions(q);
    return { suggestions };
  });
}
