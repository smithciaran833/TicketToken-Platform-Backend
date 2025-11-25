# DATABASE AUDIT: payment-service
Generated: Thu Oct  2 15:05:55 EDT 2025

## 1. PACKAGE DEPENDENCIES
```json
    "knex": "^3.1.0",
    "morgan": "^1.10.0",
    "node-cron": "^4.2.1",
    "pg": "^8.16.3",
    "prom-client": "^15.1.3",
    "redis": "^5.8.2",
```

## 2. DATABASE CONFIGURATION FILES
### knexfile.js
```typescript
module.exports = {
  client: 'postgresql',
  connection: process.env.DATABASE_URL || {
    host: process.env.DB_HOST || 'postgres',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'tickettoken_db'
  },
  pool: {
    min: 2,
    max: 10
  }
};
```

### database.ts
```typescript
import { Pool } from 'pg';
import { config } from './index';

export const pool = new Pool({
  connectionString: config.database.url,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

export async function query(text: string, params?: any[]) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;

  if (duration > 1000) {
    console.warn('Slow query:', { text, duration, rows: res.rowCount });
  }

  return res;
}

export async function getClient() {
  const client = await pool.connect();
  const originalRelease = client.release.bind(client);
  
  // Timeout after 60 seconds
  const timeout = setTimeout(() => {
    console.error('Client has been checked out for more than 60 seconds!');
    console.error(`Database error occurred`);
  }, 60000);

  const release = () => {
    clearTimeout(timeout);
    originalRelease();
  };

  return { 
    query: client.query.bind(client), 
    release, 
    client 
  };
}

export const db = require('knex')(require('./knexfile'));
```

### databaseService.ts
```typescript
import { Pool } from 'pg';

class DatabaseServiceClass {
  private pool: Pool | null = null;

  async initialize(): Promise<void> {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'postgres',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'tickettoken_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'TicketToken2024Secure!'
    });
    
    await this.pool.query('SELECT NOW()');
    console.log('Database connected');
  }

  getPool(): Pool {
    if (!this.pool) throw new Error('Database not initialized');
    return this.pool;
  }
}

export const DatabaseService = new DatabaseServiceClass();
```


## 3. MODEL/ENTITY FILES
### backend/services/payment-service//src/models/refund.model.ts
```typescript
import { query } from '../config/database';

export interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  stripeRefundId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  completedAt?: Date;
}

export class RefundModel {
  static async create(data: Partial<Refund>): Promise<Refund> {
    const text = `
      INSERT INTO payment_refunds (
        transaction_id, amount, reason, status,
        stripe_refund_id, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [
      data.transactionId,
      data.amount,
      data.reason,
      data.status || 'pending',
      data.stripeRefundId,
      JSON.stringify(data.metadata || {})
    ];
    
    const result = await query(text, values);
    return result.rows[0];
  }

  static async updateStatus(id: string, status: string, stripeRefundId?: string): Promise<Refund> {
    const text = `
      UPDATE payment_refunds 
      SET status = $2, 
          stripe_refund_id = COALESCE($3, stripe_refund_id),
          completed_at = CASE WHEN $2 = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await query(text, [id, status, stripeRefundId]);
    return result.rows[0];
  }
}
```

### backend/services/payment-service//src/models/venue-balance.model.ts
```typescript
import { query, getClient } from '../config/database';
import { VenueBalance } from '../types';

export class VenueBalanceModel {
  static async getBalance(venueId: string): Promise<VenueBalance> {
    const text = `
      SELECT 
        venue_id,
        COALESCE(SUM(CASE WHEN balance_type = 'available' THEN amount ELSE 0 END), 0) as available,
        COALESCE(SUM(CASE WHEN balance_type = 'pending' THEN amount ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN balance_type = 'reserved' THEN amount ELSE 0 END), 0) as reserved,
        'USD' as currency
      FROM venue_balances 
      WHERE venue_id = $1
      GROUP BY venue_id
    `;

    const result = await query(text, [venueId]);

    if (result.rows.length === 0) {
      // Return zero balances if no records exist
      return {
        available: 0,
        pending: 0,
        reserved: 0,
        currency: 'USD'
      };
    }

    return result.rows[0];
  }

  static async updateBalance(
    venueId: string,
    amount: number,
    type: 'available' | 'pending' | 'reserved'
  ): Promise<VenueBalance> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Insert or update the balance for this type
      const upsertText = `
        INSERT INTO venue_balances (venue_id, amount, balance_type)
        VALUES ($1, $2, $3)
        ON CONFLICT (venue_id, balance_type) 
        DO UPDATE SET 
          amount = venue_balances.amount + $2,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      await client.query(upsertText, [venueId, amount, type]);

      // Get the updated balances
      const balances = await this.getBalance(venueId);

      await client.query('COMMIT');
      return balances;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  static async createInitialBalance(venueId: string): Promise<VenueBalance> {
    // Create initial zero balances for all types
    const types = ['available', 'pending', 'reserved'];
    
    for (const type of types) {
      await query(
        `INSERT INTO venue_balances (venue_id, amount, balance_type)
         VALUES ($1, 0, $2)
         ON CONFLICT (venue_id, balance_type) DO NOTHING`,
        [venueId, type]
      );
    }

    return this.getBalance(venueId);
  }
}
```

### backend/services/payment-service//src/models/transaction.model.ts
```typescript
import { query, getClient } from '../config/database';
import { Transaction, TransactionStatus } from '../types/payment.types';

export class TransactionModel {
  static async create(data: Partial<Transaction> & { idempotencyKey?: string; tenantId?: string }): Promise<Transaction> {
    const text = `
      INSERT INTO transactions (
        venue_id, user_id, event_id, amount, currency, status,
        platform_fee, venue_payout, gas_fee_paid, tax_amount, total_amount,
        stripe_payment_intent_id, metadata, idempotency_key, tenant_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;

    const values = [
      data.venueId,
      data.userId,
      data.eventId,
      data.amount || 0,
      data.currency || 'USD',
      data.status || TransactionStatus.PENDING,
      data.platformFee || 0,
      data.venuePayout || 0,
      data.gasFeePaid || null,
      data.taxAmount || null,
      data.totalAmount || null,
      data.stripePaymentIntentId || null,
      JSON.stringify(data.metadata || {}),
      data.idempotencyKey || null,
      data.tenantId || null
    ];

    try {
      const result = await query(text, values);
      return this.mapRow(result.rows[0]);
    } catch (error: any) {
      // Handle duplicate idempotency key
      if (error.code === '23505' && error.constraint === 'uq_transactions_idempotency') {
        throw new Error('DUPLICATE_IDEMPOTENCY_KEY');
      }
      throw error;
    }
  }

  static async findById(id: string): Promise<Transaction | null> {
    const text = `
      SELECT * FROM transactions WHERE id = $1
    `;

    const result = await query(text, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  static async findByPaymentIntentId(paymentIntentId: string): Promise<Transaction | null> {
    const text = `
      SELECT * FROM transactions WHERE stripe_payment_intent_id = $1
    `;

    const result = await query(text, [paymentIntentId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapRow(result.rows[0]);
  }

  static async updateStatus(id: string, status: TransactionStatus): Promise<Transaction> {
    const text = `
      UPDATE transactions
      SET status = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;

    const result = await query(text, [id, status]);

    if (result.rows.length === 0) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  static async update(id: string, data: Partial<Transaction>): Promise<Transaction> {
    // SECURITY NOTE: Building parameterized query safely
    // The paramIndex is only used to create placeholder numbers ($1, $2, etc.)
    // The actual values are passed separately in the values array
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (data.amount !== undefined) {
      updates.push(`amount = $${paramIndex++}`);
      values.push(data.amount);
    }

    if (data.platformFee !== undefined) {
      updates.push(`platform_fee = $${paramIndex++}`);
      values.push(data.platformFee);
    }

    if (data.venuePayout !== undefined) {
      updates.push(`venue_payout = $${paramIndex++}`);
      values.push(data.venuePayout);
    }

    if (data.gasFeePaid !== undefined) {
      updates.push(`gas_fee_paid = $${paramIndex++}`);
      values.push(data.gasFeePaid);
    }

    if (data.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    // SECURITY: This query is parameterized - the values are in the values array
    // The ${updates.join(', ')} only contains column names and parameter placeholders
    const text = `
      UPDATE transactions
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(text, values);

    if (result.rows.length === 0) {
      throw new Error(`Transaction not found: ${id}`);
    }

    return this.mapRow(result.rows[0]);
  }

  static async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const text = `
      SELECT * FROM transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(text, [userId, limit, offset]);
    return result.rows.map(row => this.mapRow(row));
  }

  static async findByVenueId(
    venueId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<Transaction[]> {
    const text = `
      SELECT * FROM transactions
      WHERE venue_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(text, [venueId, limit, offset]);
    return result.rows.map(row => this.mapRow(row));
  }

  private static mapRow(row: any): Transaction {
    return {
      id: row.id,
      venueId: row.venue_id,
      userId: row.user_id,
      eventId: row.event_id,
      amount: parseInt(row.amount),
      currency: row.currency,
      status: row.status as TransactionStatus,
      platformFee: parseInt(row.platform_fee),
      venuePayout: parseInt(row.venue_payout),
      gasFeePaid: row.gas_fee_paid ? parseInt(row.gas_fee_paid) : undefined,
      taxAmount: row.tax_amount ? parseInt(row.tax_amount) : undefined,
      totalAmount: row.total_amount ? parseInt(row.total_amount) : undefined,
      stripePaymentIntentId: row.stripe_payment_intent_id,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
```


## 4. SQL/QUERY PATTERNS
### Direct SQL Queries
backend/services/payment-service//src/jobs/process-webhook-queue.ts:17:      `SELECT * FROM webhook_inbox 
backend/services/payment-service//src/jobs/process-webhook-queue.ts:43:        'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE id = $1',
backend/services/payment-service//src/jobs/process-webhook-queue.ts:49:        `UPDATE webhook_inbox 
backend/services/payment-service//src/jobs/retry-failed-payments.ts:17:      `SELECT * FROM payments 
backend/services/payment-service//src/jobs/retry-failed-payments.ts:34:        'UPDATE payments SET retry_count = retry_count + 1, updated_at = NOW() WHERE id = $1',
backend/services/payment-service//src/migrations/005_event_ordering.sql:50:INSERT INTO payment_state_machine (from_state, to_state, event_type) VALUES
backend/services/payment-service//src/migrations/005_event_ordering.sql:74:        SELECT 1 FROM payment_state_machine
backend/services/payment-service//src/migrations/005_event_ordering.sql:89:    UPDATE payment_intents
backend/services/payment-service//src/migrations/20250930143102_fix_transactions_idempotency.sql:47:FROM pg_indexes 
backend/services/payment-service//src/migrations/001_create_tenants.sql:13:INSERT INTO tenants (id, name, slug)
backend/services/payment-service//src/migrations/20250930142553_fix_idempotency_constraints.sql:44:FROM pg_indexes
backend/services/payment-service//src/index.ts:165:      FROM payment_intents
backend/services/payment-service//src/controllers/webhookController.ts:20:        `INSERT INTO webhook_inbox (webhook_id, source, event_type, payload, signature)
backend/services/payment-service//src/controllers/refundController.ts:41:         FROM payment_intents pi
backend/services/payment-service//src/controllers/refundController.ts:42:         JOIN orders o ON pi.order_id = o.id
backend/services/payment-service//src/controllers/refundController.ts:87:          `INSERT INTO refunds (id, payment_intent_id, amount, status, reason, tenant_id, created_at)
backend/services/payment-service//src/controllers/refundController.ts:94:          `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
backend/services/payment-service//src/controllers/refundController.ts:101:          `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload, tenant_id)
backend/services/payment-service//src/models/refund.model.ts:18:      INSERT INTO payment_refunds (
backend/services/payment-service//src/models/refund.model.ts:40:      UPDATE payment_refunds 
backend/services/payment-service//src/models/venue-balance.model.ts:13:      FROM venue_balances 
backend/services/payment-service//src/models/venue-balance.model.ts:45:        INSERT INTO venue_balances (venue_id, amount, balance_type)
backend/services/payment-service//src/models/venue-balance.model.ts:75:        `INSERT INTO venue_balances (venue_id, amount, balance_type)
backend/services/payment-service//src/models/transaction.model.ts:7:      INSERT INTO transactions (
backend/services/payment-service//src/models/transaction.model.ts:47:      SELECT * FROM transactions WHERE id = $1
backend/services/payment-service//src/models/transaction.model.ts:61:      SELECT * FROM transactions WHERE stripe_payment_intent_id = $1
backend/services/payment-service//src/models/transaction.model.ts:75:      UPDATE transactions
backend/services/payment-service//src/models/transaction.model.ts:138:      UPDATE transactions
backend/services/payment-service//src/models/transaction.model.ts:159:      SELECT * FROM transactions
backend/services/payment-service//src/models/transaction.model.ts:175:      SELECT * FROM transactions
backend/services/payment-service//src/cron/webhook-cleanup.ts:15:      `DELETE FROM webhook_inbox 
backend/services/payment-service//src/cron/webhook-cleanup.ts:24:      `SELECT * FROM webhook_inbox 
backend/services/payment-service//src/cron/payment-reconciliation.ts:19:      `SELECT * FROM payments 
backend/services/payment-service//src/cron/payment-reconciliation.ts:44:            'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/cron/payment-reconciliation.ts:74:        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
backend/services/payment-service//src/cron/payment-reconciliation.ts:82:          `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
backend/services/payment-service//src/processors/payment-event-processor.ts:28:      `INSERT INTO payment_events (event_id, event_type, payment_id, order_id, provider, payload, created_at)
backend/services/payment-service//src/processors/payment-event-processor.ts:67:      'SELECT retry_count FROM payments WHERE id = $1',
backend/services/payment-service//src/processors/order-event-processor.ts:20:      'SELECT state FROM orders WHERE id = $1',
backend/services/payment-service//src/processors/order-event-processor.ts:50:      'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/services/paymentService.ts:47:      `INSERT INTO payment_intents
backend/services/payment-service//src/services/paymentService.ts:65:      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/payment-service//src/services/paymentService.ts:100:      `UPDATE payment_intents
backend/services/payment-service//src/services/paymentService.ts:111:        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:11:      INSERT INTO group_contributions (
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:48:      FROM group_contributions c
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:49:      JOIN group_payment_members m ON c.member_id = m.id
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:62:      FROM group_payments
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:71:      FROM group_contributions
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:92:      `INSERT INTO group_contribution_failures 

### Knex Query Builder

## 5. REPOSITORY/SERVICE FILES
### mock-fraud.service.ts
First 100 lines:
```typescript
export class MockFraudService {
  checkTransaction(userId: string, amount: number, deviceFingerprint: string) {
    // Simulate fraud scoring
    const score = Math.random() * 0.5; // 0-0.5 for testing
    const isHighRisk = score > 0.4;
    
    return {
      score,
      decision: isHighRisk ? 'review' : 'approve',
      signals: isHighRisk ? ['rapid_purchases', 'new_device'] : [],
      details: {
        userId,
        amount,
        deviceFingerprint,
        timestamp: new Date()
      }
    };
  }
  
  checkVelocity(userId: string) {
    // Mock velocity check
    const recentPurchases = Math.floor(Math.random() * 5);
    const withinLimit = recentPurchases < 3;
    
    return {
      allowed: withinLimit,
      recentPurchases,
      limit: 3,
      timeWindow: '1 hour'
    };
  }
}
```

### mock-stripe.service.ts
First 100 lines:
```typescript
export class MockStripeService {
  async createPaymentIntent(amount: number, metadata: any) {
    return {
      id: `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: amount, // Convert to cents
      currency: 'usd',
      status: 'succeeded',
      metadata,
      created: Date.now(),
      mockData: true
    };
  }

  async createRefund(paymentIntentId: string, amount?: number) {
    return {
      id: `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      payment_intent: paymentIntentId,
      amount: amount || 0,
      status: 'succeeded',
      created: Date.now(),
      mockData: true
    };
  }

  async createCustomer(email: string, name: string) {
    return {
      id: `cus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      email,
      name,
      created: Date.now(),
      mockData: true
    };
  }
}
```

### mock-nft.service.ts
First 100 lines:
```typescript
export class MockNFTService {
  private mintQueue: any[] = [];

  async queueMinting(ticketIds: string[], eventId: string) {
    const job = {
      id: `mint_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ticketIds,
      eventId,
      status: 'queued',
      createdAt: new Date(),
      mockData: true
    };
    
    this.mintQueue.push(job);
    
    // Simulate processing after 2 seconds
    setTimeout(() => {
      const index = this.mintQueue.findIndex(j => j.id === job.id);
      if (index > -1) {
        this.mintQueue[index].status = 'completed';
        this.mintQueue[index].transactionHash = `0x${Math.random().toString(16).substr(2, 40)}`;
      }
    }, 2000);
    
    return job;
  }

  async getMintStatus(jobId: string) {
    const job = this.mintQueue.find(j => j.id === jobId);
    return job || { id: jobId, status: 'not_found' };
  }

  async estimateGasFees(ticketCount: number) {
    return {
      blockchain: 'solana',
      estimatedFee: 0.002 * ticketCount, // 0.002 SOL per ticket
      feeInUSD: 0.05 * ticketCount, // ~$0.05 per ticket
      congestionLevel: 'low',
      timestamp: new Date()
    };
  }
}
```

### mock-email.service.ts
First 100 lines:
```typescript
export class MockEmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`
📧 Mock Email Sent:
To: ${to}
Subject: ${subject}
Body: ${body}
Timestamp: ${new Date().toISOString()}
    `);
    
    return {
      id: `email_${Date.now()}`,
      to,
      subject,
      status: 'sent',
      mockData: true
    };
  }

  async sendGroupPaymentInvite(email: string, groupId: string, amount: number) {
    return this.sendEmail(
      email,
      'You have been invited to a group payment',
      `Please pay $${amount} for your ticket. Link: http://localhost:3000/group/${groupId}`
    );
  }
}
```

### contribution-tracker.service.ts
First 100 lines:
```typescript
import { query } from '../../config/database';

export class ContributionTrackerService {
  async trackContribution(
    groupId: string,
    memberId: string,
    amount: number,
    paymentId: string
  ): Promise<void> {
    const trackingQuery = `
      INSERT INTO group_contributions (
        group_id, member_id, amount, payment_id,
        status, contributed_at
      ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    `;
    
    await query(trackingQuery, [
      groupId,
      memberId,
      amount,
      paymentId,
      'completed'
    ]);
  }
  
  async getContributionHistory(groupId: string): Promise<{
    contributions: Array<{
      memberId: string;
      memberName: string;
      amount: number;
      contributedAt: Date;
      status: string;
    }>;
    timeline: Array<{
      timestamp: Date;
      event: string;
      details: any;
    }>;
  }> {
    // Get all contributions
    const contributionsQuery = `
      SELECT 
        c.member_id,
        m.name as member_name,
        c.amount,
        c.contributed_at,
        c.status
      FROM group_contributions c
      JOIN group_payment_members m ON c.member_id = m.id
      WHERE c.group_id = $1
      ORDER BY c.contributed_at DESC
    `;
    
    const contributions = await query(contributionsQuery, [groupId]);
    
    // Build timeline
    const timelineQuery = `
      SELECT 
        created_at as timestamp,
        'group_created' as event,
        json_build_object('total_amount', total_amount) as details
      FROM group_payments
      WHERE id = $1
      
      UNION ALL
      
      SELECT 
        contributed_at as timestamp,
        'member_paid' as event,
        json_build_object('member_id', member_id, 'amount', amount) as details
      FROM group_contributions
      WHERE group_id = $1
      
      ORDER BY timestamp ASC
    `;
    
    const timeline = await query(timelineQuery, [groupId]);
    
    return {
      contributions: contributions.rows,
      timeline: timeline.rows
    };
  }
  
  async handleFailedContribution(
    groupId: string,
    memberId: string,
    reason: string
  ): Promise<void> {
    // Record failed attempt
    await query(
      `INSERT INTO group_contribution_failures 
       (group_id, member_id, reason, failed_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [groupId, memberId, reason]
    );
    
    // Check if member has too many failures
    const failureCount = await this.getFailureCount(groupId, memberId);
    
```

### reminder-engine.service.ts
First 100 lines:
```typescript
import Bull from 'bull';
import { config } from '../../config';
import { query } from '../../config/database';

export class ReminderEngineService {
  private reminderQueue: Bull.Queue;
  
  constructor() {
    this.reminderQueue = new Bull('payment-reminders', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.setupProcessor();
  }
  
  async scheduleReminders(groupId: string): Promise<void> {
    // Schedule reminders at:
    // - 5 minutes after creation
    // - 8 minutes after creation
    // - 9.5 minutes after creation (final warning)
    
    const delays = [5 * 60 * 1000, 8 * 60 * 1000, 9.5 * 60 * 1000];
    
    for (let i = 0; i < delays.length; i++) {
      await this.reminderQueue.add(
        'send-group-reminder',
        {
          groupId,
          reminderNumber: i + 1,
          isFinal: i === delays.length - 1
        },
        {
          delay: delays[i],
          attempts: 3,
          backoff: {
            type: 'fixed',
            delay: 5000
          }
        }
      );
    }
  }
  
  private setupProcessor() {
    this.reminderQueue.process('send-group-reminder', async (job) => {
      const { groupId, reminderNumber, isFinal } = job.data;
      
      // Get unpaid members
      const unpaidQuery = `
        SELECT 
          m.*,
          g.expires_at,
          g.event_id,
          e.name as event_name
        FROM group_payment_members m
        JOIN group_payments g ON m.group_payment_id = g.id
        JOIN events e ON g.event_id = e.id
        WHERE g.id = $1 AND m.paid = false
      `;
      
      const unpaidMembers = await query(unpaidQuery, [groupId]);
      
      if (unpaidMembers.rows.length === 0) {
        return { status: 'no_unpaid_members' };
      }
      
      // Send reminders
      for (const member of unpaidMembers.rows) {
        await this.sendReminder(member, reminderNumber, isFinal);
      }
      
      // Update reminder count
      await query(
        `UPDATE group_payment_members 
         SET reminders_sent = $2 
         WHERE group_payment_id = $1 AND paid = false`,
        [groupId, reminderNumber]
      );
      
      return {
        status: 'sent',
        count: unpaidMembers.rows.length
      };
    });
  }
  
  private async sendReminder(
    member: any,
    reminderNumber: number,
    isFinal: boolean
  ): Promise<void> {
    const timeRemaining = new Date(member.expires_at).getTime() - Date.now();
    const minutesRemaining = Math.floor(timeRemaining / 60000);
    
    const template = this.getReminderTemplate(
      reminderNumber,
```

### group-payment.service.ts
First 100 lines:
```typescript
import { v4 as uuidv4 } from 'uuid';
import { GroupPayment, GroupMember, GroupPaymentStatus, TicketSelection } from '../../types';
import { query, getClient } from '../../config/database';
import Bull from 'bull';
import { config } from '../../config';

export class GroupPaymentService {
  private reminderQueue: Bull.Queue;
  private expiryQueue: Bull.Queue;
  
  constructor() {
    this.reminderQueue = new Bull('group-payment-reminders', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.expiryQueue = new Bull('group-payment-expiry', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.setupQueues();
  }
  
  async createGroupPayment(
    organizerId: string,
    eventId: string,
    ticketSelections: TicketSelection[],
    members: Array<{ email: string; name: string; ticketCount: number }>
  ): Promise<GroupPayment> {
    const { client, release } = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Calculate total and per-person amounts
      const totalAmount = ticketSelections.reduce(
        (sum, ts) => sum + (ts.price * ts.quantity), 
        0
      );
      
      const totalTickets = ticketSelections.reduce(
        (sum, ts) => sum + ts.quantity,
        0
      );
      
      const pricePerTicket = totalAmount / totalTickets;
      
      // Create group payment record
      const groupId = uuidv4();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      const groupQuery = `
        INSERT INTO group_payments (
          id, organizer_id, event_id, total_amount,
          ticket_selections, expires_at, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const groupValues = [
        groupId,
        organizerId,
        eventId,
        totalAmount,
        JSON.stringify(ticketSelections),
        expiresAt,
        GroupPaymentStatus.COLLECTING
      ];
      
      const groupResult = await client.query(groupQuery, groupValues);
      const groupPayment = groupResult.rows[0];
      
      // Create member records
      const groupMembers: GroupMember[] = [];
      
      for (const member of members) {
        const memberId = uuidv4();
        const amountDue = pricePerTicket * member.ticketCount;
        
        const memberQuery = `
          INSERT INTO group_payment_members (
            id, group_payment_id, email, name,
            amount_due, ticket_count
          ) VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        
        const memberValues = [
          memberId,
          groupId,
          member.email,
          member.name,
          amountDue,
```

### event-ordering.service.ts
First 100 lines:
```typescript
import { Pool } from 'pg';
import { logger } from '../utils/logger';
import crypto from 'crypto';

interface PaymentEvent {
  paymentId: string;
  orderId?: string;
  eventType: string;
  eventTimestamp: Date;
  stripeEventId?: string;
  idempotencyKey?: string;
  payload: any;
}

interface ProcessedEvent {
  sequenceNumber: number;
  processed: boolean;
  error?: string;
}

export class EventOrderingService {
  private pool: Pool;
  private log = logger.child({ component: 'EventOrderingService' });
  private processingLocks: Map<string, Promise<any>> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
    // Start background processor for out-of-order events
    this.startBackgroundProcessor();
  }

  /**
   * Process a payment event with ordering guarantees
   */
  async processPaymentEvent(event: PaymentEvent): Promise<ProcessedEvent> {
    const { paymentId, eventType, idempotencyKey } = event;

    // Create idempotency key if not provided
    const finalIdempotencyKey = idempotencyKey || this.generateIdempotencyKey(event);

    // Ensure we don't process the same payment concurrently
    const lockKey = `payment:${paymentId}`;
    if (this.processingLocks.has(lockKey)) {
      this.log.info('Waiting for existing processing to complete', { paymentId });
      await this.processingLocks.get(lockKey);
    }

    const processingPromise = this.doProcessEvent(event, finalIdempotencyKey);
    this.processingLocks.set(lockKey, processingPromise);

    try {
      const result = await processingPromise;
      return result;
    } finally {
      this.processingLocks.delete(lockKey);
    }
  }

  private async doProcessEvent(
    event: PaymentEvent,
    idempotencyKey: string
  ): Promise<ProcessedEvent> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for duplicate event
      const duplicateCheck = await client.query(`
        SELECT sequence_number, processed_at 
        FROM payment_event_sequence
        WHERE payment_id = $1 
          AND event_type = $2
          AND idempotency_key = $3
      `, [event.paymentId, event.eventType, idempotencyKey]);

      if (duplicateCheck.rows.length > 0) {
        this.log.info('Duplicate event detected, skipping', {
          paymentId: event.paymentId,
          eventType: event.eventType,
          idempotencyKey
        });
        await client.query('COMMIT');
        return {
          sequenceNumber: duplicateCheck.rows[0].sequence_number,
          processed: duplicateCheck.rows[0].processed_at !== null
        };
      }

      // Get next sequence number
      const seqResult = await client.query(
        'SELECT get_next_sequence_number($1) as seq',
        [event.paymentId]
      );
      const sequenceNumber = seqResult.rows[0].seq;

      // Insert event into sequence
      await client.query(`
        INSERT INTO payment_event_sequence (
          payment_id,
```

### royalty-splitter.service.ts
First 100 lines:
```typescript
import { query } from '../../config/database';

export class RoyaltySplitterService {
  async calculateRoyalties(
    salePrice: number,
    venueId: string,
    eventId: string
  ): Promise<{
    venueRoyalty: number;
    venuePercentage: number;
    artistRoyalty: number;
    artistPercentage: number;
    sellerProceeds: number;
    platformFee: number;
  }> {
    // Get venue royalty settings
    const venueSettings = await this.getVenueRoyaltySettings(venueId);
    
    // Get event-specific royalty settings (if any)
    const eventSettings = await this.getEventRoyaltySettings(eventId);
    
    // Use event settings if available, otherwise venue defaults
    const venuePercentage = eventSettings?.venueRoyaltyPercentage ?? 
                           venueSettings?.defaultRoyaltyPercentage ?? 
                           10; // 10% default
    
    const artistPercentage = eventSettings?.artistRoyaltyPercentage ?? 0;
    const platformPercentage = 5; // 5% platform fee on resales
    
    // Calculate amounts
    const venueRoyalty = salePrice * (venuePercentage / 100);
    const artistRoyalty = salePrice * (artistPercentage / 100);
    const platformFee = salePrice * (platformPercentage / 100);
    const sellerProceeds = salePrice - venueRoyalty - artistRoyalty - platformFee;
    
    return {
      venueRoyalty: Math.round(venueRoyalty * 100) / 100,
      venuePercentage,
      artistRoyalty: Math.round(artistRoyalty * 100) / 100,
      artistPercentage,
      sellerProceeds: Math.round(sellerProceeds * 100) / 100,
      platformFee: Math.round(platformFee * 100) / 100
    };
  }
  
  async distributeRoyalties(
    transactionId: string,
    royalties: any
  ): Promise<void> {
    // Record royalty distributions
    const distributions = [
      {
        transactionId,
        recipientType: 'venue',
        recipientId: royalties.venueId,
        amount: royalties.venueRoyalty,
        percentage: royalties.venuePercentage
      },
      {
        transactionId,
        recipientType: 'artist',
        recipientId: royalties.artistId,
        amount: royalties.artistRoyalty,
        percentage: royalties.artistPercentage
      },
      {
        transactionId,
        recipientType: 'platform',
        recipientId: 'tickettoken',
        amount: royalties.platformFee,
        percentage: 5
      }
    ];
    
    for (const distribution of distributions) {
      if (distribution.amount > 0) {
        await query(
          `INSERT INTO royalty_distributions 
           (transaction_id, recipient_type, recipient_id, amount, percentage)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            distribution.transactionId,
            distribution.recipientType,
            distribution.recipientId,
            distribution.amount,
            distribution.percentage
          ]
        );
      }
    }
  }
  
  private async getVenueRoyaltySettings(venueId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM venue_royalty_settings WHERE venue_id = $1',
      [venueId]
    );
    
    return result.rows[0] || { defaultRoyaltyPercentage: 10 };
  }
```

### escrow.service.ts
First 100 lines:
```typescript
import { getClient, query } from '../../config/database';
import { EscrowTransaction, EscrowStatus, ResaleListing, TransactionStatus } from '../../types';
import { TransactionModel, VenueBalanceModel } from '../../models';
import { percentOfCents } from '../../utils/money';
import Stripe from 'stripe';
import { config } from '../../config';

interface ExtendedEscrowTransaction extends EscrowTransaction {
  stripePaymentIntentId: string;
  sellerId: string;
  sellerPayout: number;
  venueRoyalty: number;
  listingId: string;
}

export class EscrowService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(config.stripe.secretKey, {
      apiVersion: '2023-10-16'
    });
  }

  async createEscrow(
    listing: ResaleListing,
    buyerId: string,
    paymentMethodId: string
  ): Promise<ExtendedEscrowTransaction> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      // Calculate splits (all in cents)
      const splits = this.calculatePaymentSplits(
        listing.price, // Already in cents
        listing.venueRoyaltyPercentage
      );

      // Create Stripe payment intent (Stripe expects cents)
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: listing.price, // Already in cents
        currency: 'usd',
        payment_method: paymentMethodId,
        capture_method: 'manual',
        metadata: {
          listingId: listing.id,
          sellerId: listing.sellerId,
          buyerId: buyerId,
          ticketId: listing.ticketId
        }
      });

      // Create escrow record (amounts in cents)
      const escrowQuery = `
        INSERT INTO payment_escrows (
          listing_id, buyer_id, seller_id, amount,
          seller_payout, venue_royalty, platform_fee,
          stripe_payment_intent_id, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `;

      const escrowValues = [
        listing.id,
        buyerId,
        listing.sellerId,
        listing.price,
        splits.sellerPayout,
        splits.venueRoyalty,
        splits.platformFee,
        paymentIntent.id,
        EscrowStatus.CREATED
      ];

      const escrowResult = await client.query(escrowQuery, escrowValues);
      const escrow = escrowResult.rows[0];

      await this.setReleaseConditions(client, escrow.id);
      await client.query('COMMIT');

      return escrow;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async fundEscrow(escrowId: string): Promise<ExtendedEscrowTransaction> {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status !== EscrowStatus.CREATED) {
      throw new Error('Escrow already funded or cancelled');
    }

    const paymentIntent = await this.stripe.paymentIntents.confirm(
      escrow.stripePaymentIntentId
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

