import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TaxCalculatorService } from '../services/compliance/tax-calculator.service';
import { internalAuth } from '../middleware/internal-auth';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'InternalTaxRoutes' });

export default async function internalTaxRoutes(fastify: FastifyInstance) {
  const taxCalculator = new TaxCalculatorService();

  // ISSUE #25 FIX: Internal endpoint with proper authentication
  fastify.post(
    '/internal/calculate-tax',
    {
      preHandler: [internalAuth]
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { amount, venueAddress, customerAddress } = request.body as any;

        // Log which service is requesting tax calculation
        log.info('Tax calculation requested', { service: (request as any).internalService });

        const taxResult = await taxCalculator.calculateTax(
          amount,
          venueAddress,
          customerAddress
        );

        return reply.send(taxResult);
      } catch (error) {
        log.error('Tax calculation error', { error });
        return reply.status(500).send({ error: 'Tax calculation failed' });
      }
    }
  );
}
