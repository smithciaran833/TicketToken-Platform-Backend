import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TaxCalculatorService } from '../services/compliance/tax-calculator.service';
import { internalAuthMiddlewareNew } from '../middleware/internal-auth.middleware';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalTaxRoutes' });

export default async function internalTaxRoutes(fastify: FastifyInstance) {
  const taxCalculator = new TaxCalculatorService();

  fastify.post(
    '/internal/calculate-tax',
    { preHandler: [internalAuthMiddlewareNew] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { amount, venueAddress, customerAddress } = request.body as any;

        log.info({ service: (request as any).internalService }, 'Tax calculation requested');

        const taxResult = await taxCalculator.calculateTax(amount, venueAddress, customerAddress);
        return reply.send(taxResult);
      } catch (error) {
        log.error({ error }, 'Tax calculation error');
        return reply.status(500).send({ error: 'Tax calculation failed' });
      }
    }
  );
}
