/**
 * Unit Tests for BankService
 *
 * Tests bank verification, payout method creation, and tenant isolation
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { TENANT_FIXTURES, VENUE_FIXTURES } from '../../fixtures';

// =============================================================================
// MOCKS - Must be defined before importing the module under test
// =============================================================================

const mockDbQuery = jest.fn();
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: mockDbQuery
  }
}));

const mockVenueServiceClient = {
  venueExists: jest.fn()
};
jest.mock('@tickettoken/shared/clients', () => ({
  venueServiceClient: mockVenueServiceClient
}));

// Mock console.log to prevent noise in tests
const originalConsoleLog = console.log;
beforeEach(() => {
  console.log = jest.fn();
});
afterEach(() => {
  console.log = originalConsoleLog;
});

// Import module under test AFTER mocks
import { BankService, bankService } from '../../../src/services/bank.service';

// =============================================================================
// TEST CONSTANTS
// =============================================================================

const TEST_TENANT_ID = TENANT_FIXTURES.default.id;
const TEST_VENUE_ID = VENUE_FIXTURES.lowRisk.id;
const TEST_ACCOUNT_NUMBER = '123456789012';
const TEST_ROUTING_NUMBER = '021000021';

// =============================================================================
// TESTS
// =============================================================================

describe('BankService', () => {
  let service: BankService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new BankService();
    mockDbQuery.mockResolvedValue({ rows: [] });
  });

  // ===========================================================================
  // verifyBankAccount Tests
  // ===========================================================================

  describe('verifyBankAccount', () => {
    describe('venue validation', () => {
      it('should verify venue exists via venueServiceClient', async () => {
        mockVenueServiceClient.venueExists.mockResolvedValue(true);

        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_NUMBER,
          TEST_ROUTING_NUMBER
        );

        expect(mockVenueServiceClient.venueExists).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          expect.objectContaining({ tenantId: TEST_TENANT_ID })
        );
      });

      it('should throw error when venue does not exist', async () => {
        mockVenueServiceClient.venueExists.mockResolvedValue(false);

        await expect(
          service.verifyBankAccount(
            TEST_TENANT_ID,
            TEST_VENUE_ID,
            TEST_ACCOUNT_NUMBER,
            TEST_ROUTING_NUMBER
          )
        ).rejects.toThrow(`Venue ${TEST_VENUE_ID} not found or access denied for tenant ${TEST_TENANT_ID}`);
      });

      it('should throw error when venue belongs to different tenant', async () => {
        mockVenueServiceClient.venueExists.mockResolvedValue(false);
        const differentTenantId = TENANT_FIXTURES.secondary.id;

        await expect(
          service.verifyBankAccount(
            differentTenantId,
            TEST_VENUE_ID,
            TEST_ACCOUNT_NUMBER,
            TEST_ROUTING_NUMBER
          )
        ).rejects.toThrow(/not found or access denied/);
      });
    });

    describe('verification logic', () => {
      beforeEach(() => {
        mockVenueServiceClient.venueExists.mockResolvedValue(true);
      });

      it('should return verified=true for valid account number', async () => {
        const result = await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          '123456789012',
          TEST_ROUTING_NUMBER
        );

        expect(result.verified).toBe(true);
        expect(result.accountName).toBe('Mock Business Checking');
        expect(result.accountType).toBe('checking');
      });

      it('should return verified=false when account contains "000"', async () => {
        const result = await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          '000123456789',
          TEST_ROUTING_NUMBER
        );

        expect(result.verified).toBe(false);
      });

      it('should return verified=false for all zeros account', async () => {
        const result = await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          '000000000000',
          TEST_ROUTING_NUMBER
        );

        expect(result.verified).toBe(false);
      });
    });

    describe('database persistence', () => {
      beforeEach(() => {
        mockVenueServiceClient.venueExists.mockResolvedValue(true);
      });

      it('should store verification result in bank_verifications table', async () => {
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_NUMBER,
          TEST_ROUTING_NUMBER
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO bank_verifications'),
          expect.arrayContaining([
            TEST_TENANT_ID,
            TEST_VENUE_ID,
            TEST_ACCOUNT_NUMBER.slice(-4), // last 4 digits
            TEST_ROUTING_NUMBER,
            true, // verified
            'Mock Business Checking'
          ])
        );
      });

      it('should only store last 4 digits of account number', async () => {
        const accountNumber = '9876543210';
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          accountNumber,
          TEST_ROUTING_NUMBER
        );

        const insertCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('INSERT INTO bank_verifications')
        );
        expect(insertCall[1]).toContain('3210'); // last 4 digits
      });

      it('should update venue_verifications when verification succeeds', async () => {
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_NUMBER,
          TEST_ROUTING_NUMBER
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE venue_verifications'),
          [TEST_VENUE_ID, TEST_TENANT_ID]
        );
      });

      it('should NOT update venue_verifications when verification fails', async () => {
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          '000000000000', // fails verification
          TEST_ROUTING_NUMBER
        );

        const updateCall = mockDbQuery.mock.calls.find(call =>
          call[0].includes('UPDATE venue_verifications')
        );
        expect(updateCall).toBeUndefined();
      });

      it('should set bank_verified=true in venue_verifications', async () => {
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_NUMBER,
          TEST_ROUTING_NUMBER
        );

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('bank_verified = true'),
          expect.any(Array)
        );
      });
    });

    describe('tenant isolation', () => {
      beforeEach(() => {
        mockVenueServiceClient.venueExists.mockResolvedValue(true);
      });

      it('should include tenant_id in all database queries', async () => {
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_NUMBER,
          TEST_ROUTING_NUMBER
        );

        mockDbQuery.mock.calls.forEach(call => {
          // All queries should reference tenant_id
          expect(call[1]).toContain(TEST_TENANT_ID);
        });
      });

      it('should pass tenant context to venueServiceClient', async () => {
        await service.verifyBankAccount(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_NUMBER,
          TEST_ROUTING_NUMBER
        );

        expect(mockVenueServiceClient.venueExists).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          expect.objectContaining({
            tenantId: TEST_TENANT_ID,
            traceId: expect.stringMatching(/^bank-\d+-[a-z0-9]+$/)
          })
        );
      });
    });
  });

  // ===========================================================================
  // createPayoutMethod Tests
  // ===========================================================================

  describe('createPayoutMethod', () => {
    const TEST_ACCOUNT_TOKEN = 'tok_test_123456';

    describe('venue validation', () => {
      it('should verify venue exists before creating payout method', async () => {
        mockVenueServiceClient.venueExists.mockResolvedValue(true);

        await service.createPayoutMethod(TEST_TENANT_ID, TEST_VENUE_ID, TEST_ACCOUNT_TOKEN);

        expect(mockVenueServiceClient.venueExists).toHaveBeenCalledWith(
          TEST_VENUE_ID,
          expect.objectContaining({ tenantId: TEST_TENANT_ID })
        );
      });

      it('should throw error when venue does not exist', async () => {
        mockVenueServiceClient.venueExists.mockResolvedValue(false);

        await expect(
          service.createPayoutMethod(TEST_TENANT_ID, TEST_VENUE_ID, TEST_ACCOUNT_TOKEN)
        ).rejects.toThrow(`Venue ${TEST_VENUE_ID} not found or access denied for tenant ${TEST_TENANT_ID}`);
      });
    });

    describe('payout method creation', () => {
      beforeEach(() => {
        mockVenueServiceClient.venueExists.mockResolvedValue(true);
      });

      it('should return a payout ID', async () => {
        const payoutId = await service.createPayoutMethod(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_TOKEN
        );

        expect(payoutId).toMatch(/^payout_\d+$/);
      });

      it('should generate unique payout IDs', async () => {
        const payoutId1 = await service.createPayoutMethod(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_TOKEN
        );

        // Small delay to ensure different timestamp
        await new Promise(resolve => setTimeout(resolve, 5));

        const payoutId2 = await service.createPayoutMethod(
          TEST_TENANT_ID,
          TEST_VENUE_ID,
          TEST_ACCOUNT_TOKEN
        );

        expect(payoutId1).not.toBe(payoutId2);
      });

      it('should store payout method in database', async () => {
        await service.createPayoutMethod(TEST_TENANT_ID, TEST_VENUE_ID, TEST_ACCOUNT_TOKEN);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO payout_methods'),
          expect.arrayContaining([
            TEST_TENANT_ID,
            TEST_VENUE_ID,
            expect.stringMatching(/^payout_\d+$/)
          ])
        );
      });

      it('should set initial status as active', async () => {
        await service.createPayoutMethod(TEST_TENANT_ID, TEST_VENUE_ID, TEST_ACCOUNT_TOKEN);

        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining("'active'"),
          expect.any(Array)
        );
      });
    });
  });

  // ===========================================================================
  // getPayoutMethods Tests
  // ===========================================================================

  describe('getPayoutMethods', () => {
    it('should return payout methods for venue', async () => {
      const mockPayoutMethods = [
        { payout_id: 'payout_123', status: 'active', created_at: new Date('2025-01-01') },
        { payout_id: 'payout_456', status: 'inactive', created_at: new Date('2025-01-02') }
      ];
      mockDbQuery.mockResolvedValue({ rows: mockPayoutMethods });

      const result = await service.getPayoutMethods(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        payoutId: 'payout_123',
        status: 'active',
        createdAt: expect.any(Date)
      });
      expect(result[1]).toEqual({
        payoutId: 'payout_456',
        status: 'inactive',
        createdAt: expect.any(Date)
      });
    });

    it('should query with correct tenant and venue IDs', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getPayoutMethods(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM payout_methods'),
        [TEST_VENUE_ID, TEST_TENANT_ID]
      );
    });

    it('should order by created_at DESC', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getPayoutMethods(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no payout methods exist', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const result = await service.getPayoutMethods(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(result).toEqual([]);
    });

    it('should include tenant_id in WHERE clause for isolation', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getPayoutMethods(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // getBankVerificationHistory Tests
  // ===========================================================================

  describe('getBankVerificationHistory', () => {
    it('should return verification history for venue', async () => {
      const mockHistory = [
        { account_last_four: '1234', verified: true, created_at: new Date('2025-01-01') },
        { account_last_four: '5678', verified: false, created_at: new Date('2025-01-02') }
      ];
      mockDbQuery.mockResolvedValue({ rows: mockHistory });

      const result = await service.getBankVerificationHistory(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        accountLastFour: '1234',
        verified: true,
        createdAt: expect.any(Date)
      });
      expect(result[1]).toEqual({
        accountLastFour: '5678',
        verified: false,
        createdAt: expect.any(Date)
      });
    });

    it('should query bank_verifications table', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getBankVerificationHistory(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM bank_verifications'),
        [TEST_VENUE_ID, TEST_TENANT_ID]
      );
    });

    it('should order by created_at DESC (most recent first)', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getBankVerificationHistory(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array when no verification history', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      const result = await service.getBankVerificationHistory(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(result).toEqual([]);
    });

    it('should include tenant_id in WHERE clause for isolation', async () => {
      mockDbQuery.mockResolvedValue({ rows: [] });

      await service.getBankVerificationHistory(TEST_TENANT_ID, TEST_VENUE_ID);

      expect(mockDbQuery).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = $2'),
        expect.any(Array)
      );
    });
  });

  // ===========================================================================
  // Singleton Export Test
  // ===========================================================================

  describe('bankService singleton', () => {
    it('should export a singleton instance', () => {
      expect(bankService).toBeInstanceOf(BankService);
    });
  });
});
