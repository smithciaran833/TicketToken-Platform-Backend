import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { brandingService, BrandingConfig } from '../services/branding.service';
import { authenticate } from '../middleware/auth.middleware';
import { addTenantContext } from '../middleware/tenant.middleware';
import { UnauthorizedError } from '../utils/errors';
import { getRedis } from '../config/redis';

interface VenueIdParam {
  venueId: string;
}

interface DomainParam {
  domain: string;
}

interface BrandingBody {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
  headingFont?: string;
  logoUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  emailHeaderImage?: string;
  ticketBackgroundImage?: string;
  customCss?: string;
  emailFromName?: string;
  emailReplyTo?: string;
  emailFooterText?: string;
  ticketHeaderText?: string;
  ticketFooterText?: string;
  ogImageUrl?: string;
  ogDescription?: string;
}

interface ChangeTierBody {
  newTier: string;
  reason?: string;
  userId?: string;
}

export async function brandingRoutes(fastify: FastifyInstance) {
  const redis = getRedis();

  // SECURITY FIX: Rate limiting middleware using Redis
  const createSimpleRateLimiter = (max: number, windowMs: number) => {
    return async (request: any, reply: any) => {
      const key = request.user?.id || request.ip;
      const redisKey = `rate_limit:branding:${key}:${Date.now() - (Date.now() % windowMs)}`;

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
   * GET /api/v1/branding/:venueId
   * Get branding configuration for a venue
   * SECURITY FIX: Public read with rate limiting (needed for displaying venue branding)
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/:venueId',
    {
      preHandler: [rateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const branding = await brandingService.getBrandingByVenueId(venueId);
        return reply.send({ branding });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/branding/domain/:domain
   * Get branding by custom domain
   * SECURITY FIX: Public read with rate limiting (needed for custom domain resolution)
   */
  fastify.get<{ Params: DomainParam }>(
    '/domain/:domain',
    {
      preHandler: [rateLimiter]
    },
    async (request: FastifyRequest<{ Params: DomainParam }>, reply: FastifyReply) => {
      try {
        const { domain } = request.params;
        const result = await brandingService.getBrandingByDomain(domain);

        if (!result) {
          return reply.status(404).send({ error: 'Domain not found' });
        }

        return reply.send(result);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * PUT /api/v1/branding/:venueId
   * Create or update branding configuration
   * SECURITY FIX: Requires authentication + tenant + rate limiting
   */
  fastify.put<{ Params: VenueIdParam; Body: BrandingBody }>(
    '/:venueId',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam; Body: BrandingBody }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;
        const branding = await brandingService.upsertBranding({
          venueId,
          ...request.body
        } as BrandingConfig, tenantId);

        return reply.send({ branding });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/branding/:venueId/css
   * Get CSS variables for venue branding
   * SECURITY FIX: Public read with rate limiting (needed for serving CSS files)
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/:venueId/css',
    {
      preHandler: [rateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const branding = await brandingService.getBrandingByVenueId(venueId);
        const css = brandingService.generateCssVariables(branding);

        return reply.type('text/css').send(css);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/branding/pricing/tiers
   * Get all pricing tiers
   * SECURITY FIX: Public read with rate limiting (needed for displaying pricing)
   */
  fastify.get(
    '/pricing/tiers',
    {
      preHandler: [rateLimiter]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const tiers = await brandingService.getAllPricingTiers();
        return reply.send({ tiers });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * POST /api/v1/branding/:venueId/tier
   * Upgrade/downgrade venue tier
   * SECURITY FIX: Requires authentication + tenant + rate limiting (critical operation)
   */
  fastify.post<{ Params: VenueIdParam; Body: ChangeTierBody }>(
    '/:venueId/tier',
    {
      preHandler: [authenticate, addTenantContext, writeRateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam; Body: ChangeTierBody }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const { newTier, reason } = request.body;
        const tenantId = (request as any).tenantId;
        
        // SECURITY FIX: Require authentication
        if (!(request as any).user?.id) {
          throw new UnauthorizedError('Authentication required');
        }
        const changedBy = (request as any).user.id;

        await brandingService.changeTier(venueId, newTier, changedBy, reason, tenantId);
        return reply.send({ message: 'Tier changed successfully' });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/branding/:venueId/tier/history
   * Get tier change history
   * SECURITY FIX: Requires authentication + tenant + rate limiting (private data)
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/:venueId/tier/history',
    {
      preHandler: [authenticate, addTenantContext, rateLimiter]
    },
    async (request: FastifyRequest<{ Params: VenueIdParam }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const tenantId = (request as any).tenantId;
        const history = await brandingService.getTierHistory(venueId, tenantId);
        return reply.send({ history });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );
}
