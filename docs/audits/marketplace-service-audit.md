# DATABASE AUDIT: marketplace-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "pg": "^8.11.3",
    "prom-client": "^15.1.3",
    "redis": "^5.8.2",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex, { Knex } from 'knex';
import { logger } from '../utils/logger';

// Debug: Log the connection details (remove password from logs in production!)
console.log('DB Connection attempt:', {
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || '5432',
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD ? '[HIDDEN]' : 'NO PASSWORD SET',
  passwordLength: process.env.DB_PASSWORD?.length || 0
});

const config: Knex.Config = {
  client: 'postgresql',
  connection: {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'tickettoken_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  },
  pool: {
    min: 2,
    max: 10,
    createTimeoutMillis: 3000,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 1000,
    createRetryIntervalMillis: 100,
  },
  migrations: {
    directory: './migrations',
    extension: 'ts',
  },
  seeds: {
    directory: './seeds',
    extension: 'ts',
  },
};

export const db = knex(config);

// Test connection function
export async function testConnection(): Promise<boolean> {
  try {
    await db.raw('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error) {
```


## 3. MODEL/ENTITY FILES
### backend/services/marketplace-service//src/models/listing.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceListing {
  id: string;
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  priceMultiplier?: number;   // DECIMAL (e.g., 1.5 = 150%)
  status: 'active' | 'sold' | 'cancelled' | 'expired' | 'pending_approval';
  listedAt: Date;
  soldAt?: Date;
  expiresAt?: Date;
  cancelledAt?: Date;
  listingSignature?: string;
  walletAddress: string;
  programAddress?: string;
  requiresApproval: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  approvalNotes?: string;
  viewCount: number;
  favoriteCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateListingInput {
  ticketId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  price: number;              // INTEGER CENTS
  originalFaceValue: number;  // INTEGER CENTS
  walletAddress: string;
  expiresAt?: Date;
  requiresApproval?: boolean;
}

export interface UpdateListingInput {
  price?: number;  // INTEGER CENTS
  expiresAt?: Date;
}

export class ListingModel {
  private tableName = 'marketplace_listings';

  async create(input: CreateListingInput): Promise<MarketplaceListing> {
    const id = uuidv4();
    const [listing] = await db(this.tableName)
      .insert({
        id,
        ticket_id: input.ticketId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        price: input.price,
        original_face_value: input.originalFaceValue,
        wallet_address: input.walletAddress,
        expires_at: input.expiresAt,
        requires_approval: input.requiresApproval || false,
        status: input.requiresApproval ? 'pending_approval' : 'active',
      })
      .returning('*');

    return this.mapToListing(listing);
  }

  async findById(id: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ id })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByTicketId(ticketId: string): Promise<MarketplaceListing | null> {
    const listing = await db(this.tableName)
      .where({ ticket_id: ticketId, status: 'active' })
      .first();

    return listing ? this.mapToListing(listing) : null;
  }

  async findByEventId(
    eventId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .orderBy('price', 'asc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async findBySellerId(
    sellerId: string,
    status?: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceListing[]> {
    let query = db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('listed_at', 'desc')
      .limit(limit)
      .offset(offset);

    if (status) {
      query = query.where({ status });
    }

    const listings = await query;
    return listings.map(this.mapToListing);
  }

  async update(
    id: string,
    input: UpdateListingInput
  ): Promise<MarketplaceListing | null> {
    const updateData: any = {};

    if (input.price !== undefined) {
      updateData.price = input.price;
    }
    if (input.expiresAt !== undefined) {
      updateData.expires_at = input.expiresAt;
    }

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async updateStatus(
    id: string,
    status: MarketplaceListing['status'],
    additionalData?: any
  ): Promise<MarketplaceListing | null> {
    const updateData: any = { status };

    if (status === 'sold' && !additionalData?.sold_at) {
      updateData.sold_at = new Date();
    }
    if (status === 'cancelled' && !additionalData?.cancelled_at) {
      updateData.cancelled_at = new Date();
    }

    Object.assign(updateData, additionalData);

    const [listing] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return listing ? this.mapToListing(listing) : null;
  }

  async incrementViewCount(id: string): Promise<void> {
    await db(this.tableName)
      .where({ id })
      .increment('view_count', 1);
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async countByUserId(userId: string, eventId?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ seller_id: userId, status: 'active' })
      .count('* as count');

    if (eventId) {
      query = query.where({ event_id: eventId });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async expireListings(eventId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ event_id: eventId, status: 'active' })
      .update({ status: 'expired' });

    return result;
  }

  private mapToListing(row: any): MarketplaceListing {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      price: parseInt(row.price),  // Ensure integer cents
      originalFaceValue: parseInt(row.original_face_value),  // Ensure integer cents
      priceMultiplier: row.price_multiplier ? parseFloat(row.price_multiplier) : undefined,  // Keep as decimal
      status: row.status,
      listedAt: row.listed_at,
      soldAt: row.sold_at,
      expiresAt: row.expires_at,
      cancelledAt: row.cancelled_at,
      listingSignature: row.listing_signature,
      walletAddress: row.wallet_address,
      programAddress: row.program_address,
      requiresApproval: row.requires_approval,
      approvedAt: row.approved_at,
      approvedBy: row.approved_by,
      approvalNotes: row.approval_notes,
      viewCount: row.view_count,
      favoriteCount: row.favorite_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const listingModel = new ListingModel();
```

### backend/services/marketplace-service//src/models/tax-reporting.model.ts
```typescript
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
```

### backend/services/marketplace-service//src/models/dispute.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { DisputeStatus } from '../types/common.types';

export interface Dispute {
  id: string;
  transfer_id: string;
  listing_id: string;
  initiator_id: string;
  respondent_id: string;
  reason: string;
  description?: string;
  status: DisputeStatus;
  resolution?: string;
  resolved_by?: string;
  created_at: Date;
  updated_at: Date;
  resolved_at?: Date;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  submitted_by: string;
  evidence_type: 'text' | 'image' | 'document' | 'blockchain_tx';
  content: string;
  metadata?: Record<string, any>;
  submitted_at: Date;
}

export class DisputeModel {
  private readonly tableName = 'marketplace_disputes';
  private readonly evidenceTable = 'dispute_evidence';
  
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    respondentId: string,
    reason: string,
    description?: string
  ): Promise<Dispute> {
    try {
      const dispute: Partial<Dispute> = {
        id: uuidv4(),
        transfer_id: transferId,
        listing_id: listingId,
        initiator_id: initiatorId,
        respondent_id: respondentId,
        reason,
        description,
        status: 'open',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db(this.tableName).insert(dispute);
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute as Dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(
    disputeId: string,
    submittedBy: string,
    evidenceType: 'text' | 'image' | 'document' | 'blockchain_tx',
    content: string,
    metadata?: Record<string, any>
  ): Promise<DisputeEvidence> {
    try {
      const evidence: Partial<DisputeEvidence> = {
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: submittedBy,
        evidence_type: evidenceType,
        content,
        metadata,
        submitted_at: new Date()
      };
      
      await db(this.evidenceTable).insert({
        ...evidence,
        metadata: evidence.metadata ? JSON.stringify(evidence.metadata) : null
      });
      
      logger.info(`Evidence added to dispute ${disputeId}`);
      return evidence as DisputeEvidence;
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async updateDisputeStatus(
    disputeId: string,
    status: DisputeStatus,
    resolution?: string,
    resolvedBy?: string
  ): Promise<void> {
    try {
      const updates: Partial<Dispute> = {
        status,
        updated_at: new Date()
      };
      
      if (status === 'resolved' || status === 'cancelled') {
        updates.resolution = resolution;
        updates.resolved_by = resolvedBy;
        updates.resolved_at = new Date();
      }
      
      await db(this.tableName)
        .where('id', disputeId)
        .update(updates);
      
      logger.info(`Dispute ${disputeId} updated to status: ${status}`);
    } catch (error) {
      logger.error('Error updating dispute status:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string): Promise<Dispute | null> {
    try {
      const dispute = await db(this.tableName)
        .where('id', disputeId)
        .first();
      
      return dispute || null;
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
    try {
      const evidence = await db(this.evidenceTable)
        .where('dispute_id', disputeId)
        .orderBy('submitted_at', 'asc')
        .select('*');
      
      return evidence.map(e => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : undefined
      }));
    } catch (error) {
      logger.error('Error getting dispute evidence:', error);
      return [];
    }
  }
  
  async getActiveDisputes(userId?: string): Promise<Dispute[]> {
    try {
      const query = db(this.tableName)
        .whereIn('status', ['open', 'investigating']);
      
      if (userId) {
        query.where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        });
      }
      
      return await query.orderBy('created_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting active disputes:', error);
      return [];
    }
  }
}

export const disputeModel = new DisputeModel();
```

### backend/services/marketplace-service//src/models/fee.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { percentOfCents } from '@tickettoken/shared/utils/money';

export interface PlatformFee {
  id: string;
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeeAmount: number;      // INTEGER CENTS
  platformFeePercentage: number;  // DECIMAL (5.00 = 5%)
  venueFeeAmount: number;         // INTEGER CENTS
  venueFeePercentage: number;     // DECIMAL (5.00 = 5%)
  sellerPayout: number;           // INTEGER CENTS
  platformFeeWallet?: string;
  platformFeeSignature?: string;
  venueFeeWallet?: string;
  venueFeeSignature?: string;
  platformFeeCollected: boolean;
  venueFeeCollected: boolean;
  createdAt: Date;
}

export interface CreateFeeInput {
  transferId: string;
  salePrice: number;              // INTEGER CENTS
  platformFeePercentage?: number; // DECIMAL (5.00 = 5%)
  venueFeePercentage?: number;    // DECIMAL (5.00 = 5%)
}

export class FeeModel {
  private tableName = 'platform_fees';

  async create(input: CreateFeeInput): Promise<PlatformFee> {
    const id = uuidv4();

    // Calculate fees using basis points
    const platformFeePercentage = input.platformFeePercentage || 5.00;
    const venueFeePercentage = input.venueFeePercentage || 5.00;
    
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);
    
    const platformFeeAmountCents = percentOfCents(input.salePrice, platformFeeBps);
    const venueFeeAmountCents = percentOfCents(input.salePrice, venueFeeBps);
    const sellerPayoutCents = input.salePrice - platformFeeAmountCents - venueFeeAmountCents;

    const [fee] = await db(this.tableName)
      .insert({
        id,
        transfer_id: input.transferId,
        sale_price: input.salePrice,
        platform_fee_amount: platformFeeAmountCents,
        platform_fee_percentage: platformFeePercentage,
        venue_fee_amount: venueFeeAmountCents,
        venue_fee_percentage: venueFeePercentage,
        seller_payout: sellerPayoutCents,
        platform_fee_collected: false,
        venue_fee_paid: false,
      })
      .returning('*');

    return this.mapToFee(fee);
  }

  async findById(id: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ id })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async findByTransferId(transferId: string): Promise<PlatformFee | null> {
    const fee = await db(this.tableName)
      .where({ transfer_id: transferId })
      .first();

    return fee ? this.mapToFee(fee) : null;
  }

  async updateFeeCollection(
    id: string,
    platformCollected?: boolean,
    venueCollected?: boolean,
    platformSignature?: string,
    venueSignature?: string
  ): Promise<PlatformFee | null> {
    const updateData: any = {};

    if (platformCollected !== undefined) {
      updateData.platform_fee_collected = platformCollected;
    }
    if (venueCollected !== undefined) {
      updateData.venue_fee_paid = venueCollected;
    }
    if (platformSignature) {
      updateData.platform_fee_signature = platformSignature;
    }
    if (venueSignature) {
      updateData.venue_fee_signature = venueSignature;
    }

    const [fee] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return fee ? this.mapToFee(fee) : null;
  }

  async getTotalPlatformFees(startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .where({ platform_fee_collected: true })
      .sum('platform_fee_amount as total');

    if (startDate) {
      query = query.where('created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  async getTotalVenueFees(venueId: string, startDate?: Date, endDate?: Date): Promise<number> {
    let query = db(this.tableName)
      .join('marketplace_transfers', 'platform_fees.transfer_id', 'marketplace_transfers.id')
      .where({
        'marketplace_transfers.venue_id': venueId,
        'platform_fees.venue_fee_paid': true
      })
      .sum('platform_fees.venue_fee_amount as total');

    if (startDate) {
      query = query.where('platform_fees.created_at', '>=', startDate);
    }
    if (endDate) {
      query = query.where('platform_fees.created_at', '<=', endDate);
    }

    const result = await query.first();
    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToFee(row: any): PlatformFee {
    return {
      id: row.id,
      transferId: row.transfer_id,
      salePrice: parseInt(row.sale_price),                       // INTEGER CENTS
      platformFeeAmount: parseInt(row.platform_fee_amount),      // INTEGER CENTS
      platformFeePercentage: parseFloat(row.platform_fee_percentage), // DECIMAL %
      venueFeeAmount: parseInt(row.venue_fee_amount),            // INTEGER CENTS
      venueFeePercentage: parseFloat(row.venue_fee_percentage),  // DECIMAL %
      sellerPayout: parseInt(row.seller_payout),                 // INTEGER CENTS
      platformFeeWallet: row.platform_fee_wallet,
      platformFeeSignature: row.platform_fee_signature,
      venueFeeWallet: row.venue_fee_wallet,
      venueFeeSignature: row.venue_fee_signature,
      platformFeeCollected: row.platform_fee_collected,
      venueFeeCollected: row.venue_fee_paid,
      createdAt: row.created_at,
    };
  }
}

export const feeModel = new FeeModel();
```

### backend/services/marketplace-service//src/models/price-history.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface PriceHistoryEntry {
  id: string;
  listing_id: string;
  old_price: number;        // INTEGER CENTS
  new_price: number;        // INTEGER CENTS
  price_change: number;     // INTEGER CENTS
  percentage_change: number; // DECIMAL (e.g., 5.5 = 5.5%)
  changed_by: string;
  reason?: string;
  changed_at: Date;
}

export interface PriceTrend {
  period: string;
  average_price: number;    // INTEGER CENTS
  min_price: number;        // INTEGER CENTS
  max_price: number;        // INTEGER CENTS
  total_changes: number;
  trend_direction: 'up' | 'down' | 'stable';
}

export class PriceHistoryModel {
  private readonly tableName = 'price_history';

  async recordPriceChange(
    listingId: string,
    oldPriceCents: number,
    newPriceCents: number,
    changedBy: string,
    reason?: string
  ): Promise<PriceHistoryEntry> {
    try {
      const priceChangeCents = newPriceCents - oldPriceCents;
      // Calculate percentage with precision, store as decimal
      const percentageChange = (priceChangeCents / oldPriceCents) * 100;

      const entry: PriceHistoryEntry = {
        id: uuidv4(),
        listing_id: listingId,
        old_price: oldPriceCents,
        new_price: newPriceCents,
        price_change: priceChangeCents,
        percentage_change: percentageChange,
        changed_by: changedBy,
        reason,
        changed_at: new Date()
      };

      await db(this.tableName).insert(entry);

      logger.info(`Price change recorded for listing ${listingId}: $${oldPriceCents/100} -> $${newPriceCents/100}`);
      return entry;
    } catch (error) {
      logger.error('Error recording price change:', error);
      throw error;
    }
  }

  async getPriceHistory(listingId: string): Promise<PriceHistoryEntry[]> {
    try {
      return await db(this.tableName)
        .where('listing_id', listingId)
        .orderBy('changed_at', 'desc')
        .select('*');
    } catch (error) {
      logger.error('Error getting price history:', error);
      return [];
    }
  }

  async getAveragePrice(
    eventId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<number> {
    try {
      const query = db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId);

      if (startDate) {
        query.where('ph.changed_at', '>=', startDate);
      }
      if (endDate) {
        query.where('ph.changed_at', '<=', endDate);
      }

      const result = await query.avg('ph.new_price as average');

      // Return average as integer cents
      return Math.round(parseFloat(result[0]?.average || '0'));
    } catch (error) {
      logger.error('Error calculating average price:', error);
      return 0;
    }
  }

  async getPriceTrends(
    eventId: string,
    period: 'day' | 'week' | 'month' = 'week'
  ): Promise<PriceTrend> {
    try {
      const periodDays = period === 'day' ? 1 : period === 'week' ? 7 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - periodDays);

      const stats = await db('marketplace_listings as ml')
        .join(this.tableName + ' as ph', 'ml.id', 'ph.listing_id')
        .where('ml.event_id', eventId)
        .where('ph.changed_at', '>=', startDate)
        .select(
          db.raw('AVG(ph.new_price) as average_price'),
          db.raw('MIN(ph.new_price) as min_price'),
          db.raw('MAX(ph.new_price) as max_price'),
          db.raw('COUNT(*) as total_changes'),
          db.raw('AVG(ph.percentage_change) as avg_change')
        )
        .first();

      const avgChange = parseFloat(stats?.avg_change || '0');
      const trendDirection = avgChange > 1 ? 'up' : avgChange < -1 ? 'down' : 'stable';

      return {
        period,
        average_price: Math.round(parseFloat(stats?.average_price || '0')),  // INTEGER CENTS
        min_price: Math.round(parseFloat(stats?.min_price || '0')),          // INTEGER CENTS
        max_price: Math.round(parseFloat(stats?.max_price || '0')),          // INTEGER CENTS
        total_changes: parseInt(stats?.total_changes || '0', 10),
        trend_direction: trendDirection
      };
    } catch (error) {
      logger.error('Error getting price trends:', error);
      return {
        period,
        average_price: 0,
        min_price: 0,
        max_price: 0,
        total_changes: 0,
        trend_direction: 'stable'
      };
    }
  }
}

export const priceHistoryModel = new PriceHistoryModel();
```

### backend/services/marketplace-service//src/models/blacklist.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface BlacklistEntry {
  id: string;
  user_id?: string;
  wallet_address?: string;
  reason: string;
  banned_by: string;
  banned_at: Date;
  expires_at?: Date;
  is_active: boolean;
}

export class BlacklistModel {
  private readonly tableName = 'marketplace_blacklist';
  
  async addToBlacklist(
    identifier: { user_id?: string; wallet_address?: string },
    reason: string,
    bannedBy: string,
    duration?: number // Duration in days
  ): Promise<BlacklistEntry> {
    try {
      const entry: Partial<BlacklistEntry> = {
        id: uuidv4(),
        ...identifier,
        reason,
        banned_by: bannedBy,
        banned_at: new Date(),
        is_active: true
      };
      
      if (duration) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + duration);
        entry.expires_at = expiresAt;
      }
      
      await db(this.tableName).insert(entry);
      
      logger.info(`Added to blacklist: ${JSON.stringify(identifier)}`);
      return entry as BlacklistEntry;
    } catch (error) {
      logger.error('Error adding to blacklist:', error);
      throw error;
    }
  }
  
  async removeFromBlacklist(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<void> {
    try {
      const query = db(this.tableName).where('is_active', true);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      await query.update({ is_active: false });
      
      logger.info(`Removed from blacklist: ${JSON.stringify(identifier)}`);
    } catch (error) {
      logger.error('Error removing from blacklist:', error);
      throw error;
    }
  }
  
  async isBlacklisted(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<boolean> {
    try {
      const query = db(this.tableName)
        .where('is_active', true)
        .where(function() {
          if (identifier.user_id) {
            this.orWhere('user_id', identifier.user_id);
          }
          if (identifier.wallet_address) {
            this.orWhere('wallet_address', identifier.wallet_address);
          }
        });
      
      const entries = await query.select('*');
      
      // Check for expired entries and deactivate them
      const now = new Date();
      for (const entry of entries) {
        if (entry.expires_at && new Date(entry.expires_at) < now) {
          await db(this.tableName)
            .where('id', entry.id)
            .update({ is_active: false });
          continue;
        }
        return true; // Found active, non-expired entry
      }
      
      return false;
    } catch (error) {
      logger.error('Error checking blacklist:', error);
      return false;
    }
  }
  
  async getBlacklistHistory(
    identifier: { user_id?: string; wallet_address?: string }
  ): Promise<BlacklistEntry[]> {
    try {
      const query = db(this.tableName);
      
      if (identifier.user_id) {
        query.where('user_id', identifier.user_id);
      }
      if (identifier.wallet_address) {
        query.where('wallet_address', identifier.wallet_address);
      }
      
      return await query.orderBy('banned_at', 'desc').select('*');
    } catch (error) {
      logger.error('Error getting blacklist history:', error);
      return [];
    }
  }
}

export const blacklistModel = new BlacklistModel();
```

### backend/services/marketplace-service//src/models/anti-bot.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { VELOCITY_CHECK_WINDOW_SECONDS, BOT_SCORE_THRESHOLD } from '../utils/constants';

export interface AntiBotActivity {
  id: string;
  user_id: string;
  action_type: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface BotScore {
  user_id: string;
  score: number;
  factors: {
    velocity_score: number;
    pattern_score: number;
    reputation_score: number;
  };
  is_bot: boolean;
  checked_at: Date;
}

export class AntiBotModel {
  private readonly tableName = 'anti_bot_activities';
  
  async recordActivity(
    userId: string,
    action: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await db(this.tableName).insert({
        id: uuidv4(),
        user_id: userId,
        action_type: action,
        ip_address: metadata?.ip_address,
        user_agent: metadata?.user_agent,
        timestamp: new Date(),
        metadata: JSON.stringify(metadata)
      });
    } catch (error) {
      logger.error('Error recording anti-bot activity:', error);
      throw error;
    }
  }
  
  async checkVelocity(
    userId: string,
    action: string,
    windowSeconds: number = VELOCITY_CHECK_WINDOW_SECONDS
  ): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - windowSeconds * 1000);
      
      const result = await db(this.tableName)
        .where('user_id', userId)
        .where('action_type', action)
        .where('timestamp', '>=', cutoff)
        .count('* as count');
      
      return parseInt(result[0].count as string, 10);
    } catch (error) {
      logger.error('Error checking velocity:', error);
      return 0;
    }
  }
  
  async calculateBotScore(userId: string): Promise<BotScore> {
    try {
      // Get recent activity patterns
      const recentActivity = await db(this.tableName)
        .where('user_id', userId)
        .where('timestamp', '>=', new Date(Date.now() - 3600000)) // Last hour
        .select('*');
      
      // Calculate velocity score (actions per minute)
      const velocityScore = Math.min(recentActivity.length / 60, 1);
      
      // Calculate pattern score (repetitive actions)
      const actionCounts = recentActivity.reduce((acc, act) => {
        acc[act.action_type] = (acc[act.action_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const maxActions = Math.max(...Object.values(actionCounts).map(v => Number(v)), 0);
      const patternScore = maxActions > 10 ? Math.min(maxActions / 20, 1) : 0;
      
      // Calculate reputation score (previous violations)
      const violations = await db('anti_bot_violations')
        .where('user_id', userId)
        .count('* as count');
      
      const reputationScore = Math.min(parseInt(violations[0]?.count as string || '0', 10) / 5, 1);
      
      // Calculate overall score
      const overallScore = (velocityScore * 0.4 + patternScore * 0.3 + reputationScore * 0.3);
      
      return {
        user_id: userId,
        score: overallScore,
        factors: {
          velocity_score: velocityScore,
          pattern_score: patternScore,
          reputation_score: reputationScore
        },
        is_bot: overallScore > BOT_SCORE_THRESHOLD,
        checked_at: new Date()
      };
    } catch (error) {
      logger.error('Error calculating bot score:', error);
      return {
        user_id: userId,
        score: 0,
        factors: {
          velocity_score: 0,
          pattern_score: 0,
          reputation_score: 0
        },
        is_bot: false,
        checked_at: new Date()
      };
    }
  }
  
  async flagSuspiciousActivity(
    userId: string,
    reason: string,
    severity: 'low' | 'medium' | 'high'
  ): Promise<void> {
    try {
      await db('anti_bot_violations').insert({
        id: uuidv4(),
        user_id: userId,
        reason,
        severity,
        flagged_at: new Date()
      });
    } catch (error) {
      logger.error('Error flagging suspicious activity:', error);
      throw error;
    }
  }
}

export const antiBotModel = new AntiBotModel();
```

### backend/services/marketplace-service//src/models/transfer.model.ts
```typescript
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';

export interface MarketplaceTransfer {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  transferSignature: string;
  blockHeight?: number;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount?: number;     // Amount in smallest unit (lamports/microUSDC)
  usdValue: number;           // INTEGER CENTS
  status: 'initiated' | 'pending' | 'completed' | 'failed' | 'disputed';
  initiatedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  failureReason?: string;
  networkFee?: number;        // Blockchain fee in smallest unit
  networkFeeUsd?: number;     // INTEGER CENTS
  createdAt: Date;
}

export interface CreateTransferInput {
  listingId: string;
  buyerId: string;
  sellerId: string;
  eventId: string;
  venueId: string;
  buyerWallet: string;
  sellerWallet: string;
  paymentCurrency: 'USDC' | 'SOL';
  paymentAmount: number;
  usdValue: number;           // INTEGER CENTS
}

export class TransferModel {
  private tableName = 'marketplace_transfers';

  async create(input: CreateTransferInput): Promise<MarketplaceTransfer> {
    const id = uuidv4();
    const [transfer] = await db(this.tableName)
      .insert({
        id,
        listing_id: input.listingId,
        buyer_id: input.buyerId,
        seller_id: input.sellerId,
        event_id: input.eventId,
        venue_id: input.venueId,
        buyer_wallet: input.buyerWallet,
        seller_wallet: input.sellerWallet,
        payment_currency: input.paymentCurrency,
        payment_amount: input.paymentAmount,
        usd_value: input.usdValue,
        status: 'initiated',
        transfer_signature: '',
      })
      .returning('*');

    return this.mapToTransfer(transfer);
  }

  async findById(id: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ id })
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByListingId(listingId: string): Promise<MarketplaceTransfer | null> {
    const transfer = await db(this.tableName)
      .where({ listing_id: listingId })
      .orderBy('created_at', 'desc')
      .first();

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async findByBuyerId(
    buyerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ buyer_id: buyerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async findBySellerId(
    sellerId: string,
    limit = 20,
    offset = 0
  ): Promise<MarketplaceTransfer[]> {
    const transfers = await db(this.tableName)
      .where({ seller_id: sellerId })
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return transfers.map(this.mapToTransfer);
  }

  async updateStatus(
    id: string,
    status: MarketplaceTransfer['status'],
    additionalData?: any
  ): Promise<MarketplaceTransfer | null> {
    const updateData: any = { status };

    if (status === 'completed') {
      updateData.completed_at = new Date();
    } else if (status === 'failed') {
      updateData.failed_at = new Date();
      if (additionalData?.failureReason) {
        updateData.failure_reason = additionalData.failureReason;
      }
    }

    Object.assign(updateData, additionalData);

    const [transfer] = await db(this.tableName)
      .where({ id })
      .update(updateData)
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async updateBlockchainData(
    id: string,
    transferSignature: string,
    blockHeight: number,
    networkFee?: number,
    networkFeeUsd?: number
  ): Promise<MarketplaceTransfer | null> {
    const [transfer] = await db(this.tableName)
      .where({ id })
      .update({
        transfer_signature: transferSignature,
        block_height: blockHeight,
        network_fee: networkFee,
        network_fee_usd: networkFeeUsd,
      })
      .returning('*');

    return transfer ? this.mapToTransfer(transfer) : null;
  }

  async countByEventId(eventId: string, status?: string): Promise<number> {
    let query = db(this.tableName)
      .where({ event_id: eventId })
      .count('* as count');

    if (status) {
      query = query.where({ status });
    }

    const result = await query.first();
    if (!result) return 0;
    return parseInt(String(result.count), 10);
  }

  async getTotalVolumeByVenueId(venueId: string): Promise<number> {
    const result = await db(this.tableName)
      .where({ venue_id: venueId, status: 'completed' })
      .sum('usd_value as total')
      .first();

    if (!result || !result.total) return 0;
    return parseInt(String(result.total));  // Return integer cents
  }

  private mapToTransfer(row: any): MarketplaceTransfer {
    return {
      id: row.id,
      listingId: row.listing_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      eventId: row.event_id,
      venueId: row.venue_id,
      buyerWallet: row.buyer_wallet,
      sellerWallet: row.seller_wallet,
      transferSignature: row.transfer_signature,
      blockHeight: row.block_height,
      paymentCurrency: row.payment_currency,
      paymentAmount: row.payment_amount ? parseInt(row.payment_amount) : undefined,
      usdValue: parseInt(row.usd_value),  // INTEGER CENTS
      status: row.status,
      initiatedAt: row.initiated_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      failureReason: row.failure_reason,
      networkFee: row.network_fee ? parseInt(row.network_fee) : undefined,
      networkFeeUsd: row.network_fee_usd ? parseInt(row.network_fee_usd) : undefined,  // INTEGER CENTS
      createdAt: row.created_at,
    };
  }
}

export const transferModel = new TransferModel();
```

### backend/services/marketplace-service//src/models/venue-settings.model.ts
```typescript
import { db } from '../config/database';

export interface VenueMarketplaceSettings {
  venueId: string;
  maxResaleMultiplier: number;      // DECIMAL (3.0 = 300%)
  minPriceMultiplier: number;       // DECIMAL (1.0 = 100%)
  allowBelowFace: boolean;
  transferCutoffHours: number;
  listingAdvanceHours: number;
  autoExpireOnEventStart: boolean;
  maxListingsPerUserPerEvent: number;
  maxListingsPerUserTotal: number;
  requireListingApproval: boolean;
  autoApproveVerifiedSellers: boolean;
  royaltyPercentage: number;        // DECIMAL (5.00 = 5%)
  royaltyWalletAddress: string;
  minimumRoyaltyPayout: number;     // INTEGER CENTS
  allowInternationalSales: boolean;
  blockedCountries: string[];
  requireKycForHighValue: boolean;
  highValueThreshold: number;       // INTEGER CENTS
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVenueSettingsInput {
  venueId: string;
  royaltyWalletAddress: string;
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
}

export interface UpdateVenueSettingsInput {
  maxResaleMultiplier?: number;
  minPriceMultiplier?: number;
  allowBelowFace?: boolean;
  transferCutoffHours?: number;
  listingAdvanceHours?: number;
  maxListingsPerUserPerEvent?: number;
  maxListingsPerUserTotal?: number;
  requireListingApproval?: boolean;
  royaltyPercentage?: number;
  royaltyWalletAddress?: string;
  allowInternationalSales?: boolean;
  blockedCountries?: string[];
  requireKycForHighValue?: boolean;
  highValueThreshold?: number;
}

export class VenueSettingsModel {
  private tableName = 'venue_marketplace_settings';

  async create(input: CreateVenueSettingsInput): Promise<VenueMarketplaceSettings> {
    const [settings] = await db(this.tableName)
      .insert({
        venue_id: input.venueId,
        royalty_wallet_address: input.royaltyWalletAddress,
        max_resale_multiplier: input.maxResaleMultiplier || 3.0,
        min_price_multiplier: input.minPriceMultiplier || 1.0,
        allow_below_face: input.allowBelowFace || false,
        transfer_cutoff_hours: input.transferCutoffHours || 4,
        listing_advance_hours: input.listingAdvanceHours || 720,
        max_listings_per_user_per_event: input.maxListingsPerUserPerEvent || 8,
        max_listings_per_user_total: input.maxListingsPerUserTotal || 50,
        require_listing_approval: input.requireListingApproval || false,
        royalty_percentage: input.royaltyPercentage || 5.00,
      })
      .returning('*');

    return this.mapToSettings(settings);
  }

  async findByVenueId(venueId: string): Promise<VenueMarketplaceSettings | null> {
    const settings = await db(this.tableName)
      .where({ venue_id: venueId })
      .first();

    return settings ? this.mapToSettings(settings) : null;
  }

  async findOrCreateDefault(venueId: string, walletAddress: string): Promise<VenueMarketplaceSettings> {
    const existing = await this.findByVenueId(venueId);
    if (existing) return existing;

    return this.create({
      venueId,
      royaltyWalletAddress: walletAddress,
    });
  }

  async update(
    venueId: string,
    input: UpdateVenueSettingsInput
  ): Promise<VenueMarketplaceSettings | null> {
    const updateData: any = {};

    if (input.maxResaleMultiplier !== undefined) {
      updateData.max_resale_multiplier = input.maxResaleMultiplier;
    }
    if (input.minPriceMultiplier !== undefined) {
      updateData.min_price_multiplier = input.minPriceMultiplier;
    }
    if (input.allowBelowFace !== undefined) {
      updateData.allow_below_face = input.allowBelowFace;
    }
    if (input.transferCutoffHours !== undefined) {
      updateData.transfer_cutoff_hours = input.transferCutoffHours;
    }
    if (input.listingAdvanceHours !== undefined) {
      updateData.listing_advance_hours = input.listingAdvanceHours;
    }
    if (input.maxListingsPerUserPerEvent !== undefined) {
      updateData.max_listings_per_user_per_event = input.maxListingsPerUserPerEvent;
    }
    if (input.maxListingsPerUserTotal !== undefined) {
      updateData.max_listings_per_user_total = input.maxListingsPerUserTotal;
    }
    if (input.requireListingApproval !== undefined) {
      updateData.require_listing_approval = input.requireListingApproval;
    }
    if (input.royaltyPercentage !== undefined) {
      updateData.royalty_percentage = input.royaltyPercentage;
    }
    if (input.royaltyWalletAddress !== undefined) {
      updateData.royalty_wallet_address = input.royaltyWalletAddress;
    }
    if (input.allowInternationalSales !== undefined) {
      updateData.allow_international_sales = input.allowInternationalSales;
    }
    if (input.blockedCountries !== undefined) {
      updateData.blocked_countries = input.blockedCountries;
    }
    if (input.requireKycForHighValue !== undefined) {
      updateData.require_kyc_for_high_value = input.requireKycForHighValue;
    }
    if (input.highValueThreshold !== undefined) {
      updateData.high_value_threshold = input.highValueThreshold;
    }

    updateData.updated_at = new Date();

    const [settings] = await db(this.tableName)
      .where({ venue_id: venueId })
      .update(updateData)
      .returning('*');

    return settings ? this.mapToSettings(settings) : null;
  }

  async getAllSettings(limit = 100, offset = 0): Promise<VenueMarketplaceSettings[]> {
    const settings = await db(this.tableName)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return settings.map(this.mapToSettings);
  }

  private mapToSettings(row: any): VenueMarketplaceSettings {
    return {
      venueId: row.venue_id,
      maxResaleMultiplier: parseFloat(row.max_resale_multiplier),      // DECIMAL multiplier
      minPriceMultiplier: parseFloat(row.min_price_multiplier),        // DECIMAL multiplier
      allowBelowFace: row.allow_below_face,
      transferCutoffHours: row.transfer_cutoff_hours,
      listingAdvanceHours: row.listing_advance_hours,
      autoExpireOnEventStart: row.auto_expire_on_event_start,
      maxListingsPerUserPerEvent: row.max_listings_per_user_per_event,
      maxListingsPerUserTotal: row.max_listings_per_user_total,
      requireListingApproval: row.require_listing_approval,
      autoApproveVerifiedSellers: row.auto_approve_verified_sellers,
      royaltyPercentage: parseFloat(row.royalty_percentage),           // DECIMAL percentage
      royaltyWalletAddress: row.royalty_wallet_address,
      minimumRoyaltyPayout: parseInt(row.minimum_royalty_payout || 0), // INTEGER CENTS
      allowInternationalSales: row.allow_international_sales,
      blockedCountries: row.blocked_countries || [],
      requireKycForHighValue: row.require_kyc_for_high_value,
      highValueThreshold: parseInt(row.high_value_threshold || 0),     // INTEGER CENTS
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const venueSettingsModel = new VenueSettingsModel();
```


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/marketplace-service//src/services/listing.service.ts.backup:19:      FROM listings l
backend/services/marketplace-service//src/services/listing.service.ts.backup:20:      JOIN tickets t ON l.ticket_id = t.id
backend/services/marketplace-service//src/services/listing.service.ts.backup:21:      JOIN ticket_types tt ON t.ticket_type_id = tt.id

### Knex Query Builder
backend/services/marketplace-service//src/services/blockchain.service.ts:69:        [Buffer.from('listing'), new PublicKey(listingId).toBuffer()],
backend/services/marketplace-service//src/services/blockchain.service.ts:74:        [Buffer.from('marketplace')],
backend/services/marketplace-service//src/services/blockchain.service.ts:79:        [Buffer.from('reentrancy'), listingPDA.toBuffer()],
backend/services/marketplace-service//src/services/blockchain.service.ts:144:        [Buffer.from('listing'), new PublicKey(tokenId).toBuffer()],
backend/services/marketplace-service//src/services/search.service.ts:152:            .from('events')

## 5. REPOSITORY/SERVICE FILES
### service-urls.ts
First 100 lines:
```typescript
// Additional service URLs that were missing
export const additionalServiceUrls = {
  blockchainServiceUrl: process.env.BLOCKCHAIN_SERVICE_URL || 'http://blockchain-service:3010',
  notificationServiceUrl: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3008'
};
```

### blockchain.service.ts
First 100 lines:
```typescript
import { Connection, PublicKey, Transaction, SystemProgram, Keypair } from '@solana/web3.js';
import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import blockchain from '../config/blockchain';
import { logger } from '../utils/logger';
import { InternalServerError } from '../utils/errors';

// Import the IDL (you'll need to copy this from your deployed-idl.json)
const IDL = require('../idl/marketplace.json');

interface TransferNFTParams {
  tokenId: string;
  fromWallet: string;
  toWallet: string;
  listingId: string;
  price: number;
}

interface TransferResult {
  signature: string;
  blockHeight: number;
  fee: number;
}

export class RealBlockchainService {
  private connection: Connection;
  private program: Program | null = null;
  private log = logger.child({ component: 'RealBlockchainService' });

  constructor() {
    this.connection = blockchain.getConnection();
    this.initializeProgram();
  }

  private initializeProgram() {
    try {
      // Get the marketplace program ID from your deployed contract
      const programId = new PublicKey(process.env.MARKETPLACE_PROGRAM_ID || 'BTNZP23sGbQsMwX1SBiyfTpDDqD8Sev7j78N45QBoYtv');

      // Create a dummy provider for reading
      const provider = new AnchorProvider(
        this.connection,
        {} as any, // We'll add wallet when needed for transactions
        { commitment: 'confirmed' }
      );

      this.program = new Program(IDL as any, provider);
      this.log.info('Marketplace program initialized', { programId: programId.toString() });
    } catch (error) {
      this.log.error('Failed to initialize program', { error });
    }
  }

  async transferNFT(params: TransferNFTParams): Promise<TransferResult> {
    try {
      if (!this.program) {
        throw new Error('Program not initialized');
      }

      const { tokenId, fromWallet, toWallet, listingId, price } = params;

      // Get the payer wallet (marketplace service wallet)
      const payer = blockchain.getWallet();
      if (!payer) {
        throw new Error('Marketplace wallet not configured');
      }

      // Create the necessary PDAs and accounts
      const [listingPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('listing'), new PublicKey(listingId).toBuffer()],
        this.program.programId
      );

      const [marketplacePDA] = await PublicKey.findProgramAddress(
        [Buffer.from('marketplace')],
        this.program.programId
      );

      const [reentrancyGuardPDA] = await PublicKey.findProgramAddress(
        [Buffer.from('reentrancy'), listingPDA.toBuffer()],
        this.program.programId
      );

      // Build the buy_listing instruction
      const instruction = await this.program.methods
        .buyListing()
        .accounts({
          buyer: new PublicKey(toWallet),
          listing: listingPDA,
          marketplace: marketplacePDA,
          seller: new PublicKey(fromWallet),
          marketplaceTreasury: new PublicKey(process.env.MARKETPLACE_TREASURY || payer.publicKey),
          venueTreasury: new PublicKey(process.env.VENUE_TREASURY || payer.publicKey),
          reentrancyGuard: reentrancyGuardPDA,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      // Create and send transaction
      const transaction = new Transaction().add(instruction);

```

### notification.service.ts
First 100 lines:
```typescript
import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { config } from '../config';

interface NotificationPayload {
  user_id: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, any>;
  priority?: 'low' | 'normal' | 'high';
}

class NotificationServiceClass {
  private async sendNotification(payload: NotificationPayload): Promise<void> {
    try {
      const response = await fetch(`${additionalServiceUrls.notificationServiceUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`Notification service error: ${response.statusText}`);
      }
      
      logger.info(`Notification sent to user ${payload.user_id}: ${payload.type}`);
    } catch (error) {
      logger.error('Error sending notification:', error);
      // Don't throw - notifications should not block main flow
    }
  }
  
  async notifyListingSold(
    listingId: string,
    buyerId: string,
    sellerId: string,
    price: number
  ): Promise<void> {
    try {
      // Notify seller
      await this.sendNotification({
        user_id: sellerId,
        type: 'listing_sold',
        title: 'Your ticket has been sold!',
        body: `Your listing has been purchased for $${price}`,
        data: { listing_id: listingId, buyer_id: buyerId },
        priority: 'high'
      });
      
      // Notify buyer
      await this.sendNotification({
        user_id: buyerId,
        type: 'purchase_confirmed',
        title: 'Purchase confirmed!',
        body: `You have successfully purchased a ticket for $${price}`,
        data: { listing_id: listingId, seller_id: sellerId },
        priority: 'high'
      });
    } catch (error) {
      logger.error('Error sending listing sold notifications:', error);
    }
  }
  
  async notifyPriceChange(
    listingId: string,
    watchers: string[],
    oldPrice: number,
    newPrice: number
  ): Promise<void> {
    try {
      const priceDirection = newPrice < oldPrice ? 'decreased' : 'increased';
      const priceDiff = Math.abs(newPrice - oldPrice);
      
      for (const watcherId of watchers) {
        await this.sendNotification({
          user_id: watcherId,
          type: 'price_change',
          title: 'Price alert!',
          body: `A ticket you're watching has ${priceDirection} by $${priceDiff}`,
          data: { 
            listing_id: listingId,
            old_price: oldPrice,
            new_price: newPrice
          },
          priority: 'normal'
        });
      }
    } catch (error) {
      logger.error('Error sending price change notifications:', error);
    }
  }
  
  async notifyDisputeUpdate(
    disputeId: string,
    parties: string[],
    status: string,
    message: string
```

### venue-rules.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { ValidationError } from '../utils/errors';

class VenueRulesServiceClass {
  async validateListing(listing: any, venueId: string) {
    try {
      const venueSettings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      if (!venueSettings) {
        return { isValid: true };
      }
      
      const rules = venueSettings.rules || {};
      const errors: string[] = [];
      
      // Check max markup
      if (rules.max_markup_percentage) {
        const maxPrice = listing.face_value * (1 + rules.max_markup_percentage / 100);
        if (listing.price > maxPrice) {
          errors.push(`Price exceeds maximum ${rules.max_markup_percentage}% markup`);
        }
      }
      
      // Check min markup
      if (rules.min_markup_percentage) {
        const minPrice = listing.face_value * (1 + rules.min_markup_percentage / 100);
        if (listing.price < minPrice) {
          errors.push(`Price below minimum ${rules.min_markup_percentage}% markup`);
        }
      }
      
      // Check days before event
      if (rules.min_days_before_event) {
        const eventDate = new Date(listing.event_date);
        const daysUntilEvent = (eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
        if (daysUntilEvent < rules.min_days_before_event) {
          errors.push(`Cannot list tickets less than ${rules.min_days_before_event} days before event`);
        }
      }
      
      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      logger.error('Error validating listing:', error);
      return { isValid: true };
    }
  }
  
  async checkMaxMarkup(price: number, faceValue: number, venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      if (!settings?.rules?.max_markup_percentage) {
        return true;
      }
      
      const maxPrice = faceValue * (1 + settings.rules.max_markup_percentage / 100);
      return price <= maxPrice;
    } catch (error) {
      logger.error('Error checking max markup:', error);
      return true;
    }
  }
  
  async requiresApproval(venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      return settings?.rules?.requires_approval || false;
    } catch (error) {
      logger.error('Error checking approval requirement:', error);
      return false;
    }
  }
  
  async getVenueRestrictions(venueId: string) {
    try {
      const settings = await db('venue_marketplace_settings')
        .where('venue_id', venueId)
        .first();
      
      return settings?.rules || {};
    } catch (error) {
      logger.error('Error getting venue restrictions:', error);
      return {};
    }
  }
}

export const venueRulesService = new VenueRulesServiceClass();
```

### wallet.service.ts
First 100 lines:
```typescript
import { additionalServiceUrls } from '../config/service-urls';
import { logger } from '../utils/logger';
import { 
  isValidSolanaAddress, 
  formatWalletAddress,
  verifyWalletOwnership 
} from '../utils/wallet-helper';
import { WalletInfo, WalletBalance, WalletVerification } from '../types/wallet.types';
import { config } from '../config';

class WalletServiceClass {
  async getWalletInfo(walletAddress: string): Promise<WalletInfo | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        logger.warn(`Invalid wallet address: ${walletAddress}`);
        return null;
      }
      
      // In production, would fetch from blockchain
      const walletInfo: WalletInfo = {
        address: walletAddress,
        network: (process.env.SOLANA_NETWORK || 'devnet') as any,
        is_valid: true,
        is_program_wallet: false
      };
      
      // Fetch balance from blockchain service
      try {
        const balanceResponse = await fetch(
          `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance`
        );
        
        if (balanceResponse.ok) {
          const data = await balanceResponse.json();
          walletInfo.balance = data.balance;
        }
      } catch (error) {
        logger.error('Error fetching wallet balance:', error);
      }
      
      return walletInfo;
    } catch (error) {
      logger.error('Error getting wallet info:', error);
      return null;
    }
  }
  
  async verifyWalletOwnership(
    userId: string,
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      // Verify signature
      const isValid = await verifyWalletOwnership(walletAddress, message, signature);
      
      if (!isValid) {
        logger.warn(`Invalid signature for wallet ${formatWalletAddress(walletAddress)}`);
        return false;
      }
      
      // Store verification record
      const verification: WalletVerification = {
        wallet_address: walletAddress,
        message,
        signature,
        verified: true,
        verified_at: new Date()
      };
      
      // In production, would store in database
      logger.info(`Wallet ownership verified for user ${userId}`);
      
      return true;
    } catch (error) {
      logger.error('Error verifying wallet ownership:', error);
      return false;
    }
  }
  
  async getWalletBalance(walletAddress: string): Promise<WalletBalance | null> {
    try {
      if (!isValidSolanaAddress(walletAddress)) {
        return null;
      }
      
      // Fetch from blockchain service
      const response = await fetch(
        `${additionalServiceUrls.blockchainServiceUrl}/wallet/${walletAddress}/balance/detailed`
      );
      
      if (!response.ok) {
        throw new Error(`Failed to fetch balance: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      return {
        wallet_address: walletAddress,
```

### anti-bot.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { antiBotModel } from '../models/anti-bot.model';
import { cache } from './cache-integration';
import { 
  MAX_PURCHASES_PER_HOUR,
  MAX_LISTINGS_PER_DAY,
  VELOCITY_CHECK_WINDOW_SECONDS,
  BOT_SCORE_THRESHOLD
} from '../utils/constants';

class AntiBotServiceClass {
  async checkPurchaseVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'purchase',
        3600 // 1 hour in seconds
      );
      
      if (count >= MAX_PURCHASES_PER_HOUR) {
        logger.warn(`User ${userId} exceeded purchase velocity limit: ${count} purchases`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded purchase velocity: ${count} purchases in 1 hour`,
          'high'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking purchase velocity:', error);
      return true; // Allow on error
    }
  }
  
  async checkListingVelocity(userId: string): Promise<boolean> {
    try {
      const count = await antiBotModel.checkVelocity(
        userId,
        'listing_created',
        86400 // 24 hours in seconds
      );
      
      if (count >= MAX_LISTINGS_PER_DAY) {
        logger.warn(`User ${userId} exceeded listing velocity limit: ${count} listings`);
        await antiBotModel.flagSuspiciousActivity(
          userId,
          `Exceeded listing velocity: ${count} listings in 24 hours`,
          'medium'
        );
        return false;
      }
      
      return true;
    } catch (error) {
      logger.error('Error checking listing velocity:', error);
      return true;
    }
  }
  
  async analyzeUserPattern(userId: string): Promise<any> {
    try {
      const botScore = await antiBotModel.calculateBotScore(userId);
      
      if (botScore.is_bot) {
        logger.warn(`User ${userId} flagged as potential bot. Score: ${botScore.score}`);
        
        // Cache the bot detection
        await cache.set(
          `bot_detection:${userId}`,
          JSON.stringify(botScore),
          { ttl: 3600 }
        );
      }
      
      return botScore;
    } catch (error) {
      logger.error('Error analyzing user pattern:', error);
      return null;
    }
  }
  
  async enforceRateLimit(userId: string, action: string): Promise<boolean> {
    try {
      const cacheKey = `rate_limit:${userId}:${action}`;
      const current = await cache.get(cacheKey);
      
      if (current) {
        const count = parseInt(current as string, 10);
        const limit = this.getActionLimit(action);
        
        if (count >= limit) {
          logger.warn(`Rate limit exceeded for user ${userId}, action: ${action}`);
          return false;
        }
        
        await cache.set(cacheKey, (count + 1).toString(), { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
      } else {
        await cache.set(cacheKey, '1', { ttl: VELOCITY_CHECK_WINDOW_SECONDS });
```

### fee.service.ts
First 100 lines:
```typescript
import { feeModel } from '../models/fee.model';
import { transferModel } from '../models/transfer.model';
import { venueSettingsModel } from '../models/venue-settings.model';
import { percentOfCents } from '@tickettoken/shared/utils/money';
import { logger } from '../utils/logger';
import { constants } from '../config';
import { NotFoundError } from '../utils/errors';

export interface FeeCalculation {
  salePrice: number;        // INTEGER CENTS
  platformFee: number;      // INTEGER CENTS
  venueFee: number;         // INTEGER CENTS
  sellerPayout: number;     // INTEGER CENTS
  totalFees: number;        // INTEGER CENTS
}

export interface FeeReport {
  totalVolume: number;           // INTEGER CENTS
  totalPlatformFees: number;     // INTEGER CENTS
  totalVenueFees: number;        // INTEGER CENTS
  transactionCount: number;
  averageTransactionSize: number; // INTEGER CENTS
}

export class FeeService {
  private log = logger.child({ component: 'FeeService' });

  /**
   * Calculate fees for a sale (all amounts in INTEGER CENTS)
   */
  calculateFees(salePriceCents: number, venueRoyaltyPercentage?: number): FeeCalculation {
    const platformFeePercentage = constants.FEES.PLATFORM_FEE_PERCENTAGE;
    const venueFeePercentage = venueRoyaltyPercentage || constants.FEES.DEFAULT_VENUE_FEE_PERCENTAGE;

    // Convert percentages to basis points
    const platformFeeBps = Math.round(platformFeePercentage * 100);
    const venueFeeBps = Math.round(venueFeePercentage * 100);

    const platformFeeCents = percentOfCents(salePriceCents, platformFeeBps);
    const venueFeeCents = percentOfCents(salePriceCents, venueFeeBps);
    const totalFeesCents = platformFeeCents + venueFeeCents;
    const sellerPayoutCents = salePriceCents - totalFeesCents;

    return {
      salePrice: salePriceCents,
      platformFee: platformFeeCents,
      venueFee: venueFeeCents,
      sellerPayout: sellerPayoutCents,
      totalFees: totalFeesCents,
    };
  }

  /**
   * Get fee breakdown for a transfer
   */
  async getTransferFees(transferId: string) {
    const fee = await feeModel.findByTransferId(transferId);
    if (!fee) {
      throw new NotFoundError('Fee record');
    }

    return {
      transferId,
      salePrice: fee.salePrice,
      platformFee: {
        amount: fee.platformFeeAmount,
        percentage: fee.platformFeePercentage,
        collected: fee.platformFeeCollected,
        signature: fee.platformFeeSignature,
      },
      venueFee: {
        amount: fee.venueFeeAmount,
        percentage: fee.venueFeePercentage,
        collected: fee.venueFeeCollected,
        signature: fee.venueFeeSignature,
      },
      sellerPayout: fee.sellerPayout,
      createdAt: fee.createdAt,
    };
  }

  /**
   * Get platform fee report (amounts in cents)
   */
  async getPlatformFeeReport(startDate?: Date, endDate?: Date): Promise<FeeReport> {
    const totalFeesCents = await feeModel.getTotalPlatformFees(startDate, endDate);

    // Estimate volume based on 5% platform fee
    const estimatedVolumeCents = Math.round(totalFeesCents * 20);

    return {
      totalVolume: estimatedVolumeCents,
      totalPlatformFees: totalFeesCents,
      totalVenueFees: 0,
      transactionCount: 0,
      averageTransactionSize: 0,
    };
  }

  /**
```

### listing.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { withLock, LockKeys } from '@tickettoken/shared/utils/distributed-lock';
import { listingModel } from '../models/listing.model';

class ListingServiceClass {
  private log = logger.child({ component: 'ListingService' });

  async updateListingPrice(params: {
    listingId: string;
    newPrice: number;
    userId: string;
  }) {
    const { listingId, newPrice, userId } = params;
    const lockKey = LockKeys.listing(listingId);

    return await withLock(lockKey, 5000, async () => {
      if (newPrice <= 0) {
        throw new Error('Price must be greater than zero');
      }

      const listing = await listingModel.findById(listingId);

      if (!listing) {
        throw new Error(`Listing not found: ${listingId}`);
      }

      if (listing.sellerId !== userId) {
        throw new Error('Unauthorized: Not the listing owner');
      }

      if (listing.status !== 'active') {
        throw new Error(`Cannot update price for listing with status: ${listing.status}`);
      }

      const originalPriceCents = listing.originalFaceValue;
      const maxMarkupPercent = 300;
      const maxAllowedPriceCents = Math.floor(originalPriceCents * (1 + maxMarkupPercent / 100));

      if (newPrice > maxAllowedPriceCents) {
        throw new Error(`Price cannot exceed ${maxMarkupPercent}% markup. Maximum allowed: $${maxAllowedPriceCents / 100}`);
      }

      const updated = await listingModel.update(listingId, { price: newPrice });
      const markupPercent = Math.floor(((newPrice - originalPriceCents) / originalPriceCents) * 10000) / 100;

      this.log.info('Listing price updated with distributed lock', {
        listingId,
        oldPriceCents: listing.price,
        newPriceCents: newPrice,
        markupPercent: `${markupPercent}%`
      });

      return updated;
    });
  }

  async createListing(data: any) {
    const { ticketId, sellerId, walletAddress, eventId, venueId, originalFaceValue } = data;
    const lockKey = LockKeys.ticket(ticketId);

    return await withLock(lockKey, 5000, async () => {
      if (data.price) {
        this.log.warn('Client attempted to set listing price directly', {
          ticketId,
          attemptedPrice: data.price,
          sellerId
        });
      }

      const existingListing = await listingModel.findByTicketId(ticketId);
      
      if (existingListing && existingListing.status === 'active') {
        throw new Error('Ticket already has an active listing');
      }

      const ticketValueCents = originalFaceValue || await this.getTicketMarketValue(ticketId);

      const listing = await listingModel.create({
        ticketId,
        sellerId,
        eventId,
        venueId,
        price: ticketValueCents,
        originalFaceValue: ticketValueCents,
        walletAddress,
        requiresApproval: false
      });

      this.log.info('Listing created with distributed lock', {
        listingId: listing.id,
        ticketId,
        sellerId,
        priceCents: ticketValueCents
      });

      return listing;
    });
  }

  private async getTicketMarketValue(ticketId: string): Promise<number> {
```

### search.service.ts
First 100 lines:
```typescript
import { db } from '../config/database';
import { logger } from '../utils/logger';
import { ListingFilters, ListingWithDetails } from '../types/listing.types';
import { PaginationParams } from '../types/common.types';
import { cache } from './cache-integration';
import { SEARCH_CACHE_TTL } from '../utils/constants';

class SearchServiceClass {
  async searchListings(
    filters: ListingFilters,
    pagination: PaginationParams
  ): Promise<{ listings: ListingWithDetails[]; total: number }> {
    try {
      // Generate cache key
      const cacheKey = `search:${JSON.stringify({ filters, pagination })}`;
      
      // Check cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        return JSON.parse(cached as string);
      }
      
      // Build query
      const query = db('marketplace_listings as ml')
        .leftJoin('events as e', 'ml.event_id', 'e.id')
        .leftJoin('venues as v', 'ml.venue_id', 'v.id')
        .leftJoin('users as u', 'ml.seller_id', 'u.id')
        .where('ml.status', 'active');
      
      // Apply filters
      if (filters.eventId) {
        query.where('ml.event_id', filters.eventId);
      }
      
      if (filters.venueId) {
        query.where('ml.venue_id', filters.venueId);
      }
      
      if (filters.minPrice !== undefined) {
        query.where('ml.price', '>=', filters.minPrice);
      }
      
      if (filters.maxPrice !== undefined) {
        query.where('ml.price', '<=', filters.maxPrice);
      }
      
      if (filters.sellerId) {
        query.where('ml.seller_id', filters.sellerId);
      }
      
      if (filters.dateFrom) {
        query.where('e.start_date', '>=', filters.dateFrom);
      }
      
      if (filters.dateTo) {
        query.where('e.start_date', '<=', filters.dateTo);
      }
      
      // Count total
      const countQuery = query.clone();
      const totalResult = await countQuery.count('* as count');
      const total = parseInt(totalResult[0].count as string, 10);
      
      // Apply pagination
      const offset = (pagination.page - 1) * pagination.limit;
      query.limit(pagination.limit).offset(offset);
      
      // Apply sorting
      const sortBy = pagination.sortBy || 'ml.listed_at';
      const sortOrder = pagination.sortOrder || 'desc';
      query.orderBy(sortBy, sortOrder);
      
      // Select fields
      const listings = await query.select(
        'ml.*',
        'e.name as event_name',
        'e.start_date as event_date',
        'v.name as venue_name',
        'u.username as seller_username'
      );
      
      // Cache results
      await cache.set(cacheKey, JSON.stringify({ listings, total }), { ttl: SEARCH_CACHE_TTL });
      
      return { listings, total };
    } catch (error) {
      logger.error('Error searching listings:', error);
      return { listings: [], total: 0 };
    }
  }
  
  async searchByEvent(eventId: string): Promise<ListingWithDetails[]> {
    try {
      const result = await this.searchListings(
        { eventId, status: 'active' },
        { page: 1, limit: 100, sortBy: 'price', sortOrder: 'asc' }
      );
      
      return result.listings;
    } catch (error) {
```

### dispute.service.ts
First 100 lines:
```typescript
import { logger } from '../utils/logger';
import { db } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { ValidationError, NotFoundError } from '../utils/errors';

class DisputeServiceClass {
  async createDispute(
    transferId: string,
    listingId: string,
    initiatorId: string,
    reason: string,
    description?: string,
    evidence?: any
  ) {
    try {
      const transfer = await db('marketplace_transfers')
        .where('id', transferId)
        .first();
      
      if (!transfer) {
        throw new NotFoundError('Transfer not found');
      }
      
      const respondentId = initiatorId === transfer.buyer_id 
        ? transfer.seller_id 
        : transfer.buyer_id;
      
      const dispute = {
        id: uuidv4(),
        transfer_id: transferId,
        listing_id: listingId,
        initiator_id: initiatorId,
        respondent_id: respondentId,
        reason,
        description,
        status: 'open',
        created_at: new Date(),
        updated_at: new Date()
      };
      
      await db('marketplace_disputes').insert(dispute);
      
      if (evidence) {
        await this.addEvidence(dispute.id, initiatorId, 'text', JSON.stringify(evidence));
      }
      
      logger.info(`Dispute created: ${dispute.id}`);
      return dispute;
    } catch (error) {
      logger.error('Error creating dispute:', error);
      throw error;
    }
  }
  
  async addEvidence(disputeId: string, userId: string, type: string, content: string, metadata?: any) {
    try {
      await db('dispute_evidence').insert({
        id: uuidv4(),
        dispute_id: disputeId,
        submitted_by: userId,
        evidence_type: type,
        content,
        metadata: metadata ? JSON.stringify(metadata) : null,
        submitted_at: new Date()
      });
    } catch (error) {
      logger.error('Error adding evidence:', error);
      throw error;
    }
  }
  
  async getDispute(disputeId: string) {
    try {
      return await db('marketplace_disputes')
        .where('id', disputeId)
        .first();
    } catch (error) {
      logger.error('Error getting dispute:', error);
      return null;
    }
  }
  
  async getUserDisputes(userId: string) {
    try {
      return await db('marketplace_disputes')
        .where(function() {
          this.where('initiator_id', userId)
            .orWhere('respondent_id', userId);
        })
        .orderBy('created_at', 'desc');
    } catch (error) {
      logger.error('Error getting user disputes:', error);
      return [];
    }
  }
}

export const disputeService = new DisputeServiceClass();
```


## 6. ENVIRONMENT VARIABLES
```
# ==== REQUIRED: Database Configuration ====
DB_HOST=localhost                       # Database host
DB_PORT=5432                           # PostgreSQL port (5432) or pgBouncer (6432)
DB_USER=postgres                       # Database user
DB_PASSWORD=<CHANGE_ME>                # Database password
DB_NAME=tickettoken_db                 # Database name
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
# ==== Database Connection Pool ====
DB_POOL_MIN=2                          # Minimum pool connections
DB_POOL_MAX=10                         # Maximum pool connections
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

