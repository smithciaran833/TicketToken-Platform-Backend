import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { domainManagementService } from '../services/domain-management.service';
import { authenticate } from '../middleware/auth.middleware';
import { addTenantContext } from '../middleware/tenant.middleware';
import { getRedis } from '../config/redis';

interface VenueIdParam {
  venueId: string;
}

interface DomainIdParam {
  domainId: string;
}

interface AddDomainBody {
  domain: string;
}

export async function domainRoutes(fastify: FastifyInstance) {
  const redis = getRedis();

  // SECURITY FIX: Rate limiting middleware using Redis
  const createSimpleRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:domains:${key}:${Date.now() - (Date.now() % windowMs)}`;
      
      try {
        const current = await redis.incr(redisKey);
        if (current === 1) {
          await redis.expire(redisKey, Math.ceil(windowMs / 1000));
        }
        
        reply.header('X-RateLimit-Limit', max.toString());
        reply.header('X-RateLimit-Remaining', Math.max(0, max - current).toString());
        
        if (current > max) {
          reply.header('Retry-After', Math.ceil(windowMs / 1000).toString());
          return reply.status(429).send({ 
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Try again in ${Math.ceil(windowMs / 1000)} seconds`
          });
        }
      } catch (error) {
        // Fail open if Redis is unavailable
        fastify.log.warn({ error }, 'Rate limit check failed, allowing request');
      }
    };
  };

  const rateLimiter = createSimpleRateLimiter(100, 60000); // 100 requests per minute
  const writeRateLimiter = createSimpleRateLimiter(20, 60000); // 20 writes per minute

  /**
   * POST /api/v1/domains/:venueId/add
   * Add custom domain for venue
   * SECURITY FIX: Requires authentication + tenant + rate limiting (prevents domain hijacking)
   */
  fastify.post<{ Params: VenueIdParam; Body: AddDomainBody }>(
    '/:venueId/add',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam; Body: AddDomainBody }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const { domain } = request.body;
        
        const customDomain = await domainManagementService.addCustomDomain(venueId, domain, request.tenantId);
        return reply.status(201).send({ domain: customDomain });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * POST /api/v1/domains/:domainId/verify
   * Verify domain ownership
   * SECURITY FIX: Requires authentication + tenant + rate limiting (admin operation)
   */
  fastify.post<{ Params: DomainIdParam }>(
    '/:domainId/verify',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: FastifyRequest<{ Params: DomainIdParam }>, reply: FastifyReply) => {
      try {
        const { domainId } = request.params;
        
        const verified = await domainManagementService.verifyDomain(domainId, request.tenantId);
        return reply.send({ 
          verified,
          message: verified ? 'Domain verified successfully' : 'Domain verification pending'
        });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/domains/:domainId/status
   * Get domain status
   * SECURITY FIX: Requires authentication + tenant + rate limiting (private data)
   */
  fastify.get<{ Params: DomainIdParam }>(
    '/:domainId/status',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: FastifyRequest<{ Params: DomainIdParam }>, reply: FastifyReply) => {
      try {
        const { domainId } = request.params;
        
        const domain = await domainManagementService.getDomainStatus(domainId, request.tenantId);
        return reply.send({ domain });
      } catch (error: any) {
        return reply.status(404).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/domains/venue/:venueId
   * Get all domains for venue
   * SECURITY FIX: Requires authentication + tenant + rate limiting (private data)
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/venue/:venueId',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        
        const domains = await domainManagementService.getVenueDomains(venueId, request.tenantId);
        return reply.send({ domains });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * DELETE /api/v1/domains/:domainId
   * Remove custom domain
   * SECURITY FIX: Requires authentication + tenant + rate limiting (prevents domain deletion)
   */
  fastify.delete<{ Params: DomainIdParam }>(
    '/:domainId',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: FastifyRequest<{ Params: DomainIdParam }>, reply: FastifyReply) => {
      try {
        const { domainId } = request.params;
        
        await domainManagementService.removeDomain(domainId, request.tenantId);
        return reply.send({ message: 'Domain removed successfully' });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );
}
