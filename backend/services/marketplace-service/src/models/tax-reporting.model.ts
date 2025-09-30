import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface TaxReport {
  id: string;
  seller_id: string;
  year: number;
  total_sales: number;
  total_transactions: number;
  total_fees_paid: number;
  net_proceeds: number;
  generated_at: Date;
  report_data?: Record<string, any>;
}

export interface TaxableTransaction {
  id: string;
  seller_id: string;
  transfer_id: string;
  sale_amount: number;
  platform_fee: number;
  net_amount: number;
  transaction_date: Date;
  buyer_wallet: string;
  ticket_id: string;
  reported: boolean;
}

export class TaxReportingModel {
  private readonly reportsTable = 'tax_reports';
  private readonly transactionsTable = 'taxable_transactions';
  
  async recordSale(
    sellerId: string,
    transferId: string,
    saleAmount: number,
    platformFee: number,
    buyerWallet: string,
    ticketId: string
  ): Promise<void> {
    try {
      const transaction: TaxableTransaction = {
        id: uuidv4(),
        seller_id: sellerId,
        transfer_id: transferId,
        sale_amount: saleAmount,
        platform_fee: platformFee,
        net_amount: saleAmount - platformFee,
        transaction_date: new Date(),
        buyer_wallet: buyerWallet,
        ticket_id: ticketId,
        reported: false
      };
      
      await db(this.transactionsTable).insert(transaction);
      
      logger.info(`Taxable transaction recorded for seller ${sellerId}`);
    } catch (error) {
      logger.error('Error recording taxable transaction:', error);
      throw error;
    }
  }
  
  async getYearlyReport(sellerId: string, year: number): Promise<TaxReport | null> {
    try {
      // Check if report already exists
      const existingReport = await db(this.reportsTable)
        .where('seller_id', sellerId)
        .where('year', year)
        .first();
      
      if (existingReport) {
        return {
          ...existingReport,
          report_data: existingReport.report_data ? 
            JSON.parse(existingReport.report_data) : undefined
        };
      }
      
      // Generate new report
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      const transactions = await db(this.transactionsTable)
        .where('seller_id', sellerId)
        .whereBetween('transaction_date', [startDate, endDate])
        .select('*');
      
      if (transactions.length === 0) {
        return null;
      }
      
      const totalSales = transactions.reduce((sum, t) => sum + t.sale_amount, 0);
      const totalFees = transactions.reduce((sum, t) => sum + t.platform_fee, 0);
      const netProceeds = transactions.reduce((sum, t) => sum + t.net_amount, 0);
      
      const report: TaxReport = {
        id: uuidv4(),
        seller_id: sellerId,
        year,
        total_sales: totalSales,
        total_transactions: transactions.length,
        total_fees_paid: totalFees,
        net_proceeds: netProceeds,
        generated_at: new Date(),
        report_data: {
          transactions_by_month: this.groupTransactionsByMonth(transactions),
          largest_sale: Math.max(...transactions.map(t => t.sale_amount)),
          average_sale: totalSales / transactions.length
        }
      };
      
      await db(this.reportsTable).insert({
        ...report,
        report_data: JSON.stringify(report.report_data)
      });
      
      // Mark transactions as reported
      await db(this.transactionsTable)
        .whereIn('id', transactions.map(t => t.id))
        .update({ reported: true });
      
      return report;
    } catch (error) {
      logger.error('Error generating yearly report:', error);
      return null;
    }
  }
  
  async generate1099K(sellerId: string, year: number): Promise<any> {
    try {
      const report = await this.getYearlyReport(sellerId, year);
      
      if (!report) {
        return null;
      }
      
      // Check if meets IRS threshold ($600)
      const irsThreshold = 600;
      if (report.net_proceeds < irsThreshold) {
        return {
          required: false,
          reason: `Net proceeds ($${report.net_proceeds}) below IRS threshold ($${irsThreshold})`
        };
      }
      
      // Generate 1099-K data structure
      return {
        required: true,
        form_type: '1099-K',
        tax_year: year,
        payer: {
          name: 'TicketToken Platform',
          tin: process.env.PLATFORM_TIN || 'XX-XXXXXXX'
        },
        payee: {
          id: sellerId,
          // Additional payee info would be fetched from user service
        },
        gross_amount: report.total_sales,
        transactions_count: report.total_transactions,
        fees_deducted: report.total_fees_paid,
        net_proceeds: report.net_proceeds,
        generated_at: new Date()
      };
    } catch (error) {
      logger.error('Error generating 1099-K:', error);
      return null;
    }
  }
  
  private groupTransactionsByMonth(transactions: TaxableTransaction[]): Record<string, any> {
    const grouped: Record<string, any> = {};
    
    transactions.forEach(t => {
      const month = new Date(t.transaction_date).toISOString().slice(0, 7);
      if (!grouped[month]) {
        grouped[month] = {
          count: 0,
          total: 0,
          fees: 0,
          net: 0
        };
      }
      grouped[month].count++;
      grouped[month].total += t.sale_amount;
      grouped[month].fees += t.platform_fee;
      grouped[month].net += t.net_amount;
    });
    
    return grouped;
  }
  
  async getReportableTransactions(
    sellerId: string,
    year: number
  ): Promise<TaxableTransaction[]> {
    try {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31, 23, 59, 59);
      
      return await db(this.transactionsTable)
        .where('seller_id', sellerId)
        .whereBetween('transaction_date', [startDate, endDate])
        .orderBy('transaction_date', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting reportable transactions:', error);
      return [];
    }
  }
}

export const taxReportingModel = new TaxReportingModel();
