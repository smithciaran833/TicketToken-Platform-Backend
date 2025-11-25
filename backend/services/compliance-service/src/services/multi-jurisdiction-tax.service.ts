import { db } from './database.service';
import { logger } from '../utils/logger';

/**
 * MULTI-JURISDICTION TAX SERVICE
 * 
 * Handles tax calculations for multiple states/jurisdictions
 * Phase 6: Advanced Compliance Features
 */

export interface TaxJurisdiction {
  code: string;
  name: string;
  type: 'state' | 'county' | 'city';
  taxRate: number;
  threshold1099: number;
  requiresRegistration: boolean;
  filingFrequency: 'monthly' | 'quarterly' | 'annual';
}

export interface TaxCalculation {
  jurisdiction: string;
  grossAmount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  netAmount: number;
}

export class MultiJurisdictionTaxService {
  private jurisdictions: Map<string, TaxJurisdiction> = new Map();

  constructor() {
    this.loadJurisdictions();
  }

  /**
   * Load tax jurisdictions
   */
  private loadJurisdictions(): void {
    // US State tax rates (simplified - actual rates vary by locality)
    const states: TaxJurisdiction[] = [
      { code: 'CA', name: 'California', type: 'state', taxRate: 0.0725, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'NY', name: 'New York', type: 'state', taxRate: 0.08875, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'TX', name: 'Texas', type: 'state', taxRate: 0.0625, threshold1099: 600, requiresRegistration: false, filingFrequency: 'quarterly' },
      { code: 'FL', name: 'Florida', type: 'state', taxRate: 0.06, threshold1099: 600, requiresRegistration: false, filingFrequency: 'monthly' },
      { code: 'IL', name: 'Illinois', type: 'state', taxRate: 0.0625, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'PA', name: 'Pennsylvania', type: 'state', taxRate: 0.06, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'OH', name: 'Ohio', type: 'state', taxRate: 0.0575, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'GA', name: 'Georgia', type: 'state', taxRate: 0.04, threshold1099: 600, requiresRegistration: true, filingFrequency: 'monthly' },
      { code: 'NC', name: 'North Carolina', type: 'state', taxRate: 0.0475, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'MI', name: 'Michigan', type: 'state', taxRate: 0.06, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'NJ', name: 'New Jersey', type: 'state', taxRate: 0.06625, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'VA', name: 'Virginia', type: 'state', taxRate: 0.053, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'WA', name: 'Washington', type: 'state', taxRate: 0.065, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'AZ', name: 'Arizona', type: 'state', taxRate: 0.056, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'MA', name: 'Massachusetts', type: 'state', taxRate: 0.0625, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'TN', name: 'Tennessee', type: 'state', taxRate: 0.07, threshold1099: 600, requiresRegistration: false, filingFrequency: 'quarterly' },
      { code: 'IN', name: 'Indiana', type: 'state', taxRate: 0.07, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'MO', name: 'Missouri', type: 'state', taxRate: 0.0423, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'MD', name: 'Maryland', type: 'state', taxRate: 0.06, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
      { code: 'WI', name: 'Wisconsin', type: 'state', taxRate: 0.05, threshold1099: 600, requiresRegistration: true, filingFrequency: 'quarterly' },
    ];

    states.forEach(jurisdiction => {
      this.jurisdictions.set(jurisdiction.code, jurisdiction);
    });

    logger.info(`Loaded ${this.jurisdictions.size} tax jurisdictions`);
  }

  /**
   * Calculate tax for a single jurisdiction
   */
  calculateTax(
    jurisdiction: string,
    amount: number,
    taxExempt: boolean = false
  ): TaxCalculation {
    const jurisdictionData = this.jurisdictions.get(jurisdiction);
    
    if (!jurisdictionData) {
      throw new Error(`Unknown jurisdiction: ${jurisdiction}`);
    }

    const taxableAmount = taxExempt ? 0 : amount;
    const taxAmount = taxableAmount * jurisdictionData.taxRate;
    const netAmount = amount - taxAmount;

    return {
      jurisdiction,
      grossAmount: amount,
      taxableAmount,
      taxRate: jurisdictionData.taxRate,
      taxAmount,
      netAmount,
    };
  }

  /**
   * Calculate tax for multiple jurisdictions
   */
  calculateMultiJurisdictionTax(
    jurisdictions: string[],
    amount: number
  ): TaxCalculation[] {
    return jurisdictions.map(jurisdiction => 
      this.calculateTax(jurisdiction, amount)
    );
  }

  /**
   * Get jurisdiction info
   */
  getJurisdiction(code: string): TaxJurisdiction | null {
    return this.jurisdictions.get(code) || null;
  }

  /**
   * Get all jurisdictions
   */
  getAllJurisdictions(): TaxJurisdiction[] {
    return Array.from(this.jurisdictions.values());
  }

  /**
   * Check if venue meets 1099 threshold in jurisdiction
   */
  async checkThreshold1099(
    venueId: string,
    tenantId: string,
    jurisdiction: string,
    year: number
  ): Promise<{ meetsThreshold: boolean; totalAmount: number; threshold: number }> {
    const jurisdictionData = this.jurisdictions.get(jurisdiction);
    
    if (!jurisdictionData) {
      throw new Error(`Unknown jurisdiction: ${jurisdiction}`);
    }

    // Get total earnings for venue in jurisdiction for year
    const result = await db.query(
      `SELECT COALESCE(SUM(amount), 0) as total
       FROM tax_records
       WHERE venue_id = $1 
         AND tenant_id = $2 
         AND jurisdiction = $3 
         AND year = $4`,
      [venueId, tenantId, jurisdiction, year]
    );

    const totalAmount = parseFloat(result.rows[0]?.total || '0');
    const meetsThreshold = totalAmount >= jurisdictionData.threshold1099;

    return {
      meetsThreshold,
      totalAmount,
      threshold: jurisdictionData.threshold1099,
    };
  }

  /**
   * Get venues requiring 1099s in jurisdiction
   */
  async getVenuesRequiring1099(
    tenantId: string,
    jurisdiction: string,
    year: number
  ): Promise<Array<{ venueId: string; totalAmount: number }>> {
    const jurisdictionData = this.jurisdictions.get(jurisdiction);
    
    if (!jurisdictionData) {
      throw new Error(`Unknown jurisdiction: ${jurisdiction}`);
    }

    const result = await db.query(
      `SELECT venue_id, SUM(amount) as total_amount
       FROM tax_records
       WHERE tenant_id = $1 
         AND jurisdiction = $2 
         AND year = $3
       GROUP BY venue_id
       HAVING SUM(amount) >= $4
       ORDER BY total_amount DESC`,
      [tenantId, jurisdiction, year, jurisdictionData.threshold1099]
    );

    return result.rows.map(row => ({
      venueId: row.venue_id,
      totalAmount: parseFloat(row.total_amount),
    }));
  }

  /**
   * Record taxable transaction
   */
  async recordTaxableTransaction(
    venueId: string,
    tenantId: string,
    jurisdiction: string,
    amount: number,
    transactionId: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    const tax = this.calculateTax(jurisdiction, amount);

    await db.query(
      `INSERT INTO tax_records (
        venue_id, tenant_id, jurisdiction, amount, tax_amount, 
        transaction_id, year, metadata, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        venueId,
        tenantId,
        jurisdiction,
        amount,
        tax.taxAmount,
        transactionId,
        new Date().getFullYear(),
        JSON.stringify(metadata),
      ]
    );

    logger.info(`Recorded tax transaction: ${transactionId} for ${jurisdiction}`);
  }

  /**
   * Get tax summary by jurisdiction
   */
  async getTaxSummary(
    tenantId: string,
    year?: number
  ): Promise<Array<{
    jurisdiction: string;
    totalAmount: number;
    taxAmount: number;
    transactionCount: number;
  }>> {
    const targetYear = year || new Date().getFullYear();

    const result = await db.query(
      `SELECT 
        jurisdiction,
        SUM(amount) as total_amount,
        SUM(tax_amount) as tax_amount,
        COUNT(*) as transaction_count
       FROM tax_records
       WHERE tenant_id = $1 AND year = $2
       GROUP BY jurisdiction
       ORDER BY total_amount DESC`,
      [tenantId, targetYear]
    );

    return result.rows.map(row => ({
      jurisdiction: row.jurisdiction,
      totalAmount: parseFloat(row.total_amount),
      taxAmount: parseFloat(row.tax_amount),
      transactionCount: parseInt(row.transaction_count),
    }));
  }

  /**
   * Get jurisdictions requiring registration
   */
  getJurisdictionsRequiringRegistration(): TaxJurisdiction[] {
    return Array.from(this.jurisdictions.values())
      .filter(j => j.requiresRegistration);
  }

  /**
   * Get filing calendar for jurisdiction
   */
  getFilingCalendar(jurisdiction: string, year: number): Array<{ 
    quarter?: number;
    month?: number;
    dueDate: Date;
  }> {
    const jurisdictionData = this.jurisdictions.get(jurisdiction);
    
    if (!jurisdictionData) {
      throw new Error(`Unknown jurisdiction: ${jurisdiction}`);
    }

    const calendar: Array<{ quarter?: number; month?: number; dueDate: Date }> = [];

    if (jurisdictionData.filingFrequency === 'quarterly') {
      // Quarterly filings - due on the last day of the month following quarter end
      for (let q = 1; q <= 4; q++) {
        const quarterEndMonth = q * 3;
        const dueMonth = (quarterEndMonth % 12) + 1;
        const dueYear = dueMonth === 1 ? year + 1 : year;
        const lastDay = new Date(dueYear, dueMonth, 0).getDate();
        
        calendar.push({
          quarter: q,
          dueDate: new Date(dueYear, dueMonth - 1, lastDay),
        });
      }
    } else if (jurisdictionData.filingFrequency === 'monthly') {
      // Monthly filings - due on the 20th of following month
      for (let m = 1; m <= 12; m++) {
        const dueMonth = (m % 12) + 1;
        const dueYear = dueMonth === 1 ? year + 1 : year;
        
        calendar.push({
          month: m,
          dueDate: new Date(dueYear, dueMonth - 1, 20),
        });
      }
    } else {
      // Annual filing - due March 31 of following year
      calendar.push({
        dueDate: new Date(year + 1, 2, 31),
      });
    }

    return calendar;
  }

  /**
   * Check compliance status across jurisdictions
   */
  async checkMultiJurisdictionCompliance(
    tenantId: string,
    year: number
  ): Promise<Array<{
    jurisdiction: string;
    registered: boolean;
    filingRequired: boolean;
    filingComplete: boolean;
    venueCount: number;
  }>> {
    const jurisdictions = this.getJurisdictionsRequiringRegistration();
    const compliance: Array<any> = [];

    for (const jurisdiction of jurisdictions) {
      const venues = await this.getVenuesRequiring1099(tenantId, jurisdiction.code, year);
      const filingRequired = venues.length > 0;

      // Check if filings are complete
      const filingResult = await db.query(
        `SELECT COUNT(*) as count
         FROM form_1099_records
         WHERE tenant_id = $1 
           AND jurisdiction = $2 
           AND year = $3`,
        [tenantId, jurisdiction.code, year]
      );

      const filingComplete = filingRequired ? 
        parseInt(filingResult.rows[0]?.count || '0') >= venues.length : 
        true;

      compliance.push({
        jurisdiction: jurisdiction.code,
        registered: jurisdiction.requiresRegistration,
        filingRequired,
        filingComplete,
        venueCount: venues.length,
      });
    }

    return compliance;
  }
}

export const multiJurisdictionTaxService = new MultiJurisdictionTaxService();
