import { FastifyInstance } from 'fastify';
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

interface GiftTransferBody {
  ticketId: string;
  toEmail: string;
  message?: string;
}

interface AcceptTransferParams {
  transferId: string;
}

interface AcceptTransferBody {
  acceptanceCode: string;
  userId: string;
}

export async function transferRoutes(app: FastifyInstance, pool: Pool) {
  const controller = new TransferController(pool);

  // Create gift transfer
  app.post<{ Body: GiftTransferBody }>(
    '/api/v1/transfers/gift',
    {
      preHandler: [
        authenticate,
        validate({ body: giftTransferBodySchema })
      ]
    },
    async (request, reply) => controller.createGiftTransfer(request, reply)
  );

  // Accept transfer
  app.post<{ Params: AcceptTransferParams; Body: AcceptTransferBody }>(
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
    async (request, reply) => controller.acceptTransfer(request, reply)
  );
}
