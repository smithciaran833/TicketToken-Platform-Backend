import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { domainManagementService } from '../services/domain-management.service';

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
  /**
   * POST /api/v1/domains/:venueId/add
   * Add custom domain for venue
   */
  fastify.post<{ Params: VenueIdParam; Body: AddDomainBody }>(
    '/:venueId/add',
    async (request: FastifyRequest<{ Params: VenueIdParam; Body: AddDomainBody }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        const { domain } = request.body;
        
        const customDomain = await domainManagementService.addCustomDomain(venueId, domain);
        return reply.status(201).send({ domain: customDomain });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );

  /**
   * POST /api/v1/domains/:domainId/verify
   * Verify domain ownership
   */
  fastify.post<{ Params: DomainIdParam }>(
    '/:domainId/verify',
    async (request: FastifyRequest<{ Params: DomainIdParam }>, reply: FastifyReply) => {
      try {
        const { domainId } = request.params;
        
        const verified = await domainManagementService.verifyDomain(domainId);
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
   */
  fastify.get<{ Params: DomainIdParam }>(
    '/:domainId/status',
    async (request: FastifyRequest<{ Params: DomainIdParam }>, reply: FastifyReply) => {
      try {
        const { domainId } = request.params;
        
        const domain = await domainManagementService.getDomainStatus(domainId);
        return reply.send({ domain });
      } catch (error: any) {
        return reply.status(404).send({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/domains/venue/:venueId
   * Get all domains for venue
   */
  fastify.get<{ Params: VenueIdParam }>(
    '/venue/:venueId',
    async (request: FastifyRequest<{ Params: VenueIdParam }>, reply: FastifyReply) => {
      try {
        const { venueId } = request.params;
        
        const domains = await domainManagementService.getVenueDomains(venueId);
        return reply.send({ domains });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * DELETE /api/v1/domains/:domainId
   * Remove custom domain
   */
  fastify.delete<{ Params: DomainIdParam }>(
    '/:domainId',
    async (request: FastifyRequest<{ Params: DomainIdParam }>, reply: FastifyReply) => {
      try {
        const { domainId } = request.params;
        
        await domainManagementService.removeDomain(domainId);
        return reply.send({ message: 'Domain removed successfully' });
      } catch (error: any) {
        return reply.status(400).send({ error: error.message });
      }
    }
  );
}
