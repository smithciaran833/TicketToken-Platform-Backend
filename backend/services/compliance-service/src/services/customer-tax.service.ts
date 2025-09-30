import { db } from './database.service';

export class CustomerTaxService {
  private readonly FORM_1099_DA_THRESHOLD = 600; // IRS threshold for digital assets

  async trackNFTSale(customerId: string, saleAmount: number, ticketId: string): Promise<any> {
    const year = new Date().getFullYear();

    // Track the sale
    await db.query(
      `INSERT INTO customer_tax_records
       (customer_id, year, transaction_type, amount, ticket_id, asset_type)
       VALUES ($1, $2, 'nft_sale', $3, $4, 'ticket_nft')`,
      [customerId, year, saleAmount, ticketId]
    );

    // Check yearly total
    const result = await db.query(
      `SELECT SUM(amount) as total FROM customer_tax_records
       WHERE customer_id = $1 AND year = $2 AND transaction_type = 'nft_sale'`,
      [customerId, year]
    );

    const yearlyTotal = parseFloat(result.rows[0].total);
    const requires1099DA = yearlyTotal >= this.FORM_1099_DA_THRESHOLD;

    if (requires1099DA) {
      // Flag customer for 1099-DA - fixed to handle constraint properly
      await db.query(
        `INSERT INTO tax_reporting_requirements
         (customer_id, year, form_type, threshold_met, total_amount)
         VALUES ($1, $2, '1099-DA', true, $3)
         ON CONFLICT (customer_id, year, form_type) 
         DO UPDATE SET 
           total_amount = EXCLUDED.total_amount,
           threshold_met = EXCLUDED.threshold_met,
           updated_at = NOW()
         WHERE tax_reporting_requirements.customer_id IS NOT DISTINCT FROM EXCLUDED.customer_id`,
        [customerId, year, yearlyTotal]
      );
    }

    return { yearlyTotal, requires1099DA };
  }

  async getCustomerTaxSummary(customerId: string, year?: number) {
    const taxYear = year || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT 
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales
       FROM customer_tax_records
       WHERE customer_id = $1 AND year = $2 AND transaction_type = 'nft_sale'`,
      [customerId, taxYear]
    );
    
    const total = parseFloat(result.rows[0]?.total_sales || '0');
    
    return {
      customerId,
      year: taxYear,
      totalNFTSales: total,
      transactionCount: result.rows[0].transaction_count,
      requires1099DA: total >= this.FORM_1099_DA_THRESHOLD
    };
  }
}

export const customerTaxService = new CustomerTaxService();
