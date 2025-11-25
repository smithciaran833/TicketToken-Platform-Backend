# DATABASE AUDIT: blockchain-service
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "rate-limit-redis": "^4.2.2",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import knex from 'knex';

export const db = knex({
  client: 'pg',
  connection: process.env.DATABASE_URL || 'postgres://postgres:postgres@postgres:5432/tickettoken',
  pool: {
    min: 2,
    max: 10
  }
});
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/blockchain-service//src/wallets/userWallet.js:28:                'SELECT * FROM wallet_addresses WHERE user_id = $1 AND wallet_address = $2',
backend/services/blockchain-service//src/wallets/userWallet.js:35:                    UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:45:                    UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:59:                UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:66:                INSERT INTO wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:74:                INSERT INTO user_wallet_connections 
backend/services/blockchain-service//src/wallets/userWallet.js:113:            SELECT * FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:123:            SELECT * FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:133:            SELECT * FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:142:            DELETE FROM wallet_addresses 
backend/services/blockchain-service//src/wallets/userWallet.js:151:            UPDATE wallet_addresses 
backend/services/blockchain-service//src/wallets/treasury.js:47:                    INSERT INTO treasury_wallets (wallet_address, blockchain_type, purpose, is_active)
backend/services/blockchain-service//src/listeners/transactionMonitor.js:78:            UPDATE blockchain_transactions 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:90:                UPDATE tickets 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:97:                UPDATE queue_jobs 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:103:                UPDATE tickets 
backend/services/blockchain-service//src/listeners/transactionMonitor.js:110:                UPDATE queue_jobs 
backend/services/blockchain-service//src/listeners/baseListener.js:51:                INSERT INTO blockchain_events (
backend/services/blockchain-service//src/listeners/programListener.js:93:            INSERT INTO blockchain_events (
backend/services/blockchain-service//src/listeners/programListener.js:126:                UPDATE tickets 
backend/services/blockchain-service//src/listeners/programListener.js:147:            INSERT INTO blockchain_events (
backend/services/blockchain-service//src/queues/mintQueue.js:92:            'SELECT token_id, mint_transaction_id FROM tickets WHERE id = $1 AND is_minted = true',
backend/services/blockchain-service//src/queues/mintQueue.js:109:            'UPDATE tickets SET status = $1 WHERE id = $2',
backend/services/blockchain-service//src/queues/mintQueue.js:117:            'SELECT id FROM queue_jobs WHERE job_id = $1',
backend/services/blockchain-service//src/queues/mintQueue.js:124:                'UPDATE queue_jobs SET status = $1 WHERE job_id = $2',
backend/services/blockchain-service//src/queues/mintQueue.js:130:                INSERT INTO queue_jobs (
backend/services/blockchain-service//src/queues/mintQueue.js:148:            UPDATE queue_jobs 
backend/services/blockchain-service//src/queues/mintQueue.js:175:            INSERT INTO blockchain_transactions (
backend/services/blockchain-service//src/queues/mintQueue.js:195:            UPDATE tickets 
backend/services/blockchain-service//src/workers/mint-worker.js:92:          SELECT * FROM mint_jobs 
backend/services/blockchain-service//src/workers/mint-worker.js:117:        UPDATE tickets t
backend/services/blockchain-service//src/workers/mint-worker.js:119:        FROM order_items oi 
backend/services/blockchain-service//src/workers/mint-worker.js:129:          UPDATE mint_jobs 
backend/services/blockchain-service//src/workers/mint-worker.js:152:          UPDATE mint_jobs 

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### fee-transparency.service.ts
First 100 lines:
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';

interface FeeBreakdown {
  basePrice: number;
  platformFee: number;
  platformFeePercent: number;
  venueFee: number;
  venueFeePercent: number;
  paymentProcessingFee: number;
  paymentProcessingPercent: number;
  taxAmount: number;
  taxPercent: number;
  totalPrice: number;
  currency: string;
}

interface VenueFeePolicy {
  venueId: string;
  venueName: string;
  baseFeePercent: number;
  serviceFeePercent: number;
  resaleFeePercent: number;
  maxResalePrice?: number;
  effectiveDate: Date;
  lastUpdated: Date;
}

export class FeeTransparencyService {
  /**
   * Calculate complete fee breakdown for a ticket purchase
   */
  async calculateFeeBreakdown(
    basePrice: number,
    venueId: string,
    isResale: boolean = false,
    location?: string
  ): Promise<FeeBreakdown> {
    try {
      // Get venue fee policy
      const venuePolicy = await this.getVenueFeePolicy(venueId);
      
      // Platform fees (TicketToken's cut)
      const platformFeePercent = isResale ? 2.5 : 3.5; // Lower for resales
      const platformFee = Math.round(basePrice * platformFeePercent / 100);
      
      // Venue fees
      const venueFeePercent = isResale ? 
        venuePolicy.resaleFeePercent : 
        venuePolicy.baseFeePercent;
      const venueFee = Math.round(basePrice * venueFeePercent / 100);
      
      // Payment processing (Stripe/Square)
      const paymentProcessingPercent = 2.9; // + $0.30 typically
      const paymentProcessingFee = Math.round(basePrice * paymentProcessingPercent / 100) + 30;
      
      // Tax calculation (simplified - would use real tax API)
      const taxPercent = this.getTaxRate(location);
      const subtotal = basePrice + platformFee + venueFee + paymentProcessingFee;
      const taxAmount = Math.round(subtotal * taxPercent / 100);
      
      // Total
      const totalPrice = subtotal + taxAmount;
      
      return {
        basePrice,
        platformFee,
        platformFeePercent,
        venueFee,
        venueFeePercent,
        paymentProcessingFee,
        paymentProcessingPercent,
        taxAmount,
        taxPercent,
        totalPrice,
        currency: 'USD'
      };
      
    } catch (error) {
      logger.error('Failed to calculate fee breakdown:', error);
      throw error;
    }
  }

  /**
   * Get venue fee policy
   */
  async getVenueFeePolicy(venueId: string): Promise<VenueFeePolicy> {
    const policy = await db('venue_fee_policies')
      .where({ venue_id: venueId, active: true })
      .first();
    
    if (!policy) {
      // Return default policy
      return {
        venueId,
        venueName: 'Venue',
        baseFeePercent: 5.0,
        serviceFeePercent: 2.5,
        resaleFeePercent: 5.0,
```

### privacy-export.service.ts
First 100 lines:
```typescript
import { db } from '../../config/database';
import { logger } from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';

interface UserDataExport {
  requestId: string;
  userId: string;
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export class PrivacyExportService {
  private exportPath = process.env.EXPORT_PATH || '/tmp/exports';

  /**
   * Request full data export for GDPR/CCPA compliance
   */
  async requestDataExport(userId: string, reason: string): Promise<UserDataExport> {
    try {
      const requestId = crypto.randomUUID();
      
      // Store export request
      await db('privacy_export_requests').insert({
        id: requestId,
        user_id: userId,
        reason,
        status: 'pending',
        requested_at: new Date()
      });
      
      // Queue for processing (async)
      this.processExportAsync(requestId, userId);
      
      return {
        requestId,
        userId,
        requestedAt: new Date(),
        status: 'pending'
      };
      
    } catch (error) {
      logger.error('Failed to create export request:', error);
      throw error;
    }
  }

  /**
   * Process data export asynchronously
   */
  private async processExportAsync(requestId: string, userId: string): Promise<void> {
    try {
      // Update status
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({ status: 'processing' });
      
      // Collect all user data
      const userData = await this.collectUserData(userId);
      
      // Create export file
      const exportFile = await this.createExportArchive(userId, userData);
      
      // Generate secure download URL
      const downloadUrl = await this.generateDownloadUrl(exportFile);
      
      // Update request
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'completed',
          completed_at: new Date(),
          download_url: downloadUrl,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
      
      // Send notification to user
      await this.notifyUserExportReady(userId, downloadUrl);
      
    } catch (error) {
      logger.error('Export processing failed:', error);
      
      await db('privacy_export_requests')
        .where({ id: requestId })
        .update({
          status: 'failed',
          error_message: (error as Error).message
        });
    }
  }

  /**
   * Collect all user data from various tables
   */
  private async collectUserData(userId: string): Promise<any> {
```


## 6. ENVIRONMENT VARIABLES
```
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}
```

---

