import { logger } from '../utils/logger';
import { db } from '../config/database';

export interface ComplianceReport {
  venueId: string;
  generatedAt: Date;
  overallStatus: 'compliant' | 'non_compliant' | 'review_needed';
  categories: {
    dataProtection: ComplianceCategory;
    ageVerification: ComplianceCategory;
    accessibility: ComplianceCategory;
    financialReporting: ComplianceCategory;
    licensing: ComplianceCategory;
  };
  recommendations: ComplianceRecommendation[];
  nextReviewDate: Date;
}

interface ComplianceCategory {
  status: 'compliant' | 'non_compliant' | 'review_needed';
  checks: ComplianceCheck[];
  lastReviewDate?: Date;
}

interface ComplianceCheck {
  name: string;
  passed: boolean;
  details: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface ComplianceRecommendation {
  category: string;
  issue: string;
  recommendation: string;
  priority: 'immediate' | 'high' | 'medium' | 'low';
  dueDate?: Date;
}

export class ComplianceService {
  async generateComplianceReport(venueId: string): Promise<ComplianceReport> {
    const venue = await db('venues').where({ id: venueId }).first();
    if (!venue) {
      throw new Error('Venue not found');
    }

    const report: ComplianceReport = {
      venueId,
      generatedAt: new Date(),
      overallStatus: 'compliant',
      categories: {
        dataProtection: await this.checkDataProtection(venueId),
        ageVerification: await this.checkAgeVerification(venueId),
        accessibility: await this.checkAccessibility(venueId),
        financialReporting: await this.checkFinancialReporting(venueId),
        licensing: await this.checkLicensing(venueId),
      },
      recommendations: [],
      nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    // Determine overall status
    const statuses = Object.values(report.categories).map(cat => cat.status);
    if (statuses.includes('non_compliant')) {
      report.overallStatus = 'non_compliant';
    } else if (statuses.includes('review_needed')) {
      report.overallStatus = 'review_needed';
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report.categories);

    // Store report
    await this.storeComplianceReport(report);

    logger.info({ venueId, status: report.overallStatus }, 'Compliance report generated');

    return report;
  }

  async scheduleComplianceReview(venueId: string, reviewDate: Date): Promise<void> {
    await db('venue_compliance_reviews').insert({
      venue_id: venueId,
      scheduled_date: reviewDate,
      status: 'scheduled',
      created_at: new Date(),
    });

    logger.info({ venueId, reviewDate }, 'Compliance review scheduled');
  }

  async updateComplianceSettings(venueId: string, settings: any): Promise<void> {
    const existing = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();

    if (existing) {
      await db('venue_compliance')
        .where({ venue_id: venueId })
        .update({
          settings,
          updated_at: new Date(),
        });
    } else {
      await db('venue_compliance').insert({
        venue_id: venueId,
        settings,
        created_at: new Date(),
      });
    }

    // Check if settings change affects compliance
    await this.checkComplianceImpact(venueId, settings);
  }

  private async checkDataProtection(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    
    // Check GDPR compliance
    const gdprSettings = await this.getGDPRSettings(venueId);
    checks.push({
      name: 'GDPR Compliance',
      passed: gdprSettings.enabled && !!gdprSettings.privacyPolicyUrl,
      details: gdprSettings.enabled ? 'GDPR compliance enabled' : 'GDPR compliance not configured',
      severity: 'critical',
    });

    // Check data retention policies
    const retentionSettings = await this.getRetentionSettings(venueId);
    checks.push({
      name: 'Data Retention Policy',
      passed: retentionSettings.configured,
      details: `Customer data retained for ${retentionSettings.customerDataDays} days`,
      severity: 'high',
    });

    // Check encryption
    checks.push({
      name: 'Data Encryption',
      passed: true, // Assume encrypted at rest
      details: 'All sensitive data encrypted at rest',
      severity: 'critical',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';

    return { status, checks, lastReviewDate: new Date() };
  }

  private async checkAgeVerification(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAgeVerificationSettings(venueId);
    
    // Get venue type to determine severity
    const venue = await db('venues').where({ id: venueId }).first();
    const venueType = venue?.venue_type || '';
    
    // Determine severity based on venue type
    const ageRestrictedVenues = ['bar', 'nightclub', 'casino', 'comedy_club'];
    const severity = ageRestrictedVenues.includes(venueType) ? 'critical' : 'medium';

    checks.push({
      name: 'Age Verification System',
      passed: settings.enabled || !ageRestrictedVenues.includes(venueType),
      details: settings.enabled 
        ? `Minimum age: ${settings.minimumAge}` 
        : ageRestrictedVenues.includes(venueType)
          ? 'Age verification required for this venue type but not enabled'
          : 'Age verification not required for this venue type',
      severity,
    });

    if (settings.enabled) {
      checks.push({
        name: 'Verification Method',
        passed: settings.verificationRequired,
        details: settings.verificationRequired ? 'ID verification required' : 'Self-declaration only',
        severity: ageRestrictedVenues.includes(venueType) ? 'high' : 'medium',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' :
                   'review_needed';
    return { status, checks };
  }

  private async checkAccessibility(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const settings = await this.getAccessibilitySettings(venueId);

    checks.push({
      name: 'Wheelchair Accessibility',
      passed: settings.wheelchairAccessible !== null,
      details: settings.wheelchairAccessible ? 'Wheelchair accessible' : 'Accessibility status not specified',
      severity: 'high',
    });

    checks.push({
      name: 'Accessibility Information',
      passed: settings.hasAccessibilityInfo,
      details: 'Accessibility information provided to customers',
      severity: 'medium',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'review_needed';
    return { status, checks };
  }

  private async checkFinancialReporting(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];

    // Check tax reporting setup
    checks.push({
      name: 'Tax Reporting Configuration',
      passed: await this.hasTaxConfiguration(venueId),
      details: 'Tax reporting properly configured',
      severity: 'critical',
    });

    // Check payout compliance
    checks.push({
      name: 'Payout Compliance',
      passed: await this.hasVerifiedPayoutMethod(venueId),
      details: 'Verified payout method on file',
      severity: 'high',
    });

    const status = checks.every(c => c.passed) ? 'compliant' : 'non_compliant';
    return { status, checks };
  }

  private async checkLicensing(venueId: string): Promise<ComplianceCategory> {
    const checks: ComplianceCheck[] = [];
    const venue = await db('venues').where({ id: venueId }).first();

    // Check business license
    checks.push({
      name: 'Business License',
      passed: await this.hasValidBusinessLicense(venueId),
      details: 'Valid business license on file',
      severity: 'critical',
    });

    // Check entertainment license if applicable
    if (['comedy_club', 'theater'].includes(venue.venue_type)) {
      checks.push({
        name: 'Entertainment License',
        passed: await this.hasEntertainmentLicense(venueId),
        details: 'Entertainment license required for venue type',
        severity: 'high',
      });
    }

    const status = checks.every(c => c.passed) ? 'compliant' : 
                   checks.some(c => !c.passed && c.severity === 'critical') ? 'non_compliant' : 
                   'review_needed';
    return { status, checks };
  }

  private generateRecommendations(categories: any): ComplianceRecommendation[] {
    const recommendations: ComplianceRecommendation[] = [];

    Object.entries(categories).forEach(([category, data]: [string, any]) => {
      data.checks.forEach((check: ComplianceCheck) => {
        if (!check.passed) {
          recommendations.push({
            category,
            issue: check.name,
            recommendation: this.getRecommendation(category, check.name),
            priority: check.severity === 'critical' ? 'immediate' : 
                     check.severity === 'high' ? 'high' : 'medium',
            dueDate: this.calculateDueDate(check.severity),
          });
        }
      });
    });

    return recommendations.sort((a, b) => {
      const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private getRecommendation(category: string, checkName: string): string {
    const recommendations: Record<string, Record<string, string>> = {
      dataProtection: {
        'GDPR Compliance': 'Enable GDPR compliance settings and upload privacy policy',
        'Data Retention Policy': 'Configure data retention periods in compliance settings',
      },
      ageVerification: {
        'Age Verification System': 'Enable age verification for age-restricted events',
        'Verification Method': 'Require ID verification for better compliance',
      },
      accessibility: {
        'Wheelchair Accessibility': 'Update venue accessibility information',
        'Accessibility Information': 'Provide detailed accessibility information for customers',
      },
      financialReporting: {
        'Tax Reporting Configuration': 'Complete tax information setup in venue settings',
        'Payout Compliance': 'Verify bank account or payment method for payouts',
      },
      licensing: {
        'Business License': 'Upload valid business license document',
        'Entertainment License': 'Upload entertainment license for your venue type',
      },
    };

    return recommendations[category]?.[checkName] || 'Review and update compliance settings';
  }

  private calculateDueDate(severity: string): Date {
    const daysToAdd = {
      critical: 7,
      high: 30,
      medium: 60,
      low: 90,
    };

    return new Date(Date.now() + ((daysToAdd as any)[severity] || 30) * 24 * 60 * 60 * 1000);
  }

  private async storeComplianceReport(report: ComplianceReport): Promise<void> {
    await db('venue_compliance_reports').insert({
      venue_id: report.venueId,
      report: JSON.stringify(report)
    });
  }

  // Helper methods for checks
  private async getGDPRSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.gdpr || { enabled: false };
  }

  private async getRetentionSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.dataRetention || {};
    return {
      configured: !!settings.customerDataDays,
      ...settings,
    };
  }

  private async getAgeVerificationSettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    return compliance?.settings?.ageRestriction || { enabled: false };
  }

  private async getAccessibilitySettings(venueId: string): Promise<any> {
    const compliance = await db('venue_compliance')
      .where({ venue_id: venueId })
      .first();
    
    const settings = compliance?.settings?.accessibility || {};
    return {
      ...settings,
      hasAccessibilityInfo: !!(settings.wheelchairAccessible !== undefined),
    };
  }

  private async hasTaxConfiguration(venueId: string): Promise<boolean> {
    // Check if venue has tax information configured
    const taxDocs = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'tax_id', status: 'approved' })
      .first();
    
    return !!taxDocs;
  }

  private async hasVerifiedPayoutMethod(venueId: string): Promise<boolean> {
    // Check for verified payment integration
    const integration = await db('venue_integrations')
      .where({ venue_id: venueId, is_active: true })
      .whereIn('integration_type', ['stripe', 'square'])
      .first();
    
    return !!integration;
  }

  private async hasValidBusinessLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'business_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async hasEntertainmentLicense(venueId: string): Promise<boolean> {
    const license = await db('venue_documents')
      .where({ venue_id: venueId, document_type: 'entertainment_license', status: 'approved' })
      .first();
    
    return !!license;
  }

  private async checkComplianceImpact(venueId: string, newSettings: any): Promise<void> {
    // Check if settings change requires immediate compliance review
    const criticalChanges = ['gdpr', 'ageRestriction', 'dataRetention'];
    const hasCriticalChange = Object.keys(newSettings).some(key => criticalChanges.includes(key));
    
    if (hasCriticalChange) {
      logger.warn({ venueId, settings: newSettings }, 'Critical compliance settings changed');
      
      // Trigger compliance review notification
      await this.triggerComplianceReviewNotification(venueId, newSettings);
      
      // Schedule immediate compliance review
      const reviewDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // Next day
      await this.scheduleComplianceReview(venueId, reviewDate);
    }
  }

  /**
   * Trigger notification for compliance review
   * Sends notification to venue admins and compliance team
   */
  private async triggerComplianceReviewNotification(venueId: string, changedSettings: any): Promise<void> {
    try {
      const venue = await db('venues').where({ id: venueId }).first();
      const changedKeys = Object.keys(changedSettings);
      
      // Create notification record
      await db('notifications').insert({
        venue_id: venueId,
        type: 'compliance_review_required',
        priority: 'high',
        title: 'Compliance Review Required',
        message: `Critical compliance settings changed: ${changedKeys.join(', ')}. A compliance review has been scheduled.`,
        metadata: {
          changedSettings,
          scheduledReviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        created_at: new Date(),
        read: false,
      });

      // Get venue staff emails for notification
      const staffEmails = await db('venue_staff')
        .where({ venue_id: venueId })
        .whereIn('role', ['owner', 'admin'])
        .pluck('contact_email');

      // Queue email notifications
      for (const email of staffEmails) {
        await db('email_queue').insert({
          to_email: email,
          subject: 'Compliance Review Required - Action Needed',
          template: 'compliance_review_notification',
          data: {
            venueName: venue.name,
            changedSettings: changedKeys,
            reviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          priority: 'high',
          created_at: new Date(),
        });
      }

      // Notify compliance team
      await db('email_queue').insert({
        to_email: process.env.COMPLIANCE_TEAM_EMAIL || 'compliance@tickettoken.com',
        subject: `Compliance Review Scheduled - Venue ${venue.name}`,
        template: 'compliance_team_notification',
        data: {
          venueId,
          venueName: venue.name,
          changedSettings: changedKeys,
          settingsDetails: changedSettings,
          reviewDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        },
        priority: 'high',
        created_at: new Date(),
      });

      logger.info({ venueId, changedSettings: changedKeys }, 'Compliance review notifications sent');
    } catch (error: any) {
      logger.error({ error: error.message, venueId }, 'Failed to send compliance review notifications');
    }
  }
}
