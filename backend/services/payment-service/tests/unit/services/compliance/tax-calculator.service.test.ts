import { TaxCalculatorService } from '../../../../src/services/compliance/tax-calculator.service';

// Mock database
jest.mock('../../../../src/config/database', () => ({
  query: jest.fn()
}));

// Mock config
jest.mock('../../../../src/config', () => ({
  config: {
    taxJar: {
      apiKey: undefined // Test without TaxJar by default
    }
  }
}));

// Mock compliance config
jest.mock('../../../../src/config/compliance', () => ({
  complianceConfig: {
    tax: {
      nexusStates: ['TN', 'CA', 'NY', 'TX'],
      tennessee: {
        stateSalesRate: 0.07,
        localRates: {
          'nashville': 0.0225,
          'memphis': 0.0275,
          'knoxville': 0.0225,
          'chattanooga': 0.0275
        }
      }
    }
  }
}));

// Mock percentOfCents utility
jest.mock('../../../../src/utils/money', () => ({
  percentOfCents: jest.fn((amount, bps) => Math.round(amount * bps / 10000))
}));

// Mock logger
jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    }))
  }
}));

import { query } from '../../../../src/config/database';

describe('TaxCalculatorService', () => {
  let service: TaxCalculatorService;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery = query as jest.Mock;
    service = new TaxCalculatorService();
  });

  describe('calculateTax', () => {
    it('should calculate Tennessee tax with state and local rates', async () => {
      const venueAddress = {
        street: '123 Broadway',
        city: 'Nashville',
        state: 'TN',
        zip: '37203'
      };

      const result = await service.calculateTax(10000, venueAddress);

      expect(result.stateTax).toBeGreaterThan(0); // 7% state tax
      expect(result.localTax).toBeGreaterThan(0); // 2.25% local tax
      expect(result.specialTax).toBeGreaterThan(0); // 1% entertainment tax for Nashville
      expect(result.totalTax).toBe(result.stateTax + result.localTax + result.specialTax);
    });

    it('should apply entertainment tax only in Nashville and Memphis', async () => {
      const nashvilleAddress = {
        street: '123 Broadway',
        city: 'Nashville',
        state: 'TN',
        zip: '37203'
      };

      const knoxvilleAddress = {
        street: '456 Main St',
        city: 'Knoxville',
        state: 'TN',
        zip: '37902'
      };

      const nashvilleResult = await service.calculateTax(10000, nashvilleAddress);
      const knoxvilleResult = await service.calculateTax(10000, knoxvilleAddress);

      expect(nashvilleResult.specialTax).toBeGreaterThan(0);
      expect(knoxvilleResult.specialTax).toBe(0);
    });

    it('should use correct local tax rates for different TN cities', async () => {
      const memphisAddress = {
        street: '123 Beale St',
        city: 'Memphis',
        state: 'TN',
        zip: '38103'
      };

      const result = await service.calculateTax(10000, memphisAddress);

      expect(result.localTax).toBeGreaterThan(0);
      expect(result.breakdown.local).toBeDefined();
      expect(result.breakdown.local.name).toContain('Memphis');
    });

    it('should calculate basic tax for non-Tennessee states', async () => {
      const californiaAddress = {
        street: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001'
      };

      const result = await service.calculateTax(10000, californiaAddress);

      expect(result.stateTax).toBeGreaterThan(0); // CA has 7.25% sales tax
      expect(result.localTax).toBe(0); // Basic calc doesn't include local
      expect(result.specialTax).toBe(0);
      expect(result.totalTax).toBe(result.stateTax);
    });

    it('should handle states with no sales tax', async () => {
      const delawareAddress = {
        street: '123 Main St',
        city: 'Wilmington',
        state: 'DE',
        zip: '19801'
      };

      const result = await service.calculateTax(10000, delawareAddress);

      expect(result.stateTax).toBe(0);
      expect(result.totalTax).toBe(0);
    });

    it('should provide detailed breakdown', async () => {
      const venueAddress = {
        street: '123 Broadway',
        city: 'Nashville',
        state: 'TN',
        zip: '37203'
      };

      const result = await service.calculateTax(10000, venueAddress);

      expect(result.breakdown.state).toBeDefined();
      expect(result.breakdown.state.name).toBeDefined();
      expect(result.breakdown.state.rate).toBeDefined();
      expect(result.breakdown.state.amount).toBeDefined();
      expect(result.breakdown.local).toBeDefined();
      expect(result.breakdown.special).toBeDefined();
    });
  });

  describe('recordTaxCollection', () => {
    it('should record tax collection in database', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const taxDetails = {
        stateTax: 700,
        localTax: 225,
        specialTax: 100,
        totalTax: 1025,
        breakdown: {
          state: { name: 'Tennessee Sales Tax' }
        }
      };

      await service.recordTaxCollection('txn_123', taxDetails);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tax_collections'),
        expect.arrayContaining([
          'txn_123',
          700,
          225,
          100,
          1025,
          'Tennessee Sales Tax',
          expect.any(String)
        ])
      );
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const taxDetails = {
        stateTax: 700,
        localTax: 0,
        specialTax: 0,
        totalTax: 700,
        breakdown: { state: { name: 'CA Sales Tax' } }
      };

      await expect(
        service.recordTaxCollection('txn_456', taxDetails)
      ).rejects.toThrow();
    });
  });

  describe('getNexusStatus', () => {
    it('should return true for nexus states', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 50, revenue_cents: 5000000 }]
      });

      const result = await service.getNexusStatus('CA');

      expect(result.hasNexus).toBe(true);
      expect(result.threshold).toBeDefined();
      expect(result.currentStatus).toBeDefined();
    });

    it('should return false for non-nexus states', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 10, revenue_cents: 1000000 }]
      });

      const result = await service.getNexusStatus('WY');

      expect(result.hasNexus).toBe(false);
      expect(result.threshold).toBeDefined();
      expect(result.currentStatus).toBeDefined();
    });

    it('should check threshold for non-nexus states', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 150, revenue_cents: 8000000 }]
      });

      const result = await service.getNexusStatus('FL');

      expect(result.currentStatus.revenue).toBe(8000000);
      expect(result.currentStatus.transactionCount).toBe(150);
      expect(result.currentStatus.percentOfRevenueThreshold).toBeDefined();
      expect(result.currentStatus.percentOfTransactionThreshold).toBeDefined();
    });

    it('should use correct thresholds for different states', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 0, revenue_cents: 0 }]
      });

      const caResult = await service.getNexusStatus('CA');
      const nyResult = await service.getNexusStatus('NY');

      // CA has $500k threshold, NY has $500k threshold
      expect(caResult.threshold.revenue).toBeDefined();
      expect(nyResult.threshold.revenue).toBeDefined();
    });
  });

  describe('Tax Calculation Accuracy', () => {
    it('should handle small amounts correctly', async () => {
      const venueAddress = {
        street: '123 Main St',
        city: 'Nashville',
        state: 'TN',
        zip: '37203'
      };

      const result = await service.calculateTax(100, venueAddress); // $1.00

      expect(result.taxableAmount).toBe(100);
      expect(result.totalTax).toBeGreaterThan(0);
    });

    it('should handle large amounts correctly', async () => {
      const venueAddress = {
        street: '123 Main St',
        city: 'Nashville',
        state: 'TN',
        zip: '37203'
      };

      const result = await service.calculateTax(1000000, venueAddress); // $10,000

      expect(result.taxableAmount).toBe(1000000);
      expect(result.totalTax).toBeGreaterThan(0);
    });

    it('should handle zero amounts', async () => {
      const venueAddress = {
        street: '123 Main St',
        city: 'Nashville',
        state: 'TN',
        zip: '37203'
      };

      const result = await service.calculateTax(0, venueAddress);

      expect(result.taxableAmount).toBe(0);
      expect(result.totalTax).toBe(0);
    });

    it('should calculate tax for all 50 states', async () => {
      const states = [
        'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
        'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
        'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
        'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
        'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
      ];

      for (const state of states) {
        const venueAddress = {
          street: '123 Main St',
          city: 'City',
          state: state,
          zip: '12345'
        };

        const result = await service.calculateTax(10000, venueAddress);
        
        expect(result).toBeDefined();
        expect(result.totalTax).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing city in TN address', async () => {
      const venueAddress = {
        street: '123 Main St',
        city: 'UnknownCity',
        state: 'TN',
        zip: '37000'
      };

      const result = await service.calculateTax(10000, venueAddress);

      // Should use default Nashville rate
      expect(result.localTax).toBeGreaterThan(0);
    });

    it('should handle customer address when available', async () => {
      const venueAddress = {
        street: '123 Main St',
        city: 'Los Angeles',
        state: 'CA',
        zip: '90001'
      };

      const customerAddress = {
        city: 'San Francisco',
        state: 'CA',
        zip: '94102'
      };

      const result = await service.calculateTax(10000, venueAddress, customerAddress);

      expect(result).toBeDefined();
    });

    it('should handle case-insensitive city names', async () => {
      const venueAddress1 = {
        street: '123 Broadway',
        city: 'NASHVILLE',
        state: 'TN',
        zip: '37203'
      };

      const venueAddress2 = {
        street: '123 Broadway',
        city: 'nashville',
        state: 'TN',
        zip: '37203'
      };

      const result1 = await service.calculateTax(10000, venueAddress1);
      const result2 = await service.calculateTax(10000, venueAddress2);

      expect(result1.totalTax).toBe(result2.totalTax);
    });

    it('should handle unusual state codes gracefully', async () => {
      const venueAddress = {
        street: '123 Main St',
        city: 'City',
        state: 'XX',
        zip: '12345'
      };

      const result = await service.calculateTax(10000, venueAddress);

      // Should default to 0% for unknown states
      expect(result.totalTax).toBe(0);
    });
  });

  describe('Nexus Threshold Monitoring', () => {
    it('should warn when approaching thresholds', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 180, revenue_cents: 9500000 }]
      });

      const result = await service.getNexusStatus('FL');

      expect(result.currentStatus.percentOfRevenueThreshold).toBeGreaterThan(90);
      expect(result.currentStatus.percentOfTransactionThreshold).toBeGreaterThan(90);
    });

    it('should track transaction volume by state', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 250, revenue_cents: 15000000 }]
      });

      const result = await service.getNexusStatus('TX');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('FROM payment_transactions'),
        expect.arrayContaining(['TX', expect.any(Date)])
      );
    });

    it('should calculate percentages correctly', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ transaction_count: 50, revenue_cents: 5000000 }]
      });

      const result = await service.getNexusStatus('GA');

      // $50k revenue against $100k threshold = 50%
      expect(result.currentStatus.percentOfRevenueThreshold).toBe(50);
      // 50 transactions against 200 threshold = 25%
      expect(result.currentStatus.percentOfTransactionThreshold).toBe(25);
    });
  });
});
