import { db } from './database.service';
import { logger } from '../utils/logger';

export class TaxService {
  private readonly FORM_1099_THRESHOLD = 600; // Real IRS threshold
  private readonly TICKET_REPORTING_THRESHOLD = 200; // Per transaction

  async trackSale(venueId: string, amount: number, ticketId: string, tenantId: string) {
    try {
      // Get current year totals
      const year = new Date().getFullYear();
      
      const result = await db.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM tax_records
         WHERE venue_id = $1 AND year = $2 AND tenant_id = $3`,
        [venueId, year, tenantId]
      );
      
      const currentTotal = parseFloat(result.rows[0]?.total || '0');
      const newTotal = currentTotal + amount;
      
      // Check if threshold reached
      const thresholdReached = newTotal >= this.FORM_1099_THRESHOLD;
      
      // Log the sale
      await db.query(
        `INSERT INTO tax_records (venue_id, year, amount, ticket_id, threshold_reached, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [venueId, year, amount, ticketId, thresholdReached, tenantId]
      );
      
      // Alert if threshold just crossed
      if (!thresholdReached && newTotal >= this.FORM_1099_THRESHOLD) {
        logger.info(`🚨 VENUE ${venueId} (tenant ${tenantId}) has reached $${this.FORM_1099_THRESHOLD} threshold!`);
        logger.info(`📋 1099-K required for tax year ${year}`);
      }
      
      return {
        venueId,
        year,
        saleAmount: amount,
        yearToDate: newTotal,
        thresholdReached,
        requires1099: thresholdReached,
        percentToThreshold: (newTotal / this.FORM_1099_THRESHOLD) * 100
      };
    } catch (error) {
      logger.error({ error }, 'Error tracking sale:');
      throw error;
    }
  }

  async getVenueTaxSummary(venueId: string, year: number | undefined, tenantId: string) {
    const taxYear = year || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        MAX(amount) as largest_sale,
        MIN(created_at) as first_sale,
        MAX(created_at) as last_sale
       FROM tax_records
       WHERE venue_id = $1 AND year = $2 AND tenant_id = $3`,
      [venueId, taxYear, tenantId]
    );
    
    const total = parseFloat(result.rows[0]?.total_sales || '0');
    
    return {
      venueId,
      year: taxYear,
      totalSales: total,
      transactionCount: result.rows[0].transaction_count,
      requires1099: total >= this.FORM_1099_THRESHOLD,
      thresholdStatus: {
        reached: total >= this.FORM_1099_THRESHOLD,
        amount: total,
        threshold: this.FORM_1099_THRESHOLD,
        remaining: Math.max(0, this.FORM_1099_THRESHOLD - total)
      },
      largestSale: result.rows[0].largest_sale,
      firstSale: result.rows[0].first_sale,
      lastSale: result.rows[0].last_sale
    };
  }

  async calculateTax(data: any, tenantId: string) {
    // Simple tax calculation implementation
    const { amount, venueId, taxRate = 0.08 } = data;
    
    const taxAmount = amount * taxRate;
    const totalWithTax = amount + taxAmount;
    
    // Log the calculation
    await db.query(
      `INSERT INTO tax_calculations (venue_id, amount, tax_rate, tax_amount, total, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [venueId, amount, taxRate, taxAmount, totalWithTax, tenantId]
    );
    
    return {
      originalAmount: amount,
      taxRate,
      taxAmount,
      totalWithTax,
      venueId,
      timestamp: new Date().toISOString()
    };
  }

  async generateTaxReport(year: number, tenantId: string) {
    // Generate comprehensive tax report for the year
    const result = await db.query(
      `SELECT 
        venue_id,
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        COUNT(CASE WHEN threshold_reached THEN 1 END) as threshold_transactions
       FROM tax_records
       WHERE year = $1 AND tenant_id = $2
       GROUP BY venue_id
       ORDER BY total_sales DESC`,
      [year, tenantId]
    );
    
    const venues1099Required = result.rows.filter(
      row => parseFloat(row.total_sales) >= this.FORM_1099_THRESHOLD
    );
    
    return {
      year,
      generatedAt: new Date().toISOString(),
      summary: {
        totalVenues: result.rows.length,
        venues1099Required: venues1099Required.length,
        totalTransactions: result.rows.reduce((sum, row) => sum + parseInt(row.transaction_count), 0),
        totalSales: result.rows.reduce((sum, row) => sum + parseFloat(row.total_sales), 0)
      },
      venueDetails: result.rows.map(row => ({
        venueId: row.venue_id,
        transactionCount: row.transaction_count,
        totalSales: parseFloat(row.total_sales),
        requires1099: parseFloat(row.total_sales) >= this.FORM_1099_THRESHOLD
      })),
      form1099Required: venues1099Required
    };
  }
}

export const taxService = new TaxService();
