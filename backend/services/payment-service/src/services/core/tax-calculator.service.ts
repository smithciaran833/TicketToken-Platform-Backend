/**
 * Tax Calculator Service
 * Integrates with TaxJar for real-time, multi-state tax calculations
 */

import axios from 'axios';
import { SafeLogger } from '../../utils/pci-log-scrubber.util';
import { cacheService } from '../cache.service';

const logger = new SafeLogger('TaxCalculatorService');

const TAX_RATE_CACHE_TTL = 86400;
const FALLBACK_TAX_CACHE_TTL = 3600;

interface TaxJarResponse {
  tax: {
    amount_to_collect: number;
    rate: number;
    freight_taxable: boolean;
    tax_source: string;
    breakdown?: {
      state_tax_rate?: number;
      state_tax_collectable?: number;
      county_tax_rate?: number;
      county_tax_collectable?: number;
      city_tax_rate?: number;
      city_tax_collectable?: number;
      special_district_tax_rate?: number;
      special_tax_collectable?: number;
    };
  };
}

export interface TaxBreakdown {
  state: number;
  county: number;
  city: number;
  special: number;
  total: number;
  rate: number;
}

export interface TaxLocation {
  country: string;
  zip: string;
  state?: string;
  city?: string;
  street?: string;
}

export class TaxCalculatorService {
  private taxJarApiKey: string;
  private taxJarBaseUrl: string = 'https://api.taxjar.com/v2';
  private enabled: boolean;

  constructor() {
    this.taxJarApiKey = process.env.TAXJAR_API_KEY || '';
    this.enabled = !!this.taxJarApiKey && process.env.TAXJAR_ENABLED !== 'false';

    if (!this.enabled) {
      logger.warn('TaxJar integration disabled - using fallback tax rates');
    }
  }

  async calculateTax(
    amountCents: number,
    location: TaxLocation,
    venueId: string
  ): Promise<TaxBreakdown> {
    const cacheKey = this.getTaxCacheKey(location);

    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        if (this.enabled) {
          try {
            return await this.calculateTaxWithTaxJar(amountCents, location);
          } catch (error) {
            logger.error({
              error: error instanceof Error ? error.message : 'Unknown error',
              location,
            }, 'TaxJar calculation failed, using fallback');

            return this.calculateFallbackTax(amountCents, location);
          }
        } else {
          return this.calculateFallbackTax(amountCents, location);
        }
      },
      TAX_RATE_CACHE_TTL
    );
  }

  private async calculateTaxWithTaxJar(
    amountCents: number,
    location: TaxLocation
  ): Promise<TaxBreakdown> {
    const amountDollars = amountCents / 100;

    const params = {
      amount: amountDollars,
      shipping: 0,
      to_country: location.country,
      to_zip: location.zip,
      to_state: location.state,
      to_city: location.city,
      to_street: location.street,
    };

    logger.info({
      amount: amountDollars,
      location: `${location.city}, ${location.state} ${location.zip}`,
    }, 'Requesting tax calculation from TaxJar');

    const response = await axios.post<TaxJarResponse>(
      `${this.taxJarBaseUrl}/taxes`,
      params,
      {
        headers: {
          'Authorization': `Bearer ${this.taxJarApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    const { tax } = response.data;
    const breakdown = tax.breakdown || {};

    const stateCents = Math.round((breakdown.state_tax_collectable || 0) * 100);
    const countyCents = Math.round((breakdown.county_tax_collectable || 0) * 100);
    const cityCents = Math.round((breakdown.city_tax_collectable || 0) * 100);
    const specialCents = Math.round((breakdown.special_tax_collectable || 0) * 100);
    const totalCents = Math.round(tax.amount_to_collect * 100);

    logger.info({
      totalCents,
      rate: tax.rate,
      source: tax.tax_source,
    }, 'Tax calculation received from TaxJar');

    return {
      state: stateCents,
      county: countyCents,
      city: cityCents,
      special: specialCents,
      total: totalCents,
      rate: tax.rate * 100,
    };
  }

  private calculateFallbackTax(
    amountCents: number,
    location: TaxLocation
  ): TaxBreakdown {
    const rates = this.getFallbackRates(location);

    const stateCents = Math.round((amountCents * rates.state) / 10000);
    const countyCents = Math.round((amountCents * rates.county) / 10000);
    const cityCents = Math.round((amountCents * rates.city) / 10000);
    const specialCents = Math.round((amountCents * rates.special) / 10000);

    const totalCents = stateCents + countyCents + cityCents + specialCents;
    const combinedRate = rates.state + rates.county + rates.city + rates.special;

    logger.info({
      location: `${location.state} ${location.zip}`,
      totalCents,
      rate: combinedRate / 100,
    }, 'Using fallback tax rates');

    return {
      state: stateCents,
      county: countyCents,
      city: cityCents,
      special: specialCents,
      total: totalCents,
      rate: combinedRate / 100,
    };
  }

  private getFallbackRates(location: TaxLocation): {
    state: number;
    county: number;
    city: number;
    special: number;
  } {
    const state = location.state?.toUpperCase();

    const stateRates: Record<string, { state: number; county: number; city: number; special: number }> = {
      'TN': { state: 700, county: 225, city: 0, special: 0 },
      'CA': { state: 725, county: 100, city: 100, special: 0 },
      'TX': { state: 625, county: 100, city: 100, special: 0 },
      'NY': { state: 400, county: 400, city: 0, special: 0 },
      'FL': { state: 600, county: 100, city: 0, special: 0 },
      'WA': { state: 650, county: 250, city: 0, special: 0 },
      'IL': { state: 625, county: 250, city: 0, special: 0 },
      'PA': { state: 600, county: 100, city: 0, special: 0 },
      'OH': { state: 575, county: 150, city: 0, special: 0 },
      'GA': { state: 400, county: 300, city: 0, special: 0 },
    };

    return stateRates[state || ''] || {
      state: 700,
      county: 200,
      city: 0,
      special: 0,
    };
  }

  private getTaxCacheKey(location: TaxLocation): string {
    return `tax:rate:${location.country}:${location.state}:${location.zip}`;
  }

  async getTaxRate(location: TaxLocation): Promise<number> {
    const testAmount = 10000;
    const breakdown = await this.calculateTax(testAmount, location, 'test');
    return breakdown.rate;
  }

  async hasNexusInState(state: string): Promise<boolean> {
    const nexusStates = process.env.TAX_NEXUS_STATES?.split(',') || [
      'TN',
      'CA',
      'NY',
    ];

    return nexusStates.includes(state.toUpperCase());
  }
}
