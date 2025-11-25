import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Pool } from 'pg';
import { TransferController } from '../controllers/transfer.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import {
  giftTransferBodySchema,
  acceptTransferBodySchema,
  acceptTransferParamsSchema
} from '../validators/schemas';

/**
 * TRANSFER ROUTES
 *
 * Route definitions for transfer endpoints
 * Phase 2: Route Layer
 */
export async function transferRoutes(app: FastifyInstance, pool: Pool) {
  const controller = new TransferController(pool);

  // Create gift transfer
  app.post(
    '/api/v1/transfers/gift',
    {
      preHandler: [
        authenticate,
        validate({ body: giftTransferBodySchema })
      ]
    },
    async (request: FastifyRequest<{ Body: { ticketId: string; toEmail: string; message?: string; } }>, reply: FastifyReply) => 
      controller.createGiftTransfer(request, reply)
  );

  // Accept transfer
  app.post(
    '/api/v1/transfers/:transferId/accept',
    {
      preHandler: [
        authenticate,
        validate({
          params: acceptTransferParamsSchema,
          body: acceptTransferBodySchema
        })
      ]
    },
    async (request: FastifyRequest<{ Params: { transferId: string; }; Body: { acceptanceCode: string; userId: string; } }>, reply: FastifyReply) => 
      controller.acceptTransfer(request, reply)
  );
}
