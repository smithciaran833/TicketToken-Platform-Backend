import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { riskService } from '../services/risk.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class RiskController {
  async calculateRiskScore(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.body as any;
      
      const riskAssessment = await riskService.calculateRiskScore(venueId, tenantId);

      logger.info(`Risk score calculated for tenant ${tenantId}, venue ${venueId}: ${riskAssessment.score}`);

      return reply.send({
        success: true,
        data: {
          venueId,
          ...riskAssessment,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error: any) {
      logger.error(`Error calculating risk score: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async flagVenue(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId, reason } = request.body as any;
      
      await riskService.flagForReview(venueId, reason, tenantId);

      logger.info(`Venue ${venueId} flagged for review by tenant ${tenantId}, reason: ${reason}`);

      return reply.send({
        success: true,
        message: 'Venue flagged for review',
        data: { venueId, reason }
      });
    } catch (error: any) {
      logger.error(`Error flagging venue: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async resolveFlag(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { flagId } = request.params as any;
      const { resolution } = request.body as any;
      
      await riskService.resolveFlag(parseInt(flagId), resolution, tenantId);

      logger.info(`Flag ${flagId} resolved by tenant ${tenantId}`);

      return reply.send({
        success: true,
        message: 'Flag resolved',
        data: { flagId, resolution }
      });
    } catch (error: any) {
      logger.error(`Error resolving flag: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
