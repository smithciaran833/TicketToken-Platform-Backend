import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import logger from '../utils/logger';
import { MintingOrchestrator } from '../services/MintingOrchestrator';
import { validateInternalRequest } from '../middleware/internal-auth';
import { internalMintSchema, InternalMintRequest } from '../validators/mint.schemas';

interface MintResult {
  ticketId: string;
  success: boolean;
  result?: any;
  mintAddress?: string;
  error?: string;
}

export default async function internalMintRoutes(
  fastify: FastifyInstance,
  options: any
): Promise<void> {
  // Protected internal endpoint - only accessible by authenticated services
  fastify.post<{ Body: InternalMintRequest }>(
    '/internal/mint',
    { preHandler: validateInternalRequest },
    async (request: FastifyRequest<{ Body: InternalMintRequest }>, reply: FastifyReply) => {
      try {
        // Validate request body with Zod schema
        const validation = internalMintSchema.safeParse(request.body);
        
        if (!validation.success) {
          return reply.code(400).send({
            success: false,
            error: 'Validation failed',
            details: validation.error.flatten()
          });
        }

        const { ticketIds, eventId, userId, tenantId, queue, orderId } = validation.data;

        logger.info('Internal mint request received', {
          ticketIds,
          eventId,
          userId,
          tenantId,
          queue,
          fromService: request.internalService
        });

        const orchestrator = new MintingOrchestrator();
        const results: MintResult[] = [];

        for (const ticketId of ticketIds) {
          try {
            const result = await orchestrator.mintCompressedNFT({
              ticketId,
              eventId,
              tenantId,
              orderId: orderId || `order-${ticketId}`,
            });

            results.push({
              ticketId,
              success: true,
              result,
              mintAddress: result.mintAddress
            });
          } catch (error) {
            logger.error('Mint failed for ticket', {
              ticketId,
              tenantId,
              error: (error as Error).message,
              service: request.internalService
            });

            results.push({
              ticketId,
              success: false,
              error: (error as Error).message
            });
          }
        }

        const allSuccessful = results.every(r => r.success);

        return reply.send({
          success: allSuccessful,
          results,
          mintedBy: request.internalService,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Internal mint endpoint error:', {
          error: (error as Error).message,
          service: request.internalService,
          body: request.body
        });

        return reply.code(500).send({
          success: false,
          error: (error as Error).message
        });
      }
    }
  );
}
