/**
 * Tax Calculator Service
 * Integrates with TaxJar for real-time, multi-state tax calculations
 */

import axios from 'axios';
import { SafeLogger } from '../../utils/pci-log-scrubber.util';
import { cacheService } from '../cache.service';

const logger = new SafeLogger('TaxCalculatorService');

// Cache configuration
const TAX_RATE_CACHE_TTL = 86400; // 24 hours (tax rates don't change frequently)
const FALLBACK_TAX_CACHE_TTL = 3600; // 1 hour for fallback rates

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
  rate: number; // Combined rate as percentage
}

export interface TaxLocation {
  country: string; // 'US', 'CA', etc.
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

  /**
   * Calculate tax for a transaction
   * @param amountCents Amount in cents
   * @param location Venue/customer location
   * @param venueId Venue ID for caching
   */
  async calculateTax(
    amountCents: number,
    location: TaxLocation,
    venueId: string
  ): Promise<TaxBreakdown> {
    // Use cached rate if available
    const cacheKey = this.getTaxCacheKey(location);
    
    return cacheService.getOrCompute(
      cacheKey,
      async () => {
        if (this.enabled) {
          try {
            return await this.calculateTaxWithTaxJar(amountCents, location);
          } catch (error) {
            logger.error('TaxJar calculation failed, using fallback', {
              error: error instanceof Error ? error.message : 'Unknown error',
              location,
            });
            
            // Fall back to estimates
            return this.calculateFallbackTax(amountCents, location);
          }
        } else {
          // TaxJar disabled - use fallback
          return this.calculateFallbackTax(amountCents, location);
        }
      },
      TAX_RATE_CACHE_TTL
    );
  }

  /**
   * Calculate tax using TaxJar API
   */
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

    logger.info('Requesting tax calculation from TaxJar', {
      amount: amountDollars,
      location: `${location.city}, ${location.state} ${location.zip}`,
    });

    const response = await axios.post<TaxJarResponse>(
      `${this.taxJarBaseUrl}/taxes`,
      params,
      {
        headers: {
          'Authorization': `Bearer ${this.taxJarApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 5000, // 5 second timeout
      }
    );

    const { tax } = response.data;
    const breakdown = tax.breakdown || {};

    // Convert dollars back to cents
    const stateCents = Math.round((breakdown.state_tax_collectable || 0) * 100);
    const countyCents = Math.round((breakdown.county_tax_collectable || 0) * 100);
    const cityCents = Math.round((breakdown.city_tax_collectable || 0) * 100);
    const specialCents = Math.round((breakdown.special_tax_collectable || 0) * 100);
    const totalCents = Math.round(tax.amount_to_collect * 100);

    logger.info('Tax calculation received from TaxJar', {
      totalCents,
      rate: tax.rate,
      source: tax.tax_source,
    });

    return {
      state: stateCents,
      county: countyCents,
      city: cityCents,
      special: specialCents,
      total: totalCents,
      rate: tax.rate * 100, // Convert to percentage
    };
  }

  /**
   * Fallback tax calculation using approximate rates
   * Used when TaxJar is unavailable or disabled
   */
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

    logger.info('Using fallback tax rates', {
      location: `${location.state} ${location.zip}`,
      totalCents,
      rate: combinedRate / 100,
    });

    return {
      state: stateCents,
      county: countyCents,
      city: cityCents,
      special: specialCents,
      total: totalCents,
      rate: combinedRate / 100, // Convert to percentage
    };
  }

  /**
   * Get fallback tax rates by state/location
   * Returns rates in basis points (1/100th of a percent)
   */
  private getFallbackRates(location: TaxLocation): {
    state: number;
    county: number;
    city: number;
    special: number;
  } {
    const state = location.state?.toUpperCase();

    // State-specific fallback rates (conservative estimates)
    // Format: basis points (e.g., 700 = 7%, 225 = 2.25%)
    const stateRates: Record<string, { state: number; county: number; city: number; special: number }> = {
      'TN': { state: 700, county: 225, city: 0, special: 0 }, // Tennessee: 7% state + 2.25% avg local
      'CA': { state: 725, county: 100, city: 100, special: 0 }, // California: 7.25% state + ~2% local
      'TX': { state: 625, county: 100, city: 100, special: 0 }, // Texas: 6.25% state + ~2% local
      'NY': { state: 400, county: 400, city: 0, special: 0 }, // New York: 4% state + ~4% local
      'FL': { state: 600, county: 100, city: 0, special: 0 }, // Florida: 6% state + ~1% local
      'WA': { state: 650, county: 250, city: 0, special: 0 }, // Washington: 6.5% state + ~2.5% local
      'IL': { state: 625, county: 250, city: 0, special: 0 }, // Illinois: 6.25% state + ~2.5% local
      'PA': { state: 600, county: 100, city: 0, special: 0 }, // Pennsylvania: 6% state + ~1% local
      'OH': { state: 575, county: 150, city: 0, special: 0 }, // Ohio: 5.75% state + ~1.5% local
      'GA': { state: 400, county: 300, city: 0, special: 0 }, // Georgia: 4% state + ~3% local
    };

    // Return state-specific rates or conservative default
    return stateRates[state || ''] || {
      state: 700,  // 7% conservative default
      county: 200, // 2% local average
      city: 0,
      special: 0,
    };
  }

  /**
   * Generate cache key for tax rates
   */
  private getTaxCacheKey(location: TaxLocation): string {
    return `tax:rate:${location.country}:${location.state}:${location.zip}`;
  }

  /**
   * Get tax rate for a location (without calculating specific amount)
   * Useful for displaying estimated tax rates
   */
  async getTaxRate(location: TaxLocation): Promise<number> {
    const testAmount = 10000; // $100 test amount
    const breakdown = await this.calculateTax(testAmount, location, 'test');
    return breakdown.rate;
  }

  /**
   * Validate nexus (tax obligation) in a state
   * Determines if the platform needs to collect tax in that state
   */
  async hasNexusInState(state: string): Promise<boolean> {
    // This would typically integrate with TaxJar's nexus API
    // For now, return true for states where we have physical presence
    const nexusStates = process.env.TAX_NEXUS_STATES?.split(',') || [
      'TN', // Tennessee - headquarters
      'CA', // California - office
      'NY', // New York - office
    ];

    return nexusStates.includes(state.toUpperCase());
  }
}
