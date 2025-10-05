# DATABASE AUDIT: compliance-service
Generated: Thu Oct  2 15:05:54 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "pg": "^8.11.3",
    "pino": "^9.12.0",
    "pino-pretty": "^13.1.1",
```

## 2. DATABASE CONFIGURATION FILES
### database.ts
```typescript
import dotenv from 'dotenv';
dotenv.config();

export const dbConfig = {
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'tickettoken_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'TicketToken2024Secure!',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

console.log('📦 Database config loaded for:', dbConfig.database);
```

### database.service.ts
```typescript
import { Pool } from 'pg';
import { dbConfig } from '../config/database';

class DatabaseService {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    try {
      this.pool = new Pool(dbConfig);
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool;
  }

  async query(text: string, params?: any[]) {
    const pool = this.getPool();
    return pool.query(text, params);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }
}

export const db = new DatabaseService();
```


## 3. MODEL/ENTITY FILES

## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/compliance-service//src/controllers/admin.controller.ts:11:        FROM venue_verifications v
backend/services/compliance-service//src/controllers/admin.controller.ts:12:        LEFT JOIN risk_assessments r ON v.venue_id = r.venue_id
backend/services/compliance-service//src/controllers/admin.controller.ts:19:        SELECT * FROM risk_flags 
backend/services/compliance-service//src/controllers/admin.controller.ts:46:        UPDATE venue_verifications 
backend/services/compliance-service//src/controllers/admin.controller.ts:56:        INSERT INTO compliance_audit_log 
backend/services/compliance-service//src/controllers/admin.controller.ts:83:        UPDATE venue_verifications 
backend/services/compliance-service//src/controllers/admin.controller.ts:93:        INSERT INTO compliance_audit_log 
backend/services/compliance-service//src/controllers/webhook.controller.ts:15:        `INSERT INTO webhook_logs (source, type, payload, created_at)
backend/services/compliance-service//src/controllers/webhook.controller.ts:26:              `UPDATE bank_verifications
backend/services/compliance-service//src/controllers/webhook.controller.ts:69:        `INSERT INTO webhook_logs (source, type, payload, created_at)
backend/services/compliance-service//src/controllers/webhook.controller.ts:92:            `UPDATE notification_log
backend/services/compliance-service//src/controllers/webhook.controller.ts:95:               SELECT id FROM notification_log
backend/services/compliance-service//src/controllers/dashboard.controller.ts:15:        FROM venue_verifications
backend/services/compliance-service//src/controllers/dashboard.controller.ts:25:        FROM tax_records
backend/services/compliance-service//src/controllers/dashboard.controller.ts:34:        FROM ofac_checks
backend/services/compliance-service//src/controllers/dashboard.controller.ts:39:        SELECT * FROM compliance_audit_log 
backend/services/compliance-service//src/controllers/gdpr.controller.ts:13:        `INSERT INTO gdpr_deletion_requests (customer_id, status)
backend/services/compliance-service//src/controllers/gdpr.controller.ts:23:        `UPDATE gdpr_deletion_requests 
backend/services/compliance-service//src/controllers/gdpr.controller.ts:45:        `SELECT * FROM gdpr_deletion_requests 
backend/services/compliance-service//src/controllers/venue.controller.ts:13:        `INSERT INTO venue_verifications (venue_id, ein, business_name, status, verification_id)
backend/services/compliance-service//src/controllers/venue.controller.ts:21:        `INSERT INTO compliance_audit_log (action, entity_type, entity_id, metadata)
backend/services/compliance-service//src/controllers/venue.controller.ts:53:        'SELECT * FROM venue_verifications WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
backend/services/compliance-service//src/controllers/venue.controller.ts:91:        'SELECT * FROM venue_verifications ORDER BY created_at DESC LIMIT 10'
backend/services/compliance-service//src/controllers/batch.controller.ts:30:        `SELECT * FROM compliance_batch_jobs 
backend/services/compliance-service//src/controllers/ofac.controller.ts:15:        `INSERT INTO ofac_checks (venue_id, name_checked, is_match, confidence, matched_name)
backend/services/compliance-service//src/services/ofac-real.service.ts:38:          `INSERT INTO ofac_sdn_list 
backend/services/compliance-service//src/services/ofac-real.service.ts:78:      SELECT * FROM ofac_sdn_list 
backend/services/compliance-service//src/services/ofac-real.service.ts:87:        FROM ofac_sdn_list 
backend/services/compliance-service//src/services/bank.service.ts:28:      `INSERT INTO bank_verifications 
backend/services/compliance-service//src/services/bank.service.ts:43:        `UPDATE venue_verifications 
backend/services/compliance-service//src/services/bank.service.ts:63:      `INSERT INTO payout_methods 
backend/services/compliance-service//src/services/notification.service.ts:17:      `INSERT INTO notification_log 
backend/services/compliance-service//src/services/notification.service.ts:30:      `INSERT INTO notification_log 
backend/services/compliance-service//src/services/notification.service.ts:40:      'SELECT * FROM venue_verifications WHERE venue_id = $1',
backend/services/compliance-service//src/services/risk.service.ts:14:      'SELECT * FROM venue_verifications WHERE venue_id = $1',
backend/services/compliance-service//src/services/risk.service.ts:48:      'SELECT * FROM ofac_checks WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
backend/services/compliance-service//src/services/risk.service.ts:78:      `INSERT INTO risk_assessments 
backend/services/compliance-service//src/services/risk.service.ts:95:       FROM tax_records 
backend/services/compliance-service//src/services/risk.service.ts:130:      `INSERT INTO risk_flags (venue_id, reason, created_at) 
backend/services/compliance-service//src/services/risk.service.ts:142:      `UPDATE risk_flags 
backend/services/compliance-service//src/services/batch.service.ts:13:        `INSERT INTO compliance_batch_jobs 
backend/services/compliance-service//src/services/batch.service.ts:29:         FROM venue_verifications v
backend/services/compliance-service//src/services/batch.service.ts:30:         JOIN tax_records t ON v.venue_id = t.venue_id
backend/services/compliance-service//src/services/batch.service.ts:58:            `INSERT INTO form_1099_records 
backend/services/compliance-service//src/services/batch.service.ts:73:            `UPDATE tax_records 
backend/services/compliance-service//src/services/batch.service.ts:97:          `UPDATE compliance_batch_jobs 
backend/services/compliance-service//src/services/batch.service.ts:111:        `UPDATE compliance_batch_jobs 
backend/services/compliance-service//src/services/batch.service.ts:128:        EXTRACT(MONTH FROM created_at) as month,
backend/services/compliance-service//src/services/batch.service.ts:130:       FROM tax_records
backend/services/compliance-service//src/services/batch.service.ts:132:       GROUP BY EXTRACT(MONTH FROM created_at)

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### ofac-real.service.ts
First 100 lines:
```typescript
import axios from 'axios';
import xml2js from 'xml2js';
import { db } from './database.service';
import { redis } from './redis.service';

export class RealOFACService {
  private readonly OFAC_SDN_URL = 'https://www.treasury.gov/ofac/downloads/sdn.xml';
  private readonly OFAC_CONSOLIDATED_URL = 'https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml';
  
  async downloadAndUpdateOFACList(): Promise<void> {
    try {
      console.log('📥 Downloading OFAC SDN list from Treasury...');
      
      const response = await axios.get(this.OFAC_SDN_URL, {
        responseType: 'text',
        timeout: 30000
      });
      
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(response.data);
      
      // Clear existing OFAC data
      await db.query('TRUNCATE TABLE ofac_sdn_list');
      
      // Parse and store SDN entries
      const sdnEntries = result.sdnList?.sdnEntry || [];
      let processed = 0;
      
      for (const entry of sdnEntries) {
        const uid = entry.uid?.[0];
        const firstName = entry.firstName?.[0] || '';
        const lastName = entry.lastName?.[0] || '';
        const fullName = `${firstName} ${lastName}`.trim();
        const sdnType = entry.sdnType?.[0];
        const programList = entry.programList?.[0]?.program || [];
        
        await db.query(
          `INSERT INTO ofac_sdn_list 
           (uid, full_name, first_name, last_name, sdn_type, programs, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uid, fullName, firstName, lastName, sdnType, 
           JSON.stringify(programList), JSON.stringify(entry)]
        );
        
        processed++;
        if (processed % 100 === 0) {
          console.log(`  Processed ${processed} OFAC entries...`);
        }
      }
      
      console.log(`✅ OFAC list updated: ${processed} entries`);
      
      // Update last update timestamp
      await redis.set('ofac:last_update', new Date().toISOString());
      
    } catch (error) {
      console.error('❌ Failed to update OFAC list:', error);
      throw error;
    }
  }
  
  async checkAgainstOFAC(name: string, fuzzyMatch: boolean = true): Promise<{
    isMatch: boolean;
    confidence: number;
    matches: any[];
  }> {
    const normalizedName = name.toUpperCase().trim();
    
    // Check cache first
    const cacheKey = `ofac:check:${normalizedName}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Search in database
    let query = `
      SELECT * FROM ofac_sdn_list 
      WHERE UPPER(full_name) = $1
    `;
    
    if (fuzzyMatch) {
      // Use PostgreSQL's similarity functions
      query = `
        SELECT *, 
               similarity(UPPER(full_name), $1) as score
        FROM ofac_sdn_list 
        WHERE similarity(UPPER(full_name), $1) > 0.3
        ORDER BY score DESC
        LIMIT 10
      `;
    }
    
    const result = await db.query(query, [normalizedName]);
    
    const response = {
      isMatch: result.rows.length > 0,
      confidence: result.rows[0]?.score ? Math.round(result.rows[0].score * 100) : 0,
      matches: result.rows.map(row => ({
        name: row.full_name,
```

### bank.service.ts
First 100 lines:
```typescript
import { db } from './database.service';

export class BankService {
  // Mock Plaid integration
  async verifyBankAccount(
    venueId: string,
    accountNumber: string,
    routingNumber: string
  ): Promise<{
    verified: boolean;
    accountName: string;
    accountType: string;
  }> {
    // In production: Use Plaid Auth API
    // Cost: $0.50 per verification
    
    // Mock verification
    const mockVerified = !accountNumber.includes('000');
    
    const result = {
      verified: mockVerified,
      accountName: 'Mock Business Checking',
      accountType: 'checking'
    };
    
    // Store verification result
    await db.query(
      `INSERT INTO bank_verifications 
       (venue_id, account_last_four, routing_number, verified, account_name, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        venueId,
        accountNumber.slice(-4),
        routingNumber,
        mockVerified,
        result.accountName
      ]
    );
    
    // Update venue verification
    if (mockVerified) {
      await db.query(
        `UPDATE venue_verifications 
         SET bank_verified = true, updated_at = NOW()
         WHERE venue_id = $1`,
        [venueId]
      );
    }
    
    console.log(`🏦 Bank verification for ${venueId}: ${mockVerified ? 'SUCCESS' : 'FAILED'}`);
    
    return result;
  }
  
  async createPayoutMethod(
    venueId: string,
    accountToken: string
  ): Promise<string> {
    // In production: Create Stripe/Square payout destination
    const payoutId = `payout_${Date.now()}`;
    
    await db.query(
      `INSERT INTO payout_methods 
       (venue_id, payout_id, status, created_at)
       VALUES ($1, $2, 'active', NOW())`,
      [venueId, payoutId]
    );
    
    return payoutId;
  }
}

export const bankService = new BankService();
```

### notification.service.ts
First 100 lines:
```typescript
import { db } from './database.service';

export class NotificationService {
  async sendEmail(
    to: string, 
    subject: string, 
    template: string, 
    data: any
  ): Promise<void> {
    // In production: Use SendGrid
    console.log(`📧 Email sent to ${to}: ${subject}`);
    console.log(`   Template: ${template}`);
    console.log(`   Data:`, data);
    
    // Log notification
    await db.query(
      `INSERT INTO notification_log 
       (type, recipient, subject, template, status, created_at)
       VALUES ('email', $1, $2, $3, 'sent', NOW())`,
      [to, subject, template]
    );
  }
  
  async sendSMS(to: string, message: string): Promise<void> {
    // In production: Use Twilio
    console.log(`📱 SMS sent to ${to}: ${message}`);
    
    // Log notification
    await db.query(
      `INSERT INTO notification_log 
       (type, recipient, message, status, created_at)
       VALUES ('sms', $1, $2, 'sent', NOW())`,
      [to, message]
    );
  }
  
  async notifyThresholdReached(venueId: string, amount: number): Promise<void> {
    // Get venue details
    const result = await db.query(
      'SELECT * FROM venue_verifications WHERE venue_id = $1',
      [venueId]
    );
    
    if (result.rows.length > 0) {
      const venue = result.rows[0];
      
      await this.sendEmail(
        'venue@example.com', // In production: Get from venue record
        '1099-K Threshold Reached',
        'threshold-reached',
        {
          businessName: venue.business_name,
          amount: amount,
          threshold: 600,
          action: 'Please ensure your W-9 is up to date'
        }
      );
    }
  }
  
  async notifyVerificationStatus(
    venueId: string, 
    status: 'approved' | 'rejected' | 'needs_info'
  ): Promise<void> {
    const templates = {
      approved: 'verification-approved',
      rejected: 'verification-rejected',
      needs_info: 'verification-needs-info'
    };
    
    await this.sendEmail(
      'venue@example.com',
      `Verification ${status}`,
      templates[status],
      { venueId, status }
    );
  }
}

export const notificationService = new NotificationService();
```

### risk.service.ts
First 100 lines:
```typescript
import { db } from './database.service';

export class RiskService {
  async calculateRiskScore(venueId: string): Promise<{
    score: number;
    factors: string[];
    recommendation: string;
  }> {
    let score = 0;
    const factors: string[] = [];
    
    // Check verification status (0-30 points)
    const verificationResult = await db.query(
      'SELECT * FROM venue_verifications WHERE venue_id = $1',
      [venueId]
    );
    
    if (verificationResult.rows.length === 0) {
      score += 30;
      factors.push('No verification started');
    } else {
      const verification = verificationResult.rows[0];
      
      if (verification.status === 'rejected') {
        score += 50;
        factors.push('Previously rejected');
      }
      if (verification.status === 'pending') {
        score += 20;
        factors.push('Verification pending');
      }
      if (!verification.ein) {
        score += 15;
        factors.push('Missing EIN');
      }
      if (!verification.w9_uploaded) {
        score += 10;
        factors.push('No W-9 on file');
      }
      if (!verification.bank_verified) {
        score += 10;
        factors.push('Bank not verified');
      }
    }
    
    // Check OFAC status (0-40 points)
    const ofacResult = await db.query(
      'SELECT * FROM ofac_checks WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
      [venueId]
    );
    
    if (ofacResult.rows.length > 0 && ofacResult.rows[0].is_match) {
      score += 40;
      factors.push('OFAC match found');
    }
    
    // Check transaction patterns (0-30 points)
    const velocityCheck = await this.checkVelocity(venueId);
    if (velocityCheck.suspicious) {
      score += velocityCheck.riskPoints;
      factors.push(velocityCheck.reason);
    }
    
    // Determine recommendation
    let recommendation = '';
    if (score >= 70) {
      recommendation = 'BLOCK';
    } else if (score >= 50) {
      recommendation = 'MANUAL_REVIEW';
    } else if (score >= 30) {
      recommendation = 'MONITOR';
    } else {
      recommendation = 'APPROVE';
    }
    
    // Store risk assessment
    await db.query(
      `INSERT INTO risk_assessments 
       (venue_id, risk_score, factors, recommendation, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [venueId, score, JSON.stringify(factors), recommendation]
    );
    
    return { score, factors, recommendation };
  }
  
  private async checkVelocity(venueId: string): Promise<{
    suspicious: boolean;
    riskPoints: number;
    reason: string;
  }> {
    // Check for suspicious patterns in last 24 hours
    const result = await db.query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM tax_records 
       WHERE venue_id = $1 
       AND created_at > NOW() - INTERVAL '24 hours'`,
      [venueId]
    );
    
```

### batch.service.ts
First 100 lines:
```typescript
import { db } from './database.service';
import { notificationService } from './notification.service';

export class BatchService {
  async generateYear1099Forms(year: number): Promise<{
    generated: number;
    errors: number;
    venues: any[];
  }> {
    try {
      // Start batch job
      const jobResult = await db.query(
        `INSERT INTO compliance_batch_jobs 
         (job_type, status, started_at, created_at)
         VALUES ('1099_generation', 'running', NOW(), NOW())
         RETURNING id`,
        []
      );
      const jobId = jobResult.rows[0].id;
      
      // Get all venues that need 1099s
      const venuesResult = await db.query(
        `SELECT 
          v.venue_id,
          v.business_name,
          v.ein,
          SUM(t.amount) as total_sales,
          COUNT(t.id) as transaction_count
         FROM venue_verifications v
         JOIN tax_records t ON v.venue_id = t.venue_id
         WHERE t.year = $1
         GROUP BY v.venue_id, v.business_name, v.ein
         HAVING SUM(t.amount) >= 600`,
        [year]
      );
      
      const venues = venuesResult.rows;
      let generated = 0;
      let errors = 0;
      
      for (const venue of venues) {
        try {
          // Generate 1099-K form data
          const form1099 = {
            venueId: venue.venue_id,
            businessName: venue.business_name,
            ein: venue.ein,
            year: year,
            grossAmount: venue.total_sales,
            transactionCount: venue.transaction_count,
            monthlyAmounts: await this.getMonthlyBreakdown(venue.venue_id, year),
            formType: '1099-K',
            generatedAt: new Date()
          };
          
          // Store 1099 record
          await db.query(
            `INSERT INTO form_1099_records 
             (venue_id, year, form_type, gross_amount, transaction_count, form_data, generated_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [
              venue.venue_id,
              year,
              '1099-K',
              venue.total_sales,
              venue.transaction_count,
              JSON.stringify(form1099)
            ]
          );
          
          // Update tax records
          await db.query(
            `UPDATE tax_records 
             SET form_1099_required = true 
             WHERE venue_id = $1 AND year = $2`,
            [venue.venue_id, year]
          );
          
          // Send notification
          await notificationService.sendEmail(
            'venue@example.com',
            `Your ${year} Form 1099-K is Ready`,
            '1099-ready',
            form1099
          );
          
          generated++;
          console.log(`✅ Generated 1099-K for ${venue.business_name}: $${venue.total_sales}`);
          
        } catch (error) {
          console.error(`❌ Failed to generate 1099 for ${venue.venue_id}:`, error);
          errors++;
        }
        
        // Update job progress
        await db.query(
          `UPDATE compliance_batch_jobs 
           SET completed_items = $2, error_count = $3, progress = $4
           WHERE id = $1`,
          [
```

### data-retention.service.ts
First 100 lines:
```typescript
import { db } from './database.service';

export class DataRetentionService {
  private retentionPolicies = {
    'tax_records': { days: 2555, reason: 'IRS 7-year requirement', canDelete: false },
    'ofac_checks': { days: 1825, reason: 'FinCEN 5-year requirement', canDelete: false },
    'audit_logs': { days: 2555, reason: 'SOC 2 requirement', canDelete: false },
    'customer_profiles': { days: 90, reason: 'GDPR - delete on request', canDelete: true },
    'payment_data': { days: 2555, reason: 'PCI DSS & tax requirements', canDelete: false },
    'venue_verifications': { days: 2555, reason: 'Business records', canDelete: false }
  };

  async enforceRetention(): Promise<void> {
    for (const [table, policy] of Object.entries(this.retentionPolicies)) {
      if (policy.canDelete) {
        await this.deleteOldRecords(table, policy.days);
      }
    }
  }

  async handleGDPRDeletion(customerId: string): Promise<void> {
    // Anonymize customer profiles
    await db.query(
      `UPDATE customer_profiles SET
       email = 'deleted@gdpr.request',
       name = 'GDPR_DELETED',
       phone = NULL,
       address = NULL
       WHERE customer_id = $1`,
      [customerId]
    );

    // Clear preferences (different columns)
    await db.query(
      `UPDATE customer_preferences SET
       marketing_emails = false,
       sms_notifications = false,
       push_notifications = false
       WHERE customer_id = $1`,
      [customerId]
    );

    // Clear analytics
    await db.query(
      `DELETE FROM customer_analytics WHERE customer_id = $1`,
      [customerId]
    );
  }

  private async deleteOldRecords(table: string, days: number): Promise<void> {
    // SECURITY FIX: Whitelist table names and use parameterized queries
    const allowedTables = Object.keys(this.retentionPolicies);
    
    if (!allowedTables.includes(table)) {
      throw new Error(`Invalid table name: ${table}`);
    }

    // Validate days parameter
    const daysNum = Number.parseInt(String(days), 10);
    if (!Number.isFinite(daysNum) || daysNum < 0 || daysNum > 10000) {
      throw new Error('Invalid days parameter: must be 0-10000');
    }

    // Since we can't parameterize table names in PostgreSQL, we use a whitelist approach
    // The table name is now guaranteed to be from our predefined list
    // We use parameterized query for the days value
    const query = `DELETE FROM ${table} WHERE created_at < NOW() - make_interval(days => $1)`;
    await db.query(query, [daysNum]);
  }
}

export const dataRetentionService = new DataRetentionService();
```

### customer-tax.service.ts
First 100 lines:
```typescript
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
```

### database.service.ts
First 100 lines:
```typescript
import { Pool } from 'pg';
import { dbConfig } from '../config/database';

class DatabaseService {
  private pool: Pool | null = null;

  async connect(): Promise<void> {
    try {
      this.pool = new Pool(dbConfig);
      
      // Test the connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      console.log('✅ Database connected successfully');
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  getPool(): Pool {
    if (!this.pool) {
      throw new Error('Database not connected');
    }
    return this.pool;
  }

  async query(text: string, params?: any[]) {
    const pool = this.getPool();
    return pool.query(text, params);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      console.log('Database connection closed');
    }
  }
}

export const db = new DatabaseService();
```

### pdf.service.ts
First 100 lines:
```typescript
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

export class PDFService {
  private outputDir = process.env.PDF_OUTPUT_PATH || './generated-forms';
  
  constructor() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }
  
  async generate1099K(data: {
    venueId: string;
    businessName: string;
    ein: string;
    year: number;
    grossAmount: number;
    transactionCount: number;
    monthlyAmounts: any;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const filename = `1099K_${data.venueId}_${data.year}.pdf`;
        const filepath = path.join(this.outputDir, filename);
        
        const doc = new PDFDocument({ size: 'LETTER', margin: 50 });
        const stream = fs.createWriteStream(filepath);
        doc.pipe(stream);
        
        // IRS Form 1099-K Header
        doc.fontSize(16).font('Helvetica-Bold')
           .text('Form 1099-K', 50, 50);
        
        doc.fontSize(12).font('Helvetica')
           .text('Payment Card and Third Party Network Transactions', 50, 75);
        
        doc.fontSize(10)
           .text(`Tax Year: ${data.year}`, 450, 50);
        
        // Payer Information (TicketToken)
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PAYER (TicketToken Platform)', 50, 120);
        
        doc.fontSize(10).font('Helvetica')
           .text('TicketToken Inc.', 50, 140)
           .text('123 Blockchain Way', 50, 155)
           .text('Nashville, TN 37203', 50, 170)
           .text('EIN: 88-1234567', 50, 185);
        
        // Payee Information (Venue)
        doc.fontSize(12).font('Helvetica-Bold')
           .text('PAYEE', 300, 120);
        
        doc.fontSize(10).font('Helvetica')
           .text(data.businessName, 300, 140)
           .text(`EIN: ${data.ein}`, 300, 155)
           .text(`Venue ID: ${data.venueId}`, 300, 170);
        
        // Transaction Information
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Transaction Information', 50, 230);
        
        // Box 1a: Gross amount of payment card/third party transactions
        doc.rect(50, 250, 500, 30).stroke();
        doc.fontSize(10).font('Helvetica')
           .text('1a. Gross amount of payment card/third party network transactions', 55, 255)
           .font('Helvetica-Bold')
           .text(`$${data.grossAmount.toFixed(2)}`, 450, 255);
        
        // Box 2: Card not present transactions
        doc.rect(50, 285, 500, 30).stroke();
        doc.fontSize(10).font('Helvetica')
           .text('2. Card not present transactions', 55, 290)
           .font('Helvetica-Bold')
           .text(`${data.transactionCount}`, 450, 290);
        
        // Monthly breakdown
        doc.fontSize(12).font('Helvetica-Bold')
           .text('Monthly Breakdown', 50, 340);
        
        let yPos = 360;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        doc.fontSize(9).font('Helvetica');
        for (let i = 0; i < 12; i++) {
          const amount = data.monthlyAmounts[`month_${i + 1}`] || 0;
          if (i % 2 === 0) {
            doc.text(`${months[i]}: $${amount.toFixed(2)}`, 50, yPos);
          } else {
            doc.text(`${months[i]}: $${amount.toFixed(2)}`, 200, yPos);
            yPos += 15;
          }
        }
        
        // Footer
        doc.fontSize(8).font('Helvetica')
           .text('This is important tax information and is being furnished to the Internal Revenue Service.', 50, 500)
```

### state-compliance.service.ts
First 100 lines:
```typescript
import { db } from './database.service';

interface StateRule {
  maxMarkup: number | null;
  requiresDisclosure: boolean;
  requiresLicense: boolean;
  specialRules: string[];
}

export class StateComplianceService {
  private stateRules: Record<string, StateRule> = {
    'TN': {
      maxMarkup: 0.20, // Tennessee limits markup to 20% over face value
      requiresDisclosure: true,
      requiresLicense: false,
      specialRules: ['No sales within 200ft of venue']
    },
    'TX': {
      maxMarkup: null, // No limit
      requiresDisclosure: true,
      requiresLicense: true, // Texas requires license for resale
      specialRules: ['Must display original price']
    }
  };

  async validateResale(state: string, originalPrice: number, resalePrice: number): Promise<{
    allowed: boolean;
    reason?: string;
    maxAllowedPrice?: number;
  }> {
    const rules = this.stateRules[state];

    if (!rules) {
      return { allowed: true }; // No restrictions for this state
    }

    if (rules.maxMarkup !== null) {
      const maxPrice = originalPrice * (1 + rules.maxMarkup);
      if (resalePrice > maxPrice) {
        return {
          allowed: false,
          reason: `${state} limits markup to ${rules.maxMarkup * 100}%`,
          maxAllowedPrice: maxPrice
        };
      }
    }

    return { allowed: true };
  }

  async checkLicenseRequirement(state: string): Promise<boolean> {
    return this.stateRules[state]?.requiresLicense || false;
  }

  async loadFromDatabase(): Promise<void> {
    const result = await db.query('SELECT * FROM state_compliance_rules');
    
    for (const row of result.rows) {
      this.stateRules[row.state_code] = {
        maxMarkup: row.max_markup_percentage ? row.max_markup_percentage / 100 : null,
        requiresDisclosure: row.requires_disclosure,
        requiresLicense: row.requires_license,
        specialRules: row.special_rules?.rules || []
      };
    }
  }
}

export const stateComplianceService = new StateComplianceService();
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

