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
      
      // Pass tenantId to bankService for proper tenant isolation
      const verification = await bankService.verifyBankAccount(
        tenantId,
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
      
      // Pass tenantId to bankService for proper tenant isolation
      const payoutId = await bankService.createPayoutMethod(tenantId, venueId, accountToken);

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

  async getPayoutMethods(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.params as { venueId: string };
      
      const payoutMethods = await bankService.getPayoutMethods(tenantId, venueId);

      return reply.send({
        success: true,
        data: payoutMethods
      });
    } catch (error: any) {
      logger.error(`Error getting payout methods: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async getBankVerificationHistory(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.params as { venueId: string };
      
      const history = await bankService.getBankVerificationHistory(tenantId, venueId);

      return reply.send({
        success: true,
        data: history
      });
    } catch (error: any) {
      logger.error(`Error getting bank verification history: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
