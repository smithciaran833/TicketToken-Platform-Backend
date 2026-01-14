import { ComplianceService } from '../../../src/services/compliance.service';
import { logger } from '../../../src/utils/logger';
import { db } from '../../../src/config/database';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(),
}));

describe('ComplianceService', () => {
  let complianceService: ComplianceService;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database query builder with all needed methods
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
    });

    (db as any) = mockDb;

    complianceService = new ComplianceService();
  });

  // =============================================================================
  // generateComplianceReport() - 8 test cases
  // =============================================================================

  describe('generateComplianceReport()', () => {
    const venueId = 'venue-123';
    const mockVenue = {
      id: venueId,
      name: 'Test Venue',
      tenant_id: 'tenant-123',
    };

    beforeEach(() => {
      // Mock all database calls with proper responses
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce(mockVenue) // venue lookup
        .mockResolvedValueOnce({ settings: { enabled: true, privacyPolicyUrl: 'https://privacy.com' } }) // GDPR
        .mockResolvedValueOnce({ configured: true, customerDataDays: 365 }) // retention
        .mockResolvedValueOnce({ enabled: true, minimumAge: 18, verificationRequired: true }) // age verification
        .mockResolvedValueOnce({ wheelchairAccessible: true, hasAccessibilityInfo: true }) // accessibility
        .mockResolvedValueOnce({ integration: 'tax' }) // tax config
        .mockResolvedValueOnce({ integration: 'payout' }) // payout
        .mockResolvedValueOnce({ license: 'business' }) // business license
        .mockResolvedValueOnce({ license: 'entertainment' }); // entertainment license
      
      mockDb._mockQueryBuilder.insert.mockResolvedValue([{ id: 'report-1' }]);
    });

    it('should throw error if venue not found', async () => {
      mockDb._mockQueryBuilder.first.mockReset().mockResolvedValueOnce(null);

      await expect(
        complianceService.generateComplianceReport(venueId)
      ).rejects.toThrow('Venue not found');
    });

    it('should generate compliance report for venue', async () => {
      const report = await complianceService.generateComplianceReport(venueId);

      expect(report).toBeDefined();
      expect(report.venueId).toBe(venueId);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should include all compliance categories', async () => {
      const report = await complianceService.generateComplianceReport(venueId);

      expect(report.categories).toBeDefined();
      expect(report.categories.dataProtection).toBeDefined();
      expect(report.categories.ageVerification).toBeDefined();
      expect(report.categories.accessibility).toBeDefined();
      expect(report.categories.financialReporting).toBeDefined();
      expect(report.categories.licensing).toBeDefined();
    });

    it('should set next review date to 90 days', async () => {
      const report = await complianceService.generateComplianceReport(venueId);

      const expectedDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      const diff = Math.abs(report.nextReviewDate.getTime() - expectedDate.getTime());
      
      expect(diff).toBeLessThan(1000); // Within 1 second
    });

    it('should set overall status based on categories', async () => {
      const report = await complianceService.generateComplianceReport(venueId);

      expect(['compliant', 'non_compliant', 'review_needed']).toContain(
        report.overallStatus
      );
    });

    it('should generate recommendations', async () => {
      const report = await complianceService.generateComplianceReport(venueId);

      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should store compliance report', async () => {
      await complianceService.generateComplianceReport(venueId);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalled();
    });

    it('should log report generation', async () => {
      await complianceService.generateComplianceReport(venueId);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Compliance report generated'
      );
    });
  });

  // =============================================================================
  // scheduleComplianceReview() - 3 test cases
  // =============================================================================

  describe('scheduleComplianceReview()', () => {
    const venueId = 'venue-123';
    const reviewDate = new Date('2025-12-31');

    it('should schedule compliance review', async () => {
      mockDb._mockQueryBuilder.insert.mockResolvedValue([{ id: 'review-1' }]);

      await complianceService.scheduleComplianceReview(venueId, reviewDate);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          scheduled_date: reviewDate,
          status: 'scheduled',
        })
      );
    });

    it('should log scheduled review', async () => {
      mockDb._mockQueryBuilder.insert.mockResolvedValue([{ id: 'review-1' }]);

      await complianceService.scheduleComplianceReview(venueId, reviewDate);

      expect(logger.info).toHaveBeenCalledWith(
        { venueId, reviewDate },
        'Compliance review scheduled'
      );
    });

    it('should handle database errors', async () => {
      mockDb._mockQueryBuilder.insert.mockRejectedValue(new Error('DB error'));

      await expect(
        complianceService.scheduleComplianceReview(venueId, reviewDate)
      ).rejects.toThrow('DB error');
    });
  });

  // =============================================================================
  // updateComplianceSettings() - 5 test cases
  // =============================================================================

  describe('updateComplianceSettings()', () => {
    const venueId = 'venue-123';
    const settings = { gdpr: true, ageRestriction: 18 };

    it('should update existing compliance settings', async () => {
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce({}); // For checkComplianceImpact
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      await complianceService.updateComplianceSettings(venueId, settings);

      expect(mockDb._mockQueryBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({ settings })
      );
    });

    it('should create new compliance settings if not exists', async () => {
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({}); // For checkComplianceImpact
      mockDb._mockQueryBuilder.insert.mockResolvedValue([{ id: 'new-1' }]);

      await complianceService.updateComplianceSettings(venueId, settings);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          settings,
        })
      );
    });

    it('should check compliance impact after update', async () => {
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce({});
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      await complianceService.updateComplianceSettings(venueId, settings);

      expect(mockDb).toHaveBeenCalled();
    });

    it('should log warning for critical changes', async () => {
      const criticalSettings = { gdpr: false, ageRestriction: 21 };
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce({ id: 'existing-1' })
        .mockResolvedValueOnce({});
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);

      await complianceService.updateComplianceSettings(venueId, criticalSettings);

      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Critical compliance settings changed'
      );
    });

    it('should handle database errors', async () => {
      mockDb._mockQueryBuilder.first.mockRejectedValue(new Error('DB error'));

      await expect(
        complianceService.updateComplianceSettings(venueId, settings)
      ).rejects.toThrow('DB error');
    });
  });
});
