import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { brandingService, BrandingConfig } from '../services/branding.service';

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
  /**
   * GET /api/v1/branding/:venueId
   * Get branding configuration for a venue
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/:venueId',
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
   */
  fastify.get<{ Params: DomainParam }>(
    '/domain/:domain',
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
   */
  fastify.put<{ Params: VenueIdParam; Body: BrandingBody }>(
    '/:venueId',
    async (request: FastifyRequest<{ Params: VenueIdParam; Body: BrandingBody }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const branding = await brandingService.upsertBranding({
          venueId,
          ...request.body
        } as BrandingConfig);
        
        return reply.send({ branding });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/branding/:venueId/css
   * Get CSS variables for venue branding
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/:venueId/css',
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
   */
  fastify.get(
    '/pricing/tiers',
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
   */
  fastify.post<{ Params: VenueIdParam; Body: ChangeTierBody }>(
    '/:venueId/tier',
    async (request: FastifyRequest<{ Params: VenueIdParam; Body: ChangeTierBody }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const { newTier, reason, userId } = request.body;
        const changedBy = userId || 'system'; // Should come from auth middleware
        
        await brandingService.changeTier(venueId, newTier, changedBy, reason);
        return reply.send({ message: 'Tier changed successfully' });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/branding/:venueId/tier/history
   * Get tier change history
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/:venueId/tier/history',
    async (request: FastifyRequest<{ Params: VenueIdParam }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const history = await brandingService.getTierHistory(venueId);
        return reply.send({ history });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );
}
