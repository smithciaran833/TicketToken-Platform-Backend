import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { db } from '../services/database.service';
import { notificationService } from '../services/notification.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class AdminController {
  async getPendingReviews(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);

      const pendingVerifications = await db.query(`
        SELECT v.*, r.risk_score, r.factors, r.recommendation
        FROM venue_verifications v
        LEFT JOIN risk_assessments r ON v.venue_id = r.venue_id AND r.tenant_id = $1
        WHERE v.tenant_id = $1
        AND (v.status = 'pending' OR v.manual_review_required = true)
        ORDER BY v.created_at DESC
      `, [tenantId]);

      const pendingFlags = await db.query(`
        SELECT * FROM risk_flags
        WHERE tenant_id = $1 AND resolved = false
        ORDER BY created_at DESC
      `, [tenantId]);

      logger.info(`Admin retrieved ${pendingVerifications.rows.length} pending reviews for tenant ${tenantId}`);

      return reply.send({
        success: true,
        data: {
          verifications: pendingVerifications.rows,
          flags: pendingFlags.rows,
          totalPending: pendingVerifications.rows.length + pendingFlags.rows.length
        }
      });
    } catch (error: any) {
      logger.error(`Error getting pending reviews: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async approveVerification(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.params as any;
      const { notes } = request.body as any;

      await db.query(`
        UPDATE venue_verifications
        SET status = 'verified',
            manual_review_required = false,
            manual_review_notes = $2,
            updated_at = NOW()
        WHERE venue_id = $1 AND tenant_id = $3
      `, [venueId, notes, tenantId]);

      // Log the action with tenant_id
      await db.query(`
        INSERT INTO compliance_audit_log
        (action, entity_type, entity_id, user_id, metadata, tenant_id)
        VALUES ('verification_approved', 'venue', $1, $2, $3, $4)
      `, [venueId, 'admin', JSON.stringify({ notes }), tenantId]);

      // Notify venue
      await notificationService.notifyVerificationStatus(venueId, 'approved');

      logger.info(`Venue ${venueId} approved by admin for tenant ${tenantId}`);

      return reply.send({
        success: true,
        message: 'Venue verification approved',
        data: { venueId }
      });
    } catch (error: any) {
      logger.error(`Error approving verification: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }

  async rejectVerification(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { venueId } = request.params as any;
      const { reason, notes } = request.body as any;

      await db.query(`
        UPDATE venue_verifications
        SET status = 'rejected',
            manual_review_required = false,
            manual_review_notes = $2,
            updated_at = NOW()
        WHERE venue_id = $1 AND tenant_id = $3
      `, [venueId, notes, tenantId]);

      // Log the action with tenant_id
      await db.query(`
        INSERT INTO compliance_audit_log
        (action, entity_type, entity_id, user_id, metadata, tenant_id)
        VALUES ('verification_rejected', 'venue', $1, $2, $3, $4)
      `, [venueId, 'admin', JSON.stringify({ reason, notes }), tenantId]);

      // Notify venue
      await notificationService.notifyVerificationStatus(venueId, 'rejected');

      logger.info(`Venue ${venueId} rejected by admin for tenant ${tenantId}, reason: ${reason}`);

      return reply.send({
        success: true,
        message: 'Venue verification rejected',
        data: { venueId, reason }
      });
    } catch (error: any) {
      logger.error(`Error rejecting verification: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
