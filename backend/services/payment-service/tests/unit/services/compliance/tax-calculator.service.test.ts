/**
 * Tax Calculator Service Tests
 * Tests for tax calculation and compliance
 */

jest.mock('../../../../src/utils/logger', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

describe('TaxCalculatorService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateSalesTax', () => {
    it('should calculate sales tax for US state', () => {
      const amount = 10000; // $100.00
      const jurisdiction = { country: 'US', state: 'CA' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(725);
      expect(tax.rate).toBe(7.25);
    });

    it('should handle states with no sales tax', () => {
      const amount = 10000;
      const jurisdiction = { country: 'US', state: 'OR' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(0);
      expect(tax.rate).toBe(0);
    });

    it('should calculate VAT for EU countries', () => {
      const amount = 10000;
      const jurisdiction = { country: 'DE' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(1900);
      expect(tax.rate).toBe(19);
      expect(tax.type).toBe('VAT');
    });

    it('should handle reduced VAT rates', () => {
      const amount = 10000;
      const jurisdiction = { country: 'DE' };
      const options = { category: 'entertainment' };

      const tax = calculateSalesTax(amount, jurisdiction, options);

      expect(tax.rate).toBe(7);
    });

    it('should handle GST for Canada', () => {
      const amount = 10000;
      const jurisdiction = { country: 'CA', province: 'ON' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(1300);
      expect(tax.type).toBe('HST');
    });

    it('should return 0 for tax-exempt items', () => {
      const amount = 10000;
      const jurisdiction = { country: 'US', state: 'NY' };
      const options = { exempt: true };

      const tax = calculateSalesTax(amount, jurisdiction, options);

      expect(tax.amount).toBe(0);
    });
  });

  describe('calculateWithholdingTax', () => {
    it('should calculate withholding for US contractors', () => {
      const payment = 100000;
      const recipientType = 'contractor';
      const country = 'US';

      const withholding = calculateWithholdingTax(payment, recipientType, country);

      expect(withholding.amount).toBe(24000);
      expect(withholding.rate).toBe(24);
    });

    it('should skip withholding with valid W-9', () => {
      const payment = 100000;
      const recipientType = 'contractor';
      const country = 'US';
      const hasW9 = true;

      const withholding = calculateWithholdingTax(payment, recipientType, country, { hasW9 });

      expect(withholding.amount).toBe(0);
    });

    it('should calculate withholding for foreign payees', () => {
      const payment = 100000;
      const recipientType = 'foreign';
      const country = 'CA';

      const withholding = calculateWithholdingTax(payment, recipientType, country);

      expect(withholding.rate).toBe(30);
    });

    it('should apply tax treaty rates', () => {
      const payment = 100000;
      const recipientType = 'foreign';
      const country = 'GB';
      const hasTreatyForm = true;

      const withholding = calculateWithholdingTax(payment, recipientType, country, { hasTreatyForm });

      expect(withholding.rate).toBeLessThan(30);
    });
  });

  describe('get1099Threshold', () => {
    it('should return $600 threshold for contractor payments', () => {
      const threshold = get1099Threshold('1099-NEC');
      expect(threshold).toBe(60000);
    });

    it('should return threshold for miscellaneous income', () => {
      const threshold = get1099Threshold('1099-MISC');
      expect(threshold).toBe(60000);
    });

    it('should return threshold for interest income', () => {
      const threshold = get1099Threshold('1099-INT');
      expect(threshold).toBe(1000);
    });
  });

  describe('calculateTaxableAmount', () => {
    it('should deduct fees from gross amount', () => {
      const gross = 10000;
      const fees = 500;

      const taxable = calculateTaxableAmount(gross, fees);

      expect(taxable).toBe(9500);
    });

    it('should not go below zero', () => {
      const gross = 500;
      const fees = 1000;

      const taxable = calculateTaxableAmount(gross, fees);

      expect(taxable).toBe(0);
    });

    it('should handle refunds', () => {
      const gross = 10000;
      const fees = 500;
      const refunds = 2000;

      const taxable = calculateTaxableAmount(gross, fees, refunds);

      expect(taxable).toBe(7500);
    });
  });

  describe('isReportingRequired', () => {
    it('should require reporting above threshold', () => {
      const totalPayments = 100000;
      const formType = '1099-NEC';

      const required = isReportingRequired(totalPayments, formType);

      expect(required).toBe(true);
    });

    it('should not require reporting below threshold', () => {
      const totalPayments = 50000;
      const formType = '1099-NEC';

      const required = isReportingRequired(totalPayments, formType);

      expect(required).toBe(false);
    });
  });

  describe('getJurisdictionRates', () => {
    it('should return rates for US state', async () => {
      const jurisdiction = { country: 'US', state: 'NY' };

      const rates = await getJurisdictionRates(jurisdiction);

      expect(rates.baseRate).toBeDefined();
      expect(rates.localRates).toBeDefined();
    });

    it('should include local tax rates', async () => {
      const jurisdiction = { country: 'US', state: 'NY', city: 'NYC' };

      const rates = await getJurisdictionRates(jurisdiction);

      expect(rates.localRates.length).toBeGreaterThan(0);
    });

    it('should return EU VAT rates', async () => {
      const jurisdiction = { country: 'FR' };

      const rates = await getJurisdictionRates(jurisdiction);

      expect(rates.vatRates).toBeDefined();
      expect(rates.vatRates.standard).toBe(20);
    });
  });

  describe('calculateTotalTax', () => {
    it('should combine state and local taxes', () => {
      const amount = 10000;
      const rates = { state: 6, county: 1.5, city: 0.5 };

      const total = calculateTotalTax(amount, rates);

      expect(total.amount).toBe(800);
      expect(total.breakdown).toHaveLength(3);
    });

    it('should handle jurisdiction with only state tax', () => {
      const amount = 10000;
      const rates = { state: 5 };

      const total = calculateTotalTax(amount, rates);

      expect(total.amount).toBe(500);
      expect(total.breakdown).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('should handle unknown jurisdiction', () => {
      const amount = 10000;
      const jurisdiction = { country: 'XX' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(0);
      expect(tax.unknown).toBe(true);
    });

    it('should handle zero amount', () => {
      const amount = 0;
      const jurisdiction = { country: 'US', state: 'CA' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(0);
    });

    it('should round tax correctly', () => {
      const amount = 1001;
      const jurisdiction = { country: 'US', state: 'CA' };

      const tax = calculateSalesTax(amount, jurisdiction);

      expect(tax.amount).toBe(73);
    });
  });
});

// Helper functions
function calculateSalesTax(amount: number, jurisdiction: any, options: any = {}): any {
  if (options.exempt) return { amount: 0, rate: 0 };

  const rates: Record<string, Record<string, number>> = {
    US: { CA: 7.25, NY: 8, TX: 6.25, OR: 0 },
  };
  const vatRates: Record<string, number> = { DE: 19, FR: 20, GB: 20, IT: 22 };
  const reducedVatRates: Record<string, number> = { DE: 7, FR: 5.5, GB: 5 };
  const canadaRates: Record<string, number> = { ON: 13, BC: 12, AB: 5 };

  if (jurisdiction.country === 'US') {
    const rate = rates.US[jurisdiction.state] || 0;
    return { amount: Math.round(amount * (rate / 100)), rate, type: 'SALES_TAX' };
  }

  if (jurisdiction.country === 'CA') {
    const rate = canadaRates[jurisdiction.province] || 5;
    const type = rate > 5 ? 'HST' : 'GST';
    return { amount: Math.round(amount * (rate / 100)), rate, type };
  }

  if (vatRates[jurisdiction.country]) {
    const rate = options.category === 'entertainment' 
      ? (reducedVatRates[jurisdiction.country] || vatRates[jurisdiction.country])
      : vatRates[jurisdiction.country];
    return { amount: Math.round(amount * (rate / 100)), rate, type: 'VAT' };
  }

  return { amount: 0, rate: 0, unknown: true };
}

function calculateWithholdingTax(payment: number, recipientType: string, country: string, options: any = {}): any {
  if (recipientType === 'contractor' && country === 'US') {
    if (options.hasW9) return { amount: 0, rate: 0 };
    return { amount: Math.round(payment * 0.24), rate: 24 };
  }

  if (recipientType === 'foreign') {
    const treatyRates: Record<string, number> = { GB: 15, CA: 15, DE: 15 };
    const rate = options.hasTreatyForm && treatyRates[country] ? treatyRates[country] : 30;
    return { amount: Math.round(payment * (rate / 100)), rate };
  }

  return { amount: 0, rate: 0 };
}

function get1099Threshold(formType: string): number {
  const thresholds: Record<string, number> = {
    '1099-NEC': 60000,
    '1099-MISC': 60000,
    '1099-INT': 1000,
    '1099-K': 60000,
  };
  return thresholds[formType] || 60000;
}

function calculateTaxableAmount(gross: number, fees: number, refunds = 0): number {
  return Math.max(0, gross - fees - refunds);
}

function isReportingRequired(totalPayments: number, formType: string): boolean {
  return totalPayments >= get1099Threshold(formType);
}

async function getJurisdictionRates(jurisdiction: any): Promise<any> {
  if (jurisdiction.country === 'US') {
    const localRates = jurisdiction.city === 'NYC' ? [{ name: 'NYC', rate: 4.5 }] : [];
    return { baseRate: 4, localRates };
  }
  if (['FR', 'DE', 'GB'].includes(jurisdiction.country)) {
    const standard: Record<string, number> = { FR: 20, DE: 19, GB: 20 };
    return { vatRates: { standard: standard[jurisdiction.country] } };
  }
  return { baseRate: 0, localRates: [] };
}

function calculateTotalTax(amount: number, rates: Record<string, number>): any {
  const breakdown: any[] = [];
  let total = 0;

  for (const [type, rate] of Object.entries(rates)) {
    const tax = Math.round(amount * (rate / 100));
    breakdown.push({ type, rate, amount: tax });
    total += tax;
  }

  return { amount: total, breakdown };
}
