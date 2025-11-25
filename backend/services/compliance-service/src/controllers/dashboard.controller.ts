import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class DashboardController {
  async getComplianceOverview(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);

      // Get verification stats
      const verifications = await db.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
        FROM venue_verifications
        WHERE tenant_id = $1
      `, [tenantId]);

      // Get tax stats for current year
      const year = new Date().getFullYear();
      const taxStats = await db.query(`
        SELECT
          COUNT(DISTINCT venue_id) as venues_with_sales,
          SUM(amount) as total_sales,
          COUNT(CASE WHEN threshold_reached THEN 1 END) as venues_over_threshold
        FROM tax_records
        WHERE year = $1 AND tenant_id = $2
      `, [year, tenantId]);

      // Get OFAC check stats
      const ofacStats = await db.query(`
        SELECT
          COUNT(*) as total_checks,
          COUNT(CASE WHEN is_match THEN 1 END) as matches_found
        FROM ofac_checks
        WHERE tenant_id = $1
      `, [tenantId]);

      // Get recent activity
      const recentActivity = await db.query(`
        SELECT * FROM compliance_audit_log
        WHERE tenant_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `, [tenantId]);

      logger.info(`Compliance overview retrieved for tenant ${tenantId}`);

      return reply.send({
        success: true,
        data: {
          overview: {
            timestamp: new Date().toISOString(),
            year: year
          },
          verifications: verifications.rows[0],
          taxReporting: {
            ...taxStats.rows[0],
            threshold: 600,
            forms_required: taxStats.rows[0]?.venues_over_threshold || 0
          },
          ofacScreening: ofacStats.rows[0],
          recentActivity: recentActivity.rows
        }
      });
    } catch (error: any) {
      logger.error(`Error getting compliance overview: ${error.message}`);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
