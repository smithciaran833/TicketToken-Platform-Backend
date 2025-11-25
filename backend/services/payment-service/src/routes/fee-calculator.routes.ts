import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { feeCalculatorService } from '../services/fee-calculator.service';

interface CalculateFeesBody {
  subtotal: number;
  ticketCount: number;
  venueId?: string;
}

export default async function feeCalculatorRoutes(fastify: FastifyInstance) {
  /**
   * POST /fees/calculate
   * Calculate fees for an order
   */
  fastify.post<{ Body: CalculateFeesBody }>(
    '/calculate',
    async (request: FastifyRequest<{ Body: CalculateFeesBody }>, reply: FastifyReply) => {
      try {
        const { subtotal, ticketCount, venueId } = request.body;

        if (!subtotal || !ticketCount) {
          return reply.status(400).send({ 
            error: 'subtotal and ticketCount are required' 
          });
        }

        const calculation = await feeCalculatorService.calculateFees(
          parseFloat(subtotal.toString()),
          parseInt(ticketCount.toString()),
          venueId
        );

        return reply.send({ calculation });
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );

  /**
   * POST /fees/breakdown
   * Get formatted fee breakdown for display
   */
  fastify.post<{ Body: CalculateFeesBody }>(
    '/breakdown',
    async (request: FastifyRequest<{ Body: CalculateFeesBody }>, reply: FastifyReply) => {
      try {
        const { subtotal, ticketCount, venueId } = request.body;

        if (!subtotal || !ticketCount) {
          return reply.status(400).send({ 
            error: 'subtotal and ticketCount are required' 
          });
        }

        const breakdown = await feeCalculatorService.getFeeBreakdown(
          parseFloat(subtotal.toString()),
          parseInt(ticketCount.toString()),
          venueId
        );

        return reply.send(breakdown);
      } catch (error: any) {
        return reply.status(500).send({ error: error.message });
      }
    }
  );
}
