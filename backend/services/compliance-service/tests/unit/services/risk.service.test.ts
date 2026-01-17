/**
 * Unit Tests for RiskService
 *
 * Tests risk scoring calculations, flag management, and admin notifications
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TENANT_FIXTURES, VENUE_FIXTURES, USER_FIXTURES } from '../../fixtures';

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

const mockAuthServiceClient = {
  getAdminUsers: jest.fn()
};
const mockVenueServiceClient = {
  getVenueBasicInfo: jest.fn(),
  batchGetVenueNames: jest.fn()
};
jest.mock('@tickettoken/shared/clients', () => ({
  authServiceClient: mockAuthServiceClient,
  venueServiceClient: mockVenueServiceClient
}));

// Import module under test AFTER mocks
import { RiskService, riskService } from '../../../src/services/risk.service';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;
const TEST_TENANT_ID = TENANT_FIXTURES.default.id;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create mock DB result for venue_verifications query
 */
function createVerificationResult(overrides: Partial<{
  status: string;
  ein: string | null;
  w9_uploaded: boolean;
  bank_verified: boolean;
}> = {}) {
  return {
    rows: [{
      venue_id: TEST_VENUE_ID,
      tenant_id: TEST_TENANT_ID,
      status: 'approved',
      ein: '12-3456789',
      w9_uploaded: true,
      bank_verified: true,
      ...overrides
    }]
  };
}

/**
 * Create mock DB result for ofac_checks query
 */
function createOfacResult(isMatch: boolean = false) {
  return {
    rows: isMatch ? [{ is_match: true }] : [{ is_match: false }]
  };
}

/**
 * Create mock DB result for tax_records velocity query
 */
function createVelocityResult(count: number, total: number) {
  return {
    rows: [{ count: count.toString(), total: total.toString() }]
  };
}

/**
 * Create empty DB result
 */
function createEmptyResult() {
  return { rows: [] };
}

/**
 * Setup standard mock sequence for calculateRiskScore
 */
function setupCalculateRiskScoreMocks(options: {
  verification?: ReturnType<typeof createVerificationResult> | ReturnType<typeof createEmptyResult>;
  ofac?: ReturnType<typeof createOfacResult>;
  velocity?: ReturnType<typeof createVelocityResult>;
} = {}) {
  const verification = options.verification ?? createVerificationResult();
  const ofac = options.ofac ?? createOfacResult(false);
  const velocity = options.velocity ?? createVelocityResult(10, 500);

  mockDbQuery
    .mockResolvedValueOnce(verification)  // venue_verifications query
    .mockResolvedValueOnce(ofac)          // ofac_checks query
    .mockResolvedValueOnce(velocity)      // tax_records velocity query
    .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // INSERT risk_assessments
}

// =============================================================================
// TESTS
// =============================================================================

describe('RiskService', () => {
  let service: RiskService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RiskService();
  });

  // ===========================================================================
  // calculateRiskScore - Core Risk Calculation Tests
  // ===========================================================================

  describe('calculateRiskScore', () => {
    describe('verification status scoring', () => {
      it('should add 30 points when no verification exists', async () => {
        setupCalculateRiskScoreMocks({
          verification: createEmptyResult()
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(30);
        expect(result.factors).toContain('No verification started');
      });

      it('should add 50 points for rejected verification', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ status: 'rejected' })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(50);
        expect(result.factors).toContain('Previously rejected');
      });

      it('should add 20 points for pending verification', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ status: 'pending' })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(20);
        expect(result.factors).toContain('Verification pending');
      });

      it('should add 15 points for missing EIN', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ ein: null })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(15);
        expect(result.factors).toContain('Missing EIN');
      });

      it('should add 10 points when W-9 not uploaded', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ w9_uploaded: false })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(10);
        expect(result.factors).toContain('No W-9 on file');
      });

      it('should add 10 points when bank not verified', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ bank_verified: false })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(10);
        expect(result.factors).toContain('Bank not verified');
      });

      it('should accumulate multiple verification issues', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({
            status: 'pending',
            ein: null,
            w9_uploaded: false,
            bank_verified: false
          })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        // pending (20) + missing EIN (15) + no W-9 (10) + bank not verified (10) = 55
        expect(result.score).toBeGreaterThanOrEqual(55);
        expect(result.factors).toContain('Verification pending');
        expect(result.factors).toContain('Missing EIN');
        expect(result.factors).toContain('No W-9 on file');
        expect(result.factors).toContain('Bank not verified');
      });
    });

    describe('OFAC scoring', () => {
      it('should add 40 points for OFAC match', async () => {
        setupCalculateRiskScoreMocks({
          ofac: createOfacResult(true)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(40);
        expect(result.factors).toContain('OFAC match found');
      });

      it('should add 0 points when no OFAC match', async () => {
        setupCalculateRiskScoreMocks({
          ofac: createOfacResult(false)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.factors).not.toContain('OFAC match found');
      });

      it('should handle no OFAC check records', async () => {
        setupCalculateRiskScoreMocks({
          ofac: createEmptyResult()
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.factors).not.toContain('OFAC match found');
      });
    });

    describe('velocity scoring', () => {
      it('should add 20 points for high transaction count (>100 in 24h)', async () => {
        setupCalculateRiskScoreMocks({
          velocity: createVelocityResult(150, 5000)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(20);
        expect(result.factors).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/High transaction velocity: 150 in 24h/)
          ])
        );
      });

      it('should add 25 points for high transaction volume (>$10000 in 24h)', async () => {
        setupCalculateRiskScoreMocks({
          velocity: createVelocityResult(50, 15000)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(25);
        expect(result.factors).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/High transaction volume: \$15000 in 24h/)
          ])
        );
      });

      it('should add 0 points for normal velocity', async () => {
        setupCalculateRiskScoreMocks({
          velocity: createVelocityResult(50, 5000)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.factors).not.toEqual(
          expect.arrayContaining([
            expect.stringMatching(/High transaction velocity/)
          ])
        );
        expect(result.factors).not.toEqual(
          expect.arrayContaining([
            expect.stringMatching(/High transaction volume/)
          ])
        );
      });

      it('should handle null/missing velocity data', async () => {
        setupCalculateRiskScoreMocks({
          velocity: { rows: [{ count: null, total: null }] }
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        // Should not throw, should handle gracefully
        expect(result).toHaveProperty('score');
        expect(result).toHaveProperty('factors');
        expect(result).toHaveProperty('recommendation');
      });
    });

    describe('recommendation thresholds', () => {
      it('should recommend BLOCK when score >= 70', async () => {
        // rejected (50) + pending issues to push over 70
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ status: 'rejected', ein: null, w9_uploaded: false })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(70);
        expect(result.recommendation).toBe('BLOCK');
      });

      it('should recommend MANUAL_REVIEW when score >= 50 and < 70', async () => {
        // rejected (50) alone should trigger MANUAL_REVIEW
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({ status: 'rejected' })
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(50);
        expect(result.score).toBeLessThan(70);
        expect(result.recommendation).toBe('MANUAL_REVIEW');
      });

      it('should recommend MONITOR when score >= 30 and < 50', async () => {
        // No verification (30) should trigger MONITOR
        setupCalculateRiskScoreMocks({
          verification: createEmptyResult()
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeGreaterThanOrEqual(30);
        expect(result.score).toBeLessThan(50);
        expect(result.recommendation).toBe('MONITOR');
      });

      it('should recommend APPROVE when score < 30', async () => {
        // Fully verified, no issues
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult(),
          ofac: createOfacResult(false),
          velocity: createVelocityResult(10, 500)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBeLessThan(30);
        expect(result.recommendation).toBe('APPROVE');
      });
    });

    describe('database persistence', () => {
      it('should store risk assessment in database', async () => {
        setupCalculateRiskScoreMocks();

        await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        // Fourth call should be the INSERT into risk_assessments
        expect(mockDbQuery).toHaveBeenCalledTimes(4);
        const insertCall = mockDbQuery.mock.calls[3];
        expect(insertCall[0]).toContain('INSERT INTO risk_assessments');
        expect(insertCall[1]).toContain(TEST_VENUE_ID);
        expect(insertCall[1]).toContain(TEST_TENANT_ID);
      });

      it('should pass correct tenant_id to all queries', async () => {
        setupCalculateRiskScoreMocks();

        await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        // All queries should include tenant_id
        mockDbQuery.mock.calls.forEach((call) => {
          expect(call[1]).toContain(TEST_TENANT_ID);
        });
      });
    });

    describe('edge cases', () => {
      it('should return score of 0 with empty factors for fully compliant venue', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({
            status: 'approved',
            ein: '12-3456789',
            w9_uploaded: true,
            bank_verified: true
          }),
          ofac: createOfacResult(false),
          velocity: createVelocityResult(5, 100)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        expect(result.score).toBe(0);
        expect(result.factors).toHaveLength(0);
        expect(result.recommendation).toBe('APPROVE');
      });

      it('should handle maximum risk scenario', async () => {
        setupCalculateRiskScoreMocks({
          verification: createVerificationResult({
            status: 'rejected',
            ein: null,
            w9_uploaded: false,
            bank_verified: false
          }),
          ofac: createOfacResult(true),
          velocity: createVelocityResult(200, 50000)
        });

        const result = await service.calculateRiskScore(TEST_VENUE_ID, TEST_TENANT_ID);

        // rejected (50) + missing EIN (15) + no W-9 (10) + bank not verified (10) + OFAC (40) + velocity (20 or 25)
        expect(result.score).toBeGreaterThanOrEqual(125);
        expect(result.recommendation).toBe('BLOCK');
      });
    });
  });

  // ===========================================================================
  // flagForReview Tests
  // ===========================================================================

  describe('flagForReview', () => {
    const TEST_REASON = 'Suspicious activity detected';

    beforeEach(() => {
      // Setup default mocks for flagForReview
      mockDbQuery.mockResolvedValue({ rows: [{ id: 123 }] });
      mockAuthServiceClient.getAdminUsers.mockResolvedValue([]);
    });

    it('should insert flag into risk_flags table', async () => {
      await service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO risk_flags'),
        [TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID]
      );
    });

    it('should log the flag creation', async () => {
      await service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Venue ${TEST_VENUE_ID}`)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining(TEST_REASON)
      );
    });

    it('should attempt to send admin notification', async () => {
      const adminUsers = [
        { id: 'admin-1', email: 'admin@test.com', firstName: 'Admin', lastName: 'User' }
      ];
      mockAuthServiceClient.getAdminUsers.mockResolvedValue(adminUsers);
      mockVenueServiceClient.getVenueBasicInfo.mockResolvedValue({ name: 'Test Venue' });

      await service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID);

      expect(mockAuthServiceClient.getAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TEST_TENANT_ID }),
        expect.objectContaining({ roles: expect.arrayContaining(['admin']) })
      );
    });

    it('should handle case when no admin users exist', async () => {
      mockAuthServiceClient.getAdminUsers.mockResolvedValue([]);

      await service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TEST_TENANT_ID }),
        expect.stringContaining('No admin users found')
      );
    });

    it('should create notifications for each admin user', async () => {
      const adminUsers = [
        { id: 'admin-1', email: 'admin1@test.com', firstName: 'Admin', lastName: 'One' },
        { id: 'admin-2', email: 'admin2@test.com', firstName: 'Admin', lastName: 'Two' }
      ];
      mockAuthServiceClient.getAdminUsers.mockResolvedValue(adminUsers);
      mockVenueServiceClient.getVenueBasicInfo.mockResolvedValue({ name: 'Test Venue' });

      await service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID);

      // Should have INSERT calls for: risk_flags, admin_notifications x2, notification_queue x2, compliance_notifications
      const insertCalls = mockDbQuery.mock.calls.filter(call => 
        call[0].includes('INSERT')
      );
      
      // At minimum: 1 risk_flag + 2 admin_notifications + 2 notification_queue + 1 compliance_notification = 6
      expect(insertCalls.length).toBeGreaterThanOrEqual(6);
    });

    it('should handle venue service failure gracefully', async () => {
      mockAuthServiceClient.getAdminUsers.mockResolvedValue([
        { id: 'admin-1', email: 'admin@test.com' }
      ]);
      mockVenueServiceClient.getVenueBasicInfo.mockRejectedValue(new Error('Service unavailable'));

      // Should not throw
      await expect(service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID))
        .resolves.toBeUndefined();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ venueId: TEST_VENUE_ID }),
        expect.stringContaining('Failed to get venue name')
      );
    });

    it('should handle notification failure without throwing', async () => {
      mockAuthServiceClient.getAdminUsers.mockRejectedValue(new Error('Auth service down'));

      // Should not throw - notification failure shouldn't block flag creation
      await expect(service.flagForReview(TEST_VENUE_ID, TEST_REASON, TEST_TENANT_ID))
        .resolves.toBeUndefined();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: TEST_TENANT_ID }),
        expect.stringContaining('Failed to send admin notification')
      );
    });
  });

  // ===========================================================================
  // getPendingFlags Tests
  // ===========================================================================

  describe('getPendingFlags', () => {
    it('should return pending flags with venue names', async () => {
      const flagsResult = {
        rows: [
          { id: 1, venue_id: 'venue-1', reason: 'Reason 1', created_at: new Date('2025-01-01') },
          { id: 2, venue_id: 'venue-2', reason: 'Reason 2', created_at: new Date('2025-01-02') }
        ]
      };
      mockDbQuery.mockResolvedValue(flagsResult);
      mockVenueServiceClient.batchGetVenueNames.mockResolvedValue({
        venues: {
          'venue-1': { name: 'Venue One' },
          'venue-2': { name: 'Venue Two' }
        }
      });

      const result = await service.getPendingFlags(TEST_TENANT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        venueId: 'venue-1',
        venueName: 'Venue One',
        reason: 'Reason 1',
        createdAt: expect.any(Date)
      });
      expect(result[1]).toEqual({
        id: 2,
        venueId: 'venue-2',
        venueName: 'Venue Two',
        reason: 'Reason 2',
        createdAt: expect.any(Date)
      });
    });

    it('should query only unresolved flags', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });
      mockVenueServiceClient.batchGetVenueNames.mockResolvedValue({ venues: {} });

      await service.getPendingFlags(TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('resolved = false'),
        [TEST_TENANT_ID]
      );
    });

    it('should return "Unknown" for missing venue names', async () => {
      const flagsResult = {
        rows: [
          { id: 1, venue_id: 'venue-unknown', reason: 'Test', created_at: new Date() }
        ]
      };
      mockDbQuery.mockResolvedValue(flagsResult);
      mockVenueServiceClient.batchGetVenueNames.mockResolvedValue({ venues: {} });

      const result = await service.getPendingFlags(TEST_TENANT_ID);

      expect(result[0].venueName).toBe('Unknown');
    });

    it('should handle venue service failure gracefully', async () => {
      const flagsResult = {
        rows: [
          { id: 1, venue_id: 'venue-1', reason: 'Test', created_at: new Date() }
        ]
      };
      mockDbQuery.mockResolvedValue(flagsResult);
      mockVenueServiceClient.batchGetVenueNames.mockRejectedValue(new Error('Service error'));

      const result = await service.getPendingFlags(TEST_TENANT_ID);

      expect(result[0].venueName).toBe('Unknown');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        expect.stringContaining('Failed to get venue names')
      );
    });

    it('should return empty array when no pending flags', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const result = await service.getPendingFlags(TEST_TENANT_ID);

      expect(result).toEqual([]);
      // Should not call venue service when no flags
      expect(mockVenueServiceClient.batchGetVenueNames).not.toHaveBeenCalled();
    });

    it('should deduplicate venue IDs when calling venue service', async () => {
      const flagsResult = {
        rows: [
          { id: 1, venue_id: 'venue-1', reason: 'Reason 1', created_at: new Date() },
          { id: 2, venue_id: 'venue-1', reason: 'Reason 2', created_at: new Date() },
          { id: 3, venue_id: 'venue-2', reason: 'Reason 3', created_at: new Date() }
        ]
      };
      mockDbQuery.mockResolvedValue(flagsResult);
      mockVenueServiceClient.batchGetVenueNames.mockResolvedValue({
        venues: {
          'venue-1': { name: 'Venue One' },
          'venue-2': { name: 'Venue Two' }
        }
      });

      await service.getPendingFlags(TEST_TENANT_ID);

      // Should only request unique venue IDs
      expect(mockVenueServiceClient.batchGetVenueNames).toHaveBeenCalledWith(
        expect.arrayContaining(['venue-1', 'venue-2']),
        expect.any(Object)
      );
      const calledVenueIds = mockVenueServiceClient.batchGetVenueNames.mock.calls[0][0];
      expect(calledVenueIds).toHaveLength(2);
    });
  });

  // ===========================================================================
  // resolveFlag Tests
  // ===========================================================================

  describe('resolveFlag', () => {
    const TEST_FLAG_ID = 123;
    const TEST_RESOLUTION = 'Investigated and cleared';

    beforeEach(() => {
      mockDbQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    });

    it('should update flag as resolved', async () => {
      await service.resolveFlag(TEST_FLAG_ID, TEST_RESOLUTION, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE risk_flags'),
        [TEST_FLAG_ID, TEST_RESOLUTION, TEST_TENANT_ID]
      );
    });

    it('should set resolved = true', async () => {
      await service.resolveFlag(TEST_FLAG_ID, TEST_RESOLUTION, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('resolved = true'),
        expect.any(Array)
      );
    });

    it('should set resolved_at timestamp', async () => {
      await service.resolveFlag(TEST_FLAG_ID, TEST_RESOLUTION, TEST_TENANT_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('resolved_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should include tenant_id in WHERE clause for security', async () => {
      await service.resolveFlag(TEST_FLAG_ID, TEST_RESOLUTION, TEST_TENANT_ID);

      const query = mockDbQuery.mock.calls[0][0];
      expect(query).toContain('tenant_id = $3');
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('riskService singleton', () => {
    it('should export a singleton instance', () => {
      expect(riskService).toBeInstanceOf(RiskService);
    });
  });
});
