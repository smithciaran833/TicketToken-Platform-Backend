import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class VenueController {
  async startVerification(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId, ein, businessName } = request.body as any;
      const verificationId = 'ver_' + Date.now();

      const result = await db.query(
        `INSERT INTO venue_verifications (venue_id, ein, business_name, status, verification_id, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [venueId, ein, businessName, 'pending', verificationId, tenantId]
      );

      await db.query(
        `INSERT INTO compliance_audit_log (action, entity_type, entity_id, metadata, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        ['verification_started', 'venue', venueId, JSON.stringify({ ein, businessName }), tenantId]
      );

      logger.info(`Verification started for tenant ${tenantId}, venue ${venueId}`);

      return reply.send({
        success: true,
        message: 'Verification started and saved to database',
        data: {
          id: result.rows[0].id,
          venueId,
          verificationId,
          status: 'pending',
          nextStep: 'upload_w9'
        }
      });
    } catch (error: any) {
      logger.error(`Error starting verification: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to start verification',
        details: error.message
      });
    }
  }

  async getVerificationStatus(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.params as any;

      const result = await db.query(
        `SELECT * FROM venue_verifications 
         WHERE venue_id = $1 AND tenant_id = $2 
         ORDER BY created_at DESC LIMIT 1`,
        [venueId, tenantId]
      );

      if (result.rows.length === 0) {
        return reply.code(404).send({
          success: false,
          error: 'No verification found for this venue'
        });
      }

      const verification = result.rows[0];

      return reply.send({
        success: true,
        data: {
          venueId: verification.venue_id,
          verificationId: verification.verification_id,
          status: verification.status,
          businessName: verification.business_name,
          ein: verification.ein,
          createdAt: verification.created_at,
          updatedAt: verification.updated_at
        }
      });
    } catch (error: any) {
      logger.error(`Error getting verification status: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get verification status',
        details: error.message
      });
    }
  }

  async getAllVerifications(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);

      const result = await db.query(
        `SELECT * FROM venue_verifications 
         WHERE tenant_id = $1 
         ORDER BY created_at DESC LIMIT 10`,
        [tenantId]
      );

      return reply.send({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error: any) {
      logger.error(`Error getting verifications: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get verifications',
        details: error.message
      });
    }
  }
}
