import { FastifyInstance } from 'fastify';
import { transferController } from '../controllers/transfer.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { walletMiddleware } from '../middleware/wallet.middleware';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

// Validation schemas
const purchaseListingSchema = Joi.object({
  listingId: Joi.string().uuid().required(),
  paymentMethodId: Joi.string().optional(),
});

const directTransferSchema = Joi.object({
  ticketId: Joi.string().uuid().required(),
  recipientWallet: Joi.string().required(),
});

export default async function transfersRoutes(fastify: FastifyInstance) {
  // All transfer routes require authentication and wallet
  const securePreHandler = [authMiddleware, walletMiddleware];

  // Purchase listing
  fastify.post('/purchase', {
    preHandler: [...securePreHandler, validate(purchaseListingSchema)]
  }, transferController.purchaseListing.bind(transferController));

  // Direct transfer
  fastify.post('/direct', {
    preHandler: [...securePreHandler, validate(directTransferSchema)]
  }, transferController.directTransfer.bind(transferController));

  // Get transfer history
  fastify.get('/history', {
    preHandler: securePreHandler
  }, transferController.getTransferHistory.bind(transferController));

  // Get transfer by ID
  fastify.get('/:id', {
    preHandler: securePreHandler
  }, transferController.getTransfer.bind(transferController));

  // Cancel pending transfer
  fastify.post('/:id/cancel', {
    preHandler: securePreHandler
  }, transferController.cancelTransfer.bind(transferController));
}
