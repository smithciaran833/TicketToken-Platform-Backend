# COMPLETE DATABASE ANALYSIS: compliance-service
Generated: Thu Oct  2 15:07:49 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/controllers/admin.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';
import { notificationService } from '../services/notification.service';

export class AdminController {
  static async getPendingReviews(req: Request, res: Response) {
    try {
      const pendingVerifications = await db.query(`
        SELECT v.*, r.risk_score, r.factors, r.recommendation
        FROM venue_verifications v
        LEFT JOIN risk_assessments r ON v.venue_id = r.venue_id
        WHERE v.status = 'pending' 
        OR v.manual_review_required = true
        ORDER BY v.created_at DESC
      `);
      
      const pendingFlags = await db.query(`
        SELECT * FROM risk_flags 
        WHERE resolved = false
        ORDER BY created_at DESC
      `);
      
      res.json({
        success: true,
        data: {
          verifications: pendingVerifications.rows,
          flags: pendingFlags.rows,
          totalPending: pendingVerifications.rows.length + pendingFlags.rows.length
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async approveVerification(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const { notes } = req.body;
      
      await db.query(`
        UPDATE venue_verifications 
        SET status = 'verified', 
            manual_review_required = false,
            manual_review_notes = $2,
            updated_at = NOW()
        WHERE venue_id = $1
      `, [venueId, notes]);
      
      // Log the action
      await db.query(`
        INSERT INTO compliance_audit_log 
        (action, entity_type, entity_id, user_id, metadata)
        VALUES ('verification_approved', 'venue', $1, $2, $3)
      `, [venueId, 'admin', JSON.stringify({ notes })]);
      
      // Notify venue
      await notificationService.notifyVerificationStatus(venueId, 'approved');
      
      res.json({
        success: true,
        message: 'Venue verification approved',
        data: { venueId }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async rejectVerification(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      const { reason, notes } = req.body;
      
      await db.query(`
        UPDATE venue_verifications 
        SET status = 'rejected',
            manual_review_required = false,
            manual_review_notes = $2,
            updated_at = NOW()
        WHERE venue_id = $1
      `, [venueId, notes]);
      
      // Log the action
      await db.query(`
        INSERT INTO compliance_audit_log 
        (action, entity_type, entity_id, user_id, metadata)
        VALUES ('verification_rejected', 'venue', $1, $2, $3)
      `, [venueId, 'admin', JSON.stringify({ reason, notes })]);
      
      // Notify venue
      await notificationService.notifyVerificationStatus(venueId, 'rejected');
      
      res.json({
        success: true,
        message: 'Venue verification rejected',
        data: { venueId, reason }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

### FILE: src/controllers/webhook.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';
import crypto from 'crypto';

export class WebhookController {
  // Plaid webhook for bank verification
  static async handlePlaidWebhook(req: Request, res: Response) {
    try {
      const { webhook_type, webhook_code, item_id } = req.body;
      console.log(`🏦 Plaid webhook: ${webhook_type} - ${webhook_code}`);
      
      // Log webhook
      await db.query(
        `INSERT INTO webhook_logs (source, type, payload, created_at)
         VALUES ('plaid', $1, $2, NOW())`,
        [webhook_type, JSON.stringify(req.body)]
      );
      
      // Handle different webhook types
      switch (webhook_type) {
        case 'AUTH':
          if (webhook_code === 'VERIFICATION_EXPIRED') {
            // Mark bank verification as expired
            await db.query(
              `UPDATE bank_verifications
               SET verified = false
               WHERE plaid_item_id = $1`,
              [item_id]
            );
          }
          break;
          
        case 'ITEM':
          if (webhook_code === 'ERROR') {
            console.error('Plaid item error:', req.body.error);
          }
          break;
      }
      
      return res.json({ received: true });
    } catch (error: any) {
      console.error('Plaid webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Stripe webhook for payment processing
  static async handleStripeWebhook(req: Request, res: Response) {
    try {
      const sig = req.headers['stripe-signature'] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      
      if (!webhookSecret) {
        console.log('💳 [MOCK] Stripe webhook received');
        return res.json({ received: true });
      }
      
      // Verify webhook signature
      const payload = req.body;
      const payloadString = JSON.stringify(payload);
      const header = sig;
      
      // In production: Use Stripe SDK to verify
      // const event = stripe.webhooks.constructEvent(payloadString, header, webhookSecret);
      
      // Log webhook
      await db.query(
        `INSERT INTO webhook_logs (source, type, payload, created_at)
         VALUES ('stripe', $1, $2, NOW())`,
        ['payment', payloadString]
      );
      
      return res.json({ received: true });
    } catch (error: any) {
      console.error('Stripe webhook error:', error);
      return res.status(400).json({ error: error.message });
    }
  }

  // SendGrid webhook for email events
  static async handleSendGridWebhook(req: Request, res: Response) {
    try {
      const events = req.body; // Array of events
      
      for (const event of events) {
        console.log(`📧 SendGrid event: ${event.event} for ${event.email}`);
        
        // Update notification log - fixed SQL
        if (event.event === 'delivered' || event.event === 'bounce') {
          await db.query(
            `UPDATE notification_log
             SET status = $1, updated_at = NOW()
             WHERE id = (
               SELECT id FROM notification_log
               WHERE recipient = $2 AND type = 'email'
               ORDER BY created_at DESC
               LIMIT 1
             )`,
            [event.event, event.email]
          );
        }
      }
      
      return res.json({ received: true });
    } catch (error: any) {
      console.error('SendGrid webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }
}
```

### FILE: src/controllers/dashboard.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';

export class DashboardController {
  static async getComplianceOverview(req: Request, res: Response) {
    try {
      // Get verification stats
      const verifications = await db.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
          COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
        FROM venue_verifications
      `);
      
      // Get tax stats for current year
      const year = new Date().getFullYear();
      const taxStats = await db.query(`
        SELECT 
          COUNT(DISTINCT venue_id) as venues_with_sales,
          SUM(amount) as total_sales,
          COUNT(CASE WHEN threshold_reached THEN 1 END) as venues_over_threshold
        FROM tax_records
        WHERE year = $1
      `, [year]);
      
      // Get OFAC check stats
      const ofacStats = await db.query(`
        SELECT 
          COUNT(*) as total_checks,
          COUNT(CASE WHEN is_match THEN 1 END) as matches_found
        FROM ofac_checks
      `);
      
      // Get recent activity
      const recentActivity = await db.query(`
        SELECT * FROM compliance_audit_log 
        ORDER BY created_at DESC 
        LIMIT 5
      `);
      
      res.json({
        success: true,
        data: {
          overview: {
            timestamp: new Date().toISOString(),
            year: year
          },
          verifications: verifications.rows[0],
          taxReporting: {
            ...taxStats.rows[0],
            threshold: 600,
            forms_required: taxStats.rows[0]?.venues_over_threshold || 0
          },
          ofacScreening: ofacStats.rows[0],
          recentActivity: recentActivity.rows
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

### FILE: src/controllers/gdpr.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { dataRetentionService } from '../services/data-retention.service';
import { db } from '../services/database.service';

export class GDPRController {
  static async requestDeletion(req: Request, res: Response) {
    try {
      const { customerId } = req.body;
      
      // Log the request
      await db.query(
        `INSERT INTO gdpr_deletion_requests (customer_id, status)
         VALUES ($1, 'processing')`,
        [customerId]
      );
      
      // Process deletion
      await dataRetentionService.handleGDPRDeletion(customerId);
      
      // Update status
      await db.query(
        `UPDATE gdpr_deletion_requests 
         SET status = 'completed', processed_at = NOW()
         WHERE customer_id = $1`,
        [customerId]
      );
      
      res.json({
        success: true,
        message: 'GDPR deletion request processed',
        customerId
      });
    } catch (error: any) {
      console.error('GDPR deletion error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  static async getDeletionStatus(req: Request, res: Response) {
    try {
      const { customerId } = req.params;
      
      const result = await db.query(
        `SELECT * FROM gdpr_deletion_requests 
         WHERE customer_id = $1 
         ORDER BY requested_at DESC LIMIT 1`,
        [customerId]
      );
      
      res.json({
        success: true,
        data: result.rows[0] || null
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
```

### FILE: src/controllers/venue.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';

export class VenueController {
  static async startVerification(req: Request, res: Response) {
    try {
      const { venueId, ein, businessName } = req.body;
      const verificationId = 'ver_' + Date.now();
      
      // Save to database
      const result = await db.query(
        `INSERT INTO venue_verifications (venue_id, ein, business_name, status, verification_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [venueId, ein, businessName, 'pending', verificationId]
      );
      
      // Log to audit table
      await db.query(
        `INSERT INTO compliance_audit_log (action, entity_type, entity_id, metadata)
         VALUES ($1, $2, $3, $4)`,
        ['verification_started', 'venue', venueId, JSON.stringify({ ein, businessName })]
      );
      
      return res.json({
        success: true,
        message: 'Verification started and saved to database',
        data: {
          id: result.rows[0].id,
          venueId,
          verificationId,
          status: 'pending',
          nextStep: 'upload_w9'
        }
      });
    } catch (error: any) {
      console.error('Error starting verification:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to start verification',
        details: error.message
      });
    }
  }

  static async getVerificationStatus(req: Request, res: Response) {
    try {
      const { venueId } = req.params;
      
      // Get from database
      const result = await db.query(
        'SELECT * FROM venue_verifications WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
        [venueId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No verification found for this venue'
        });
      }
      
      const verification = result.rows[0];
      
      return res.json({
        success: true,
        data: {
          venueId: verification.venue_id,
          verificationId: verification.verification_id,
          status: verification.status,
          businessName: verification.business_name,
          ein: verification.ein,
          createdAt: verification.created_at,
          updatedAt: verification.updated_at
        }
      });
    } catch (error: any) {
      console.error('Error getting verification status:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get verification status',
        details: error.message
      });
    }
  }

  static async getAllVerifications(req: Request, res: Response) {
    try {
      const result = await db.query(
        'SELECT * FROM venue_verifications ORDER BY created_at DESC LIMIT 10'
      );
      
      return res.json({
        success: true,
        count: result.rows.length,
        data: result.rows
      });
    } catch (error: any) {
      console.error('Error getting verifications:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to get verifications',
        details: error.message
      });
    }
  }
}
```

### FILE: src/controllers/batch.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { batchService } from '../services/batch.service';
import { db } from '../services/database.service';

export class BatchController {
  static async generate1099Forms(req: Request, res: Response) {
    try {
      const { year } = req.body;
      const targetYear = year || new Date().getFullYear() - 1;
      
      const result = await batchService.generateYear1099Forms(targetYear);
      
      res.json({
        success: true,
        message: `Generated ${result.generated} Form 1099-Ks for year ${targetYear}`,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async getBatchJobs(req: Request, res: Response) {
    try {
      const jobs = await db.query(
        `SELECT * FROM compliance_batch_jobs 
         ORDER BY created_at DESC 
         LIMIT 20`
      );
      
      res.json({
        success: true,
        data: jobs.rows
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async runDailyChecks(req: Request, res: Response) {
    try {
      await batchService.dailyComplianceChecks();
      
      res.json({
        success: true,
        message: 'Daily compliance checks completed'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  static async updateOFACList(req: Request, res: Response) {
    try {
      await batchService.processOFACUpdates();
      
      res.json({
        success: true,
        message: 'OFAC list updated successfully'
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

### FILE: src/controllers/ofac.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { ofacService } from '../services/ofac.service';
import { db } from '../services/database.service';

export class OFACController {
  static async checkName(req: Request, res: Response) {
    try {
      const { name, venueId } = req.body;
      
      const result = await ofacService.checkName(name);
      
      // Log the check
      await db.query(
        `INSERT INTO ofac_checks (venue_id, name_checked, is_match, confidence, matched_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [venueId, name, result.isMatch, result.confidence, result.matchedName]
      );
      
      res.json({
        success: true,
        data: {
          ...result,
          timestamp: new Date().toISOString(),
          action: result.isMatch ? 'REQUIRES_REVIEW' : 'CLEARED'
        }
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

### FILE: src/controllers/health.controller.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { db } from '../services/database.service';
import { redis } from '../services/redis.service';

export class HealthController {
  static async checkHealth(req: Request, res: Response) {
    res.json({
      status: 'healthy',
      service: 'compliance-service',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV
    });
  }

  static async checkReadiness(req: Request, res: Response) {
    const checks: any = {
      database: false,
      redis: false
    };

    // Check database
    try {
      await db.query('SELECT 1');
      checks.database = true;
    } catch (error) {
      checks.database = false;
    }

    // Check Redis
    try {
      const redisClient = redis.getClient();
      if (redisClient) {
        await redisClient.ping();
        checks.redis = true;
      }
    } catch (error) {
      checks.redis = false;
    }

    const ready = checks.database; // Redis is optional

    res.status(ready ? 200 : 503).json({
      ready,
      service: 'compliance-service',
      checks
    });
  }
}
```

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends Request {
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    req.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}

// Admin only middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Compliance officer middleware
export function requireComplianceOfficer(req: AuthRequest, res: Response, next: NextFunction): void {
  const validRoles = ['admin', 'compliance_officer', 'compliance_manager'];
  const hasRole = req.user?.roles?.some((role: string) => validRoles.includes(role));
  
  if (!hasRole) {
    res.status(403).json({ error: 'Compliance officer access required' });
    return;
  }
  next();
}

// Webhook authentication (different from user auth)
export function webhookAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!signature || signature !== secret) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    // Set default tenant for webhooks
    (req as AuthRequest).tenantId = '00000000-0000-0000-0000-000000000001';
    next();
  };
}
```

### FILE: src/services/ofac-real.service.ts
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
        type: row.sdn_type,
        programs: row.programs,
        score: row.score
      }))
    };
    
    // Cache for 24 hours
    await redis.set(cacheKey, JSON.stringify(response), 86400);
    
    return response;
  }
}

export const realOFACService = new RealOFACService();
```

### FILE: src/services/bank.service.ts
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

### FILE: src/services/notification.service.ts
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

### FILE: src/services/risk.service.ts
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
    
    const count = parseInt(result.rows[0]?.count || '0');
    const total = parseFloat(result.rows[0]?.total || '0');
    
    // High velocity checks
    if (count > 100) {
      return {
        suspicious: true,
        riskPoints: 20,
        reason: `High transaction velocity: ${count} in 24h`
      };
    }
    
    if (total > 10000) {
      return {
        suspicious: true,
        riskPoints: 25,
        reason: `High transaction volume: $${total} in 24h`
      };
    }
    
    return {
      suspicious: false,
      riskPoints: 0,
      reason: ''
    };
  }
  
  async flagForReview(venueId: string, reason: string): Promise<void> {
    await db.query(
      `INSERT INTO risk_flags (venue_id, reason, created_at) 
       VALUES ($1, $2, NOW())`,
      [venueId, reason]
    );
    
    console.log(`🚩 Venue ${venueId} flagged for review: ${reason}`);
    
    // TODO: Send notification to admin
  }
  
  async resolveFlag(flagId: number, resolution: string): Promise<void> {
    await db.query(
      `UPDATE risk_flags 
       SET resolved = true, resolution = $2, resolved_at = NOW()
       WHERE id = $1`,
      [flagId, resolution]
    );
  }
}

export const riskService = new RiskService();
```

### FILE: src/services/batch.service.ts
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
            jobId, 
            generated, 
            errors,
            Math.round((generated / venues.length) * 100)
          ]
        );
      }
      
      // Complete job
      await db.query(
        `UPDATE compliance_batch_jobs 
         SET status = 'completed', completed_at = NOW(), total_items = $2
         WHERE id = $1`,
        [jobId, venues.length]
      );
      
      return { generated, errors, venues };
      
    } catch (error) {
      console.error('Batch 1099 generation failed:', error);
      throw error;
    }
  }
  
  private async getMonthlyBreakdown(venueId: string, year: number): Promise<any> {
    const result = await db.query(
      `SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        SUM(amount) as total
       FROM tax_records
       WHERE venue_id = $1 AND year = $2
       GROUP BY EXTRACT(MONTH FROM created_at)
       ORDER BY month`,
      [venueId, year]
    );
    
    const breakdown: any = {};
    for (let month = 1; month <= 12; month++) {
      breakdown[`month_${month}`] = 0;
    }
    
    for (const row of result.rows) {
      breakdown[`month_${row.month}`] = parseFloat(row.total);
    }
    
    return breakdown;
  }
  
  async processOFACUpdates(): Promise<void> {
    console.log('📥 Processing OFAC list update...');
    
    // In production: Download from Treasury
    // const response = await fetch('https://www.treasury.gov/ofac/downloads/sdn.xml');
    // Parse XML and update database
    
    // For now, just log
    console.log('✅ OFAC list updated (mock)');
    
    // Re-check all venues against new list
    const venues = await db.query('SELECT venue_id, business_name FROM venue_verifications');
    
    for (const venue of venues.rows) {
      // Re-run OFAC check
      console.log(`Re-checking ${venue.business_name} against updated OFAC list`);
    }
  }
  
  async dailyComplianceChecks(): Promise<void> {
    console.log('🔍 Running daily compliance checks...');
    
    // Check for expired verifications
    const expiredResult = await db.query(
      `SELECT * FROM venue_verifications 
       WHERE status = 'verified' 
       AND updated_at < NOW() - INTERVAL '365 days'`
    );
    
    if (expiredResult.rows.length > 0) {
      console.log(`⚠️  ${expiredResult.rows.length} venues need re-verification`);
      
      for (const venue of expiredResult.rows) {
        await notificationService.sendEmail(
          'venue@example.com',
          'Annual Verification Required',
          'reverification-required',
          { venueId: venue.venue_id, businessName: venue.business_name }
        );
      }
    }
    
    // Check for venues approaching tax threshold
    const year = new Date().getFullYear();
    const thresholdResult = await db.query(
      `SELECT 
        v.venue_id,
        v.business_name,
        SUM(t.amount) as total_sales
       FROM venue_verifications v
       JOIN tax_records t ON v.venue_id = t.venue_id
       WHERE t.year = $1
       GROUP BY v.venue_id, v.business_name
       HAVING SUM(t.amount) BETWEEN 500 AND 599`,
      [year]
    );
    
    if (thresholdResult.rows.length > 0) {
      console.log(`📊 ${thresholdResult.rows.length} venues approaching $600 threshold`);
    }
    
    console.log('✅ Daily compliance checks completed');
  }
}

export const batchService = new BatchService();
```

### FILE: src/services/init-tables.ts
```typescript
import { db } from './database.service';

export async function initializeTables() {
  try {
    // Main tables
    const tables = [
      // Venue verifications
      `CREATE TABLE IF NOT EXISTS venue_verifications (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255) NOT NULL UNIQUE,
        ein VARCHAR(20),
        business_name VARCHAR(255),
        business_address TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        verification_id VARCHAR(255) UNIQUE,
        w9_uploaded BOOLEAN DEFAULT false,
        bank_verified BOOLEAN DEFAULT false,
        ofac_cleared BOOLEAN DEFAULT false,
        risk_score INTEGER DEFAULT 0,
        manual_review_required BOOLEAN DEFAULT false,
        manual_review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Tax records
      `CREATE TABLE IF NOT EXISTS tax_records (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        ticket_id VARCHAR(255),
        event_id VARCHAR(255),
        threshold_reached BOOLEAN DEFAULT false,
        form_1099_required BOOLEAN DEFAULT false,
        form_1099_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OFAC checks
      `CREATE TABLE IF NOT EXISTS ofac_checks (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        name_checked VARCHAR(255),
        is_match BOOLEAN,
        confidence INTEGER,
        matched_name VARCHAR(255),
        reviewed BOOLEAN DEFAULT false,
        review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Risk assessments
      `CREATE TABLE IF NOT EXISTS risk_assessments (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        risk_score INTEGER,
        factors JSONB,
        recommendation VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Risk flags
      `CREATE TABLE IF NOT EXISTS risk_flags (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        reason TEXT,
        severity VARCHAR(20) DEFAULT 'medium',
        resolved BOOLEAN DEFAULT false,
        resolution TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Compliance documents
      `CREATE TABLE IF NOT EXISTS compliance_documents (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) UNIQUE,
        venue_id VARCHAR(255),
        document_type VARCHAR(50),
        filename VARCHAR(255),
        original_name VARCHAR(255),
        storage_path TEXT,
        s3_url TEXT,
        uploaded_by VARCHAR(255),
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Bank verifications
      `CREATE TABLE IF NOT EXISTS bank_verifications (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        account_last_four VARCHAR(4),
        routing_number VARCHAR(20),
        verified BOOLEAN,
        account_name VARCHAR(255),
        account_type VARCHAR(20),
        plaid_request_id VARCHAR(255),
        plaid_item_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Payout methods
      `CREATE TABLE IF NOT EXISTS payout_methods (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        payout_id VARCHAR(255),
        provider VARCHAR(50),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Notification log
      `CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20),
        recipient VARCHAR(255),
        subject VARCHAR(255),
        message TEXT,
        template VARCHAR(100),
        status VARCHAR(20),
        error_message TEXT,
        updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Compliance settings
      `CREATE TABLE IF NOT EXISTS compliance_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Batch jobs
      `CREATE TABLE IF NOT EXISTS compliance_batch_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(50),
        status VARCHAR(20),
        progress INTEGER DEFAULT 0,
        total_items INTEGER,
        completed_items INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Form 1099 records
      `CREATE TABLE IF NOT EXISTS form_1099_records (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        year INTEGER,
        form_type VARCHAR(20),
        gross_amount DECIMAL(10,2),
        transaction_count INTEGER,
        form_data JSONB,
        sent_to_irs BOOLEAN DEFAULT false,
        sent_to_venue BOOLEAN DEFAULT false,
        generated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Webhook logs
      `CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50),
        type VARCHAR(100),
        payload JSONB,
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OFAC SDN list
      `CREATE TABLE IF NOT EXISTS ofac_sdn_list (
        id SERIAL PRIMARY KEY,
        uid VARCHAR(50),
        full_name VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        sdn_type VARCHAR(50),
        programs JSONB,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Audit log
      `CREATE TABLE IF NOT EXISTS compliance_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        user_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    
    // Create all tables
    for (const table of tables) {
      await db.query(table);
    }
    
    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_venue_verifications_venue_id ON venue_verifications(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_venue_verifications_status ON venue_verifications(status)',
      'CREATE INDEX IF NOT EXISTS idx_tax_records_venue_id ON tax_records(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_tax_records_year ON tax_records(year)',
      'CREATE INDEX IF NOT EXISTS idx_ofac_checks_venue_id ON ofac_checks(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_risk_flags_venue_id ON risk_flags(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_compliance_documents_venue_id ON compliance_documents(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON compliance_audit_log(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_form_1099_venue ON form_1099_records(venue_id, year)',
      'CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source)',
      'CREATE INDEX IF NOT EXISTS idx_ofac_sdn_name ON ofac_sdn_list(full_name)'
    ];
    
    for (const index of indexes) {
      try {
        await db.query(index);
      } catch (error: any) {
        // Index might already exist
        if (!error.message.includes('already exists')) {
          console.error('Index creation error:', error.message);
        }
      }
    }
    
    // Insert default settings
    await db.query(`
      INSERT INTO compliance_settings (key, value, description)
      VALUES 
        ('tax_threshold', '600', 'IRS 1099-K threshold'),
        ('high_risk_score', '70', 'Score above which venues are blocked'),
        ('review_required_score', '50', 'Score requiring manual review'),
        ('ofac_update_enabled', 'true', 'Auto-update OFAC list daily'),
        ('auto_approve_low_risk', 'false', 'Auto-approve venues with score < 20')
      ON CONFLICT (key) DO NOTHING
    `);
    
    console.log('✅ All compliance tables and indexes created');
  } catch (error) {
    console.error('❌ Failed to initialize tables:', error);
  }
}
```

### FILE: src/services/data-retention.service.ts
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

### FILE: src/services/customer-tax.service.ts
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

### FILE: src/services/database.service.ts
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

### FILE: src/services/state-compliance.service.ts
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

### FILE: src/services/tax.service.ts
```typescript
import { db } from './database.service';

export class TaxService {
  private readonly FORM_1099_THRESHOLD = 600; // Real IRS threshold
  private readonly TICKET_REPORTING_THRESHOLD = 200; // Per transaction

  async trackSale(venueId: string, amount: number, ticketId: string) {
    try {
      // Get current year totals
      const year = new Date().getFullYear();
      
      const result = await db.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM tax_records
         WHERE venue_id = $1 AND year = $2`,
        [venueId, year]
      );
      
      const currentTotal = parseFloat(result.rows[0]?.total || '0');
      const newTotal = currentTotal + amount;
      
      // Check if threshold reached
      const thresholdReached = newTotal >= this.FORM_1099_THRESHOLD;
      
      // Log the sale
      await db.query(
        `INSERT INTO tax_records (venue_id, year, amount, ticket_id, threshold_reached)
         VALUES ($1, $2, $3, $4, $5)`,
        [venueId, year, amount, ticketId, thresholdReached]
      );
      
      // Alert if threshold just crossed
      if (!thresholdReached && newTotal >= this.FORM_1099_THRESHOLD) {
        console.log(`🚨 VENUE ${venueId} has reached $${this.FORM_1099_THRESHOLD} threshold!`);
        console.log(`📋 1099-K required for tax year ${year}`);
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
      console.error('Error tracking sale:', error);
      throw error;
    }
  }

  async getVenueTaxSummary(venueId: string, year?: number) {
    const taxYear = year || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        MAX(amount) as largest_sale,
        MIN(created_at) as first_sale,
        MAX(created_at) as last_sale
       FROM tax_records
       WHERE venue_id = $1 AND year = $2`,
      [venueId, taxYear]
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

  async calculateTax(data: any) {
    // Simple tax calculation implementation
    const { amount, venueId, taxRate = 0.08 } = data;
    
    const taxAmount = amount * taxRate;
    const totalWithTax = amount + taxAmount;
    
    // Log the calculation
    await db.query(
      `INSERT INTO tax_calculations (venue_id, amount, tax_rate, tax_amount, total)
       VALUES ($1, $2, $3, $4, $5)`,
      [venueId, amount, taxRate, taxAmount, totalWithTax]
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

  async generateTaxReport(year: number) {
    // Generate comprehensive tax report for the year
    const result = await db.query(
      `SELECT 
        venue_id,
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        COUNT(CASE WHEN threshold_reached THEN 1 END) as threshold_transactions
       FROM tax_records
       WHERE year = $1
       GROUP BY venue_id
       ORDER BY total_sales DESC`,
      [year]
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
```

### FILE: src/services/document.service.ts
```typescript
import { db } from './database.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DocumentService {
  private uploadDir = process.env.DOCUMENT_STORAGE_PATH || './uploads';
  
  constructor() {
    // Create upload directory if it doesn't exist
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }
  
  async storeDocument(
    venueId: string, 
    documentType: string, 
    buffer: Buffer,
    originalName: string
  ): Promise<string> {
    try {
      // Generate unique filename
      const documentId = `doc_${uuidv4()}`;
      const ext = path.extname(originalName);
      const filename = `${venueId}_${documentType}_${documentId}${ext}`;
      const filepath = path.join(this.uploadDir, filename);
      
      // In production, this would upload to S3
      // For now, save locally
      fs.writeFileSync(filepath, buffer);
      
      // Store reference in database
      await db.query(
        `INSERT INTO compliance_documents 
         (document_id, venue_id, document_type, filename, original_name, storage_path, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [documentId, venueId, documentType, filename, originalName, filepath]
      );
      
      // Update venue verification status
      if (documentType === 'W9') {
        await db.query(
          `UPDATE venue_verifications 
           SET w9_uploaded = true, updated_at = NOW()
           WHERE venue_id = $1`,
          [venueId]
        );
      }
      
      console.log(`📄 Document stored: ${documentType} for venue ${venueId}`);
      return documentId;
      
    } catch (error) {
      console.error('Error storing document:', error);
      throw error;
    }
  }
  
  async getDocument(documentId: string): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    const result = await db.query(
      'SELECT * FROM compliance_documents WHERE document_id = $1',
      [documentId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Document not found');
    }
    
    const doc = result.rows[0];
    const buffer = fs.readFileSync(doc.storage_path);
    
    return {
      buffer,
      filename: doc.original_name,
      contentType: this.getContentType(doc.original_name)
    };
  }
  
  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[ext] || 'application/octet-stream';
  }
  
  async validateW9(venueId: string, ein: string): Promise<boolean> {
    // Mock W-9 validation
    // In production: OCR to extract EIN and validate
    console.log(`✅ W-9 validated for venue ${venueId}`);
    return true;
  }
}

export const documentService = new DocumentService();
```

### FILE: src/services/email-real.service.ts
```typescript
export class RealEmailService {
  private sgMail: any;
  
  constructor() {
    // In production, uncomment:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // this.sgMail = sgMail;
  }
  
  async sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<void> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log(`📧 [MOCK] Email to ${to}: ${subject}`);
      return;
    }
    
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'compliance@tickettoken.com',
      subject,
      html,
      attachments
    };
    
    try {
      await this.sgMail.send(msg);
      console.log(`📧 Email sent to ${to}: ${subject}`);
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }
  
  async send1099Notification(
    venueEmail: string, 
    venueName: string, 
    year: number, 
    amount: number,
    pdfPath: string
  ): Promise<void> {
    const subject = `Your ${year} Form 1099-K from TicketToken`;
    const html = `
      <h2>Your ${year} Tax Form is Ready</h2>
      <p>Dear ${venueName},</p>
      <p>Your Form 1099-K for tax year ${year} has been generated.</p>
      <p><strong>Total Gross Payments: $${amount.toFixed(2)}</strong></p>
      <p>The form is attached to this email. Please keep it for your tax records.</p>
      <p>This form has also been filed with the IRS.</p>
      <br>
      <p>Best regards,<br>TicketToken Compliance Team</p>
    `;
    
    const attachment = {
      content: Buffer.from(pdfPath).toString('base64'), // In prod: read file
      filename: `1099K_${year}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment'
    };
    
    await this.sendEmail(venueEmail, subject, html, [attachment]);
  }
}

export const realEmailService = new RealEmailService();
```

### FILE: src/services/pci-compliance.service.ts
```typescript
import { db } from './database.service';

export class PCIComplianceService {
  async logCardDataAccess(userId: string, action: string, reason: string): Promise<void> {
    // PCI requires logging all access to card data
    await db.query(
      `INSERT INTO pci_access_logs 
       (user_id, action, reason, ip_address, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, action, reason, 'system']
    );
  }

  async validatePCICompliance(): Promise<{compliant: boolean; issues: string[]}> {
    const issues: string[] = [];

    // Check if we're storing any card data (we shouldn't be)
    const cardDataCheck = await db.query(
      `SELECT COUNT(*) FROM information_schema.columns 
       WHERE column_name LIKE '%card%number%' OR column_name LIKE '%cvv%'`
    );

    if (parseInt(cardDataCheck.rows[0].count) > 0) {
      issues.push('Card data found in database - must be removed');
    }

    // Check encryption
    const encryptionCheck = await db.query(
      `SELECT current_setting('block_encryption_type') as encryption`
    );

    if (!encryptionCheck.rows[0].encryption) {
      issues.push('Database encryption not enabled');
    }

    // Check SSL/TLS
    const sslCheck = await db.query(`SELECT current_setting('ssl') as ssl`);
    
    if (sslCheck.rows[0].ssl !== 'on') {
      issues.push('SSL not enabled for database connections');
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }
}

export const pciComplianceService = new PCIComplianceService();
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/middleware/auth.middleware.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'this-is-a-very-long-secret-key-that-is-at-least-32-characters';

export interface AuthRequest extends Request {
  user?: any;
  tenantId?: string;
}

// Standard authentication middleware
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    req.tenantId = decoded.tenant_id || '00000000-0000-0000-0000-000000000001';
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }
}

// Admin only middleware
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.roles?.includes('admin')) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

// Compliance officer middleware
export function requireComplianceOfficer(req: AuthRequest, res: Response, next: NextFunction): void {
  const validRoles = ['admin', 'compliance_officer', 'compliance_manager'];
  const hasRole = req.user?.roles?.some((role: string) => validRoles.includes(role));
  
  if (!hasRole) {
    res.status(403).json({ error: 'Compliance officer access required' });
    return;
  }
  next();
}

// Webhook authentication (different from user auth)
export function webhookAuth(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const signature = req.headers['x-webhook-signature'] as string;
    
    if (!signature || signature !== secret) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }
    
    // Set default tenant for webhooks
    (req as AuthRequest).tenantId = '00000000-0000-0000-0000-000000000001';
    next();
  };
}
```

### FILE: src/services/init-tables.ts
```typescript
import { db } from './database.service';

export async function initializeTables() {
  try {
    // Main tables
    const tables = [
      // Venue verifications
      `CREATE TABLE IF NOT EXISTS venue_verifications (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255) NOT NULL UNIQUE,
        ein VARCHAR(20),
        business_name VARCHAR(255),
        business_address TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        verification_id VARCHAR(255) UNIQUE,
        w9_uploaded BOOLEAN DEFAULT false,
        bank_verified BOOLEAN DEFAULT false,
        ofac_cleared BOOLEAN DEFAULT false,
        risk_score INTEGER DEFAULT 0,
        manual_review_required BOOLEAN DEFAULT false,
        manual_review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Tax records
      `CREATE TABLE IF NOT EXISTS tax_records (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255) NOT NULL,
        year INTEGER NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        ticket_id VARCHAR(255),
        event_id VARCHAR(255),
        threshold_reached BOOLEAN DEFAULT false,
        form_1099_required BOOLEAN DEFAULT false,
        form_1099_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OFAC checks
      `CREATE TABLE IF NOT EXISTS ofac_checks (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        name_checked VARCHAR(255),
        is_match BOOLEAN,
        confidence INTEGER,
        matched_name VARCHAR(255),
        reviewed BOOLEAN DEFAULT false,
        review_notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Risk assessments
      `CREATE TABLE IF NOT EXISTS risk_assessments (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        risk_score INTEGER,
        factors JSONB,
        recommendation VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Risk flags
      `CREATE TABLE IF NOT EXISTS risk_flags (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        reason TEXT,
        severity VARCHAR(20) DEFAULT 'medium',
        resolved BOOLEAN DEFAULT false,
        resolution TEXT,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Compliance documents
      `CREATE TABLE IF NOT EXISTS compliance_documents (
        id SERIAL PRIMARY KEY,
        document_id VARCHAR(255) UNIQUE,
        venue_id VARCHAR(255),
        document_type VARCHAR(50),
        filename VARCHAR(255),
        original_name VARCHAR(255),
        storage_path TEXT,
        s3_url TEXT,
        uploaded_by VARCHAR(255),
        verified BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Bank verifications
      `CREATE TABLE IF NOT EXISTS bank_verifications (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        account_last_four VARCHAR(4),
        routing_number VARCHAR(20),
        verified BOOLEAN,
        account_name VARCHAR(255),
        account_type VARCHAR(20),
        plaid_request_id VARCHAR(255),
        plaid_item_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Payout methods
      `CREATE TABLE IF NOT EXISTS payout_methods (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        payout_id VARCHAR(255),
        provider VARCHAR(50),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Notification log
      `CREATE TABLE IF NOT EXISTS notification_log (
        id SERIAL PRIMARY KEY,
        type VARCHAR(20),
        recipient VARCHAR(255),
        subject VARCHAR(255),
        message TEXT,
        template VARCHAR(100),
        status VARCHAR(20),
        error_message TEXT,
        updated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Compliance settings
      `CREATE TABLE IF NOT EXISTS compliance_settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(100) UNIQUE,
        value TEXT,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Batch jobs
      `CREATE TABLE IF NOT EXISTS compliance_batch_jobs (
        id SERIAL PRIMARY KEY,
        job_type VARCHAR(50),
        status VARCHAR(20),
        progress INTEGER DEFAULT 0,
        total_items INTEGER,
        completed_items INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Form 1099 records
      `CREATE TABLE IF NOT EXISTS form_1099_records (
        id SERIAL PRIMARY KEY,
        venue_id VARCHAR(255),
        year INTEGER,
        form_type VARCHAR(20),
        gross_amount DECIMAL(10,2),
        transaction_count INTEGER,
        form_data JSONB,
        sent_to_irs BOOLEAN DEFAULT false,
        sent_to_venue BOOLEAN DEFAULT false,
        generated_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Webhook logs
      `CREATE TABLE IF NOT EXISTS webhook_logs (
        id SERIAL PRIMARY KEY,
        source VARCHAR(50),
        type VARCHAR(100),
        payload JSONB,
        processed BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // OFAC SDN list
      `CREATE TABLE IF NOT EXISTS ofac_sdn_list (
        id SERIAL PRIMARY KEY,
        uid VARCHAR(50),
        full_name VARCHAR(255),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        sdn_type VARCHAR(50),
        programs JSONB,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`,
      
      // Audit log
      `CREATE TABLE IF NOT EXISTS compliance_audit_log (
        id SERIAL PRIMARY KEY,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id VARCHAR(255),
        user_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`
    ];
    
    // Create all tables
    for (const table of tables) {
      await db.query(table);
    }
    
    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_venue_verifications_venue_id ON venue_verifications(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_venue_verifications_status ON venue_verifications(status)',
      'CREATE INDEX IF NOT EXISTS idx_tax_records_venue_id ON tax_records(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_tax_records_year ON tax_records(year)',
      'CREATE INDEX IF NOT EXISTS idx_ofac_checks_venue_id ON ofac_checks(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_risk_flags_venue_id ON risk_flags(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_compliance_documents_venue_id ON compliance_documents(venue_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON compliance_audit_log(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_form_1099_venue ON form_1099_records(venue_id, year)',
      'CREATE INDEX IF NOT EXISTS idx_webhook_logs_source ON webhook_logs(source)',
      'CREATE INDEX IF NOT EXISTS idx_ofac_sdn_name ON ofac_sdn_list(full_name)'
    ];
    
    for (const index of indexes) {
      try {
        await db.query(index);
      } catch (error: any) {
        // Index might already exist
        if (!error.message.includes('already exists')) {
          console.error('Index creation error:', error.message);
        }
      }
    }
    
    // Insert default settings
    await db.query(`
      INSERT INTO compliance_settings (key, value, description)
      VALUES 
        ('tax_threshold', '600', 'IRS 1099-K threshold'),
        ('high_risk_score', '70', 'Score above which venues are blocked'),
        ('review_required_score', '50', 'Score requiring manual review'),
        ('ofac_update_enabled', 'true', 'Auto-update OFAC list daily'),
        ('auto_approve_low_risk', 'false', 'Auto-approve venues with score < 20')
      ON CONFLICT (key) DO NOTHING
    `);
    
    console.log('✅ All compliance tables and indexes created');
  } catch (error) {
    console.error('❌ Failed to initialize tables:', error);
  }
}
```

### FILE: src/services/state-compliance.service.ts
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


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/compliance-service//src/routes/batch.routes.ts:11:router.post('/batch/ofac-update', BatchController.updateOFACList);
backend/services/compliance-service//src/routes/webhook.routes.ts:9:router.post('/webhooks/compliance/tax-update', 
backend/services/compliance-service//src/routes/webhook.routes.ts:13:      // Process tax update webhook
backend/services/compliance-service//src/routes/webhook.routes.ts:15:      console.log('Tax update webhook received', { tenantId, body: req.body });
backend/services/compliance-service//src/routes/webhook.routes.ts:24:router.post('/webhooks/compliance/kyc-update',
backend/services/compliance-service//src/routes/webhook.routes.ts:28:      // Process KYC update webhook
backend/services/compliance-service//src/routes/webhook.routes.ts:30:      console.log('KYC update webhook received', { tenantId, body: req.body });
backend/services/compliance-service//src/controllers/admin.controller.ts:10:        SELECT v.*, r.risk_score, r.factors, r.recommendation
backend/services/compliance-service//src/controllers/admin.controller.ts:19:        SELECT * FROM risk_flags 
backend/services/compliance-service//src/controllers/admin.controller.ts:46:        UPDATE venue_verifications 
backend/services/compliance-service//src/controllers/admin.controller.ts:50:            updated_at = NOW()
backend/services/compliance-service//src/controllers/admin.controller.ts:56:        INSERT INTO compliance_audit_log 
backend/services/compliance-service//src/controllers/admin.controller.ts:83:        UPDATE venue_verifications 
backend/services/compliance-service//src/controllers/admin.controller.ts:87:            updated_at = NOW()
backend/services/compliance-service//src/controllers/admin.controller.ts:93:        INSERT INTO compliance_audit_log 
backend/services/compliance-service//src/controllers/webhook.controller.ts:15:        `INSERT INTO webhook_logs (source, type, payload, created_at)
backend/services/compliance-service//src/controllers/webhook.controller.ts:26:              `UPDATE bank_verifications
backend/services/compliance-service//src/controllers/webhook.controller.ts:69:        `INSERT INTO webhook_logs (source, type, payload, created_at)
backend/services/compliance-service//src/controllers/webhook.controller.ts:89:        // Update notification log - fixed SQL
backend/services/compliance-service//src/controllers/webhook.controller.ts:92:            `UPDATE notification_log
backend/services/compliance-service//src/controllers/webhook.controller.ts:93:             SET status = $1, updated_at = NOW()
backend/services/compliance-service//src/controllers/webhook.controller.ts:95:               SELECT id FROM notification_log
backend/services/compliance-service//src/controllers/dashboard.controller.ts:10:        SELECT 
backend/services/compliance-service//src/controllers/dashboard.controller.ts:21:        SELECT 
backend/services/compliance-service//src/controllers/dashboard.controller.ts:31:        SELECT 
backend/services/compliance-service//src/controllers/dashboard.controller.ts:39:        SELECT * FROM compliance_audit_log 
backend/services/compliance-service//src/controllers/gdpr.controller.ts:13:        `INSERT INTO gdpr_deletion_requests (customer_id, status)
backend/services/compliance-service//src/controllers/gdpr.controller.ts:21:      // Update status
backend/services/compliance-service//src/controllers/gdpr.controller.ts:23:        `UPDATE gdpr_deletion_requests 
backend/services/compliance-service//src/controllers/gdpr.controller.ts:45:        `SELECT * FROM gdpr_deletion_requests 
backend/services/compliance-service//src/controllers/venue.controller.ts:13:        `INSERT INTO venue_verifications (venue_id, ein, business_name, status, verification_id)
backend/services/compliance-service//src/controllers/venue.controller.ts:21:        `INSERT INTO compliance_audit_log (action, entity_type, entity_id, metadata)
backend/services/compliance-service//src/controllers/venue.controller.ts:53:        'SELECT * FROM venue_verifications WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
backend/services/compliance-service//src/controllers/venue.controller.ts:75:          updatedAt: verification.updated_at
backend/services/compliance-service//src/controllers/venue.controller.ts:91:        'SELECT * FROM venue_verifications ORDER BY created_at DESC LIMIT 10'
backend/services/compliance-service//src/controllers/batch.controller.ts:30:        `SELECT * FROM compliance_batch_jobs 
backend/services/compliance-service//src/controllers/batch.controller.ts:63:  static async updateOFACList(req: Request, res: Response) {
backend/services/compliance-service//src/controllers/batch.controller.ts:65:      await batchService.processOFACUpdates();
backend/services/compliance-service//src/controllers/batch.controller.ts:69:        message: 'OFAC list updated successfully'
backend/services/compliance-service//src/controllers/ofac.controller.ts:15:        `INSERT INTO ofac_checks (venue_id, name_checked, is_match, confidence, matched_name)
backend/services/compliance-service//src/controllers/health.controller.ts:26:      await db.query('SELECT 1');
backend/services/compliance-service//src/services/ofac-real.service.ts:10:  async downloadAndUpdateOFACList(): Promise<void> {
backend/services/compliance-service//src/services/ofac-real.service.ts:38:          `INSERT INTO ofac_sdn_list 
backend/services/compliance-service//src/services/ofac-real.service.ts:51:      console.log(`✅ OFAC list updated: ${processed} entries`);
backend/services/compliance-service//src/services/ofac-real.service.ts:53:      // Update last update timestamp
backend/services/compliance-service//src/services/ofac-real.service.ts:54:      await redis.set('ofac:last_update', new Date().toISOString());
backend/services/compliance-service//src/services/ofac-real.service.ts:57:      console.error('❌ Failed to update OFAC list:', error);
backend/services/compliance-service//src/services/ofac-real.service.ts:78:      SELECT * FROM ofac_sdn_list 
backend/services/compliance-service//src/services/ofac-real.service.ts:85:        SELECT *, 
backend/services/compliance-service//src/services/bank.service.ts:28:      `INSERT INTO bank_verifications 
backend/services/compliance-service//src/services/bank.service.ts:40:    // Update venue verification
backend/services/compliance-service//src/services/bank.service.ts:43:        `UPDATE venue_verifications 
backend/services/compliance-service//src/services/bank.service.ts:44:         SET bank_verified = true, updated_at = NOW()
backend/services/compliance-service//src/services/bank.service.ts:63:      `INSERT INTO payout_methods 
backend/services/compliance-service//src/services/notification.service.ts:17:      `INSERT INTO notification_log 
backend/services/compliance-service//src/services/notification.service.ts:30:      `INSERT INTO notification_log 
backend/services/compliance-service//src/services/notification.service.ts:40:      'SELECT * FROM venue_verifications WHERE venue_id = $1',
backend/services/compliance-service//src/services/risk.service.ts:14:      'SELECT * FROM venue_verifications WHERE venue_id = $1',
backend/services/compliance-service//src/services/risk.service.ts:48:      'SELECT * FROM ofac_checks WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
backend/services/compliance-service//src/services/risk.service.ts:78:      `INSERT INTO risk_assessments 
backend/services/compliance-service//src/services/risk.service.ts:94:      `SELECT COUNT(*) as count, SUM(amount) as total
backend/services/compliance-service//src/services/risk.service.ts:130:      `INSERT INTO risk_flags (venue_id, reason, created_at) 
backend/services/compliance-service//src/services/risk.service.ts:142:      `UPDATE risk_flags 
backend/services/compliance-service//src/services/batch.service.ts:13:        `INSERT INTO compliance_batch_jobs 
backend/services/compliance-service//src/services/batch.service.ts:23:        `SELECT 
backend/services/compliance-service//src/services/batch.service.ts:58:            `INSERT INTO form_1099_records 
backend/services/compliance-service//src/services/batch.service.ts:71:          // Update tax records
backend/services/compliance-service//src/services/batch.service.ts:73:            `UPDATE tax_records 
backend/services/compliance-service//src/services/batch.service.ts:95:        // Update job progress
backend/services/compliance-service//src/services/batch.service.ts:97:          `UPDATE compliance_batch_jobs 
backend/services/compliance-service//src/services/batch.service.ts:111:        `UPDATE compliance_batch_jobs 
backend/services/compliance-service//src/services/batch.service.ts:127:      `SELECT 
backend/services/compliance-service//src/services/batch.service.ts:149:  async processOFACUpdates(): Promise<void> {
backend/services/compliance-service//src/services/batch.service.ts:150:    console.log('📥 Processing OFAC list update...');
backend/services/compliance-service//src/services/batch.service.ts:154:    // Parse XML and update database
backend/services/compliance-service//src/services/batch.service.ts:157:    console.log('✅ OFAC list updated (mock)');
backend/services/compliance-service//src/services/batch.service.ts:160:    const venues = await db.query('SELECT venue_id, business_name FROM venue_verifications');
backend/services/compliance-service//src/services/batch.service.ts:164:      console.log(`Re-checking ${venue.business_name} against updated OFAC list`);
backend/services/compliance-service//src/services/batch.service.ts:173:      `SELECT * FROM venue_verifications 
backend/services/compliance-service//src/services/batch.service.ts:175:       AND updated_at < NOW() - INTERVAL '365 days'`
backend/services/compliance-service//src/services/batch.service.ts:194:      `SELECT 
backend/services/compliance-service//src/services/init-tables.ts:23:        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
backend/services/compliance-service//src/services/init-tables.ts:124:        updated_at TIMESTAMP,
backend/services/compliance-service//src/services/init-tables.ts:134:        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
backend/services/compliance-service//src/services/init-tables.ts:236:      INSERT INTO compliance_settings (key, value, description)
backend/services/compliance-service//src/services/init-tables.ts:241:        ('ofac_update_enabled', 'true', 'Auto-update OFAC list daily'),
backend/services/compliance-service//src/services/data-retention.service.ts:24:      `UPDATE customer_profiles SET
backend/services/compliance-service//src/services/data-retention.service.ts:35:      `UPDATE customer_preferences SET
backend/services/compliance-service//src/services/data-retention.service.ts:45:      `DELETE FROM customer_analytics WHERE customer_id = $1`,
backend/services/compliance-service//src/services/data-retention.service.ts:67:    const query = `DELETE FROM ${table} WHERE created_at < NOW() - make_interval(days => $1)`;
backend/services/compliance-service//src/services/customer-tax.service.ts:11:      `INSERT INTO customer_tax_records
backend/services/compliance-service//src/services/customer-tax.service.ts:19:      `SELECT SUM(amount) as total FROM customer_tax_records
backend/services/compliance-service//src/services/customer-tax.service.ts:30:        `INSERT INTO tax_reporting_requirements
backend/services/compliance-service//src/services/customer-tax.service.ts:34:         DO UPDATE SET 
backend/services/compliance-service//src/services/customer-tax.service.ts:37:           updated_at = NOW()
backend/services/compliance-service//src/services/customer-tax.service.ts:50:      `SELECT 
backend/services/compliance-service//src/services/database.service.ts:13:      await client.query('SELECT NOW()');
backend/services/compliance-service//src/services/state-compliance.service.ts:56:    const result = await db.query('SELECT * FROM state_compliance_rules');
backend/services/compliance-service//src/services/tax.service.ts:13:        `SELECT COALESCE(SUM(amount), 0) as total
backend/services/compliance-service//src/services/tax.service.ts:27:        `INSERT INTO tax_records (venue_id, year, amount, ticket_id, threshold_reached)
backend/services/compliance-service//src/services/tax.service.ts:57:      `SELECT
backend/services/compliance-service//src/services/tax.service.ts:97:      `INSERT INTO tax_calculations (venue_id, amount, tax_rate, tax_amount, total)
backend/services/compliance-service//src/services/tax.service.ts:115:      `SELECT 
backend/services/compliance-service//src/services/scheduler.service.ts:10:    // Daily OFAC update (3 AM)
backend/services/compliance-service//src/services/scheduler.service.ts:11:    this.scheduleDaily('ofac-update', 3, async () => {
backend/services/compliance-service//src/services/scheduler.service.ts:12:      console.log('Running OFAC update...');
backend/services/compliance-service//src/services/scheduler.service.ts:13:      await batchService.processOFACUpdates();
backend/services/compliance-service//src/services/ofac.service.ts:74:  async updateOFACList() {
backend/services/compliance-service//src/services/ofac.service.ts:76:    console.log('📥 Mock OFAC list update (in production, downloads from Treasury)');
backend/services/compliance-service//src/services/document.service.ts:35:        `INSERT INTO compliance_documents 
backend/services/compliance-service//src/services/document.service.ts:41:      // Update venue verification status
backend/services/compliance-service//src/services/document.service.ts:44:          `UPDATE venue_verifications 
backend/services/compliance-service//src/services/document.service.ts:45:           SET w9_uploaded = true, updated_at = NOW()
backend/services/compliance-service//src/services/document.service.ts:66:      'SELECT * FROM compliance_documents WHERE document_id = $1',
backend/services/compliance-service//src/services/pci-compliance.service.ts:7:      `INSERT INTO pci_access_logs 
backend/services/compliance-service//src/services/pci-compliance.service.ts:19:      `SELECT COUNT(*) FROM information_schema.columns 
backend/services/compliance-service//src/services/pci-compliance.service.ts:29:      `SELECT current_setting('block_encryption_type') as encryption`
backend/services/compliance-service//src/services/pci-compliance.service.ts:37:    const sslCheck = await db.query(`SELECT current_setting('ssl') as ssl`);

### All JOIN operations:
backend/services/compliance-service//src/controllers/admin.controller.ts:12:        LEFT JOIN risk_assessments r ON v.venue_id = r.venue_id
backend/services/compliance-service//src/services/batch.service.ts:30:         JOIN tax_records t ON v.venue_id = t.venue_id
backend/services/compliance-service//src/services/batch.service.ts:199:       JOIN tax_records t ON v.venue_id = t.venue_id
backend/services/compliance-service//src/services/pdf.service.ts:26:        const filepath = path.join(this.outputDir, filename);
backend/services/compliance-service//src/services/pdf.service.ts:130:    const filepath = path.join(this.outputDir, filename);
backend/services/compliance-service//src/services/document.service.ts:27:      const filepath = path.join(this.uploadDir, filename);

### All WHERE clauses:
backend/services/compliance-service//src/controllers/admin.controller.ts:13:        WHERE v.status = 'pending' 
backend/services/compliance-service//src/controllers/admin.controller.ts:20:        WHERE resolved = false
backend/services/compliance-service//src/controllers/admin.controller.ts:51:        WHERE venue_id = $1
backend/services/compliance-service//src/controllers/admin.controller.ts:88:        WHERE venue_id = $1
backend/services/compliance-service//src/controllers/webhook.controller.ts:28:               WHERE plaid_item_id = $1`,
backend/services/compliance-service//src/controllers/webhook.controller.ts:94:             WHERE id = (
backend/services/compliance-service//src/controllers/webhook.controller.ts:96:               WHERE recipient = $2 AND type = 'email'
backend/services/compliance-service//src/controllers/dashboard.controller.ts:26:        WHERE year = $1
backend/services/compliance-service//src/controllers/gdpr.controller.ts:25:         WHERE customer_id = $1`,
backend/services/compliance-service//src/controllers/gdpr.controller.ts:46:         WHERE customer_id = $1 
backend/services/compliance-service//src/controllers/venue.controller.ts:53:        'SELECT * FROM venue_verifications WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
backend/services/compliance-service//src/services/ofac-real.service.ts:79:      WHERE UPPER(full_name) = $1
backend/services/compliance-service//src/services/ofac-real.service.ts:88:        WHERE similarity(UPPER(full_name), $1) > 0.3
backend/services/compliance-service//src/services/bank.service.ts:45:         WHERE venue_id = $1`,
backend/services/compliance-service//src/services/notification.service.ts:40:      'SELECT * FROM venue_verifications WHERE venue_id = $1',
backend/services/compliance-service//src/services/risk.service.ts:14:      'SELECT * FROM venue_verifications WHERE venue_id = $1',
backend/services/compliance-service//src/services/risk.service.ts:48:      'SELECT * FROM ofac_checks WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 1',
backend/services/compliance-service//src/services/risk.service.ts:96:       WHERE venue_id = $1 
backend/services/compliance-service//src/services/risk.service.ts:144:       WHERE id = $1`,
backend/services/compliance-service//src/services/batch.service.ts:31:         WHERE t.year = $1
backend/services/compliance-service//src/services/batch.service.ts:75:             WHERE venue_id = $1 AND year = $2`,
backend/services/compliance-service//src/services/batch.service.ts:99:           WHERE id = $1`,
backend/services/compliance-service//src/services/batch.service.ts:113:         WHERE id = $1`,
backend/services/compliance-service//src/services/batch.service.ts:131:       WHERE venue_id = $1 AND year = $2
backend/services/compliance-service//src/services/batch.service.ts:174:       WHERE status = 'verified' 
backend/services/compliance-service//src/services/batch.service.ts:200:       WHERE t.year = $1
backend/services/compliance-service//src/services/data-retention.service.ts:29:       WHERE customer_id = $1`,
backend/services/compliance-service//src/services/data-retention.service.ts:39:       WHERE customer_id = $1`,
backend/services/compliance-service//src/services/data-retention.service.ts:45:      `DELETE FROM customer_analytics WHERE customer_id = $1`,
backend/services/compliance-service//src/services/data-retention.service.ts:67:    const query = `DELETE FROM ${table} WHERE created_at < NOW() - make_interval(days => $1)`;
backend/services/compliance-service//src/services/customer-tax.service.ts:20:       WHERE customer_id = $1 AND year = $2 AND transaction_type = 'nft_sale'`,
backend/services/compliance-service//src/services/customer-tax.service.ts:38:         WHERE tax_reporting_requirements.customer_id IS NOT DISTINCT FROM EXCLUDED.customer_id`,
backend/services/compliance-service//src/services/customer-tax.service.ts:54:       WHERE customer_id = $1 AND year = $2 AND transaction_type = 'nft_sale'`,
backend/services/compliance-service//src/services/tax.service.ts:15:         WHERE venue_id = $1 AND year = $2`,
backend/services/compliance-service//src/services/tax.service.ts:64:       WHERE venue_id = $1 AND year = $2`,
backend/services/compliance-service//src/services/tax.service.ts:121:       WHERE year = $1
backend/services/compliance-service//src/services/document.service.ts:46:           WHERE venue_id = $1`,
backend/services/compliance-service//src/services/document.service.ts:66:      'SELECT * FROM compliance_documents WHERE document_id = $1',
backend/services/compliance-service//src/services/pci-compliance.service.ts:20:       WHERE column_name LIKE '%card%number%' OR column_name LIKE '%cvv%'`

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

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
### .env.example
```
# ================================================
# COMPLIANCE-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: compliance-service
# Port: 3010
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=compliance-service           # Service identifier

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

# ==== REQUIRED: Redis Configuration ====
REDIS_HOST=localhost                   # Redis host
REDIS_PORT=6379                       # Redis port
REDIS_PASSWORD=<REDIS_PASSWORD>       # Redis password (if auth enabled)
REDIS_DB=0                            # Redis database number
REDIS_URL=redis://:${REDIS_PASSWORD}@${REDIS_HOST}:${REDIS_PORT}/${REDIS_DB}

# ==== REQUIRED: Security Configuration ====
JWT_SECRET=<CHANGE_TO_256_BIT_SECRET> # JWT signing secret (min 32 chars)
JWT_EXPIRES_IN=15m                    # Access token expiration
JWT_REFRESH_EXPIRES_IN=7d             # Refresh token expiration
JWT_ALGORITHM=HS256                   # JWT algorithm
JWT_ISSUER=tickettoken                # JWT issuer
JWT_AUDIENCE=tickettoken-platform     # JWT audience

# ==== REQUIRED: Service Discovery ====
# Internal service URLs for service-to-service communication
AUTH_SERVICE_URL=http://localhost:3001
VENUE_SERVICE_URL=http://localhost:3002
EVENT_SERVICE_URL=http://localhost:3003
TICKET_SERVICE_URL=http://localhost:3004
PAYMENT_SERVICE_URL=http://localhost:3005
MARKETPLACE_SERVICE_URL=http://localhost:3008
ANALYTICS_SERVICE_URL=http://localhost:3007
NOTIFICATION_SERVICE_URL=http://localhost:3008
INTEGRATION_SERVICE_URL=http://localhost:3009
COMPLIANCE_SERVICE_URL=http://localhost:3010
QUEUE_SERVICE_URL=http://localhost:3011
SEARCH_SERVICE_URL=http://localhost:3012
FILE_SERVICE_URL=http://localhost:3013
MONITORING_SERVICE_URL=http://localhost:3014
BLOCKCHAIN_SERVICE_URL=http://localhost:3015
ORDER_SERVICE_URL=http://localhost:3016

# ==== Optional: Monitoring & Logging ====
LOG_LEVEL=info                                # debug | info | warn | error
LOG_FORMAT=json                               # json | pretty
ENABLE_METRICS=true                          # Enable Prometheus metrics
METRICS_PORT=9090                            # Metrics endpoint port

# ==== Optional: Feature Flags ====
ENABLE_RATE_LIMITING=true                    # Enable rate limiting
RATE_LIMIT_WINDOW_MS=60000                  # Rate limit window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100                 # Max requests per window

# ==== Environment-Specific Overrides ====
# Add any environment-specific configurations below
# These will override the defaults above based on NODE_ENV

```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/ofac-real.service.ts
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
        type: row.sdn_type,
        programs: row.programs,
        score: row.score
      }))
    };
    
    // Cache for 24 hours
    await redis.set(cacheKey, JSON.stringify(response), 86400);
    
    return response;
  }
}

export const realOFACService = new RealOFACService();
```

### FILE: src/services/bank.service.ts
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

### FILE: src/services/notification.service.ts
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

### FILE: src/services/risk.service.ts
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
    
    const count = parseInt(result.rows[0]?.count || '0');
    const total = parseFloat(result.rows[0]?.total || '0');
    
    // High velocity checks
    if (count > 100) {
      return {
        suspicious: true,
        riskPoints: 20,
        reason: `High transaction velocity: ${count} in 24h`
      };
    }
    
    if (total > 10000) {
      return {
        suspicious: true,
        riskPoints: 25,
        reason: `High transaction volume: $${total} in 24h`
      };
    }
    
    return {
      suspicious: false,
      riskPoints: 0,
      reason: ''
    };
  }
  
  async flagForReview(venueId: string, reason: string): Promise<void> {
    await db.query(
      `INSERT INTO risk_flags (venue_id, reason, created_at) 
       VALUES ($1, $2, NOW())`,
      [venueId, reason]
    );
    
    console.log(`🚩 Venue ${venueId} flagged for review: ${reason}`);
    
    // TODO: Send notification to admin
  }
  
  async resolveFlag(flagId: number, resolution: string): Promise<void> {
    await db.query(
      `UPDATE risk_flags 
       SET resolved = true, resolution = $2, resolved_at = NOW()
       WHERE id = $1`,
      [flagId, resolution]
    );
  }
}

export const riskService = new RiskService();
```

### FILE: src/services/batch.service.ts
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
            jobId, 
            generated, 
            errors,
            Math.round((generated / venues.length) * 100)
          ]
        );
      }
      
      // Complete job
      await db.query(
        `UPDATE compliance_batch_jobs 
         SET status = 'completed', completed_at = NOW(), total_items = $2
         WHERE id = $1`,
        [jobId, venues.length]
      );
      
      return { generated, errors, venues };
      
    } catch (error) {
      console.error('Batch 1099 generation failed:', error);
      throw error;
    }
  }
  
  private async getMonthlyBreakdown(venueId: string, year: number): Promise<any> {
    const result = await db.query(
      `SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        SUM(amount) as total
       FROM tax_records
       WHERE venue_id = $1 AND year = $2
       GROUP BY EXTRACT(MONTH FROM created_at)
       ORDER BY month`,
      [venueId, year]
    );
    
    const breakdown: any = {};
    for (let month = 1; month <= 12; month++) {
      breakdown[`month_${month}`] = 0;
    }
    
    for (const row of result.rows) {
      breakdown[`month_${row.month}`] = parseFloat(row.total);
    }
    
    return breakdown;
  }
  
  async processOFACUpdates(): Promise<void> {
    console.log('📥 Processing OFAC list update...');
    
    // In production: Download from Treasury
    // const response = await fetch('https://www.treasury.gov/ofac/downloads/sdn.xml');
    // Parse XML and update database
    
    // For now, just log
    console.log('✅ OFAC list updated (mock)');
    
    // Re-check all venues against new list
    const venues = await db.query('SELECT venue_id, business_name FROM venue_verifications');
    
    for (const venue of venues.rows) {
      // Re-run OFAC check
      console.log(`Re-checking ${venue.business_name} against updated OFAC list`);
    }
  }
  
  async dailyComplianceChecks(): Promise<void> {
    console.log('🔍 Running daily compliance checks...');
    
    // Check for expired verifications
    const expiredResult = await db.query(
      `SELECT * FROM venue_verifications 
       WHERE status = 'verified' 
       AND updated_at < NOW() - INTERVAL '365 days'`
    );
    
    if (expiredResult.rows.length > 0) {
      console.log(`⚠️  ${expiredResult.rows.length} venues need re-verification`);
      
      for (const venue of expiredResult.rows) {
        await notificationService.sendEmail(
          'venue@example.com',
          'Annual Verification Required',
          'reverification-required',
          { venueId: venue.venue_id, businessName: venue.business_name }
        );
      }
    }
    
    // Check for venues approaching tax threshold
    const year = new Date().getFullYear();
    const thresholdResult = await db.query(
      `SELECT 
        v.venue_id,
        v.business_name,
        SUM(t.amount) as total_sales
       FROM venue_verifications v
       JOIN tax_records t ON v.venue_id = t.venue_id
       WHERE t.year = $1
       GROUP BY v.venue_id, v.business_name
       HAVING SUM(t.amount) BETWEEN 500 AND 599`,
      [year]
    );
    
    if (thresholdResult.rows.length > 0) {
      console.log(`📊 ${thresholdResult.rows.length} venues approaching $600 threshold`);
    }
    
    console.log('✅ Daily compliance checks completed');
  }
}

export const batchService = new BatchService();
```

### FILE: src/services/data-retention.service.ts
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

### FILE: src/services/customer-tax.service.ts
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

### FILE: src/services/database.service.ts
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

### FILE: src/services/pdf.service.ts
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
           .text('If you are required to file a return, a negligence penalty or other sanction may be imposed', 50, 510)
           .text('on you if taxable income results from this transaction and the IRS determines that it has', 50, 520)
           .text('not been reported.', 50, 530);
        
        // Copy designation
        doc.fontSize(10).font('Helvetica-Bold')
           .text('Copy B - For Recipient', 450, 550);
        
        doc.end();
        
        stream.on('finish', () => {
          console.log(`📄 Generated 1099-K: ${filepath}`);
          resolve(filepath);
        });
        
        stream.on('error', reject);
      } catch (error) {
        reject(error);
      }
    });
  }
  
  async generateW9(data: {
    businessName: string;
    ein: string;
    address: string;
  }): Promise<string> {
    // Similar PDF generation for W-9
    const filename = `W9_${data.ein}_${Date.now()}.pdf`;
    const filepath = path.join(this.outputDir, filename);
    
    // Create W-9 PDF...
    console.log(`📄 Generated W-9: ${filepath}`);
    return filepath;
  }
}

export const pdfService = new PDFService();
```

### FILE: src/services/state-compliance.service.ts
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

### FILE: src/services/redis.service.ts
```typescript
import Redis from 'ioredis';

class RedisService {
  private client: Redis | null = null;

  async connect(): Promise<void> {
    try {
      this.client = new Redis({
        host: process.env.REDIS_HOST || 'redis',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        }
      });

      await this.client.ping();
      console.log('✅ Redis connected successfully');
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      // Don't throw - Redis is optional
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (!this.client) return;
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      this.client.disconnect();
      console.log('Redis connection closed');
    }
  }
}

export const redis = new RedisService();
```

### FILE: src/services/tax.service.ts
```typescript
import { db } from './database.service';

export class TaxService {
  private readonly FORM_1099_THRESHOLD = 600; // Real IRS threshold
  private readonly TICKET_REPORTING_THRESHOLD = 200; // Per transaction

  async trackSale(venueId: string, amount: number, ticketId: string) {
    try {
      // Get current year totals
      const year = new Date().getFullYear();
      
      const result = await db.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM tax_records
         WHERE venue_id = $1 AND year = $2`,
        [venueId, year]
      );
      
      const currentTotal = parseFloat(result.rows[0]?.total || '0');
      const newTotal = currentTotal + amount;
      
      // Check if threshold reached
      const thresholdReached = newTotal >= this.FORM_1099_THRESHOLD;
      
      // Log the sale
      await db.query(
        `INSERT INTO tax_records (venue_id, year, amount, ticket_id, threshold_reached)
         VALUES ($1, $2, $3, $4, $5)`,
        [venueId, year, amount, ticketId, thresholdReached]
      );
      
      // Alert if threshold just crossed
      if (!thresholdReached && newTotal >= this.FORM_1099_THRESHOLD) {
        console.log(`🚨 VENUE ${venueId} has reached $${this.FORM_1099_THRESHOLD} threshold!`);
        console.log(`📋 1099-K required for tax year ${year}`);
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
      console.error('Error tracking sale:', error);
      throw error;
    }
  }

  async getVenueTaxSummary(venueId: string, year?: number) {
    const taxYear = year || new Date().getFullYear();
    
    const result = await db.query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        MAX(amount) as largest_sale,
        MIN(created_at) as first_sale,
        MAX(created_at) as last_sale
       FROM tax_records
       WHERE venue_id = $1 AND year = $2`,
      [venueId, taxYear]
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

  async calculateTax(data: any) {
    // Simple tax calculation implementation
    const { amount, venueId, taxRate = 0.08 } = data;
    
    const taxAmount = amount * taxRate;
    const totalWithTax = amount + taxAmount;
    
    // Log the calculation
    await db.query(
      `INSERT INTO tax_calculations (venue_id, amount, tax_rate, tax_amount, total)
       VALUES ($1, $2, $3, $4, $5)`,
      [venueId, amount, taxRate, taxAmount, totalWithTax]
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

  async generateTaxReport(year: number) {
    // Generate comprehensive tax report for the year
    const result = await db.query(
      `SELECT 
        venue_id,
        COUNT(*) as transaction_count,
        SUM(amount) as total_sales,
        COUNT(CASE WHEN threshold_reached THEN 1 END) as threshold_transactions
       FROM tax_records
       WHERE year = $1
       GROUP BY venue_id
       ORDER BY total_sales DESC`,
      [year]
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
```

### FILE: src/services/scheduler.service.ts
```typescript
import { batchService } from './batch.service';
import { ofacService } from './ofac.service';

export class SchedulerService {
  private jobs: Map<string, NodeJS.Timeout> = new Map();
  
  startScheduledJobs() {
    console.log('⏰ Starting scheduled jobs...');
    
    // Daily OFAC update (3 AM)
    this.scheduleDaily('ofac-update', 3, async () => {
      console.log('Running OFAC update...');
      await batchService.processOFACUpdates();
    });
    
    // Daily compliance checks (4 AM)
    this.scheduleDaily('compliance-checks', 4, async () => {
      console.log('Running compliance checks...');
      await batchService.dailyComplianceChecks();
    });
    
    // Weekly report generation (Sunday 2 AM)
    this.scheduleWeekly('weekly-report', 0, 2, async () => {
      console.log('Generating weekly compliance report...');
      // TODO: Generate report
    });
    
    // Yearly 1099 generation (January 15)
    this.scheduleYearly('1099-generation', 1, 15, async () => {
      const previousYear = new Date().getFullYear() - 1;
      console.log(`Generating 1099s for year ${previousYear}...`);
      await batchService.generateYear1099Forms(previousYear);
    });
    
    console.log('✅ Scheduled jobs started');
  }
  
  private scheduleDaily(name: string, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);
    
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next day
      this.scheduleDaily(name, hour, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    console.log(`📅 Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  private scheduleWeekly(name: string, dayOfWeek: number, hour: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hour, 0, 0, 0);
    
    // Find next occurrence of the specified day
    const daysUntilTarget = (dayOfWeek - scheduled.getDay() + 7) % 7;
    scheduled.setDate(scheduled.getDate() + (daysUntilTarget || 7));
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next week
      this.scheduleWeekly(name, dayOfWeek, hour, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    console.log(`📅 Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  private scheduleYearly(name: string, month: number, day: number, callback: () => Promise<void>) {
    const now = new Date();
    const scheduled = new Date();
    scheduled.setMonth(month - 1, day);
    scheduled.setHours(9, 0, 0, 0);
    
    if (scheduled <= now) {
      scheduled.setFullYear(scheduled.getFullYear() + 1);
    }
    
    const timeout = scheduled.getTime() - now.getTime();
    
    const job = setTimeout(async () => {
      await callback();
      // Reschedule for next year
      this.scheduleYearly(name, month, day, callback);
    }, timeout);
    
    this.jobs.set(name, job);
    console.log(`📅 Scheduled ${name} for ${scheduled.toLocaleString()}`);
  }
  
  stopAllJobs() {
    for (const [name, job] of this.jobs) {
      clearTimeout(job);
      console.log(`Stopped job: ${name}`);
    }
    this.jobs.clear();
  }
}

export const schedulerService = new SchedulerService();
```

### FILE: src/services/ofac.service.ts
```typescript
import { redis } from './redis.service';

export class OFACService {
  // In production, this would download from Treasury
  private mockOFACList = [
    'Bad Actor Company',
    'Sanctioned Venue LLC',
    'Blocked Entertainment Inc'
  ];
  
  async checkName(name: string): Promise<{
    isMatch: boolean;
    confidence: number;
    matchedName?: string;
  }> {
    // Normalize name for checking
    const normalizedName = name.toLowerCase().trim();
    
    // Check cache first
    const cached = await redis.get(`ofac:${normalizedName}`);
    if (cached) {
      return JSON.parse(cached);
    }
    
    // Mock OFAC check (in production, use real Treasury API)
    let isMatch = false;
    let confidence = 0;
    let matchedName = undefined;
    
    for (const sanctionedName of this.mockOFACList) {
      if (normalizedName.includes(sanctionedName.toLowerCase())) {
        isMatch = true;
        confidence = 95;
        matchedName = sanctionedName;
        break;
      }
      
      // Fuzzy matching simulation
      if (this.fuzzyMatch(normalizedName, sanctionedName.toLowerCase())) {
        isMatch = true;
        confidence = 75;
        matchedName = sanctionedName;
        break;
      }
    }
    
    const result = { isMatch, confidence, matchedName };
    
    // Cache result for 24 hours
    await redis.set(`ofac:${normalizedName}`, JSON.stringify(result), 86400);
    
    return result;
  }
  
  private fuzzyMatch(str1: string, str2: string): boolean {
    // Simple fuzzy match - in production use Levenshtein distance
    const words1 = str1.split(' ');
    const words2 = str2.split(' ');
    
    let matches = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.length > 3 && word2.length > 3) {
          if (word1.includes(word2) || word2.includes(word1)) {
            matches++;
          }
        }
      }
    }
    
    return matches > 0;
  }
  
  async updateOFACList() {
    // In production: download from https://www.treasury.gov/ofac/downloads/sdn.xml
    console.log('📥 Mock OFAC list update (in production, downloads from Treasury)');
    return true;
  }
}

export const ofacService = new OFACService();
```

### FILE: src/services/document.service.ts
```typescript
import { db } from './database.service';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class DocumentService {
  private uploadDir = process.env.DOCUMENT_STORAGE_PATH || './uploads';
  
  constructor() {
    // Create upload directory if it doesn't exist
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }
  
  async storeDocument(
    venueId: string, 
    documentType: string, 
    buffer: Buffer,
    originalName: string
  ): Promise<string> {
    try {
      // Generate unique filename
      const documentId = `doc_${uuidv4()}`;
      const ext = path.extname(originalName);
      const filename = `${venueId}_${documentType}_${documentId}${ext}`;
      const filepath = path.join(this.uploadDir, filename);
      
      // In production, this would upload to S3
      // For now, save locally
      fs.writeFileSync(filepath, buffer);
      
      // Store reference in database
      await db.query(
        `INSERT INTO compliance_documents 
         (document_id, venue_id, document_type, filename, original_name, storage_path, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [documentId, venueId, documentType, filename, originalName, filepath]
      );
      
      // Update venue verification status
      if (documentType === 'W9') {
        await db.query(
          `UPDATE venue_verifications 
           SET w9_uploaded = true, updated_at = NOW()
           WHERE venue_id = $1`,
          [venueId]
        );
      }
      
      console.log(`📄 Document stored: ${documentType} for venue ${venueId}`);
      return documentId;
      
    } catch (error) {
      console.error('Error storing document:', error);
      throw error;
    }
  }
  
  async getDocument(documentId: string): Promise<{
    buffer: Buffer;
    filename: string;
    contentType: string;
  }> {
    const result = await db.query(
      'SELECT * FROM compliance_documents WHERE document_id = $1',
      [documentId]
    );
    
    if (result.rows.length === 0) {
      throw new Error('Document not found');
    }
    
    const doc = result.rows[0];
    const buffer = fs.readFileSync(doc.storage_path);
    
    return {
      buffer,
      filename: doc.original_name,
      contentType: this.getContentType(doc.original_name)
    };
  }
  
  private getContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const types: { [key: string]: string } = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
    return types[ext] || 'application/octet-stream';
  }
  
  async validateW9(venueId: string, ein: string): Promise<boolean> {
    // Mock W-9 validation
    // In production: OCR to extract EIN and validate
    console.log(`✅ W-9 validated for venue ${venueId}`);
    return true;
  }
}

export const documentService = new DocumentService();
```

### FILE: src/services/email-real.service.ts
```typescript
export class RealEmailService {
  private sgMail: any;
  
  constructor() {
    // In production, uncomment:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    // this.sgMail = sgMail;
  }
  
  async sendEmail(to: string, subject: string, html: string, attachments?: any[]): Promise<void> {
    if (!process.env.SENDGRID_API_KEY) {
      console.log(`📧 [MOCK] Email to ${to}: ${subject}`);
      return;
    }
    
    const msg = {
      to,
      from: process.env.SENDGRID_FROM_EMAIL || 'compliance@tickettoken.com',
      subject,
      html,
      attachments
    };
    
    try {
      await this.sgMail.send(msg);
      console.log(`📧 Email sent to ${to}: ${subject}`);
    } catch (error) {
      console.error('Email send error:', error);
      throw error;
    }
  }
  
  async send1099Notification(
    venueEmail: string, 
    venueName: string, 
    year: number, 
    amount: number,
    pdfPath: string
  ): Promise<void> {
    const subject = `Your ${year} Form 1099-K from TicketToken`;
    const html = `
      <h2>Your ${year} Tax Form is Ready</h2>
      <p>Dear ${venueName},</p>
      <p>Your Form 1099-K for tax year ${year} has been generated.</p>
      <p><strong>Total Gross Payments: $${amount.toFixed(2)}</strong></p>
      <p>The form is attached to this email. Please keep it for your tax records.</p>
      <p>This form has also been filed with the IRS.</p>
      <br>
      <p>Best regards,<br>TicketToken Compliance Team</p>
    `;
    
    const attachment = {
      content: Buffer.from(pdfPath).toString('base64'), // In prod: read file
      filename: `1099K_${year}.pdf`,
      type: 'application/pdf',
      disposition: 'attachment'
    };
    
    await this.sendEmail(venueEmail, subject, html, [attachment]);
  }
}

export const realEmailService = new RealEmailService();
```

### FILE: src/services/pci-compliance.service.ts
```typescript
import { db } from './database.service';

export class PCIComplianceService {
  async logCardDataAccess(userId: string, action: string, reason: string): Promise<void> {
    // PCI requires logging all access to card data
    await db.query(
      `INSERT INTO pci_access_logs 
       (user_id, action, reason, ip_address, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
      [userId, action, reason, 'system']
    );
  }

  async validatePCICompliance(): Promise<{compliant: boolean; issues: string[]}> {
    const issues: string[] = [];

    // Check if we're storing any card data (we shouldn't be)
    const cardDataCheck = await db.query(
      `SELECT COUNT(*) FROM information_schema.columns 
       WHERE column_name LIKE '%card%number%' OR column_name LIKE '%cvv%'`
    );

    if (parseInt(cardDataCheck.rows[0].count) > 0) {
      issues.push('Card data found in database - must be removed');
    }

    // Check encryption
    const encryptionCheck = await db.query(
      `SELECT current_setting('block_encryption_type') as encryption`
    );

    if (!encryptionCheck.rows[0].encryption) {
      issues.push('Database encryption not enabled');
    }

    // Check SSL/TLS
    const sslCheck = await db.query(`SELECT current_setting('ssl') as ssl`);
    
    if (sslCheck.rows[0].ssl !== 'on') {
      issues.push('SSL not enabled for database connections');
    }

    return {
      compliant: issues.length === 0,
      issues
    };
  }
}

export const pciComplianceService = new PCIComplianceService();
```

