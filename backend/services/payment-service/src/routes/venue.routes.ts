import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VenueController } from '../controllers/venue.controller';
import { authenticate } from '../middleware/auth';

export default async function venueRoutes(fastify: FastifyInstance) {
  const controller = new VenueController();

  fastify.get(
    '/:venueId/balance',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getBalance(request, reply);
    }
  );

  fastify.post(
    '/:venueId/payout',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.requestPayout(request, reply);
    }
  );

  fastify.get(
    '/:venueId/payouts',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getPayoutHistory(request, reply);
    }
  );
}
