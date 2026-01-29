/**
 * COMPONENT TEST: TaxCalculatorService
 *
 * Tests TaxCalculatorService - tax calculation logic with mocked TaxJar API
 */

import axios from 'axios';

// Set env vars BEFORE any imports
process.env.NODE_ENV = 'test';
process.env.TAXJAR_API_KEY = 'test_api_key';
process.env.TAXJAR_ENABLED = 'true';
process.env.TAX_NEXUS_STATES = 'TN,CA,NY,TX';
process.env.LOG_LEVEL = 'silent';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock cache service
jest.mock('../../../../src/services/cache.service', () => ({
  cacheService: {
    getOrCompute: async (key: string, fn: () => Promise<any>, ttl: number) => fn(),
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../../src/utils/pci-log-scrubber.util', () => ({
  SafeLogger: jest.fn().mockImplementation(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

import { TaxCalculatorService, TaxLocation } from '../../../../src/services/core/tax-calculator.service';

describe('TaxCalculatorService Component Tests', () => {
  let service: TaxCalculatorService;

  beforeEach(() => {
    service = new TaxCalculatorService();
    jest.clearAllMocks();
  });

  // ===========================================================================
  // CALCULATE TAX WITH TAXJAR
  // ===========================================================================
  describe('calculateTax() with TaxJar', () => {
    const location: TaxLocation = {
      country: 'US',
      state: 'TN',
      city: 'Nashville',
      zip: '37201',
      street: '123 Main St',
    };

    it('should calculate tax using TaxJar API', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          tax: {
            amount_to_collect: 9.25,
            rate: 0.0925,
            freight_taxable: false,
            tax_source: 'destination',
            breakdown: {
              state_tax_rate: 0.07,
              state_tax_collectable: 7.00,
              county_tax_rate: 0.0225,
              county_tax_collectable: 2.25,
              city_tax_rate: 0,
              city_tax_collectable: 0,
              special_district_tax_rate: 0,
              special_tax_collectable: 0,
            },
          },
        },
      });

      const result = await service.calculateTax(10000, location, 'venue-123');

      expect(result.total).toBe(925);
      expect(result.state).toBe(700);
      expect(result.county).toBe(225);
      expect(result.city).toBe(0);
      expect(result.special).toBe(0);
      expect(result.rate).toBeCloseTo(9.25, 2);

      // Verify API was called correctly
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.taxjar.com/v2/taxes',
        expect.objectContaining({
          amount: 100, // $100.00
          to_country: 'US',
          to_state: 'TN',
          to_city: 'Nashville',
          to_zip: '37201',
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test_api_key',
          }),
        })
      );
    });

    it('should handle California tax with special districts', async () => {
      const caLocation: TaxLocation = {
        country: 'US',
        state: 'CA',
        city: 'Los Angeles',
        zip: '90001',
      };

      mockedAxios.post.mockResolvedValueOnce({
        data: {
          tax: {
            amount_to_collect: 9.50,
            rate: 0.095,
            freight_taxable: false,
            tax_source: 'destination',
            breakdown: {
              state_tax_rate: 0.0725,
              state_tax_collectable: 7.25,
              county_tax_rate: 0.01,
              county_tax_collectable: 1.00,
              city_tax_rate: 0.0025,
              city_tax_collectable: 0.25,
              special_district_tax_rate: 0.01,
              special_tax_collectable: 1.00,
            },
          },
        },
      });

      const result = await service.calculateTax(10000, caLocation, 'venue-456');

      expect(result.total).toBe(950);
      expect(result.state).toBe(725);
      expect(result.county).toBe(100);
      expect(result.city).toBe(25);
      expect(result.special).toBe(100);
    });

    it('should fall back to local rates on TaxJar error', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('API timeout'));

      const result = await service.calculateTax(10000, location, 'venue-123');

      // Should use Tennessee fallback rates
      expect(result.total).toBeGreaterThan(0);
      expect(result.state).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // FALLBACK TAX CALCULATION
  // ===========================================================================
  describe('calculateTax() with fallback rates', () => {
    beforeEach(() => {
      // Force fallback by making TaxJar fail
      mockedAxios.post.mockRejectedValue(new Error('API unavailable'));
    });

    it('should calculate Tennessee tax correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TN',
        zip: '37201',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // TN: 7% state + 2.25% county = 9.25%
      expect(result.state).toBe(700);
      expect(result.county).toBe(225);
      expect(result.total).toBe(925);
    });

    it('should calculate California tax correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'CA',
        zip: '90001',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // CA: 7.25% state + 1% county + 1% city = 9.25%
      expect(result.state).toBe(725);
      expect(result.county).toBe(100);
      expect(result.city).toBe(100);
      expect(result.total).toBe(925);
    });

    it('should calculate Texas tax correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TX',
        zip: '75001',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // TX: 6.25% state + 1% county + 1% city = 8.25%
      expect(result.state).toBe(625);
      expect(result.county).toBe(100);
      expect(result.city).toBe(100);
      expect(result.total).toBe(825);
    });

    it('should calculate New York tax correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'NY',
        zip: '10001',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // NY: 4% state + 4% county = 8%
      expect(result.state).toBe(400);
      expect(result.county).toBe(400);
      expect(result.total).toBe(800);
    });

    it('should calculate Florida tax correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'FL',
        zip: '33101',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // FL: 6% state + 1% county = 7%
      expect(result.state).toBe(600);
      expect(result.county).toBe(100);
      expect(result.total).toBe(700);
    });

    it('should use default rates for unknown state', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'XX', // Unknown
        zip: '00000',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // Default: 7% state + 2% county = 9%
      expect(result.state).toBe(700);
      expect(result.county).toBe(200);
      expect(result.total).toBe(900);
    });

    it('should handle missing state gracefully', async () => {
      const location: TaxLocation = {
        country: 'US',
        zip: '00000',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // Should use default rates
      expect(result.total).toBe(900);
    });
  });

  // ===========================================================================
  // GET TAX RATE
  // ===========================================================================
  describe('getTaxRate()', () => {
    it('should return combined tax rate', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: {
          tax: {
            amount_to_collect: 8.25,
            rate: 0.0825,
            freight_taxable: false,
            tax_source: 'destination',
            breakdown: {
              state_tax_rate: 0.0625,
              state_tax_collectable: 6.25,
              county_tax_rate: 0.02,
              county_tax_collectable: 2.00,
            },
          },
        },
      });

      const location: TaxLocation = {
        country: 'US',
        state: 'TX',
        zip: '75001',
      };

      const rate = await service.getTaxRate(location);

      expect(rate).toBeCloseTo(8.25, 2);
    });
  });

  // ===========================================================================
  // HAS NEXUS IN STATE
  // ===========================================================================
  describe('hasNexusInState()', () => {
    it('should return true for nexus states', async () => {
      expect(await service.hasNexusInState('TN')).toBe(true);
      expect(await service.hasNexusInState('CA')).toBe(true);
      expect(await service.hasNexusInState('NY')).toBe(true);
      expect(await service.hasNexusInState('TX')).toBe(true);
    });

    it('should return false for non-nexus states', async () => {
      expect(await service.hasNexusInState('OR')).toBe(false);
      expect(await service.hasNexusInState('MT')).toBe(false);
      expect(await service.hasNexusInState('DE')).toBe(false);
    });

    it('should be case-insensitive', async () => {
      expect(await service.hasNexusInState('tn')).toBe(true);
      expect(await service.hasNexusInState('Tn')).toBe(true);
      expect(await service.hasNexusInState('ca')).toBe(true);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================
  describe('edge cases', () => {
    beforeEach(() => {
      mockedAxios.post.mockRejectedValue(new Error('API unavailable'));
    });

    it('should handle zero amount', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TN',
        zip: '37201',
      };

      const result = await service.calculateTax(0, location, 'venue-123');

      expect(result.total).toBe(0);
      expect(result.state).toBe(0);
      expect(result.county).toBe(0);
    });

    it('should handle small amounts correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TN',
        zip: '37201',
      };

      const result = await service.calculateTax(100, location, 'venue-123'); // $1.00

      // TN 9.25% of $1.00 = $0.0925 = 9 cents (rounded)
      expect(result.total).toBe(9);
    });

    it('should handle large amounts', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TN',
        zip: '37201',
      };

      const result = await service.calculateTax(10000000, location, 'venue-123'); // $100,000

      // TN 9.25% of $100,000 = $9,250
      expect(result.total).toBe(925000);
    });

    it('should round tax amounts correctly', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TN',
        zip: '37201',
      };

      // Amount that would cause fractional cents
      const result = await service.calculateTax(1234, location, 'venue-123'); // $12.34

      // All amounts should be whole cents
      expect(Number.isInteger(result.total)).toBe(true);
      expect(Number.isInteger(result.state)).toBe(true);
      expect(Number.isInteger(result.county)).toBe(true);
    });
  });

  // ===========================================================================
  // CALCULATION ACCURACY
  // ===========================================================================
  describe('calculation accuracy', () => {
    beforeEach(() => {
      mockedAxios.post.mockRejectedValue(new Error('API unavailable'));
    });

    it('should have components sum to total', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'CA',
        zip: '90001',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      const componentSum = result.state + result.county + result.city + result.special;
      expect(componentSum).toBe(result.total);
    });

    it('should maintain consistent rate calculation', async () => {
      const location: TaxLocation = {
        country: 'US',
        state: 'TN',
        zip: '37201',
      };

      const result = await service.calculateTax(10000, location, 'venue-123');

      // Rate should match calculated percentage
      const calculatedRate = (result.total / 10000) * 100;
      expect(calculatedRate).toBeCloseTo(result.rate, 1);
    });
  });
});
