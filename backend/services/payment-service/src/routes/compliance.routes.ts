import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ComplianceController } from '../controllers/compliance.controller';
import { authenticate } from '../middleware/auth';

export default async function complianceRoutes(fastify: FastifyInstance) {
  const controller = new ComplianceController();

  fastify.get(
    '/tax-forms/:year',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getTaxForm(request, reply);
    }
  );

  fastify.get(
    '/tax-forms/:year/download',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.downloadTaxForm(request, reply);
    }
  );

  fastify.get(
    '/tax-summary',
    {
      preHandler: [authenticate]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      return controller.getTaxSummary(request, reply);
    }
  );
}
