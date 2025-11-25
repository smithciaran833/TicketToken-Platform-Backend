import { FastifyRequest, FastifyReply } from 'fastify';
import { serviceCache } from '../services/cache-integration';
import { realOFACService as ofacService } from '../services/ofac-real.service';
import { db } from '../services/database.service';
import { logger } from '../utils/logger';
import { requireTenantId } from '../middleware/tenant.middleware';

export class OFACController {
  async checkName(request: FastifyRequest, reply: FastifyReply) {
    try {
      const tenantId = requireTenantId(request);
      const { name, venueId } = request.body as any;
      const result = await ofacService.checkAgainstOFAC(name, true);

      const matchedName = result.matches[0]?.name || null;

      // Log the check with tenant_id
      await db.query(
        `INSERT INTO ofac_checks (venue_id, name_checked, is_match, confidence, matched_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [venueId, name, result.isMatch, result.confidence, matchedName, tenantId]
      );

      logger.info(`OFAC check performed for tenant ${tenantId}, venue ${venueId}: ${name} - ${result.isMatch ? 'MATCH' : 'CLEAR'}`);

      return reply.send({
        success: true,
        data: {
          isMatch: result.isMatch,
          confidence: result.confidence,
          matches: result.matches,
          matchedName: matchedName,
          timestamp: new Date().toISOString(),
          action: result.isMatch ? 'REQUIRES_REVIEW' : 'CLEARED'
        }
      });
    } catch (error: any) {
      logger.error('OFAC check failed:', error);
      return reply.code(500).send({
        success: false,
        error: error.message
      });
    }
  }
}
