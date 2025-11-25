import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GroupPaymentController } from '../controllers/group-payment.controller';
import { authenticate } from '../middleware/auth';

export default async function groupPaymentRoutes(fastify: FastifyInstance) {
  const controller = new GroupPaymentController();

  fastify.post(
    '/create',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.createGroup(request, reply);
    }
  );

  fastify.post(
    '/:groupId/contribute/:memberId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.contributeToGroup(request, reply);
    }
  );

  fastify.get(
    '/:groupId/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getGroupStatus(request, reply);
    }
  );

  fastify.post(
    '/:groupId/reminders',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.sendReminders(request, reply);
    }
  );

  fastify.get(
    '/:groupId/history',
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getContributionHistory(request, reply);
    }
  );
}
