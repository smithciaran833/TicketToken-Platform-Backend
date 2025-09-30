import { logger } from '../utils/logger';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

class TaxReportingServiceClass {
  async recordSale(
    sellerId: string,
    transferId: string,
    saleAmountCents: number,
    platformFeeCents: number
  ) {
    try {
      await db('taxable_transactions').insert({
        id: uuidv4(),
        seller_id: sellerId,
        transfer_id: transferId,
        sale_amount: saleAmountCents,
        platform_fee: platformFeeCents,
        net_amount: saleAmountCents - platformFeeCents,
        transaction_date: new Date(),
        reported: false
      });
      logger.info(`Taxable transaction recorded for seller ${sellerId}`);
    } catch (error) {
      logger.error('Error recording sale:', error);
      throw error;
    }
  }

  async getYearlyReport(sellerId: string, year: number) {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      const transactions = await db('marketplace_transfers')
        .where('seller_id', sellerId)
        .where('status', 'completed')
        .whereBetween('transferred_at', [startDate, endDate])
        .select('*');

      if (transactions.length === 0) {
        return null;
      }

      // Sum amounts (already in cents as integers)
      const totalSalesCents = transactions.reduce((sum: number, t: any) => sum + parseInt(t.amount || 0), 0);
      const totalFeesCents = transactions.reduce((sum: number, t: any) => sum + parseInt(t.platform_fee || 0), 0);

      return {
        id: uuidv4(),
        seller_id: sellerId,
        year,
        total_sales: totalSalesCents,
        total_transactions: transactions.length,
        total_fees_paid: totalFeesCents,
        net_proceeds: totalSalesCents - totalFeesCents,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating yearly report:', error);
      return null;
    }
  }

  async generate1099K(sellerId: string, year: number) {
    try {
      const report = await this.getYearlyReport(sellerId, year);

      if (!report) {
        return null;
      }

      const irsThresholdCents = 60000; // $600 in cents

      if (report.net_proceeds < irsThresholdCents) {
        return {
          required: false,
          reason: `Net proceeds ($${report.net_proceeds / 100}) below IRS threshold ($${irsThresholdCents / 100})`
        };
      }

      return {
        required: true,
        form_type: '1099-K',
        tax_year: year,
        gross_amount: report.total_sales,
        transactions_count: report.total_transactions,
        net_proceeds: report.net_proceeds,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      return null;
    }
  }

  async getReportableTransactions(sellerId: string, year: number) {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);

      return await db('marketplace_transfers')
        .where('seller_id', sellerId)
        .where('status', 'completed')
        .whereBetween('transferred_at', [startDate, endDate])
        .orderBy('transferred_at', 'desc');
    } catch (error) {
      logger.error('Error getting reportable transactions:', error);
      return [];
    }
  }
}

export const taxReportingService = new TaxReportingServiceClass();
