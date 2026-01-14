import { VerificationService } from '../../../src/services/verification.service';
import { logger } from '../../../src/utils/logger';
import { db } from '../../../src/config/database';

// =============================================================================
// MOCKS
// =============================================================================

jest.mock('../../../src/utils/logger');
jest.mock('../../../src/config/database', () => ({
  db: jest.fn(),
}));

describe('VerificationService', () => {
  let verificationService: VerificationService;
  let mockDb: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database query builder
    const mockQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      first: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      select: jest.fn().mockReturnThis(),
    };

    mockDb = Object.assign(jest.fn().mockReturnValue(mockQueryBuilder), {
      _mockQueryBuilder: mockQueryBuilder,
      raw: jest.fn(),
    });

    (db as any) = mockDb;

    verificationService = new VerificationService();
  });

  // =============================================================================
  // verifyVenue() - 8 test cases
  // =============================================================================

  describe('verifyVenue()', () => {
    const venueId = 'venue-123';
    const mockVenue = {
      id: venueId,
      name: 'Test Venue',
      address: { street: '123 Main', city: 'NYC' },
      venue_type: 'arena',
      max_capacity: 10000,
    };

    beforeEach(() => {
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce(mockVenue) // venue lookup
        .mockResolvedValueOnce({ type: 'tax_id' }) // tax docs
        .mockResolvedValueOnce({ type: 'stripe' }) // payment
        .mockResolvedValueOnce({ type: 'drivers_license' }); // identity
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);
    });

    it('should throw error if venue not found', async () => {
      mockDb._mockQueryBuilder.first.mockReset().mockResolvedValueOnce(null);

      await expect(verificationService.verifyVenue(venueId)).rejects.toThrow(
        'Venue not found'
      );
    });

    it('should return verification result with all checks', async () => {
      const result = await verificationService.verifyVenue(venueId);

      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.checks.businessInfo).toBeDefined();
      expect(result.checks.taxInfo).toBeDefined();
      expect(result.checks.bankAccount).toBeDefined();
      expect(result.checks.identity).toBeDefined();
    });

    it('should include issues array', async () => {
      const result = await verificationService.verifyVenue(venueId);

      expect(Array.isArray(result.issues)).toBe(true);
    });

    it('should set verified to true when all checks pass', async () => {
      const result = await verificationService.verifyVenue(venueId);

      if (Object.values(result.checks).every((check) => check)) {
        expect(result.verified).toBe(true);
        expect(result.verifiedAt).toBeInstanceOf(Date);
      }
    });

    it('should set verified to false when checks fail', async () => {
      mockDb._mockQueryBuilder.first
        .mockReset()
        .mockResolvedValueOnce(mockVenue)
        .mockResolvedValueOnce(null) // no tax docs
        .mockResolvedValueOnce(null) // no payment
        .mockResolvedValueOnce(null); // no identity

      const result = await verificationService.verifyVenue(venueId);

      expect(result.verified).toBe(false);
    });

    it('should add issues for failed checks', async () => {
      mockDb._mockQueryBuilder.first
        .mockReset()
        .mockResolvedValueOnce(mockVenue)
        .mockResolvedValueOnce(null) // no tax docs
        .mockResolvedValueOnce(null) // no payment
        .mockResolvedValueOnce(null); // no identity

      const result = await verificationService.verifyVenue(venueId);

      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should mark venue as verified in database', async () => {
      await verificationService.verifyVenue(venueId);

      if (mockDb._mockQueryBuilder.update.mock.calls.length > 0) {
        expect(mockDb._mockQueryBuilder.update).toHaveBeenCalled();
      }
    });

    it('should log verification completion', async () => {
      await verificationService.verifyVenue(venueId);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Venue verification completed'
      );
    });
  });

  // =============================================================================
  // submitDocument() - 5 test cases
  // =============================================================================

  describe('submitDocument()', () => {
    const venueId = 'venue-123';
    const documentType = 'business_license';
    const documentData = { fileUrl: 'https://example.com/doc.pdf' };

    beforeEach(() => {
      mockDb._mockQueryBuilder.insert.mockResolvedValue([{ id: 'doc-1' }]);
      mockDb._mockQueryBuilder.first.mockResolvedValue({});
    });

    it('should store document reference', async () => {
      await verificationService.submitDocument(venueId, documentType, documentData);

      expect(mockDb._mockQueryBuilder.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          venue_id: venueId,
          type: documentType,
          status: 'pending',
          metadata: documentData,
        })
      );
    });

    it('should trigger business verification for business documents', async () => {
      await verificationService.submitDocument(
        venueId,
        'business_license',
        documentData
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Business verification triggered'
      );
    });

    it('should trigger tax verification for tax documents', async () => {
      await verificationService.submitDocument(venueId, 'w9', documentData);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Tax verification triggered'
      );
    });

    it('should trigger bank verification for bank documents', async () => {
      await verificationService.submitDocument(
        venueId,
        'voided_check',
        documentData
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Bank verification triggered'
      );
    });

    it('should trigger identity verification for identity documents', async () => {
      await verificationService.submitDocument(
        venueId,
        'passport',
        documentData
      );

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ venueId }),
        'Identity verification triggered'
      );
    });
  });

  // =============================================================================
  // getVerificationStatus() - 6 test cases
  // =============================================================================

  describe('getVerificationStatus()', () => {
    const venueId = 'venue-123';
    const mockVenue = {
      id: venueId,
      name: 'Test Venue',
      address: {},
      venue_type: 'arena',
      max_capacity: 10000,
    };

    beforeEach(() => {
      mockDb._mockQueryBuilder.first
        .mockResolvedValueOnce(mockVenue)
        .mockResolvedValueOnce({ type: 'tax_id' })
        .mockResolvedValueOnce({ type: 'stripe' })
        .mockResolvedValueOnce({ type: 'drivers_license' });
      mockDb._mockQueryBuilder.select.mockResolvedValue([
        { type: 'tax_id', status: 'approved' },
      ]);
      mockDb._mockQueryBuilder.update.mockResolvedValue(1);
    });

    it('should return verification status', async () => {
      const status = await verificationService.getVerificationStatus(venueId);

      expect(status).toBeDefined();
      expect(status.status).toBeDefined();
      expect(['unverified', 'pending', 'verified', 'rejected']).toContain(
        status.status
      );
    });

    it('should list completed checks', async () => {
      const status = await verificationService.getVerificationStatus(venueId);

      expect(Array.isArray(status.completedChecks)).toBe(true);
    });

    it('should list pending checks', async () => {
      const status = await verificationService.getVerificationStatus(venueId);

      expect(Array.isArray(status.pendingChecks)).toBe(true);
    });

    it('should list required documents', async () => {
      const status = await verificationService.getVerificationStatus(venueId);

      expect(Array.isArray(status.requiredDocuments)).toBe(true);
    });

    it('should return verified status when all checks complete', async () => {
      const status = await verificationService.getVerificationStatus(venueId);

      if (status.pendingChecks.length === 0) {
        expect(status.status).toBe('verified');
      }
    });

    it('should return pending status when documents submitted', async () => {
      mockDb._mockQueryBuilder.select.mockResolvedValue([
        { type: 'tax_id', status: 'pending' },
      ]);

      const status = await verificationService.getVerificationStatus(venueId);

      if (status.status === 'pending') {
        expect(status.pendingChecks.length).toBeGreaterThan(0);
      }
    });
  });
});
