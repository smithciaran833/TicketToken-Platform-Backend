import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import {
  mintingServiceClient,
  createRequestContext,
  ServiceClientError,
} from '@tickettoken/shared';
import { logger } from '../utils/logger';
import { internalAuthMiddleware } from '../middleware/internal-auth';
import { validateMintRequest } from '../middleware/validation';

async function internalMintRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions
) {
  fastify.post('/internal/mint-tickets', {
    preHandler: [internalAuthMiddleware, validateMintRequest]
  }, async (request, reply) => {
    try {
      const body = request.body as {
        ticketIds: string[];
        eventId: string;
        userId: string;
        queue?: string;
      };

      // Extract tenant context from headers
      const tenantId = request.headers['x-tenant-id'] as string || 'default';
      const traceId = request.headers['x-trace-id'] as string;
      const ctx = createRequestContext(tenantId, body.userId, traceId);

      // Forward to minting service using shared client
      // HMAC authentication is handled automatically by the client
      const response = await mintingServiceClient.queueMint({
        ticketIds: body.ticketIds,
        eventId: body.eventId,
        userId: body.userId,
        queue: body.queue || 'ticket.mint',
      }, ctx);

      return response;
    } catch (error: any) {
      if (error instanceof ServiceClientError) {
        logger.error('Minting proxy error', {
          error: error.message,
          statusCode: error.statusCode,
          responseData: error.responseData,
        });
        return reply.status(error.statusCode || 500).send({
          error: error.responseData?.error || 'Minting request failed',
          message: error.message,
        });
      }

      logger.error('Minting proxy error', { error: error.message });
      return reply.status(500).send({
        error: 'Minting request failed',
        message: error.message,
      });
    }
  });
}

export default internalMintRoutes;
