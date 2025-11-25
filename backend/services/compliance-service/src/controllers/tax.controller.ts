import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { taxService } from '../services/tax.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class TaxController {
  async trackSale(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId, amount, ticketId } = request.body as any;
      
      const result = await taxService.trackSale(venueId, amount, ticketId, tenantId);
      
      logger.info(`Sale tracked for tenant ${tenantId}, venue ${venueId}, amount: $${amount}`);
      
      return reply.send({
        success: true,
        message: 'Sale tracked for tax reporting',
        data: result
      });
    } catch (error: any) {
      logger.error(`Error tracking sale: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async getTaxSummary(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.params as any;
      const { year } = request.query as any;
      
      const summary = await taxService.getVenueTaxSummary(
        venueId,
        year ? parseInt(year as string) : undefined,
        tenantId
      );
      
      return reply.send({
        success: true,
        data: summary
      });
    } catch (error: any) {
      logger.error(`Error getting tax summary: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async calculateTax(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      
      const result = await taxService.calculateTax(request.body, tenantId);
      
      return reply.send(result);
    } catch (error: any) {
      logger.error(`Error calculating tax: ${error.message}`);
      return reply.code(500).send({ error: 'Failed to calculate tax' });
    }
  }

  async generateTaxReport(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { year } = request.params as any;
      
      const result = await taxService.generateTaxReport(parseInt(year), tenantId);
      
      logger.info(`Tax report generated for tenant ${tenantId}, year ${year}`);
      
      return reply.send(result);
    } catch (error: any) {
      logger.error(`Error generating tax report: ${error.message}`);
      return reply.code(500).send({ error: 'Failed to generate tax report' });
    }
  }
}
