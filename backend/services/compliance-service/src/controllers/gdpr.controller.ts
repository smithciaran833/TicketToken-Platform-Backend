import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { dataRetentionService } from '../services/data-retention.service';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class GDPRController {
  async requestDeletion(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { customerId } = request.body as any;

      logger.info(`GDPR deletion requested for customer ${customerId} by tenant ${tenantId}`);

      // Log the request with tenant_id
      await db.query(
        `INSERT INTO gdpr_deletion_requests (customer_id, status, tenant_id)
         VALUES ($1, 'processing', $2)`,
        [customerId, tenantId]
      );

      // Process deletion
      // TODO: Update dataRetentionService to be tenant-aware
      await dataRetentionService.handleGDPRDeletion(customerId);

      // Update status with tenant filter
      await db.query(
        `UPDATE gdpr_deletion_requests
         SET status = 'completed', processed_at = NOW()
         WHERE customer_id = $1 AND tenant_id = $2`,
        [customerId, tenantId]
      );

      logger.info(`GDPR deletion completed for customer ${customerId}`);

      return reply.send({
        success: true,
        message: 'GDPR deletion request processed',
        customerId
      });
    } catch (error: any) {
      logger.error(`GDPR deletion error: ${error.message}`);
      return reply.code(500).send({ error: error.message });
    }
  }

  async getDeletionStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { customerId } = request.params as any;
      
      // Tenant-isolated query
      const result = await db.query(
        `SELECT * FROM gdpr_deletion_requests
         WHERE customer_id = $1 AND tenant_id = $2
         ORDER BY requested_at DESC LIMIT 1`,
        [customerId, tenantId]
      );

      return reply.send({
        success: true,
        data: result.rows[0] || null
      });
    } catch (error: any) {
      logger.error(`GDPR status error: ${error.message}`);
      return reply.code(500).send({ error: error.message });
    }
  }
}
