import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { bankService } from '../services/bank.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class BankController {
  async verifyBankAccount(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId, accountNumber, routingNumber } = request.body as any;
      
      // TODO: Update bankService.verifyBankAccount() to accept tenantId parameter
      const verification = await bankService.verifyBankAccount(
        venueId,
        accountNumber,
        routingNumber
      );

      logger.info(`Bank account verification for tenant ${tenantId}, venue ${venueId}: ${verification.verified ? 'VERIFIED' : 'FAILED'}`);

      return reply.send({
        success: true,
        message: verification.verified ? 'Bank account verified' : 'Verification failed',
        data: {
          venueId,
          ...verification
        }
      });
    } catch (error: any) {
      logger.error(`Error verifying bank account: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async createPayoutMethod(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId, accountToken } = request.body as any;
      
      // TODO: Update bankService.createPayoutMethod() to accept tenantId parameter
      const payoutId = await bankService.createPayoutMethod(venueId, accountToken);

      logger.info(`Payout method created for tenant ${tenantId}, venue ${venueId}`);

      return reply.send({
        success: true,
        message: 'Payout method created',
        data: {
          venueId,
          payoutId
        }
      });
    } catch (error: any) {
      logger.error(`Error creating payout method: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
