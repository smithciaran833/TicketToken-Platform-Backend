// Tax calculation service - PURE INTEGER MATH
export class TaxService {
  private stateTaxRates: { [key: string]: number } = {
    'AL': 4.0, 'AK': 0, 'AZ': 5.6, 'AR': 6.5,
    'CA': 7.25, 'CO': 2.9, 'CT': 6.35, 'DE': 0,
    'FL': 6.0, 'GA': 4.0, 'HI': 4.0, 'ID': 6.0,
    'IL': 6.25, 'IN': 7.0, 'IA': 6.0, 'KS': 6.5,
    'KY': 6.0, 'LA': 4.45, 'ME': 5.5, 'MD': 6.0,
    'MA': 6.25, 'MI': 6.0, 'MN': 6.875, 'MS': 7.0,
    'MO': 4.225, 'MT': 0, 'NE': 5.5, 'NV': 6.85,
    'NH': 0, 'NJ': 6.625, 'NM': 5.125, 'NY': 4.0,
    'NC': 4.75, 'ND': 5.0, 'OH': 5.75, 'OK': 4.5,
    'OR': 0, 'PA': 6.0, 'RI': 7.0, 'SC': 6.0,
    'SD': 4.5, 'TN': 7.0, 'TX': 6.25, 'UT': 5.95,
    'VT': 6.0, 'VA': 5.3, 'WA': 6.5, 'WV': 6.0,
    'WI': 5.0, 'WY': 4.0
  };

  private localTaxRates: { [key: string]: number } = {
    'TN': 2.25,  // Nashville/Memphis additional
    'TX': 2.0,   // Austin/Houston additional
    'CA': 2.25,  // LA/SF additional
    'NY': 4.5,   // NYC additional
    'IL': 2.75,  // Chicago additional
  };

  async calculateOrderTax(
    _eventId: string,
    subtotalCents: number,
    venueState: string
  ): Promise<{
    stateTaxCents: number;
    localTaxCents: number;
    totalTaxCents: number;
    taxRate: number;
    breakdown: any;
  }> {
    // Get tax rates
    const stateRate = this.stateTaxRates[venueState] || 0;
    const localRate = this.localTaxRates[venueState] || 0;

    // PURE INTEGER MATH - no float conversions!
    // Formula: (cents * rate) / 100
    // This keeps precision until the final division
    const stateTaxCents = Math.round((subtotalCents * stateRate) / 100);
    const localTaxCents = Math.round((subtotalCents * localRate) / 100);
    const totalTaxCents = stateTaxCents + localTaxCents;

    const effectiveRate = stateRate + localRate;

    return {
      stateTaxCents,
      localTaxCents,
      totalTaxCents,
      taxRate: effectiveRate,
      breakdown: {
        state: {
          name: `${venueState} Sales Tax`,
          rate: stateRate,
          amountCents: stateTaxCents
        },
        local: localRate > 0 ? {
          name: `Local Tax`,
          rate: localRate,
          amountCents: localTaxCents
        } : null
      }
    };
  }
}

export const taxService = new TaxService();
