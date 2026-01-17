/**
 * Unit Tests for BatchService
 *
 * Tests 1099 generation, OFAC updates, and daily compliance checks
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TENANT_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};
jest.mock('../../../src/utils/logger', () => ({
  logger: mockLogger
}));

const mockNotificationService = {
  sendEmail: jest.fn()
};
jest.mock('../../../src/services/notification.service', () => ({
  notificationService: mockNotificationService
}));

// Import module under test AFTER mocks
import { BatchService, batchService } from '../../../src/services/batch.service';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_YEAR = 2025;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockVenue(overrides: Partial<{
  venue_id: string;
  business_name: string;
  ein: string;
  total_sales: number;
  transaction_count: number;
}> = {}) {
  return {
    venue_id: 'venue-123',
    business_name: 'Test Venue LLC',
    ein: '12-3456789',
    total_sales: 1000,
    transaction_count: 50,
    ...overrides
  };
}

function createMonthlyBreakdownResult() {
  return {
    rows: [
      { month: 1, total: '100' },
      { month: 2, total: '150' },
      { month: 3, total: '200' }
    ]
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('BatchService', () => {
  let service: BatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BatchService();
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockNotificationService.sendEmail.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // generateYear1099Forms Tests
  // ===========================================================================

  describe('generateYear1099Forms', () => {
    describe('job tracking', () => {
      it('should create batch job record at start', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT job
          .mockResolvedValueOnce({ rows: [] }); // SELECT venues (empty)

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO compliance_batch_jobs'),
          [TEST_TENANT_ID]
        );
      });

      it('should set initial job status to running', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [] });

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("'1099_generation', 'running'"),
          expect.any(Array)
        );
      });

      it('should mark job as completed when finished', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT job
          .mockResolvedValueOnce({ rows: [] }); // SELECT venues

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'completed'"),
          expect.any(Array)
        );
      });
    });

    describe('venue selection', () => {
      it('should query venues with sales >= $600 threshold', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT job
          .mockResolvedValueOnce({ rows: [] }); // SELECT venues

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('HAVING SUM(t.amount) >= 600'),
          [TEST_YEAR, TEST_TENANT_ID]
        );
      });

      it('should filter by year and tenant_id', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [] });

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        const venueQuery = mockDbQuery.mock.calls.find(call =>
          call[0].includes('venue_verifications')
        );
        expect(venueQuery[1]).toContain(TEST_YEAR);
        expect(venueQuery[1]).toContain(TEST_TENANT_ID);
      });

      it('should return empty result when no venues meet threshold', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [] });

        const result = await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(result.generated).toBe(0);
        expect(result.errors).toBe(0);
        expect(result.venues).toEqual([]);
      });
    });

    describe('1099 form generation', () => {
      const mockVenue = createMockVenue({ total_sales: 1500, transaction_count: 75 });

      beforeEach(() => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // INSERT job
          .mockResolvedValueOnce({ rows: [mockVenue] }) // SELECT venues
          .mockResolvedValueOnce(createMonthlyBreakdownResult()) // monthly breakdown
          .mockResolvedValueOnce({ rows: [] }) // INSERT form_1099_records
          .mockResolvedValueOnce({ rows: [] }) // UPDATE tax_records
          .mockResolvedValueOnce({ rows: [] }) // UPDATE job progress
          .mockResolvedValueOnce({ rows: [] }); // UPDATE job completed
      });

      it('should generate 1099-K for eligible venues', async () => {
        const result = await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(result.generated).toBe(1);
        expect(result.venues).toHaveLength(1);
      });

      it('should store 1099 record in form_1099_records table', async () => {
        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO form_1099_records'),
          expect.arrayContaining([
            mockVenue.venue_id,
            TEST_YEAR,
            '1099-K',
            mockVenue.total_sales,
            mockVenue.transaction_count,
            expect.any(String), // JSON form data
            TEST_TENANT_ID
          ])
        );
      });

      it('should include monthly breakdown in form data', async () => {
        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        const insertCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('INSERT INTO form_1099_records')
        );
        const formDataJson = insertCall[1][5];
        const formData = JSON.parse(formDataJson);

        expect(formData).toHaveProperty('monthlyAmounts');
        expect(formData.monthlyAmounts).toHaveProperty('month_1');
      });

      it('should update tax_records with form_1099_required flag', async () => {
        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE tax_records'),
          [mockVenue.venue_id, TEST_YEAR, TEST_TENANT_ID]
        );
      });

      it('should send email notification for each generated form', async () => {
        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
          'venue@example.com',
          `Your ${TEST_YEAR} Form 1099-K is Ready`,
          '1099-ready',
          expect.objectContaining({
            venueId: mockVenue.venue_id,
            businessName: mockVenue.business_name,
            grossAmount: mockVenue.total_sales
          })
        );
      });

      it('should log success for each generated form', async () => {
        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining(`Generated 1099-K for ${mockVenue.business_name}`)
        );
      });
    });

    describe('job progress tracking', () => {
      it('should update job progress after each venue', async () => {
        const venues = [
          createMockVenue({ venue_id: 'v1' }),
          createMockVenue({ venue_id: 'v2' })
        ];

        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 99 }] }) // INSERT job
          .mockResolvedValueOnce({ rows: venues }) // SELECT venues
          // First venue
          .mockResolvedValueOnce(createMonthlyBreakdownResult())
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }) // UPDATE progress
          // Second venue
          .mockResolvedValueOnce(createMonthlyBreakdownResult())
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }) // UPDATE progress
          .mockResolvedValueOnce({ rows: [] }); // UPDATE completed

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        const progressUpdates = mockDbQuery.mock.calls.filter(call =>
          call[0].includes('UPDATE compliance_batch_jobs') &&
          call[0].includes('progress')
        );

        expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('error handling', () => {
      it('should count errors and continue processing', async () => {
        const venues = [
          createMockVenue({ venue_id: 'v1' }),
          createMockVenue({ venue_id: 'v2' })
        ];

        let callCount = 0;
        mockDbQuery.mockImplementation((query) => {
          callCount++;
          if (callCount === 1) return Promise.resolve({ rows: [{ id: 1 }] }); // INSERT job
          if (callCount === 2) return Promise.resolve({ rows: venues }); // SELECT venues
          if (callCount === 3) return Promise.reject(new Error('Monthly breakdown failed')); // First venue fails
          // Continue with second venue
          return Promise.resolve({ rows: [] });
        });

        const result = await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(result.errors).toBeGreaterThanOrEqual(1);
      });

      it('should log errors for failed venues', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [createMockVenue()] })
          .mockRejectedValueOnce(new Error('Database error'));

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({ error: expect.any(Error) }),
          expect.stringContaining('Failed to generate 1099')
        );
      });

      it('should throw error if job creation fails', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('Job creation failed'));

        await expect(
          service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID)
        ).rejects.toThrow('Job creation failed');
      });
    });

    describe('monthly breakdown', () => {
      it('should initialize all 12 months to 0', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [createMockVenue()] })
          .mockResolvedValueOnce({ rows: [] }) // Empty monthly data
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        const insertCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('INSERT INTO form_1099_records')
        );
        const formData = JSON.parse(insertCall[1][5]);

        for (let month = 1; month <= 12; month++) {
          expect(formData.monthlyAmounts).toHaveProperty(`month_${month}`, 0);
        }
      });

      it('should populate months with actual sales data', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [{ id: 1 }] })
          .mockResolvedValueOnce({ rows: [createMockVenue()] })
          .mockResolvedValueOnce({ rows: [{ month: 6, total: '500.50' }] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] });

        await service.generateYear1099Forms(TEST_YEAR, TEST_TENANT_ID);

        const insertCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('INSERT INTO form_1099_records')
        );
        const formData = JSON.parse(insertCall[1][5]);

        expect(formData.monthlyAmounts.month_6).toBe(500.50);
      });
    });
  });

  // ===========================================================================
  // processOFACUpdates Tests
  // ===========================================================================

  describe('processOFACUpdates', () => {
    it('should log start of OFAC processing', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.processOFACUpdates(TEST_TENANT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Processing OFAC list update for tenant ${TEST_TENANT_ID}`)
      );
    });

    it('should log completion of OFAC update', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.processOFACUpdates(TEST_TENANT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OFAC list updated')
      );
    });

    it('should query venues for tenant to re-check', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.processOFACUpdates(TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM venue_verifications'),
        [TEST_TENANT_ID]
      );
    });

    it('should log re-check for each venue', async () => {
      mockDbQuery.mockResolvedValue({
        rows: [
          { venue_id: 'v1', business_name: 'Venue One' },
          { venue_id: 'v2', business_name: 'Venue Two' }
        ]
      });

      await service.processOFACUpdates(TEST_TENANT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Re-checking Venue One')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Re-checking Venue Two')
      );
    });
  });

  // ===========================================================================
  // dailyComplianceChecks Tests
  // ===========================================================================

  describe('dailyComplianceChecks', () => {
    it('should log start of daily checks', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.dailyComplianceChecks(TEST_TENANT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Running daily compliance checks for tenant ${TEST_TENANT_ID}`)
      );
    });

    describe('expired verifications', () => {
      it('should check for verifications older than 365 days', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("365 days"),
          [TEST_TENANT_ID]
        );
      });

      it('should filter by verified status', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("status = 'verified'"),
          expect.any(Array)
        );
      });

      it('should send notification for expired verifications', async () => {
        mockDbQuery
          .mockResolvedValueOnce({
            rows: [{ venue_id: 'v1', business_name: 'Expired Venue' }]
          })
          .mockResolvedValueOnce({ rows: [] }); // threshold check

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        expect(mockNotificationService.sendEmail).toHaveBeenCalledWith(
          'venue@example.com',
          'Annual Verification Required',
          'reverification-required',
          expect.objectContaining({
            venueId: 'v1',
            businessName: 'Expired Venue'
          })
        );
      });

      it('should log count of venues needing re-verification', async () => {
        mockDbQuery
          .mockResolvedValueOnce({
            rows: [
              { venue_id: 'v1', business_name: 'Venue 1' },
              { venue_id: 'v2', business_name: 'Venue 2' }
            ]
          })
          .mockResolvedValueOnce({ rows: [] });

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('2 venues need re-verification')
        );
      });
    });

    describe('threshold approaching', () => {
      it('should check for venues with sales between $500-599', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('BETWEEN 500 AND 599'),
          expect.any(Array)
        );
      });

      it('should use current year for threshold check', async () => {
        mockDbQuery.mockResolvedValue({ rows: [] });
        const currentYear = new Date().getFullYear();

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        const thresholdCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('BETWEEN 500 AND 599')
        );
        expect(thresholdCall[1]).toContain(currentYear);
      });

      it('should log count of venues approaching threshold', async () => {
        mockDbQuery
          .mockResolvedValueOnce({ rows: [] }) // expired check
          .mockResolvedValueOnce({
            rows: [
              { venue_id: 'v1', business_name: 'Almost There', total_sales: 550 }
            ]
          });

        await service.dailyComplianceChecks(TEST_TENANT_ID);

        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining('1 venues approaching $600 threshold')
        );
      });
    });

    it('should log completion of daily checks', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.dailyComplianceChecks(TEST_TENANT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Daily compliance checks completed')
      );
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('batchService singleton', () => {
    it('should export a singleton instance', () => {
      expect(batchService).toBeInstanceOf(BatchService);
    });
  });
});
