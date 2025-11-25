import { FastifyInstance } from 'fastify';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireTenant } from '../middleware/tenant.middleware';
import { SearchSanitizer } from '../utils/sanitizer';

export async function searchRoutes(fastify: FastifyInstance) {
  const { searchService, autocompleteService } = (fastify as any).container.cradle;

  // Main search - requires auth and tenant
  fastify.get('/', {
    preHandler: [authenticate, requireTenant]
  }, async (request, _reply) => {
    const req = request as AuthenticatedRequest;
    const { q, type, limit = 20 } = request.query as any;
    
    // SECURITY: Sanitize all inputs
    const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
    const sanitizedType = type ? SearchSanitizer.sanitizeQuery(type) : undefined;
    const sanitizedLimit = SearchSanitizer.sanitizeNumber(limit, 20, 1, 100);
    
    return await searchService.search(sanitizedQuery, sanitizedType, sanitizedLimit, {
      userId: req.user?.id,
      venueId: req.user?.venueId,
      userRole: req.user?.role
    });
  });

  // Venues only - requires auth and tenant
  fastify.get('/venues', {
    preHandler: [authenticate, requireTenant]
  }, async (request, _reply) => {
    const req = request as AuthenticatedRequest;
    const { q } = request.query as any;
    
    // SECURITY: Sanitize input
    const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
    
    return await searchService.searchVenues(sanitizedQuery, {
      userId: req.user?.id,
      venueId: req.user?.venueId,
      userRole: req.user?.role
    });
  });

  // Events only - requires auth and tenant
  fastify.get('/events', {
    preHandler: [authenticate, requireTenant]
  }, async (request, _reply) => {
    const req = request as AuthenticatedRequest;
    const { q, date_from, date_to } = request.query as any;
    
    // SECURITY: Sanitize inputs
    const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
    
    if (date_from || date_to) {
      // Sanitize date inputs
      const sanitizedDateFrom = date_from ? SearchSanitizer.sanitizeQuery(date_from) : undefined;
      const sanitizedDateTo = date_to ? SearchSanitizer.sanitizeQuery(date_to) : undefined;
      
      return await searchService.searchEventsByDate(sanitizedDateFrom, sanitizedDateTo, {
        userId: req.user?.id,
        venueId: req.user?.venueId,
        userRole: req.user?.role
      });
    }
    
    return await searchService.searchEvents(sanitizedQuery, {
      userId: req.user?.id,
      venueId: req.user?.venueId,
      userRole: req.user?.role
    });
  });

  // Autocomplete - requires auth and tenant
  fastify.get('/suggest', {
    preHandler: [authenticate, requireTenant]
  }, async (request, _reply) => {
    const { q } = request.query as any;
    
    // SECURITY: Sanitize input
    const sanitizedQuery = SearchSanitizer.sanitizeQuery(q);
    const suggestions = await autocompleteService.getSuggestions(sanitizedQuery);
    
    return { suggestions };
  });
}
