import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { batchService } from '../services/batch.service';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class BatchController {
  async generate1099Forms(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { year } = (request.body as any) || {};
      const targetYear = year || new Date().getFullYear() - 1;

      const result = await batchService.generateYear1099Forms(targetYear, tenantId);

      logger.info(`Generated 1099 forms for tenant ${tenantId}, year ${targetYear}: ${result.generated} forms`);

      return reply.send({
        success: true,
        message: `Generated ${result.generated} Form 1099-Ks for year ${targetYear}`,
        data: result
      });
    } catch (error: any) {
      logger.error(`Error generating 1099 forms: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async getBatchJobs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);

      const jobs = await db.query(
        `SELECT * FROM compliance_batch_jobs
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [tenantId]
      );

      return reply.send({
        success: true,
        data: jobs.rows
      });
    } catch (error: any) {
      logger.error(`Error getting batch jobs: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async runDailyChecks(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);

      await batchService.dailyComplianceChecks(tenantId);

      logger.info(`Daily compliance checks completed for tenant ${tenantId}`);

      return reply.send({
        success: true,
        message: 'Daily compliance checks completed'
      });
    } catch (error: any) {
      logger.error(`Error running daily checks: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async updateOFACList(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);

      await batchService.processOFACUpdates(tenantId);

      logger.info(`OFAC list updated for tenant ${tenantId}`);

      return reply.send({
        success: true,
        message: 'OFAC list updated successfully'
      });
    } catch (error: any) {
      logger.error(`Error updating OFAC list: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
