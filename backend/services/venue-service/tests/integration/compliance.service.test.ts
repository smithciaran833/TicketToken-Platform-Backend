/**
 * ComplianceService Integration Tests
 */

import {
  setupTestApp,
  teardownTestApp,
  cleanDatabase,
  TestContext,
  TEST_TENANT_ID,
  TEST_USER_ID,
  TEST_VENUE_ID,
  createTestVenue,
  db,
  pool
} from './setup';
import { ComplianceService } from '../../src/services/compliance.service';
import { v4 as uuidv4 } from 'uuid';

describe('ComplianceService', () => {
  let context: TestContext;
  let complianceService: ComplianceService;

  beforeAll(async () => {
    context = await setupTestApp();
    complianceService = new ComplianceService();
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(context);
  });

  beforeEach(async () => {
    await cleanDatabase(db);
    // Clean compliance-specific tables
    await pool.query('DELETE FROM venue_compliance_reports WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM venue_compliance_reviews WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM venue_compliance WHERE venue_id = $1', [TEST_VENUE_ID]);
    await pool.query('DELETE FROM venue_documents WHERE venue_id = $1', [TEST_VENUE_ID]);
  });

  // ==========================================================================
  // generateComplianceReport
  // ==========================================================================
  describe('generateComplianceReport', () => {
    it('should generate a compliance report for a venue', async () => {
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      expect(report).toBeDefined();
      expect(report.venueId).toBe(TEST_VENUE_ID);
      expect(report.generatedAt).toBeDefined();
      expect(report.overallStatus).toBeDefined();
      expect(['compliant', 'non_compliant', 'review_needed']).toContain(report.overallStatus);
    });

    it('should include all compliance categories', async () => {
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      expect(report.categories).toBeDefined();
      expect(report.categories.dataProtection).toBeDefined();
      expect(report.categories.ageVerification).toBeDefined();
      expect(report.categories.accessibility).toBeDefined();
      expect(report.categories.financialReporting).toBeDefined();
      expect(report.categories.licensing).toBeDefined();
    });

    it('should generate recommendations for non-compliant checks', async () => {
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);

      // Each recommendation should have required fields
      report.recommendations.forEach(rec => {
        expect(rec.category).toBeDefined();
        expect(rec.issue).toBeDefined();
        expect(rec.recommendation).toBeDefined();
        expect(rec.priority).toBeDefined();
        expect(['immediate', 'high', 'medium', 'low']).toContain(rec.priority);
      });
    });

    it('should store the compliance report in database', async () => {
      await complianceService.generateComplianceReport(TEST_VENUE_ID);

      const stored = await pool.query(
        'SELECT * FROM venue_compliance_reports WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
        [TEST_VENUE_ID]
      );

      expect(stored.rows.length).toBe(1);
      expect(stored.rows[0].report).toBeDefined();
    });

    it('should throw error for non-existent venue', async () => {
      const fakeId = uuidv4();

      await expect(
        complianceService.generateComplianceReport(fakeId)
      ).rejects.toThrow('Venue not found');
    });

    it('should set next review date 90 days in future', async () => {
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      const now = new Date();
      const expectedReviewDate = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

      // Allow 1 day tolerance
      const diffDays = Math.abs(
        (new Date(report.nextReviewDate).getTime() - expectedReviewDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      expect(diffDays).toBeLessThan(1);
    });
  });

  // ==========================================================================
  // scheduleComplianceReview
  // ==========================================================================
  describe('scheduleComplianceReview', () => {
    it('should schedule a compliance review', async () => {
      const reviewDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

      await complianceService.scheduleComplianceReview(TEST_VENUE_ID, reviewDate);

      const scheduled = await pool.query(
        'SELECT * FROM venue_compliance_reviews WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
        [TEST_VENUE_ID]
      );

      expect(scheduled.rows.length).toBe(1);
      expect(scheduled.rows[0].status).toBe('scheduled');
      expect(new Date(scheduled.rows[0].scheduled_date).toDateString()).toBe(reviewDate.toDateString());
    });

    it('should allow multiple scheduled reviews', async () => {
      const reviewDate1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const reviewDate2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

      await complianceService.scheduleComplianceReview(TEST_VENUE_ID, reviewDate1);
      await complianceService.scheduleComplianceReview(TEST_VENUE_ID, reviewDate2);

      const scheduled = await pool.query(
        'SELECT * FROM venue_compliance_reviews WHERE venue_id = $1',
        [TEST_VENUE_ID]
      );

      expect(scheduled.rows.length).toBe(2);
    });
  });

  // ==========================================================================
  // updateComplianceSettings
  // ==========================================================================
  describe('updateComplianceSettings', () => {
    it('should create compliance settings for venue', async () => {
      const settings = {
        gdpr: { enabled: true, privacyPolicyUrl: 'https://example.com/privacy' },
        dataRetention: { customerDataDays: 365 },
      };

      await complianceService.updateComplianceSettings(TEST_VENUE_ID, settings);

      const result = await pool.query(
        'SELECT * FROM venue_compliance WHERE venue_id = $1',
        [TEST_VENUE_ID]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].settings).toEqual(settings);
    });

    it('should update existing compliance settings', async () => {
      // Create initial settings
      await pool.query(
        'INSERT INTO venue_compliance (venue_id, settings) VALUES ($1, $2)',
        [TEST_VENUE_ID, JSON.stringify({ gdpr: { enabled: false } })]
      );

      const newSettings = {
        gdpr: { enabled: true, privacyPolicyUrl: 'https://example.com/privacy' },
      };

      await complianceService.updateComplianceSettings(TEST_VENUE_ID, newSettings);

      const result = await pool.query(
        'SELECT * FROM venue_compliance WHERE venue_id = $1',
        [TEST_VENUE_ID]
      );

      expect(result.rows.length).toBe(1);
      expect(result.rows[0].settings).toEqual(newSettings);
    });

    it('should trigger compliance review for critical settings changes', async () => {
      const criticalSettings = {
        gdpr: { enabled: true },
      };

      await complianceService.updateComplianceSettings(TEST_VENUE_ID, criticalSettings);

      // Check if a review was scheduled
      const reviews = await pool.query(
        'SELECT * FROM venue_compliance_reviews WHERE venue_id = $1',
        [TEST_VENUE_ID]
      );

      expect(reviews.rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ==========================================================================
  // Compliance checks with proper setup
  // ==========================================================================
  describe('compliance checks with documents', () => {
    it('should mark financial reporting compliant with tax docs', async () => {
      // Add approved tax document
      await pool.query(
        `INSERT INTO venue_documents (venue_id, document_type, file_url, status)
         VALUES ($1, $2, $3, $4)`,
        [TEST_VENUE_ID, 'tax_id', 'https://example.com/tax.pdf', 'approved']
      );

      // Add payment integration
      await pool.query(
        `INSERT INTO venue_integrations (venue_id, integration_type, is_active)
         VALUES ($1, $2, $3)`,
        [TEST_VENUE_ID, 'stripe', true]
      );

      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      expect(report.categories.financialReporting.status).toBe('compliant');
    });

    it('should mark licensing compliant with business license', async () => {
      // Add approved business license
      await pool.query(
        `INSERT INTO venue_documents (venue_id, document_type, file_url, status)
         VALUES ($1, $2, $3, $4)`,
        [TEST_VENUE_ID, 'business_license', 'https://example.com/license.pdf', 'approved']
      );

      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      const businessLicenseCheck = report.categories.licensing.checks.find(
        (c: any) => c.name === 'Business License'
      );
      expect(businessLicenseCheck?.passed).toBe(true);
    });

    it('should require entertainment license for comedy clubs', async () => {
      // Create a comedy club venue
      const comedyVenue = await createTestVenue(db, {
        name: 'Comedy Club',
        slug: `comedy-${Date.now()}`,
        venue_type: 'comedy_club',
      });

      const report = await complianceService.generateComplianceReport(comedyVenue.id);

      const entertainmentCheck = report.categories.licensing.checks.find(
        (c: any) => c.name === 'Entertainment License'
      );
      expect(entertainmentCheck).toBeDefined();
    });
  });

  // ==========================================================================
  // Age verification compliance
  // ==========================================================================
  describe('age verification compliance', () => {
    it('should mark age verification non-compliant for bars without verification', async () => {
      // Create a bar venue
      const barVenue = await createTestVenue(db, {
        name: 'Test Bar',
        slug: `bar-${Date.now()}`,
        venue_type: 'bar',
      });

      const report = await complianceService.generateComplianceReport(barVenue.id);

      // Bars require age verification
      const ageCheck = report.categories.ageVerification.checks.find(
        (c: any) => c.name === 'Age Verification System'
      );
      expect(ageCheck?.passed).toBe(false);
      expect(ageCheck?.severity).toBe('critical');
    });

    it('should mark age verification compliant for bars with verification enabled', async () => {
      // Create a bar venue
      const barVenue = await createTestVenue(db, {
        name: 'Verified Bar',
        slug: `verified-bar-${Date.now()}`,
        venue_type: 'bar',
      });

      // Add compliance settings with age verification
      await pool.query(
        'INSERT INTO venue_compliance (venue_id, settings) VALUES ($1, $2)',
        [barVenue.id, JSON.stringify({
          ageRestriction: { enabled: true, minimumAge: 21, verificationRequired: true }
        })]
      );

      const report = await complianceService.generateComplianceReport(barVenue.id);

      const ageCheck = report.categories.ageVerification.checks.find(
        (c: any) => c.name === 'Age Verification System'
      );
      expect(ageCheck?.passed).toBe(true);
    });

    it('should not require age verification for theaters', async () => {
      // Theater (TEST_VENUE_ID) doesn't need age verification
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      const ageCheck = report.categories.ageVerification.checks.find(
        (c: any) => c.name === 'Age Verification System'
      );
      expect(ageCheck?.passed).toBe(true);
    });
  });

  // ==========================================================================
  // Data protection compliance
  // ==========================================================================
  describe('data protection compliance', () => {
    it('should mark GDPR compliant when properly configured', async () => {
      await pool.query(
        'INSERT INTO venue_compliance (venue_id, settings) VALUES ($1, $2)',
        [TEST_VENUE_ID, JSON.stringify({
          gdpr: { enabled: true, privacyPolicyUrl: 'https://example.com/privacy' },
          dataRetention: { customerDataDays: 365 }
        })]
      );

      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      const gdprCheck = report.categories.dataProtection.checks.find(
        (c: any) => c.name === 'GDPR Compliance'
      );
      expect(gdprCheck?.passed).toBe(true);
    });

    it('should mark data retention configured when set', async () => {
      await pool.query(
        'INSERT INTO venue_compliance (venue_id, settings) VALUES ($1, $2)',
        [TEST_VENUE_ID, JSON.stringify({
          dataRetention: { customerDataDays: 730 }
        })]
      );

      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      const retentionCheck = report.categories.dataProtection.checks.find(
        (c: any) => c.name === 'Data Retention Policy'
      );
      expect(retentionCheck?.passed).toBe(true);
      expect(retentionCheck?.details).toContain('730 days');
    });
  });

  // ==========================================================================
  // Recommendations ordering
  // ==========================================================================
  describe('recommendations', () => {
    it('should order recommendations by priority', async () => {
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      if (report.recommendations.length > 1) {
        const priorities = report.recommendations.map(r => r.priority);
        const priorityOrder = { immediate: 0, high: 1, medium: 2, low: 3 };

        for (let i = 1; i < priorities.length; i++) {
          expect(priorityOrder[priorities[i] as keyof typeof priorityOrder])
            .toBeGreaterThanOrEqual(priorityOrder[priorities[i - 1] as keyof typeof priorityOrder]);
        }
      }
    });

    it('should include due dates based on severity', async () => {
      const report = await complianceService.generateComplianceReport(TEST_VENUE_ID);

      report.recommendations.forEach(rec => {
        if (rec.dueDate) {
          const dueDate = new Date(rec.dueDate);
          expect(dueDate.getTime()).toBeGreaterThan(Date.now());
        }
      });
    });
  });
});
