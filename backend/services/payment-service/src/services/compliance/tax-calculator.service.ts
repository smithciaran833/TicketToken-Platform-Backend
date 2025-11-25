import axios from 'axios';
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';
import { config } from '../../config';
import { percentOfCents } from '../../utils/money';
import { logger } from '../../utils/logger';

const log = logger.child({ component: 'TaxCalculatorService' });

export class TaxCalculatorService {
  private taxJarClient: any;
  private taxCache: Map<string, any> = new Map();

  constructor() {
    if (config.taxJar.apiKey) {
      const Taxjar = require('taxjar');
      this.taxJarClient = new Taxjar({
        apiKey: config.taxJar.apiKey
      });
    }
  }

  // amount is in INTEGER CENTS
  async calculateTax(
    amountCents: number,
    venueAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
    },
    customerAddress?: {
      city?: string;
      state?: string;
      zip?: string;
    }
  ): Promise<{
    taxableAmount: number;
    stateTax: number;
    localTax: number;
    specialTax: number;
    totalTax: number;
    breakdown: any;
  }> {
    if (venueAddress.state === 'TN') {
      return this.calculateTennesseeTax(amountCents, venueAddress.city);
    }

    if (this.taxJarClient && customerAddress) {
      return this.calculateWithTaxJar(amountCents, venueAddress, customerAddress);
    }

    return this.calculateBasicTax(amountCents, venueAddress.state);
  }

  private async calculateTennesseeTax(
    amountCents: number,
    city: string
  ): Promise<any> {
    const stateTaxBps = complianceConfig.tax.tennessee.stateSalesRate * 100; // 7% = 700 bps
    let localTaxBps = 225; // Default Nashville 2.25%

    const cityLower = city.toLowerCase();
    const rates = complianceConfig.tax.tennessee.localRates as any;
    if (rates[cityLower]) {
      localTaxBps = Math.round(rates[cityLower] * 100);
    }

    const entertainmentTaxBps = ['nashville', 'memphis'].includes(cityLower) ? 100 : 0; // 1%

    const stateTaxCents = percentOfCents(amountCents, stateTaxBps);
    const localTaxCents = percentOfCents(amountCents, localTaxBps);
    const specialTaxCents = percentOfCents(amountCents, entertainmentTaxBps);
    const totalTaxCents = stateTaxCents + localTaxCents + specialTaxCents;

    return {
      taxableAmount: amountCents,
      stateTax: stateTaxCents,
      localTax: localTaxCents,
      specialTax: specialTaxCents,
      totalTax: totalTaxCents,
      breakdown: {
        state: {
          name: 'Tennessee Sales Tax',
          rate: stateTaxBps / 100,
          amount: stateTaxCents
        },
        local: {
          name: `${city} Local Tax`,
          rate: localTaxBps / 100,
          amount: localTaxCents
        },
        special: entertainmentTaxBps > 0 ? {
          name: 'Entertainment Tax',
          rate: entertainmentTaxBps / 100,
          amount: specialTaxCents
        } : null
      }
    };
  }

  private async calculateWithTaxJar(
    amountCents: number,
    venueAddress: any,
    customerAddress: any
  ): Promise<any> {
    try {
      // TaxJar expects dollars, convert cents to dollars
      const amountDollars = amountCents / 100;

      const taxData = await this.taxJarClient.taxForOrder({
        from_street: venueAddress.street,
        from_city: venueAddress.city,
        from_state: venueAddress.state,
        from_zip: venueAddress.zip,
        to_city: customerAddress.city,
        to_state: customerAddress.state,
        to_zip: customerAddress.zip,
        amount: amountDollars,
        shipping: 0,
        line_items: [{
          id: '1',
          quantity: 1,
          unit_price: amountDollars,
          product_tax_code: '20410'
        }]
      });

      // Convert TaxJar response back to cents
      return {
        taxableAmount: Math.round(taxData.tax.taxable_amount * 100),
        stateTax: Math.round(taxData.tax.state_amount * 100),
        localTax: Math.round((taxData.tax.city_amount + taxData.tax.county_amount) * 100),
        specialTax: Math.round(taxData.tax.special_district_amount * 100),
        totalTax: Math.round(taxData.tax.amount_to_collect * 100),
        breakdown: taxData.tax.breakdown
      };
    } catch (error) {
      log.error('TaxJar calculation failed', { error });
      return this.calculateBasicTax(amountCents, venueAddress.state);
    }
  }

  private async calculateBasicTax(amountCents: number, state: string): Promise<any> {
    // Tax rates in basis points (5.0% = 500 bps)
    const stateTaxRates: { [key: string]: number } = {
      'AL': 400, 'AK': 0, 'AZ': 560, 'AR': 650,
      'CA': 725, 'CO': 290, 'CT': 635, 'DE': 0,
      'FL': 600, 'GA': 400, 'HI': 400, 'ID': 600,
      'IL': 625, 'IN': 700, 'IA': 600, 'KS': 650,
      'KY': 600, 'LA': 445, 'ME': 550, 'MD': 600,
      'MA': 625, 'MI': 600, 'MN': 688, 'MS': 700,
      'MO': 423, 'MT': 0, 'NE': 550, 'NV': 685,
      'NH': 0, 'NJ': 663, 'NM': 513, 'NY': 400,
      'NC': 475, 'ND': 500, 'OH': 575, 'OK': 450,
      'OR': 0, 'PA': 600, 'RI': 700, 'SC': 600,
      'SD': 450, 'TN': 700, 'TX': 625, 'UT': 595,
      'VT': 600, 'VA': 530, 'WA': 650, 'WV': 600,
      'WI': 500, 'WY': 400
    };

    const taxBps = stateTaxRates[state] || 0;
    const stateTaxCents = percentOfCents(amountCents, taxBps);

    return {
      taxableAmount: amountCents,
      stateTax: stateTaxCents,
      localTax: 0,
      specialTax: 0,
      totalTax: stateTaxCents,
      breakdown: {
        state: {
          name: `${state} Sales Tax`,
          rate: taxBps / 100,
          amount: stateTaxCents
        }
      }
    };
  }

  async recordTaxCollection(
    transactionId: string,
    taxDetails: any
  ): Promise<void> {
    await query(
      `INSERT INTO tax_collections
       (transaction_id, state_tax, local_tax, special_tax,
        total_tax, jurisdiction, breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transactionId,
        taxDetails.stateTax,
        taxDetails.localTax,
        taxDetails.specialTax,
        taxDetails.totalTax,
        taxDetails.breakdown.state.name,
        JSON.stringify(taxDetails.breakdown)
      ]
    );
  }

  async getNexusStatus(state: string): Promise<{
    hasNexus: boolean;
    threshold: any;
    currentStatus: any;
  }> {
    const isNexusState = complianceConfig.tax.nexusStates.includes(state);

    if (!isNexusState) {
      const thresholdStatus = await this.checkNexusThreshold(state);
      return {
        hasNexus: false,
        threshold: this.getStateNexusThreshold(state),
        currentStatus: thresholdStatus
      };
    }

    return {
      hasNexus: true,
      threshold: this.getStateNexusThreshold(state),
      currentStatus: await this.getStateTransactionVolume(state)
    };
  }

  private async checkNexusThreshold(state: string): Promise<any> {
    const threshold = this.getStateNexusThreshold(state);
    const currentVolume = await this.getStateTransactionVolume(state);

    return {
      revenue: currentVolume.revenue,
      transactionCount: currentVolume.transactionCount,
      revenueThreshold: threshold.revenue,
      transactionThreshold: threshold.transactions,
      percentOfRevenueThreshold: (currentVolume.revenue / threshold.revenue) * 100,
      percentOfTransactionThreshold: (currentVolume.transactionCount / threshold.transactions) * 100
    };
  }

  private getStateNexusThreshold(state: string): any {
    const thresholds: { [key: string]: any } = {
      'AL': { revenue: 25000000, transactions: null }, // $250k in cents
      'AZ': { revenue: 10000000, transactions: null },
      'CA': { revenue: 50000000, transactions: null },
      'CO': { revenue: 10000000, transactions: null },
      'FL': { revenue: 10000000, transactions: null },
      'GA': { revenue: 10000000, transactions: 200 },
      'IL': { revenue: 10000000, transactions: 200 },
      'NY': { revenue: 50000000, transactions: 100 },
      'TX': { revenue: 50000000, transactions: null },
    };

    return thresholds[state] || { revenue: 10000000, transactions: 200 };
  }

  private async getStateTransactionVolume(state: string): Promise<any> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const result = await query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(pt.amount_cents) as revenue_cents
       FROM payment_transactions pt
       JOIN venues v ON pt.venue_id = v.id
       WHERE v.state = $1
         AND pt.created_at >= $2
         AND pt.status = 'completed'`,
      [state, yearStart]
    );

    return {
      transactionCount: parseInt(result.rows[0].transaction_count),
      revenue: parseInt(result.rows[0].revenue_cents) || 0 // Revenue in cents
    };
  }
}
