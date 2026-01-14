import { db } from './database.service';
import { logger } from '../utils/logger';
import { authServiceClient } from '@tickettoken/shared/clients';
import { venueServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';

/**
 * Helper to create request context for service calls
 * Compliance service operates as a system service
 */
function createSystemContext(tenantId?: string): RequestContext {
  return {
    tenantId: tenantId || 'system',
    traceId: `risk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

export class RiskService {
  async calculateRiskScore(venueId: string, tenantId: string): Promise<{
    score: number;
    factors: string[];
    recommendation: string;
  }> {
    let score = 0;
    const factors: string[] = [];
    
    // Check verification status (0-30 points) - compliance-service owned table
    const verificationResult = await db.query(
      'SELECT * FROM venue_verifications WHERE venue_id = $1 AND tenant_id = $2',
      [venueId, tenantId]
    );
    
    if (verificationResult.rows.length === 0) {
      score += 30;
      factors.push('No verification started');
    } else {
      const verification = verificationResult.rows[0];
      
      if (verification.status === 'rejected') {
        score += 50;
        factors.push('Previously rejected');
      }
      if (verification.status === 'pending') {
        score += 20;
        factors.push('Verification pending');
      }
      if (!verification.ein) {
        score += 15;
        factors.push('Missing EIN');
      }
      if (!verification.w9_uploaded) {
        score += 10;
        factors.push('No W-9 on file');
      }
      if (!verification.bank_verified) {
        score += 10;
        factors.push('Bank not verified');
      }
    }
    
    // Check OFAC status (0-40 points) - compliance-service owned table
    const ofacResult = await db.query(
      'SELECT * FROM ofac_checks WHERE venue_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 1',
      [venueId, tenantId]
    );
    
    if (ofacResult.rows.length > 0 && ofacResult.rows[0].is_match) {
      score += 40;
      factors.push('OFAC match found');
    }
    
    // Check transaction patterns (0-30 points) - compliance-service owned table
    const velocityCheck = await this.checkVelocity(venueId, tenantId);
    if (velocityCheck.suspicious) {
      score += velocityCheck.riskPoints;
      factors.push(velocityCheck.reason);
    }
    
    // Determine recommendation
    let recommendation = '';
    if (score >= 70) {
      recommendation = 'BLOCK';
    } else if (score >= 50) {
      recommendation = 'MANUAL_REVIEW';
    } else if (score >= 30) {
      recommendation = 'MONITOR';
    } else {
      recommendation = 'APPROVE';
    }
    
    // Store risk assessment - compliance-service owned table
    await db.query(
      `INSERT INTO risk_assessments 
       (venue_id, risk_score, factors, recommendation, tenant_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [venueId, score, JSON.stringify(factors), recommendation, tenantId]
    );
    
    return { score, factors, recommendation };
  }
  
  private async checkVelocity(venueId: string, tenantId: string): Promise<{
    suspicious: boolean;
    riskPoints: number;
    reason: string;
  }> {
    // Check for suspicious patterns in last 24 hours - compliance-service owned table
    const result = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM tax_records 
       WHERE venue_id = $1 AND tenant_id = $2
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [venueId, tenantId]
    );
    
    const count = parseInt(result.rows[0]?.count || '0');
    const total = parseFloat(result.rows[0]?.total || '0');
    
    // High velocity checks
    if (count > 100) {
      return {
        suspicious: true,
        riskPoints: 20,
        reason: `High transaction velocity: ${count} in 24h`
      };
    }
    
    if (total > 10000) {
      return {
        suspicious: true,
        riskPoints: 25,
        reason: `High transaction volume: $${total} in 24h`
      };
    }
    
    return {
      suspicious: false,
      riskPoints: 0,
      reason: ''
    };
  }
  
  async flagForReview(venueId: string, reason: string, tenantId: string): Promise<void> {
    // Insert risk flag record - compliance-service owned table
    const result = await db.query(
      `INSERT INTO risk_flags (venue_id, reason, tenant_id, created_at) 
       VALUES ($1, $2, $3, NOW())
       RETURNING id`,
      [venueId, reason, tenantId]
    );
    
    const flagId = result.rows[0]?.id;
    
    logger.info(`🚩 Venue ${venueId} (tenant ${tenantId}) flagged for review: ${reason}`);
    
    // Send notification to admin
    await this.sendAdminNotification(tenantId, venueId, reason, flagId);
  }

  /**
   * REFACTORED: Send notification to admin about a risk flag
   * Uses authServiceClient and venueServiceClient instead of direct DB queries
   */
  private async sendAdminNotification(
    tenantId: string,
    venueId: string,
    reason: string,
    flagId: number
  ): Promise<void> {
    const ctx = createSystemContext(tenantId);

    try {
      // REFACTORED: Get admin users via authServiceClient instead of direct DB query
      const admins = await authServiceClient.getAdminUsers(ctx, {
        roles: ['admin', 'compliance_admin', 'super_admin']
      });
      
      if (admins.length === 0) {
        logger.warn({ tenantId, venueId, flagId }, 'No admin users found to notify for risk flag');
        return;
      }

      // REFACTORED: Get venue details via venueServiceClient instead of direct DB query
      let venueName = 'Unknown Venue';
      try {
        const venueInfo = await venueServiceClient.getVenueBasicInfo(venueId, ctx);
        if (venueInfo) {
          venueName = venueInfo.name;
        }
      } catch (error) {
        logger.warn({ error, venueId }, 'Failed to get venue name, using default');
      }
      
      // Create admin notifications for each admin user
      for (const admin of admins) {
        // Store notification in database - compliance-service owned table
        await db.query(
          `INSERT INTO admin_notifications 
           (tenant_id, admin_user_id, notification_type, title, message, entity_type, entity_id, priority, status, metadata, created_at)
           VALUES ($1, $2, 'risk_flag', $3, $4, 'venue', $5, 'high', 'unread', $6, NOW())`,
          [
            tenantId,
            admin.id,
            `Risk Flag: ${venueName}`,
            `Venue "${venueName}" has been flagged for review. Reason: ${reason}`,
            venueId,
            JSON.stringify({ flagId, reason, venueName })
          ]
        );
        
        // Queue email notification - compliance-service owned table
        await db.query(
          `INSERT INTO notification_queue 
           (tenant_id, recipient_email, recipient_name, notification_type, subject, body, priority, status, created_at)
           VALUES ($1, $2, $3, 'admin_risk_alert', $4, $5, 'high', 'pending', NOW())`,
          [
            tenantId,
            admin.email,
            admin.firstName ? `${admin.firstName} ${admin.lastName || ''}`.trim() : admin.email,
            `[URGENT] Risk Flag Alert: ${venueName}`,
            this.buildRiskFlagEmailBody(venueName, venueId, reason, flagId)
          ]
        );
      }
      
      // Also create a compliance notification record for tracking - compliance-service owned table
      await db.query(
        `INSERT INTO compliance_notifications 
         (tenant_id, venue_id, notification_type, severity, message, status, created_at)
         VALUES ($1, $2, 'risk_flag', 'high', $3, 'pending', NOW())`,
        [tenantId, venueId, `Risk flag created: ${reason}`]
      );
      
      logger.info({ 
        tenantId, 
        venueId, 
        flagId, 
        notifiedAdmins: admins.length 
      }, 'Admin notifications sent for risk flag');
      
    } catch (error) {
      logger.error({ error, tenantId, venueId }, 'Failed to send admin notification for risk flag');
      // Don't throw - notification failure shouldn't block the flag creation
    }
  }

  /**
   * Build email body for risk flag notification
   */
  private buildRiskFlagEmailBody(venueName: string, venueId: string, reason: string, flagId: number): string {
    return `
Risk Flag Alert

A venue has been flagged for compliance review.

Venue Details:
- Name: ${venueName}
- Venue ID: ${venueId}
- Flag ID: ${flagId}

Reason for Flag:
${reason}

Action Required:
Please review this venue in the compliance dashboard and take appropriate action.

Dashboard Link: ${process.env.ADMIN_DASHBOARD_URL || 'https://admin.tickettoken.com'}/compliance/flags/${flagId}

This is an automated message from TicketToken Compliance Service.
    `.trim();
  }

  /**
   * REFACTORED: Get pending risk flags for a tenant
   * Uses venueServiceClient to get venue names instead of direct DB join
   */
  async getPendingFlags(tenantId: string): Promise<Array<{
    id: number;
    venueId: string;
    venueName: string;
    reason: string;
    createdAt: Date;
  }>> {
    const ctx = createSystemContext(tenantId);

    // Get risk flags - compliance-service owned table (without venue join)
    const result = await db.query(
      `SELECT id, venue_id, reason, created_at
       FROM risk_flags
       WHERE tenant_id = $1 AND resolved = false
       ORDER BY created_at DESC`,
      [tenantId]
    );
    
    // REFACTORED: Get venue names via venueServiceClient instead of direct DB join
    const venueIds = [...new Set(result.rows.map((r: any) => r.venue_id))];
    let venueNamesMap: Record<string, { name: string }> = {};
    
    if (venueIds.length > 0) {
      try {
        const venueNamesResponse = await venueServiceClient.batchGetVenueNames(venueIds, ctx);
        venueNamesMap = venueNamesResponse.venues;
      } catch (error) {
        logger.warn({ error }, 'Failed to get venue names for pending flags');
      }
    }
    
    return result.rows.map((row: any) => ({
      id: row.id,
      venueId: row.venue_id,
      venueName: venueNamesMap[row.venue_id]?.name || 'Unknown',
      reason: row.reason,
      createdAt: row.created_at
    }));
  }
  
  async resolveFlag(flagId: number, resolution: string, tenantId: string): Promise<void> {
    // Update risk flag - compliance-service owned table
    await db.query(
      `UPDATE risk_flags 
       SET resolved = true, resolution = $2, resolved_at = NOW()
       WHERE id = $1 AND tenant_id = $3`,
      [flagId, resolution, tenantId]
    );
  }
}

export const riskService = new RiskService();
