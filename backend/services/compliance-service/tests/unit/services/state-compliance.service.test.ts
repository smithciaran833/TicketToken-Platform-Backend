/**
 * Unit Tests for State Compliance Service
 */
jest.mock('../../../src/services/database.service', () => ({
  db: {
    query: jest.fn()
  }
}));

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { StateComplianceService, stateComplianceService } from '../../../src/services/state-compliance.service';
import { db } from '../../../src/services/database.service';

describe('StateComplianceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db.query as jest.Mock<any>).mockResolvedValue({ rows: [], rowCount: 0 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateResale', () => {
    describe('Tennessee (TN) - 20% markup limit', () => {
      it('should allow resale within markup limit', async () => {
        const result = await stateComplianceService.validateResale('TN', 100, 115);

        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should allow resale at exact markup limit', async () => {
        const result = await stateComplianceService.validateResale('TN', 100, 120);

        expect(result.allowed).toBe(true);
      });

      it('should reject resale exceeding markup limit', async () => {
        const result = await stateComplianceService.validateResale('TN', 100, 125);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('TN limits markup to 20%');
        expect(result.maxAllowedPrice).toBe(120);
      });

      it('should calculate correct max price for different amounts', async () => {
        const result = await stateComplianceService.validateResale('TN', 50, 100);

        expect(result.allowed).toBe(false);
        expect(result.maxAllowedPrice).toBe(60); // 50 * 1.20
      });
    });

    describe('Texas (TX) - no markup limit', () => {
      it('should allow any markup', async () => {
        const result = await stateComplianceService.validateResale('TX', 100, 500);

        expect(result.allowed).toBe(true);
        expect(result.maxAllowedPrice).toBeUndefined();
      });

      it('should allow 1000% markup', async () => {
        const result = await stateComplianceService.validateResale('TX', 100, 1100);

        expect(result.allowed).toBe(true);
      });
    });

    describe('Unknown states', () => {
      it('should allow resale for states without rules', async () => {
        const result = await stateComplianceService.validateResale('CA', 100, 500);

        expect(result.allowed).toBe(true);
      });

      it('should allow resale for invalid state codes', async () => {
        const result = await stateComplianceService.validateResale('XX', 100, 200);

        expect(result.allowed).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle zero original price', async () => {
        const result = await stateComplianceService.validateResale('TN', 0, 10);

        expect(result.allowed).toBe(false);
        expect(result.maxAllowedPrice).toBe(0);
      });

      it('should handle resale at original price', async () => {
        const result = await stateComplianceService.validateResale('TN', 100, 100);

        expect(result.allowed).toBe(true);
      });

      it('should handle resale below original price', async () => {
        const result = await stateComplianceService.validateResale('TN', 100, 80);

        expect(result.allowed).toBe(true);
      });

      it('should handle decimal prices', async () => {
        const result = await stateComplianceService.validateResale('TN', 99.99, 119.98);

        expect(result.allowed).toBe(true);
      });

      it('should reject decimal prices exceeding limit', async () => {
        const result = await stateComplianceService.validateResale('TN', 99.99, 125.00);

        expect(result.allowed).toBe(false);
        expect(result.maxAllowedPrice).toBeCloseTo(119.988, 2);
      });
    });
  });

  describe('checkLicenseRequirement', () => {
    it('should return true for Texas', async () => {
      const result = await stateComplianceService.checkLicenseRequirement('TX');

      expect(result).toBe(true);
    });

    it('should return false for Tennessee', async () => {
      const result = await stateComplianceService.checkLicenseRequirement('TN');

      expect(result).toBe(false);
    });

    it('should return false for unknown states', async () => {
      const result = await stateComplianceService.checkLicenseRequirement('CA');

      expect(result).toBe(false);
    });

    it('should return false for invalid state codes', async () => {
      const result = await stateComplianceService.checkLicenseRequirement('INVALID');

      expect(result).toBe(false);
    });
  });

  describe('loadFromDatabase', () => {
    it('should load rules from database', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          {
            state_code: 'NY',
            max_markup_percentage: 15,
            requires_disclosure: true,
            requires_license: true,
            special_rules: { rules: ['Rule 1', 'Rule 2'] }
          }
        ]
      });

      const service = new StateComplianceService();
      await service.loadFromDatabase();

      // Verify NY rules were loaded by testing validateResale
      const result = await service.validateResale('NY', 100, 120);
      expect(result.allowed).toBe(false);
      expect(result.maxAllowedPrice).toBeCloseTo(115, 2); // 100 * 1.15
    });

    it('should handle null max_markup_percentage', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          {
            state_code: 'FL',
            max_markup_percentage: null,
            requires_disclosure: false,
            requires_license: false,
            special_rules: null
          }
        ]
      });

      const service = new StateComplianceService();
      await service.loadFromDatabase();

      // FL should allow any markup
      const result = await service.validateResale('FL', 100, 1000);
      expect(result.allowed).toBe(true);
    });

    it('should handle empty special_rules', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          {
            state_code: 'GA',
            max_markup_percentage: 25,
            requires_disclosure: true,
            requires_license: false,
            special_rules: null
          }
        ]
      });

      const service = new StateComplianceService();
      await service.loadFromDatabase();

      const result = await service.validateResale('GA', 100, 125);
      expect(result.allowed).toBe(true);
    });

    it('should convert percentage to decimal', async () => {
      (db.query as jest.Mock<any>).mockResolvedValue({
        rows: [
          {
            state_code: 'OH',
            max_markup_percentage: 30, // 30% stored as integer
            requires_disclosure: true,
            requires_license: false,
            special_rules: { rules: [] }
          }
        ]
      });

      const service = new StateComplianceService();
      await service.loadFromDatabase();

      // 30% markup on $100 = $130 max
      const result = await service.validateResale('OH', 100, 135);
      expect(result.allowed).toBe(false);
      expect(result.maxAllowedPrice).toBe(130);
    });

    it('should query state_compliance_rules table', async () => {
      await stateComplianceService.loadFromDatabase();

      expect(db.query).toHaveBeenCalledWith('SELECT * FROM state_compliance_rules');
    });

    it('should propagate database errors', async () => {
      (db.query as jest.Mock<any>).mockRejectedValue(new Error('DB error'));

      await expect(stateComplianceService.loadFromDatabase())
        .rejects.toThrow('DB error');
    });
  });

  describe('exported singleton', () => {
    it('should export stateComplianceService instance', () => {
      expect(stateComplianceService).toBeDefined();
      expect(stateComplianceService.validateResale).toBeInstanceOf(Function);
      expect(stateComplianceService.checkLicenseRequirement).toBeInstanceOf(Function);
      expect(stateComplianceService.loadFromDatabase).toBeInstanceOf(Function);
    });
  });
});
