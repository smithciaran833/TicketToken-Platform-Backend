import { batchService } from './batch.service';
import { realOFACService } from './ofac-real.service';
import { logger } from '../utils/logger';
import { db } from './database.service';
import { authServiceClient } from '@tickettoken/shared/clients';
import { venueServiceClient } from '@tickettoken/shared/clients';
import { RequestContext } from '@tickettoken/shared/http-client/base-service-client';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Helper to create request context for service calls
 * Compliance service operates as a system service
 */
function createSystemContext(): RequestContext {
  return {
    tenantId: 'system',
    traceId: `compliance-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  };
}

interface WeeklyReportData {
  period: { start: Date; end: Date };
  summary: {
    totalVenuesVerified: number;
    totalVenuesPending: number;
    totalVenuesRejected: number;
    totalOFACScreenings: number;
    ofacMatches: number;
    riskFlagsCreated: number;
    riskFlagsResolved: number;
    highRiskVenues: number;
  };
  venueVerifications: Array<{
    tenantId: string;
    venueId: string;
    venueName: string;
    status: string;
    verifiedAt: Date;
  }>;
  ofacAlerts: Array<{
    tenantId: string;
    entityName: string;
    matchType: string;
    matchScore: number;
    screenedAt: Date;
  }>;
  riskFlags: Array<{
    tenantId: string;
    venueId: string;
    reason: string;
    resolved: boolean;
    createdAt: Date;
  }>;
}

export class SchedulerService {
  private jobs: Map<string, NodeJS.Timeout> = new Map();
  private reportsPath = process.env.REPORTS_PATH || '/tmp/compliance-reports';
  
  startScheduledJobs() {
    logger.info('Starting scheduled compliance jobs...');
    
    // Daily OFAC update (3 AM)
    this.scheduleDaily('ofac-update', 3, async () => {
      logger.info('Running OFAC update...');
      await realOFACService.downloadAndUpdateOFACList();
    });
    
    // Daily compliance checks (4 AM)
    this.scheduleDaily('compliance-checks', 4, async () => {
      logger.info('Running daily compliance checks...');
      await batchService.dailyComplianceChecks("system");
    });
    
    // Weekly report generation (Sunday 2 AM)
    this.scheduleWeekly('weekly-report', 0, 2, async () => {
      logger.info('Generating weekly compliance report...');
      await this.generateWeeklyComplianceReport();
    });
    
    // Yearly 1099 generation (January 15)
    this.scheduleYearly('1099-generation', 1, 15, async () => {
      const previousYear = new Date().getFullYear() - 1;
      logger.info(`Generating 1099s for year ${previousYear}...`);
      await batchService.generateYear1099Forms(previousYear, "system");
    });
    
    logger.info('Scheduled jobs started successfully');
  }
  
  private scheduleDaily(name: string, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);
    
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next day
      this.scheduleDaily(name, hour, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    logger.info(`Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  private scheduleWeekly(name: string, dayOfWeek: number, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);
    
    // Find next occurrence of the specified day
    const daysUntilTarget = (dayOfWeek - scheduled.getDay() + 7) % 7;
    scheduled.setDate(scheduled.getDate() + (daysUntilTarget || 7));
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next week
      this.scheduleWeekly(name, dayOfWeek, hour, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    logger.info(`Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  private scheduleYearly(name: string, month: number, day: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setMonth(month - 1, day);
    scheduled.setHours(9, 0, 0, 0);
    
    if (scheduled <= now) {
      scheduled.setFullYear(scheduled.getFullYear() + 1);
    }
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next year
      this.scheduleYearly(name, month, day, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    logger.info(`Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      clearTimeout(job);
      logger.info(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }

  /**
   * Generate weekly compliance report
   */
  private async generateWeeklyComplianceReport(): Promise<void> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      
      logger.info({ startDate, endDate }, 'Generating weekly compliance report');
      
      // Collect report data
      const reportData = await this.collectWeeklyReportData(startDate, endDate);
      
      // Generate report file
      const reportPath = await this.writeReportToFile(reportData);
      
      // Store report record in database
      await db.query(
        `INSERT INTO compliance_reports 
         (report_type, period_start, period_end, file_path, summary, created_at)
         VALUES ('weekly', $1, $2, $3, $4, NOW())`,
        [startDate, endDate, reportPath, JSON.stringify(reportData.summary)]
      );
      
      // Notify admins
      await this.notifyAdminsOfReport(reportData, reportPath);
      
      logger.info({ reportPath }, 'Weekly compliance report generated successfully');
      
    } catch (error) {
      logger.error({ error }, 'Failed to generate weekly compliance report');
    }
  }

  /**
   * REFACTORED: Collect data for weekly report
   * Uses venueServiceClient for venue names instead of direct DB join
   */
  private async collectWeeklyReportData(startDate: Date, endDate: Date): Promise<WeeklyReportData> {
    const ctx = createSystemContext();

    // Get venue verification stats (compliance-service owned table)
    const verificationStats = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'approved') as verified,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected
      FROM venue_verifications
      WHERE updated_at BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    // Get OFAC screening stats (compliance-service owned table)
    const ofacStats = await db.query(`
      SELECT 
        COUNT(*) as total_screenings,
        COUNT(*) FILTER (WHERE status IN ('potential_match', 'confirmed_match')) as matches
      FROM ofac_screenings
      WHERE created_at BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    // Get risk flag stats (compliance-service owned table)
    const riskFlagStats = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE created_at BETWEEN $1 AND $2) as created,
        COUNT(*) FILTER (WHERE resolved = true AND resolved_at BETWEEN $1 AND $2) as resolved
      FROM risk_flags
      WHERE created_at BETWEEN $1 AND $2 OR (resolved_at BETWEEN $1 AND $2)
    `, [startDate, endDate]);
    
    // Get high risk venues count (compliance-service owned table)
    const highRiskStats = await db.query(`
      SELECT COUNT(DISTINCT entity_id) as count
      FROM risk_assessments
      WHERE entity_type = 'venue' 
      AND risk_level IN ('high', 'critical')
      AND updated_at BETWEEN $1 AND $2
    `, [startDate, endDate]);
    
    // Get venue verifications details (compliance-service owned table)
    const venueVerificationsResult = await db.query(`
      SELECT tenant_id, venue_id, status, updated_at as verified_at
      FROM venue_verifications
      WHERE updated_at BETWEEN $1 AND $2
      ORDER BY updated_at DESC
      LIMIT 100
    `, [startDate, endDate]);

    // REFACTORED: Get venue names via venueServiceClient instead of direct DB join
    const venueIds = [...new Set(venueVerificationsResult.rows.map((r: any) => r.venue_id))];
    let venueNamesMap: Record<string, { name: string }> = {};
    
    if (venueIds.length > 0) {
      try {
        const venueNamesResponse = await venueServiceClient.batchGetVenueNames(venueIds, ctx);
        venueNamesMap = venueNamesResponse.venues;
      } catch (error) {
        logger.warn({ error }, 'Failed to get venue names, using fallback');
      }
    }
    
    // Get OFAC alerts (compliance-service owned table)
    const ofacAlerts = await db.query(`
      SELECT tenant_id, entity_name, status as match_type, match_score, created_at as screened_at
      FROM ofac_screenings
      WHERE created_at BETWEEN $1 AND $2
      AND status IN ('potential_match', 'confirmed_match')
      ORDER BY match_score DESC
      LIMIT 50
    `, [startDate, endDate]);
    
    // Get risk flags (compliance-service owned table)
    const riskFlags = await db.query(`
      SELECT tenant_id, venue_id, reason, resolved, created_at
      FROM risk_flags
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at DESC
      LIMIT 100
    `, [startDate, endDate]);
    
    return {
      period: { start: startDate, end: endDate },
      summary: {
        totalVenuesVerified: parseInt(verificationStats.rows[0]?.verified || '0'),
        totalVenuesPending: parseInt(verificationStats.rows[0]?.pending || '0'),
        totalVenuesRejected: parseInt(verificationStats.rows[0]?.rejected || '0'),
        totalOFACScreenings: parseInt(ofacStats.rows[0]?.total_screenings || '0'),
        ofacMatches: parseInt(ofacStats.rows[0]?.matches || '0'),
        riskFlagsCreated: parseInt(riskFlagStats.rows[0]?.created || '0'),
        riskFlagsResolved: parseInt(riskFlagStats.rows[0]?.resolved || '0'),
        highRiskVenues: parseInt(highRiskStats.rows[0]?.count || '0')
      },
      venueVerifications: venueVerificationsResult.rows.map((row: any) => ({
        tenantId: row.tenant_id,
        venueId: row.venue_id,
        venueName: venueNamesMap[row.venue_id]?.name || 'Unknown',
        status: row.status,
        verifiedAt: row.verified_at
      })),
      ofacAlerts: ofacAlerts.rows.map((row: any) => ({
        tenantId: row.tenant_id,
        entityName: row.entity_name,
        matchType: row.match_type,
        matchScore: parseFloat(row.match_score || '0'),
        screenedAt: row.screened_at
      })),
      riskFlags: riskFlags.rows.map((row: any) => ({
        tenantId: row.tenant_id,
        venueId: row.venue_id,
        reason: row.reason,
        resolved: row.resolved,
        createdAt: row.created_at
      }))
    };
  }

  /**
   * Write report to file
   */
  private async writeReportToFile(reportData: WeeklyReportData): Promise<string> {
    // Ensure reports directory exists
    if (!fs.existsSync(this.reportsPath)) {
      fs.mkdirSync(this.reportsPath, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `compliance_report_weekly_${timestamp}.json`;
    const filepath = path.join(this.reportsPath, filename);
    
    // Write JSON report
    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));
    
    // Also generate a human-readable text version
    const textReport = this.generateTextReport(reportData);
    const textFilename = `compliance_report_weekly_${timestamp}.txt`;
    const textFilepath = path.join(this.reportsPath, textFilename);
    fs.writeFileSync(textFilepath, textReport);
    
    return filepath;
  }

  /**
   * Generate human-readable text report
   */
  private generateTextReport(reportData: WeeklyReportData): string {
    const { period, summary, ofacAlerts, riskFlags } = reportData;
    
    return `
TICKETTOKEN WEEKLY COMPLIANCE REPORT
Period: ${period.start.toISOString().split('T')[0]} to ${period.end.toISOString().split('T')[0]}
Generated: ${new Date().toISOString()}

SUMMARY
-------
Venue Verifications:
  - Approved: ${summary.totalVenuesVerified}
  - Pending: ${summary.totalVenuesPending}
  - Rejected: ${summary.totalVenuesRejected}

OFAC Screenings:
  - Total Screenings: ${summary.totalOFACScreenings}
  - Potential/Confirmed Matches: ${summary.ofacMatches}

Risk Management:
  - Flags Created: ${summary.riskFlagsCreated}
  - Flags Resolved: ${summary.riskFlagsResolved}
  - High Risk Venues: ${summary.highRiskVenues}

${summary.ofacMatches > 0 ? `
OFAC ALERTS REQUIRING ATTENTION
-------------------------------
${ofacAlerts.map(alert => 
  `- ${alert.entityName} (Score: ${alert.matchScore}%, Type: ${alert.matchType})`
).join('\n')}
` : ''}

${summary.riskFlagsCreated > 0 ? `
NEW RISK FLAGS
--------------
${riskFlags.filter(f => !f.resolved).map(flag => 
  `- Venue: ${flag.venueId} | Reason: ${flag.reason}`
).join('\n')}
` : ''}

---
This is an automated compliance report generated by TicketToken Compliance Service.
For questions, contact compliance@tickettoken.com
    `.trim();
  }

  /**
   * REFACTORED: Notify admins of the generated report
   * Uses authServiceClient instead of direct users table query
   */
  private async notifyAdminsOfReport(reportData: WeeklyReportData, reportPath: string): Promise<void> {
    const ctx = createSystemContext();

    try {
      // REFACTORED: Get admins via authServiceClient instead of direct DB query
      const admins = await authServiceClient.getAdminUsers(ctx, {
        roles: ['super_admin', 'compliance_admin']
      });
      
      for (const admin of admins) {
        await db.query(
          `INSERT INTO notification_queue 
           (recipient_email, recipient_name, notification_type, subject, body, priority, status, created_at)
           VALUES ($1, $2, 'compliance_report', $3, $4, 'normal', 'pending', NOW())`,
          [
            admin.email,
            admin.firstName ? `${admin.firstName} ${admin.lastName || ''}`.trim() : admin.email,
            'Weekly Compliance Report Available',
            this.buildReportNotificationEmail(reportData, reportPath)
          ]
        );
      }
      
      logger.info({ adminCount: admins.length }, 'Admin notifications queued for weekly report');
    } catch (error) {
      logger.error({ error }, 'Failed to notify admins of compliance report');
    }
  }

  /**
   * Build email body for report notification
   */
  private buildReportNotificationEmail(reportData: WeeklyReportData, reportPath: string): string {
    const { summary } = reportData;
    
    return `
Weekly Compliance Report Summary

The weekly compliance report has been generated and is ready for review.

Key Metrics:
- Venues Verified: ${summary.totalVenuesVerified}
- Venues Pending: ${summary.totalVenuesPending}
- OFAC Matches: ${summary.ofacMatches}
- New Risk Flags: ${summary.riskFlagsCreated}
- High Risk Venues: ${summary.highRiskVenues}

${summary.ofacMatches > 0 || summary.highRiskVenues > 0 ? 
  '⚠️ ATTENTION REQUIRED: There are items requiring manual review.' : 
  '✅ No critical issues requiring immediate attention.'}

View the full report in the Compliance Dashboard or download from:
${process.env.ADMIN_DASHBOARD_URL || 'https://admin.tickettoken.com'}/compliance/reports

Report File: ${path.basename(reportPath)}

---
This is an automated message from TicketToken Compliance Service.
    `.trim();
  }
}

export const schedulerService = new SchedulerService();
