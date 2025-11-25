import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MarketplaceController } from '../controllers/marketplace.controller';
import { authenticate } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

export default async function marketplaceRoutes(fastify: FastifyInstance) {
  const controller = new MarketplaceController();

  // Create resale listing
  fastify.post(
    '/listings',
    {
      preHandler: [authenticate, validateRequest('createListing')]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.createListing(request, reply);
    }
  );

  // Purchase resale ticket
  fastify.post(
    '/purchase',
    {
      preHandler: [authenticate, validateRequest('purchaseResale')]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.purchaseResaleTicket(request, reply);
    }
  );

  // Confirm transfer
  fastify.post(
    '/escrow/:escrowId/confirm',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.confirmTransfer(request, reply);
    }
  );

  // Get royalty report
  fastify.get(
    '/venues/:venueId/royalties',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getRoyaltyReport(request, reply);
    }
  );

  // Get pricing analytics
  fastify.get(
    '/venues/:venueId/pricing-analytics',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getPricingAnalytics(request, reply);
    }
  );
}
