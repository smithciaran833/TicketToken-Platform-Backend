import { FastifyInstance } from 'fastify';
import { BankController } from '../controllers/bank.controller';

export async function bankRoutes(fastify: FastifyInstance) {
  const bankController = new BankController();

  // Bank verification routes
  fastify.post('/bank/verify', bankController.verifyBankAccount);
  fastify.post('/bank/payout-method', bankController.createPayoutMethod);
  fastify.get('/bank/:accountId/status', bankController.verifyBankAccount);
}
