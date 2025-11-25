# COMPLETE DATABASE ANALYSIS: payment-service
Generated: Thu Oct  2 15:07:53 EDT 2025

================================================================================
## SECTION 1: ALL TYPESCRIPT/JAVASCRIPT FILES WITH DATABASE OPERATIONS
================================================================================

### FILE: src/routes/health.routes.ts
```typescript
import { Router } from 'express';
import { pool } from '../config/database';

const router = Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'payment-service' });
});

router.get('/health/db', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      service: 'payment-service' 
    });
  } catch (error: any) {
    res.status(503).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message,
      service: 'payment-service'
    });
  }
});

export default router;
```

### FILE: src/jobs/process-webhook-queue.ts
```typescript
import { Pool } from 'pg';
import { StripeWebhookHandler } from '../webhooks/stripe-handler';
import Stripe from 'stripe';

export class ProcessWebhookQueueJob {
  private db: Pool;
  private stripeHandler: StripeWebhookHandler;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripeHandler = new StripeWebhookHandler(stripe, db);
  }

  async execute(): Promise<void> {
    // Get unprocessed webhooks
    const webhooks = await this.db.query(
      `SELECT * FROM webhook_inbox 
       WHERE processed = false 
       AND retry_count < 5
       ORDER BY created_at ASC 
       LIMIT 10`
    );

    for (const webhook of webhooks.rows) {
      await this.processWebhook(webhook);
    }
  }

  private async processWebhook(webhook: any): Promise<void> {
    try {
      const payload = JSON.parse(webhook.payload);
      
      switch (webhook.provider) {
        case 'stripe':
          // Process based on event type
          await this.processStripeWebhook(payload, webhook.webhook_id);
          break;
        // Add other providers here
      }

      // Mark as processed
      await this.db.query(
        'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE id = $1',
        [webhook.id]
      );
    } catch (error: any) {
      // Update retry count and error
      await this.db.query(
        `UPDATE webhook_inbox 
         SET retry_count = retry_count + 1, 
             error_message = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [error.message, webhook.id]
      );
    }
  }

  private async processStripeWebhook(payload: any, webhookId: string): Promise<void> {
    // Process the webhook payload
    console.log(`Processing Stripe webhook ${webhookId}`);
    // The actual processing is handled by the handler
  }
}
```

### FILE: src/jobs/retry-failed-payments.ts
```typescript
import { Pool } from 'pg';
import Stripe from 'stripe';
import { PaymentState } from '../services/state-machine/payment-state-machine';

export class RetryFailedPaymentsJob {
  private db: Pool;
  private stripe: Stripe;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripe = stripe;
  }

  async execute(): Promise<void> {
    // Find failed payments eligible for retry
    const failedPayments = await this.db.query(
      `SELECT * FROM payments 
       WHERE state = $1 
       AND retry_count < $2 
       AND updated_at < NOW() - INTERVAL '1 hour'
       LIMIT 10`,
      [PaymentState.FAILED, 3]
    );

    for (const payment of failedPayments.rows) {
      await this.retryPayment(payment);
    }
  }

  private async retryPayment(payment: any): Promise<void> {
    try {
      // Update retry count
      await this.db.query(
        'UPDATE payments SET retry_count = retry_count + 1, updated_at = NOW() WHERE id = $1',
        [payment.id]
      );

      // Retry with provider
      if (payment.provider === 'stripe') {
        const paymentIntent = await this.stripe.paymentIntents.retrieve(
          payment.provider_payment_id
        );
        
        if (paymentIntent.status === 'requires_payment_method') {
          // Payment method failed, need customer action
          console.log(`Payment ${payment.id} requires new payment method`);
        } else {
          // Attempt to confirm again
          await this.stripe.paymentIntents.confirm(payment.provider_payment_id);
        }
      }
      // Add other providers here when you implement them
    } catch (error) {
      console.error(`Failed to retry payment ${payment.id}:`, error);
    }
  }
}
```

### FILE: src/config/database.ts
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

### FILE: src/index.ts
```typescript
import { DatabaseService } from './services/databaseService';
import { RedisService } from './services/redisService';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Bull from 'bull';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3006;

// Initialize database
(async () => {
  try {
    await DatabaseService.initialize();
    console.log("Database initialized");
    
    await RedisService.initialize();
    console.log("RedisService initialized");
  } catch (error) {
    console.error("Failed to initialize database:", error);
  }
})();
const SERVICE_NAME = process.env.SERVICE_NAME || 'payment-service';

// Import services and workers
const PaymentService = require('./services/paymentService');
//const ReconciliationService = require('./services/reconciliation/reconciliation-service');
const { webhookProcessor } = require('./workers/webhook.processor');
const { startWebhookConsumer } = require('./workers/webhook.consumer');
const routes = require('./routes/index').default || require('./routes/index');

// Initialize services
const paymentService = PaymentService;
//const reconciliationService = new ReconciliationService();

// Start webhook processor (only once)
webhookProcessor.start();
console.log("Webhook processor started");

// Start webhook consumer
startWebhookConsumer()
  .then(() => console.log("Webhook consumer started"))
  .catch((err: any) => console.error("Failed to start webhook consumer:", err));

// Setup Bull Dashboard (optional - comment out if causing issues)
let serverAdapter: any;
try {
  const { createBullBoard } = require('@bull-board/api');
  const { BullAdapter } = require('@bull-board/api/bullAdapter');
  const { ExpressAdapter } = require('@bull-board/express');

  serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const queues = [
    new Bull('payment-processing', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    }),
    new Bull('webhook-processing', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    }),
    new Bull('reconciliation', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    }),
    new Bull('notifications', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    })
  ];

  createBullBoard({
    queues: queues.map((q: any) => new BullAdapter(q)),
    serverAdapter
  });
} catch (error) {
  console.log('Bull Board not available, continuing without dashboard');
}

// Middleware
app.use(cors());
app.use((req, res, next) => {
  if (req.path === '/api/v1/webhooks/stripe') {
    next(); // Skip JSON parsing for Stripe webhooks
  } else {
    express.json()(req, res, next);
  }
});

// Add queue dashboard if available
if (serverAdapter) {
  app.use('/admin/queues', serverAdapter.getRouter());
}

// Health endpoint with detailed status
app.get('/health', async (req, res) => {

// ISSUE #29 FIX: Metrics endpoint for monitoring
app.get('/metrics', async (req, res) => {
  const { register } = await import('./utils/metrics');
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
  try {
    // Check database connection
    const dbHealthy = await DatabaseService.getPool().query('SELECT 1');

    // Check Redis connection
    const testQueue = new Bull('health-check', {
      redis: { host: process.env.REDIS_HOST || 'redis', port: 6379 }
    });
    await testQueue.add('test', {});
    await testQueue.close();

    res.json({
      status: 'healthy',
      service: SERVICE_NAME,
      timestamp: new Date().toISOString(),
      components: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        redis: 'healthy',
        processor: process.env.PAYMENT_PROCESSOR || 'mock'
      }
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      service: SERVICE_NAME,
      error: error?.message || 'Unknown error'
    });
  }
});

// Service info endpoint
app.get('/info', (req, res) => {
  res.json({
    service: SERVICE_NAME,
    version: '1.0.0',
    port: PORT,
    processor: process.env.PAYMENT_PROCESSOR || 'mock',
    features: {
      stripe: true,
      square: false,
      webhooks: true,
      reconciliation: true,
      nftIntegration: true,
      notifications: true,
      fraudDetection: true,
      queueDashboard: serverAdapter ? `/admin/queues` : 'disabled'
    },
    status: 'running'
  });
});

// Admin endpoints
app.get('/admin/stats', async (req, res) => {
  try {
    const stats = await DatabaseService.getPool().query(`
      SELECT
        COUNT(*) as total_payments,
        COUNT(CASE WHEN status = 'succeeded' THEN 1 END) as successful,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as total_revenue
      FROM payment_intents
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    res.json({
      last24Hours: stats.rows[0],
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Stats query failed' });
  }
});

// Manual reconciliation endpoint
// app.post('/admin/reconcile', async (req, res) => {
//   try {
//     const report = await reconciliationService.manualReconcile();
//     res.json(report);
//   } catch (error: any) {
//     res.status(500).json({ error: error?.message || 'Reconciliation failed' });
//   }
// });

// Payment routes
app.use('/api/v1', routes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err?.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Payment Service running on port ${PORT}`);
});

export default app;
```

### FILE: src/controllers/webhookController.ts
```typescript
import { QUEUES } from "@tickettoken/shared";
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { DatabaseService } from '../services/databaseService';
import { queueService } from '../services/queueService';
import { logger } from '../utils/logger';
import * as crypto from 'crypto';

const log = logger.child({ component: 'WebhookController' });

export class WebhookController {
  async handleStripeWebhook(req: Request, res: Response) {
    const signature = req.headers['stripe-signature'] as string;
    const webhookId = req.headers['stripe-webhook-id'] as string || crypto.randomUUID();
    
    try {
      // Store in inbox immediately
      const db = DatabaseService.getPool();
      await db.query(
        `INSERT INTO webhook_inbox (webhook_id, source, event_type, payload, signature)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (webhook_id) DO NOTHING`,
        [webhookId, 'stripe', req.body.type || 'unknown', req.body, signature]
      );
      
      // Return 200 immediately (process async)
      res.status(200).json({ received: true });
      
      // Process async via queue
      await queueService.publish(QUEUES.PAYMENT_WEBHOOK, {
        webhookId,
        source: 'stripe'
      });
      
      log.info('Webhook stored for processing', { webhookId });
      
    } catch (error) {
      log.error('Failed to store webhook', error);
      // Still return 200 to prevent retries
      res.status(200).json({ received: true, error: 'stored_with_error' });
    }
  }
}

export const webhookController = new WebhookController();
```

### FILE: src/controllers/refundController.ts
```typescript
import { serviceCache } from '../services/cache-integration';
import { Request, Response } from 'express';
import { z } from 'zod';
import { DatabaseService } from '../services/databaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const log = logger.child({ component: 'RefundController' });

// Add validation schema
const refundSchema = z.object({
  paymentIntentId: z.string(),
  amount: z.number().positive(),
  reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer', 'other']).optional()
});

export class RefundController {
  async createRefund(req: Request, res: Response) {
    try {
      // Check authentication
      const user = (req as any).user;
      const tenantId = (req as any).tenantId;
      
      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      if (!tenantId) {
        return res.status(403).json({ error: 'Tenant context required' });
      }

      // Validate input
      const validated = refundSchema.parse(req.body);
      const { paymentIntentId, amount, reason } = validated;

      const db = DatabaseService.getPool();
      
      // CRITICAL: Verify the payment intent belongs to this tenant
      const paymentCheck = await db.query(
        `SELECT pi.*, o.tenant_id 
         FROM payment_intents pi
         JOIN orders o ON pi.order_id = o.id
         WHERE pi.stripe_intent_id = $1 AND o.tenant_id = $2`,
        [paymentIntentId, tenantId]
      );

      if (paymentCheck.rows.length === 0) {
        log.warn('Refund attempt for unauthorized payment intent', {
          paymentIntentId,
          tenantId,
          userId: user.id
        });
        return res.status(403).json({ error: 'Payment intent not found or unauthorized' });
      }

      const paymentIntent = paymentCheck.rows[0];

      // Verify refund amount doesn't exceed original amount
      if (amount > paymentIntent.amount) {
        return res.status(400).json({ error: 'Refund amount exceeds original payment' });
      }

      // Check if already refunded
      if (paymentIntent.status === 'refunded') {
        return res.status(400).json({ error: 'Payment already refunded' });
      }

      // Mock Stripe refund (in production, use real Stripe SDK)
      const mockRefund = {
        id: `re_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        payment_intent: paymentIntentId,
        amount: amount,
        status: 'succeeded',
        reason: reason || 'requested_by_customer'
      };

      // Start transaction
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        
        // Set tenant context for RLS
        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);

        // Store refund record with tenant_id
        await client.query(
          `INSERT INTO refunds (id, payment_intent_id, amount, status, reason, tenant_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [mockRefund.id, paymentIntentId, amount, mockRefund.status, mockRefund.reason, tenantId]
        );

        // Update payment intent status
        await client.query(
          `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
          [paymentIntentId]
        );

        // Write to outbox with tenant context
        const outboxId = uuidv4();
        await client.query(
          `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload, tenant_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            outboxId,
            'refund',
            'refund.completed',
            JSON.stringify({
              ...mockRefund,
              tenantId,
              userId: user.id,
              timestamp: new Date().toISOString()
            }),
            tenantId
          ]
        );

        await client.query('COMMIT');
        
        log.info('Refund processed', { 
          refundId: mockRefund.id,
          tenantId,
          userId: user.id
        });

        return res.json({
          refundId: mockRefund.id,
          status: mockRefund.status,
          amount: amount
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: (error as any).errors });
      }
      
      log.error('Refund failed', error);
      return res.status(500).json({ error: 'Refund failed' });
    }
  }
}

export const refundController = new RefundController();
```

### FILE: src/models/refund.model.ts
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

### FILE: src/models/venue-balance.model.ts
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

### FILE: src/models/transaction.model.ts
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

### FILE: src/middleware/validation.ts
```typescript
console.log("[VALIDATION] Module loaded");
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const schemas = {
  processPayment: Joi.object({
    venueId: Joi.string().uuid().required(),
    eventId: Joi.string().uuid().required(),
    tickets: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).max(10).required(),
        price: Joi.number().positive().required(),
        seatNumbers: Joi.array().items(Joi.string()).optional()
      })
    ).min(1).required(),
    paymentMethod: Joi.object({
      type: Joi.string().valid('card', 'ach', 'paypal', 'crypto').required(),
      token: Joi.string().optional(),
      paymentMethodId: Joi.string().optional()
    }).required(),
    metadata: Joi.object().optional(),
    deviceFingerprint: Joi.string().required(),
    sessionData: Joi.object({
      actions: Joi.array().items(
        Joi.object({
          type: Joi.string().required(),
          timestamp: Joi.number().required(),
          x: Joi.number().optional(),
          y: Joi.number().optional()
        })
      ).optional(),
      browserFeatures: Joi.object().optional()
    }).optional()
  }),
  
  calculateFees: Joi.object({
    venueId: Joi.string().uuid().required(),
    amount: Joi.number().positive().required(),
    ticketCount: Joi.number().integer().min(1).required()
  }),
  
  refundTransaction: Joi.object({
    amount: Joi.number().positive().optional(),
    reason: Joi.string().max(500).required()
  }),
  
  createListing: Joi.object({
    ticketId: Joi.string().uuid().required(),
    price: Joi.number().positive().required(),
    venueId: Joi.string().uuid().required()
  }),
  
  purchaseResale: Joi.object({
    listingId: Joi.string().required(),
    paymentMethodId: Joi.string().required()
  }),
  
  createGroup: Joi.object({
    eventId: Joi.string().uuid().required(),
    ticketSelections: Joi.array().items(
      Joi.object({
        ticketTypeId: Joi.string().uuid().required(),
        quantity: Joi.number().integer().min(1).required(),
        price: Joi.number().positive().required()
      })
    ).min(1).required(),
    members: Joi.array().items(
      Joi.object({
        email: Joi.string().email().required(),
        name: Joi.string().required(),
        ticketCount: Joi.number().integer().min(1).required()
      })
    ).min(1).max(20).required()
  })
};

export const validateRequest = (schemaName: keyof typeof schemas) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`[VALIDATION] Validating schema: ${schemaName}`, req.body);
    const schema = schemas[schemaName];
    
    if (!schema) {
      return next(new Error(`Validation schema '${schemaName}' not found`));
    }
    
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors
      });
    }
    
    // Replace request body with validated and sanitized data
    req.body = value;
    next();
  };
};

export const validateQueryParams = (schema: Joi.Schema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    console.log(`[VALIDATION] Validating query params:`, req.query);
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true
    });
    
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      
      return res.status(400).json({
        error: 'Invalid query parameters',
        code: 'QUERY_VALIDATION_ERROR',
        errors
      });
    }
    
    req.query = value;
    return next();
  };
};
```

### FILE: src/middleware/rate-limiter.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { config } from '../config';
import { AuthRequest } from './auth';

const redis = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port
  }
});

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimitConfig) {
  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests',
    keyGenerator = (req: Request) => req.ip,
    skip = () => false
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip(req)) {
      return next();
    }

    try {
      const key = `rate-limit:${keyGenerator(req)}`;
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > max) {
        return res.status(429).json({ error: message });
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

// Connect Redis
redis.connect().catch(console.error);

// Export for backwards compatibility
export const rateLimiter = (name: string, max: number, windowSeconds: number) => {
  return createRateLimiter({
    windowMs: windowSeconds * 1000,
    max: max,
    message: `Too many ${name} requests`
  });
};
```

### FILE: src/middleware/idempotency.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redisService';
import { validate as isUUID } from 'uuid';

interface IdempotencyOptions {
  ttlMs: number;
}

export function idempotencyMiddleware(options: IdempotencyOptions) {
  const { ttlMs } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    // 1. Require key for mutations
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Idempotency-Key header required',
        code: 'IDEMPOTENCY_KEY_MISSING',
        details: 'All payment operations require an Idempotency-Key header with a UUID value'
      });
    }

    // 2. Validate format (must be UUID)
    if (!isUUID(idempotencyKey)) {
      return res.status(400).json({
        error: 'Idempotency-Key must be a valid UUID',
        code: 'IDEMPOTENCY_KEY_INVALID',
        details: 'Use a UUID v4 format like: 123e4567-e89b-12d3-a456-426614174000'
      });
    }

    // 3. Scope by user (required)
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Use tenantId if available, otherwise use userId as scope
    const tenantId = (req as any).user?.tenantId || userId;
    const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

    try {
      // 4. Check if request already processed
      const cached = await RedisService.get(redisKey);

      if (cached) {
        const cachedResponse = JSON.parse(cached);

        // If still processing (102), return 409
        if (cachedResponse.statusCode === 102) {
          console.warn('Concurrent duplicate request detected', {
            idempotencyKey,
            userId,
            tenantId,
            path: req.path
          });

          return res.status(409).json({
            error: 'Request already processing',
            code: 'DUPLICATE_IN_PROGRESS',
            details: 'A request with this idempotency key is currently being processed'
          });
        }

        // Return cached response
        console.info('Returning cached idempotent response', {
          idempotencyKey,
          userId,
          tenantId,
          originalStatus: cachedResponse.statusCode
        });

        return res.status(cachedResponse.statusCode).json(cachedResponse.body);
      }

      // 5. Mark as in-progress to prevent concurrent duplicates
      await RedisService.set(
        redisKey,
        JSON.stringify({
          statusCode: 102,
          body: { processing: true },
          startedAt: new Date().toISOString()
        }),
        Math.floor(ttlMs / 1000)
      );

      // 6. Intercept response to cache result
      const originalJson = res.json?.bind(res);
      const originalSend = res.send?.bind(res);
      
      if (!originalJson) {
        // If json method doesn't exist, skip response wrapping (test environment)
        console.warn('res.json not available, skipping response caching');
        return next();
      }

      let responseSent = false;

      const cacheResponse = async (body: any) => {
        if (responseSent) return;
        responseSent = true;

        const statusCode = res.statusCode;

        // Cache successful responses (2xx) for 24 hours
        if (statusCode >= 200 && statusCode < 300) {
          await RedisService.set(
            redisKey,
            JSON.stringify({
              statusCode,
              body,
              completedAt: new Date().toISOString()
            }),
            86400  // 24 hours
          ).catch(err => {
            console.error('Failed to cache successful response', { err, idempotencyKey });
          });
        }
        // Delete key on server errors (5xx) to allow retry
        else if (statusCode >= 500) {
          await RedisService.del(redisKey).catch(err => {
            console.error('Failed to delete key after server error', { err, idempotencyKey });
          });
        }
        // Keep key for client errors (4xx) to prevent retry
        else if (statusCode >= 400 && statusCode < 500) {
          await RedisService.set(
            redisKey,
            JSON.stringify({
              statusCode,
              body,
              completedAt: new Date().toISOString()
            }),
            3600  // 1 hour for errors
          ).catch(err => {
            console.error('Failed to cache error response', { err, idempotencyKey });
          });
        }
      };

      // Override json method
      res.json = function(body: any) {
        cacheResponse(body).then(() => {
          if (originalJson) {
            originalJson(body);
          }
        }).catch(err => {
          console.error('Cache response failed', { err });
          if (originalJson) {
            originalJson(body);
          }
        });
        return res;
      };

      // Override send method if it exists
      if (originalSend) {
        res.send = function(body: any) {
          cacheResponse(body).then(() => {
            originalSend(body);
          }).catch(err => {
            console.error('Cache response failed', { err });
            originalSend(body);
          });
          return res;
        };
      }

      next();

    } catch (err) {
      console.error('Idempotency middleware error', { err, idempotencyKey });
      // On Redis failure, proceed without idempotency (degraded mode)
      next();
    }
  };
}
```

### FILE: src/middleware/request-logger.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends Request {
  id: string;
  startTime: number;
}

export const requestLogger = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
) => {
  // Assign unique request ID
  req.id = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Set request ID in response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Log request
  console.log('Incoming request:', {
    id: req.id,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    
    // Log response
    const duration = Date.now() - req.startTime;
    console.log('Outgoing response:', {
      id: req.id,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    // Set response time header
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    return res.send(data);
  };
  
  next();
};

// Performance monitoring
export const performanceMonitor = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
) => {
  const checkpoints: { [key: string]: number } = {
    start: Date.now()
  };
  
  // Add checkpoint function to request
  (req as any).checkpoint = (name: string) => {
    checkpoints[name] = Date.now();
  };
  
  // Log performance metrics on response
  res.on('finish', () => {
    const total = Date.now() - checkpoints.start;
    
    if (total > 1000) { // Log slow requests
      console.warn('Slow request detected:', {
        id: req.id,
        path: req.path,
        totalTime: `${total}ms`,
        checkpoints: Object.entries(checkpoints).map(([name, time]) => ({
          name,
          elapsed: `${time - checkpoints.start}ms`
        }))
      });
    }
  });
  
  next();
};
```

### FILE: src/cron/webhook-cleanup.ts
```typescript
import { Pool } from 'pg';

export class WebhookCleanup {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async run(): Promise<void> {
    console.log('Starting webhook cleanup...');
    
    // Delete processed webhooks older than 30 days
    const result = await this.db.query(
      `DELETE FROM webhook_inbox 
       WHERE processed = true 
       AND created_at < NOW() - INTERVAL '30 days'`
    );

    console.log(`Deleted ${result.rowCount} old webhooks`);

    // Archive failed webhooks older than 7 days
    const failedWebhooks = await this.db.query(
      `SELECT * FROM webhook_inbox 
       WHERE processed = false 
       AND retry_count >= 5 
       AND created_at < NOW() - INTERVAL '7 days'`
    );

    if (failedWebhooks.rows.length > 0) {
      // You could move these to an archive table or external storage
      console.log(`Found ${failedWebhooks.rows.length} failed webhooks to archive`);
    }
  }
}
```

### FILE: src/cron/payment-reconciliation.ts
```typescript
import { Pool } from 'pg';
import Stripe from 'stripe';
import { PaymentState } from '../services/state-machine/payment-state-machine';

export class PaymentReconciliation {
  private db: Pool;
  private stripe: Stripe;

  constructor(db: Pool, stripe: Stripe) {
    this.db = db;
    this.stripe = stripe;
  }

  async run(): Promise<void> {
    console.log('Starting payment reconciliation...');
    
    // Get payments in processing state for more than 10 minutes
    const stuckPayments = await this.db.query(
      `SELECT * FROM payments 
       WHERE state = $1 
       AND updated_at < NOW() - INTERVAL '10 minutes'`,
      [PaymentState.PROCESSING]
    );

    for (const payment of stuckPayments.rows) {
      await this.reconcilePayment(payment);
    }

    // Check for missing webhooks
    await this.checkMissingWebhooks();
  }

  private async reconcilePayment(payment: any): Promise<void> {
    try {
      if (payment.provider === 'stripe') {
        const intent = await this.stripe.paymentIntents.retrieve(
          payment.provider_payment_id
        );

        // Update local state based on Stripe's truth
        const newState = this.mapStripeStatus(intent.status);
        if (newState !== payment.state) {
          await this.db.query(
            'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
            [newState, payment.id]
          );
          console.log(`Reconciled payment ${payment.id}: ${payment.state} -> ${newState}`);
        }
      }
    } catch (error) {
      console.error(`Failed to reconcile payment ${payment.id}:`, error);
    }
  }

  private mapStripeStatus(status: string): PaymentState {
    const statusMap: Record<string, PaymentState> = {
      'requires_payment_method': PaymentState.PENDING,
      'processing': PaymentState.PROCESSING,
      'succeeded': PaymentState.COMPLETED,
      'canceled': PaymentState.CANCELLED
    };
    return statusMap[status] || PaymentState.FAILED;
  }

  private async checkMissingWebhooks(): Promise<void> {
    // Query Stripe for recent events and check if we have them
    const events = await this.stripe.events.list({
      created: { gte: Math.floor(Date.now() / 1000) - 3600 }, // Last hour
      limit: 100
    });

    for (const event of events.data) {
      const exists = await this.db.query(
        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
        [event.id]
      );

      if (exists.rows.length === 0) {
        console.log(`Missing webhook event: ${event.id}`);
        // Queue it for processing
        await this.db.query(
          `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
           VALUES ($1, $2, $3, $4, false)
           ON CONFLICT (webhook_id) DO NOTHING`,
          [event.id, 'stripe', event.type, JSON.stringify(event)]
        );
      }
    }
  }
}
```

### FILE: src/processors/payment-event-processor.ts
```typescript
import { Pool } from 'pg';
import Bull from 'bull';

export interface PaymentEvent {
  id: string;
  type: 'payment.created' | 'payment.updated' | 'payment.completed' | 'payment.failed';
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class PaymentEventProcessor {
  private db: Pool;
  private queue: Bull.Queue;

  constructor(db: Pool, queue: Bull.Queue) {
    this.db = db;
    this.queue = queue;
  }

  async processPaymentEvent(event: PaymentEvent): Promise<void> {
    // Log event
    await this.db.query(
      `INSERT INTO payment_events (event_id, event_type, payment_id, order_id, provider, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.type, event.paymentId, event.orderId, event.provider, JSON.stringify(event), event.timestamp]
    );

    // Handle different event types
    switch (event.type) {
      case 'payment.completed':
        await this.handlePaymentCompleted(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
      default:
        console.log(`Processing event type: ${event.type}`);
    }
  }

  private async handlePaymentCompleted(event: PaymentEvent): Promise<void> {
    // Queue order fulfillment
    await this.queue.add('order.fulfill', {
      orderId: event.orderId,
      paymentId: event.paymentId
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    // Queue email notification
    await this.queue.add('email.payment_success', {
      orderId: event.orderId,
      amount: event.amount,
      currency: event.currency
    });
  }

  private async handlePaymentFailed(event: PaymentEvent): Promise<void> {
    // Queue retry if applicable
    const payment = await this.db.query(
      'SELECT retry_count FROM payments WHERE id = $1',
      [event.paymentId]
    );

    if (payment.rows[0]?.retry_count < 3) {
      await this.queue.add('payment.retry', {
        paymentId: event.paymentId,
        attemptNumber: payment.rows[0].retry_count + 1
      }, {
        delay: 3600000 // Retry in 1 hour
      });
    }
  }
}
```

### FILE: src/processors/order-event-processor.ts
```typescript
import { Pool } from 'pg';
import { OrderState } from '../services/state-machine/order-state-machine';

export interface OrderEvent {
  orderId: string;
  type: string;
  payload: any;
  timestamp: Date;
}

export class OrderEventProcessor {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async processOrderEvent(event: OrderEvent): Promise<void> {
    const order = await this.db.query(
      'SELECT state FROM orders WHERE id = $1',
      [event.orderId]
    );

    if (order.rows.length === 0) {
      throw new Error(`Order ${event.orderId} not found`);
    }

    const currentState = order.rows[0].state as OrderState;
    
    // Process based on event type and current state
    switch (event.type) {
      case 'order.payment_received':
        if (currentState === OrderState.PAYMENT_PROCESSING) {
          await this.updateOrderState(event.orderId, OrderState.PAID);
        }
        break;
      case 'order.items_shipped':
        if (currentState === OrderState.PAID) {
          await this.updateOrderState(event.orderId, OrderState.FULFILLED);
        }
        break;
      case 'order.cancelled':
        await this.handleOrderCancellation(event.orderId, currentState);
        break;
    }
  }

  private async updateOrderState(orderId: string, newState: OrderState): Promise<void> {
    await this.db.query(
      'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
      [newState, orderId]
    );
  }

  private async handleOrderCancellation(orderId: string, currentState: OrderState): Promise<void> {
    // Can only cancel if not already fulfilled or refunded
    const cancellableStates = [
      OrderState.CREATED,
      OrderState.PAYMENT_PENDING,
      OrderState.PAYMENT_FAILED
    ];

    if (cancellableStates.includes(currentState)) {
      await this.updateOrderState(orderId, OrderState.CANCELLED);
    }
  }
}
```

### FILE: src/services/paymentService.ts
```typescript
import { DatabaseService } from './databaseService';
import { QUEUES } from "@tickettoken/shared";
import { QueueService } from './queueService';
import { logger } from '../utils/logger';
import { StripeMock } from './providers/stripeMock';

const log = logger.child({ component: 'PaymentService' });

let stripe: any;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
  log.info('Using real Stripe API');
} else {
  stripe = new StripeMock();
  log.info('Using mock Stripe (no valid key found)');
}

interface CreateIntentParams {
  orderId: string;
  amount: number;        // INTEGER CENTS
  platformFee: number;   // INTEGER CENTS
  venueId?: string;
  metadata?: any;
}

class PaymentServiceClass {
  async createPaymentIntent(params: CreateIntentParams) {
    const db = DatabaseService.getPool();

    // Stripe expects amount in cents (params already in cents)
    const stripeIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      application_fee_amount: params.platformFee,
      metadata: {
        orderId: params.orderId,
        venueId: params.venueId || '',
        ...params.metadata
      }
    });

    // Store in database (amounts in cents)
    const result = await db.query(
      `INSERT INTO payment_intents
       (order_id, stripe_intent_id, amount, platform_fee, venue_id, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.orderId,
        stripeIntent.id,
        params.amount,
        params.platformFee,
        params.venueId,
        JSON.stringify(params.metadata || {}),
        stripeIntent.status
      ]
    );

    const intent = result.rows[0];

    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        intent.id,
        'payment_intent',
        'payments.intent_created',
        JSON.stringify({
          orderId: params.orderId,
          intentId: intent.id,
          stripeIntentId: stripeIntent.id,
          amount: params.amount
        })
      ]
    );

    log.info('Payment intent created', {
      intentId: intent.id,
      stripeId: stripeIntent.id,
      amount: params.amount
    });

    return {
      id: intent.id,
      stripeIntentId: stripeIntent.id,
      clientSecret: stripeIntent.client_secret,
      amount: params.amount,
      platformFee: params.platformFee
    };
  }

  async confirmPayment(stripeIntentId: string) {
    const intent = await stripe.paymentIntents.retrieve(stripeIntentId);

    const db = DatabaseService.getPool();
    const result = await db.query(
      `UPDATE payment_intents
       SET status = $2, updated_at = NOW()
       WHERE stripe_intent_id = $1
       RETURNING *`,
      [stripeIntentId, intent.status]
    );

    if (result.rows.length > 0) {
      const payment = result.rows[0];

      await db.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.id,
          'payment',
          'payment.confirmed',
          JSON.stringify({
            orderId: payment.order_id,
            paymentId: payment.id,
            amount: payment.amount
          })
        ]
      );
    }

    return result.rows[0];
  }
}

export const PaymentService = new PaymentServiceClass();
```

### FILE: src/services/group/contribution-tracker.service.ts
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
    
    if (failureCount >= 3) {
      // Mark member as problematic
      await query(
        `UPDATE group_payment_members 
         SET status = 'payment_failed', 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND group_payment_id = $2`,
        [memberId, groupId]
      );
    }
  }
  
  private async getFailureCount(
    groupId: string,
    memberId: string
  ): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count 
       FROM group_contribution_failures 
       WHERE group_id = $1 AND member_id = $2`,
      [groupId, memberId]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async getGroupAnalytics(venueId: string): Promise<{
    totalGroups: number;
    successRate: number;
    averageGroupSize: number;
    averageCompletionTime: number;
    commonFailureReasons: Array<{
      reason: string;
      count: number;
    }>;
  }> {
    // Get overall stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_groups,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_groups,
        AVG(member_count) as avg_group_size,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_completion_minutes
      FROM (
        SELECT 
          gp.*,
          COUNT(gpm.id) as member_count
        FROM group_payments gp
        JOIN group_payment_members gpm ON gp.id = gpm.group_payment_id
        JOIN events e ON gp.event_id = e.id
        WHERE e.venue_id = $1
        GROUP BY gp.id
      ) as group_stats
    `;
    
    const stats = await query(statsQuery, [venueId]);
    
    // Get failure reasons
    const failuresQuery = `
      SELECT 
        cancellation_reason as reason,
        COUNT(*) as count
      FROM group_payments gp
      JOIN events e ON gp.event_id = e.id
      WHERE e.venue_id = $1 
        AND gp.status = 'cancelled'
        AND gp.cancellation_reason IS NOT NULL
      GROUP BY cancellation_reason
      ORDER BY count DESC
      LIMIT 5
    `;
    
    const failures = await query(failuresQuery, [venueId]);
    
    const statsRow = stats.rows[0];
    return {
      totalGroups: parseInt(statsRow.total_groups),
      successRate: (parseInt(statsRow.successful_groups) / parseInt(statsRow.total_groups)) * 100,
      averageGroupSize: parseFloat(statsRow.avg_group_size),
      averageCompletionTime: parseFloat(statsRow.avg_completion_minutes),
      commonFailureReasons: failures.rows
    };
  }
}
```

### FILE: src/services/group/reminder-engine.service.ts
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
      isFinal,
      minutesRemaining
    );
    
    // In production, integrate with email service
    console.log(`Sending reminder #${reminderNumber} to ${member.email}`);
    console.log(`Event: ${member.event_name}`);
    console.log(`Amount due: $${member.amount_due}`);
    console.log(`Time remaining: ${minutesRemaining} minutes`);
    console.log(`Message: ${template.subject}`);
    
    // Record reminder sent
    await query(
      `INSERT INTO reminder_history 
       (group_id, member_id, reminder_number, sent_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [member.group_payment_id, member.id, reminderNumber]
    );
  }
  
  private getReminderTemplate(
    reminderNumber: number,
    isFinal: boolean,
    minutesRemaining: number
  ): { subject: string; urgency: string } {
    if (isFinal) {
      return {
        subject: `FINAL REMINDER: ${minutesRemaining} minutes left to secure your tickets!`,
        urgency: 'critical'
      };
    }
    
    switch (reminderNumber) {
      case 1:
        return {
          subject: `Reminder: Complete your ticket payment (${minutesRemaining} minutes remaining)`,
          urgency: 'normal'
        };
      case 2:
        return {
          subject: `Don't miss out! Only ${minutesRemaining} minutes left to pay`,
          urgency: 'high'
        };
      default:
        return {
          subject: `Payment reminder for your tickets`,
          urgency: 'normal'
        };
    }
  }
  
  async getReminderEffectiveness(venueId: string): Promise<{
    reminderStats: Array<{
      reminderNumber: number;
      conversionRate: number;
      averageResponseTime: number;
    }>;
    optimalTiming: {
      firstReminder: number;
      secondReminder: number;
      finalReminder: number;
    };
  }> {
    // Analyze reminder effectiveness
    const statsQuery = `
      SELECT 
        rh.reminder_number,
        COUNT(DISTINCT rh.member_id) as reminders_sent,
        COUNT(DISTINCT CASE WHEN m.paid = true THEN m.id END) as conversions,
        AVG(EXTRACT(EPOCH FROM (m.paid_at - rh.sent_at))/60) as avg_response_minutes
      FROM reminder_history rh
      JOIN group_payment_members m ON rh.member_id = m.id
      JOIN group_payments g ON m.group_payment_id = g.id
      JOIN events e ON g.event_id = e.id
      WHERE e.venue_id = $1
      GROUP BY rh.reminder_number
      ORDER BY rh.reminder_number
    `;
    
    const stats = await query(statsQuery, [venueId]);
    
    const reminderStats = stats.rows.map(row => ({
      reminderNumber: row.reminder_number,
      conversionRate: (row.conversions / row.reminders_sent) * 100,
      averageResponseTime: parseFloat(row.avg_response_minutes) || 0
    }));
    
    // Calculate optimal timing based on historical data
    // This is simplified - in production would use ML
    const optimalTiming = {
      firstReminder: 5,   // 5 minutes
      secondReminder: 8,  // 8 minutes
      finalReminder: 9.5  // 9.5 minutes
    };
    
    return {
      reminderStats,
      optimalTiming
    };
  }
}
```

### FILE: src/services/group/group-payment.service.ts
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
          member.ticketCount
        ];
        
        const memberResult = await client.query(memberQuery, memberValues);
        groupMembers.push({
          ...memberResult.rows[0],
          paid: false,
          remindersSent: 0
        });
      }
      
      await client.query('COMMIT');
      
      // Schedule expiry check
      await this.expiryQueue.add(
        'check-expiry',
        { groupId },
        { delay: 10 * 60 * 1000 } // 10 minutes
      );
      
      // Send initial invitations
      await this.sendGroupInvitations(groupPayment, groupMembers);
      
      return {
        ...groupPayment,
        members: groupMembers
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  
  async recordMemberPayment(
    groupId: string,
    memberId: string,
    paymentMethodId: string
  ): Promise<void> {
    const { client, release } = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get member details
      const memberQuery = `
        SELECT * FROM group_payment_members 
        WHERE id = $1 AND group_payment_id = $2
      `;
      const memberResult = await client.query(memberQuery, [memberId, groupId]);
      const member = memberResult.rows[0];
      
      if (!member) {
        throw new Error('Member not found');
      }
      
      if (member.paid) {
        throw new Error('Member already paid');
      }
      
      // Process payment (integrate with PaymentProcessorService)
      const paymentId = await this.processMemberPayment(
        member,
        paymentMethodId
      );
      
      // Update member status
      const updateQuery = `
        UPDATE group_payment_members
        SET paid = true,
            paid_at = CURRENT_TIMESTAMP,
            payment_id = $3
        WHERE id = $1 AND group_payment_id = $2
      `;
      await client.query(updateQuery, [memberId, groupId, paymentId]);
      
      // Check if all members have paid
      const statusCheck = await client.query(
        `SELECT COUNT(*) as unpaid FROM group_payment_members 
         WHERE group_payment_id = $1 AND paid = false`,
        [groupId]
      );
      
      if (parseInt(statusCheck.rows[0].unpaid) === 0) {
        // All paid - update group status
        await client.query(
          `UPDATE group_payments 
           SET status = $2, completed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [groupId, GroupPaymentStatus.COMPLETED]
        );
        
        // Trigger ticket purchase
        await this.completePurchase(groupId);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  
  async sendReminders(groupId: string): Promise<void> {
    const unpaidMembers = await this.getUnpaidMembers(groupId);
    
    for (const member of unpaidMembers) {
      if (member.remindersSent < 3) { // Max 3 reminders
        await this.reminderQueue.add('send-reminder', {
          groupId,
          memberId: member.id,
          email: member.email,
          name: member.name,
          amountDue: member.amountDue
        });
        
        // Update reminder count
        await query(
          `UPDATE group_payment_members 
           SET reminders_sent = reminders_sent + 1
           WHERE id = $1`,
          [member.id]
        );
      }
    }
  }
  
  async handleExpiredGroup(groupId: string): Promise<void> {
    const { client, release } = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get group details
      const group = await this.getGroupPayment(groupId);
      
      if (group.status !== GroupPaymentStatus.COLLECTING) {
        return; // Already processed
      }
      
      // Check paid members
      const paidMembers = group.members.filter(m => m.paid);
      
      if (paidMembers.length === 0) {
        // No one paid - cancel entirely
        await this.cancelGroup(groupId, 'expired_no_payment');
      } else {
        // Partial payment - process for those who paid
        await this.processPartialGroup(groupId, paidMembers);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  
  private setupQueues() {
    // Process reminder queue
    this.reminderQueue.process('send-reminder', async (job) => {
      const { email, name, amountDue } = job.data;
      
      // In production, integrate with email service
      console.log(`Sending reminder to ${name} (${email}) for $${amountDue}`);
      
      return { sent: true };
    });
    
    // Process expiry queue
    this.expiryQueue.process('check-expiry', async (job) => {
      const { groupId } = job.data;
      await this.handleExpiredGroup(groupId);
      return { processed: true };
    });
  }
  
  private async sendGroupInvitations(
    group: GroupPayment,
    members: GroupMember[]
  ): Promise<void> {
    for (const member of members) {
      const paymentLink = this.generatePaymentLink(group.id, member.id);
      
      // In production, send actual emails
      console.log(`Sending invitation to ${member.name} (${member.email})`);
      console.log(`Payment link: ${paymentLink}`);
      console.log(`Amount due: $${member.amountDue}`);
    }
  }
  
  private generatePaymentLink(groupId: string, memberId: string): string {
    // In production, generate secure payment links
    return `https://tickettoken.com/group-payment/${groupId}/${memberId}`;
  }
  
  private async processMemberPayment(
    member: any,
    paymentMethodId: string
  ): Promise<string> {
    // In production, integrate with PaymentProcessorService
    // For now, return mock payment ID
    return `payment_${uuidv4()}`;
  }
  
  private async completePurchase(groupId: string): Promise<void> {
    const group = await this.getGroupPayment(groupId);
    
    // In production, trigger actual ticket purchase
    console.log(`Completing purchase for group ${groupId}`);
    console.log(`Total amount: $${group.totalAmount}`);
    console.log(`Tickets:`, group.ticketSelections);
  }
  
  private async cancelGroup(groupId: string, reason: string): Promise<void> {
    await query(
      `UPDATE group_payments 
       SET status = $2, 
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $3
       WHERE id = $1`,
      [groupId, GroupPaymentStatus.CANCELLED, reason]
    );
  }
  
  private async processPartialGroup(
    groupId: string,
    paidMembers: GroupMember[]
  ): Promise<void> {
    // Update status to partially paid
    await query(
      `UPDATE group_payments 
       SET status = $2 
       WHERE id = $1`,
      [groupId, GroupPaymentStatus.PARTIALLY_PAID]
    );
    
    // Process tickets for paid members only
    console.log(`Processing partial group for ${paidMembers.length} members`);
    
    // Refund would be handled for unpaid tickets
  }
  
  private async getGroupPayment(groupId: string): Promise<GroupPayment> {
    const groupResult = await query(
      'SELECT * FROM group_payments WHERE id = $1',
      [groupId]
    );
    
    const membersResult = await query(
      'SELECT * FROM group_payment_members WHERE group_payment_id = $1',
      [groupId]
    );
    
    return {
      ...groupResult.rows[0],
      members: membersResult.rows
    };
  }
  
  private async getUnpaidMembers(groupId: string): Promise<GroupMember[]> {
    const result = await query(
      'SELECT * FROM group_payment_members WHERE group_payment_id = $1 AND paid = false',
      [groupId]
    );
    
    return result.rows;
  }
  
  async getGroupStatus(groupId: string): Promise<{
    group: GroupPayment;
    summary: {
      totalMembers: number;
      paidMembers: number;
      totalExpected: number;
      totalCollected: number;
      percentageCollected: number;
    };
  }> {
    const group = await this.getGroupPayment(groupId);
    
    const paidMembers = group.members.filter(m => m.paid);
    const totalCollected = paidMembers.reduce((sum, m) => sum + m.amountDue, 0);
    
    return {
      group,
      summary: {
        totalMembers: group.members.length,
        paidMembers: paidMembers.length,
        totalExpected: group.totalAmount,
        totalCollected,
        percentageCollected: (totalCollected / group.totalAmount) * 100
      }
    };
  }
}
```

### FILE: src/services/event-ordering.service.ts
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
          order_id,
          event_type,
          sequence_number,
          event_timestamp,
          stripe_event_id,
          idempotency_key,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.paymentId,
        event.orderId,
        event.eventType,
        sequenceNumber,
        event.eventTimestamp,
        event.stripeEventId,
        idempotencyKey,
        JSON.stringify(event.payload)
      ]);

      // Check if this is the next expected event
      const isInOrder = await this.checkEventOrder(client, event.paymentId, sequenceNumber);

      if (isInOrder) {
        // Process this event and any queued events
        await this.processEventInOrder(client, event);
        await this.processQueuedEvents(client, event.paymentId);
      } else {
        this.log.warn('Event received out of order, queuing for later', {
          paymentId: event.paymentId,
          sequenceNumber,
          eventType: event.eventType
        });
      }

      await client.query('COMMIT');

      return {
        sequenceNumber,
        processed: isInOrder
      };

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error('Failed to process payment event', {
        error,
        event
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async checkEventOrder(
    client: any,
    paymentId: string,
    sequenceNumber: number
  ): Promise<boolean> {
    // Get the last processed sequence number
    const result = await client.query(`
      SELECT MAX(sequence_number) as last_processed
      FROM payment_event_sequence
      WHERE payment_id = $1 AND processed_at IS NOT NULL
    `, [paymentId]);

    const lastProcessed = result.rows[0].last_processed || 0;
    return sequenceNumber === lastProcessed + 1;
  }

  private async processEventInOrder(client: any, event: PaymentEvent): Promise<void> {
    // Get current payment state
    const paymentResult = await client.query(`
      SELECT status, version FROM payment_intents WHERE id = $1
    `, [event.paymentId]);

    if (paymentResult.rows.length === 0) {
      throw new Error(`Payment not found: ${event.paymentId}`);
    }

    const currentStatus = paymentResult.rows[0].status;
    const currentVersion = paymentResult.rows[0].version;

    // Determine new state based on event
    const newStatus = this.getNewStatus(event.eventType, currentStatus);

    // Validate state transition
    const isValid = await client.query(
      'SELECT validate_payment_state_transition($1, $2, $3) as valid',
      [currentStatus, newStatus, event.eventType]
    );

    if (!isValid.rows[0].valid) {
      this.log.warn('Invalid state transition', {
        paymentId: event.paymentId,
        from: currentStatus,
        to: newStatus,
        event: event.eventType
      });
      
      // Mark event as processed but don't change state
      await client.query(`
        UPDATE payment_event_sequence
        SET processed_at = NOW()
        WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
      `, [event.paymentId, event.eventType, event.idempotencyKey]);
      
      return;
    }

    // Update payment state with optimistic locking
    const updateResult = await client.query(`
      UPDATE payment_intents
      SET status = $1,
          version = version + 1,
          last_event_timestamp = $2,
          updated_at = NOW()
      WHERE id = $3 AND version = $4
    `, [newStatus, event.eventTimestamp, event.paymentId, currentVersion]);

    if (updateResult.rowCount === 0) {
      throw new Error('Concurrent update detected');
    }

    // Record state transition
    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id,
        order_id,
        from_state,
        to_state,
        metadata
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      event.paymentId,
      event.orderId,
      currentStatus,
      newStatus,
      JSON.stringify({
        event_type: event.eventType,
        event_timestamp: event.eventTimestamp,
        stripe_event_id: event.stripeEventId
      })
    ]);

    // Mark event as processed
    await client.query(`
      UPDATE payment_event_sequence
      SET processed_at = NOW()
      WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
    `, [event.paymentId, event.eventType, event.idempotencyKey]);

    // Write to outbox for downstream services
    await client.query(`
      INSERT INTO outbox (
        aggregate_id,
        aggregate_type,
        event_type,
        payload
      ) VALUES ($1, $2, $3, $4)
    `, [
      event.orderId || event.paymentId,
      'payment',
      event.eventType,
      JSON.stringify({
        paymentId: event.paymentId,
        orderId: event.orderId,
        status: newStatus,
        previousStatus: currentStatus,
        ...event.payload
      })
    ]);

    this.log.info('Payment event processed in order', {
      paymentId: event.paymentId,
      eventType: event.eventType,
      fromState: currentStatus,
      toState: newStatus
    });
  }

  private async processQueuedEvents(client: any, paymentId: string): Promise<void> {
    // Process any events that were waiting for this one
    const queuedEvents = await client.query(`
      SELECT * FROM payment_event_sequence
      WHERE payment_id = $1
        AND processed_at IS NULL
      ORDER BY sequence_number ASC
      LIMIT 10
    `, [paymentId]);

    for (const queuedEvent of queuedEvents.rows) {
      const isInOrder = await this.checkEventOrder(client, paymentId, queuedEvent.sequence_number);
      
      if (isInOrder) {
        await this.processEventInOrder(client, {
          paymentId: queuedEvent.payment_id,
          orderId: queuedEvent.order_id,
          eventType: queuedEvent.event_type,
          eventTimestamp: queuedEvent.event_timestamp,
          stripeEventId: queuedEvent.stripe_event_id,
          idempotencyKey: queuedEvent.idempotency_key,
          payload: queuedEvent.payload
        });
      } else {
        // Stop processing as we hit another gap
        break;
      }
    }
  }

  private getNewStatus(eventType: string, currentStatus: string): string {
    const statusMap: Record<string, string> = {
      'payment.processing': 'PROCESSING',
      'payment.succeeded': 'PAID',
      'payment_intent.succeeded': 'PAID',
      'payment.failed': 'PAYMENT_FAILED',
      'payment_intent.payment_failed': 'PAYMENT_FAILED',
      'payment.cancelled': 'CANCELLED',
      'refund.initiated': 'REFUNDING',
      'refund.partial': 'PARTIALLY_REFUNDED',
      'refund.completed': 'REFUNDED',
      'refund.failed': currentStatus === 'REFUNDING' ? 'PAID' : currentStatus
    };

    return statusMap[eventType] || currentStatus;
  }

  private generateIdempotencyKey(event: PaymentEvent): string {
    const data = `${event.paymentId}-${event.eventType}-${event.eventTimestamp.getTime()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Background processor for stuck events
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processStuckEvents();
      } catch (error) {
        this.log.error('Background processor error', error);
      }
    }, 30000); // Run every 30 seconds
  }

  private async processStuckEvents(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find payments with unprocessed events older than 5 minutes
      const stuckPayments = await client.query(`
        SELECT DISTINCT payment_id
        FROM payment_event_sequence
        WHERE processed_at IS NULL
          AND created_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      for (const row of stuckPayments.rows) {
        await this.reprocessPaymentEvents(row.payment_id);
      }

    } finally {
      client.release();
    }
  }

  private async reprocessPaymentEvents(paymentId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get all unprocessed events in order
      const events = await client.query(`
        SELECT * FROM payment_event_sequence
        WHERE payment_id = $1
          AND processed_at IS NULL
        ORDER BY sequence_number ASC
      `, [paymentId]);

      this.log.info(`Reprocessing ${events.rows.length} stuck events for payment ${paymentId}`);

      for (const event of events.rows) {
        const isInOrder = await this.checkEventOrder(client, paymentId, event.sequence_number);
        
        if (isInOrder) {
          await this.processEventInOrder(client, {
            paymentId: event.payment_id,
            orderId: event.order_id,
            eventType: event.event_type,
            eventTimestamp: event.event_timestamp,
            stripeEventId: event.stripe_event_id,
            idempotencyKey: event.idempotency_key,
            payload: event.payload
          });
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error(`Failed to reprocess events for payment ${paymentId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * Handle idempotent payment operations
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operation: string,
    request: any,
    handler: () => Promise<T>
  ): Promise<T> {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing idempotent response
      const existing = await client.query(`
        SELECT response, status_code
        FROM payment_idempotency
        WHERE idempotency_key = $1
      `, [idempotencyKey]);

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        
        // Verify request hasn't changed
        const existingHash = await client.query(`
          SELECT request_hash FROM payment_idempotency WHERE idempotency_key = $1
        `, [idempotencyKey]);

        if (existingHash.rows[0].request_hash !== requestHash) {
          throw new Error('Idempotency key reused with different request');
        }

        await client.query('COMMIT');
        
        this.log.info('Returning idempotent response', { idempotencyKey, operation });
        return row.response as T;
      }

      // Execute the operation
      const result = await handler();

      // Store idempotent response
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await client.query(`
        INSERT INTO payment_idempotency (
          idempotency_key,
          operation,
          request_hash,
          response,
          status_code,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        idempotencyKey,
        operation,
        requestHash,
        JSON.stringify(result),
        200,
        expiresAt
      ]);

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### FILE: src/services/webhookProcessor.ts
```typescript
import crypto from 'crypto';
import { DatabaseService } from './databaseService';
import { PaymentService } from './paymentService';
import { logger } from '../utils/logger';

const log = logger.child({ component: 'WebhookProcessor' });

class WebhookProcessorClass {
  async processStripeWebhook(webhookId: string) {
    const db = DatabaseService.getPool();
    
    // Get webhook from inbox
    const result = await db.query(
      `SELECT * FROM webhook_inbox WHERE webhook_id = $1`,
      [webhookId]
    );
    
    if (result.rows.length === 0) {
      log.error('Webhook not found', { webhookId });
      return;
    }
    
    const webhook = result.rows[0];
    const payload = webhook.payload;
    
    try {
      // Process based on event type
      switch (payload.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSucceeded(payload.data.object);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailed(payload.data.object);
          break;
        default:
          log.info('Unhandled webhook type', { type: payload.type });
      }
      
      // Mark as processed
      await db.query(
        `UPDATE webhook_inbox 
         SET processed_at = NOW() 
         WHERE webhook_id = $1`,
        [webhookId]
      );
      
    } catch (error) {
      log.error('Failed to process webhook', { webhookId, error });
      
      // Update attempts
      await db.query(
        `UPDATE webhook_inbox 
         SET attempts = attempts + 1, error = $2
         WHERE webhook_id = $1`,
        [webhookId, (error as Error).message || String(error)]
      );
    }
  }
  
  private async handlePaymentSucceeded(paymentIntent: any) {
    log.info('Processing payment success', { id: paymentIntent.id });
    await PaymentService.confirmPayment(paymentIntent.id);
  }
  
  private async handlePaymentFailed(paymentIntent: any) {
    log.info('Processing payment failure', { id: paymentIntent.id });
    // Handle failure - trigger refund flow
  }
  
  verifyStripeSignature(payload: string, signature: string): boolean {
    // When you have a real Stripe key, this will use Stripe's verification
    // For now, return true for mock
    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return true; // Mock mode
    }
    
    // Real Stripe verification would go here
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    try {
      stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
      return true;
    } catch (err) {
      return false;
    }
  }
}

export const WebhookProcessor = new WebhookProcessorClass();
```

### FILE: src/services/launch-features.ts
```typescript
// IP Geolocation Service
export class IPGeolocationService {
  // Mock for dev, replace with real API in production
  async getLocation(ip: string) {
    // In production: use ipapi.co or similar
    const mockLocations: Record<string, any> = {
      '0.0.0.0': { country: 'US', city: 'Nashville', risk: 'low' },
      '192.168.1.1': { country: 'US', city: 'Memphis', risk: 'low' }
    };

    return mockLocations[ip] || {
      country: 'US',
      city: 'Unknown',
      risk: 'medium',
      mockData: true
    };
  }

  isHighRiskCountry(country: string): boolean {
    const highRiskCountries = ['XX', 'YY']; // Add real ones later
    return highRiskCountries.includes(country);
  }
}

// Device Fingerprinting
export class DeviceFingerprintService {
  generateFingerprint(deviceData: any): string {
    // Simple version for launch
    const data = `${deviceData.userAgent}_${deviceData.screenResolution}_${deviceData.timezone}`;
    return Buffer.from(data).toString('base64').substring(0, 16);
  }

  async checkDevice(fingerprint: string): Promise<any> {
    // In production: check database
    return {
      trusted: true,
      previousUses: Math.floor(Math.random() * 5),
      mockData: true
    };
  }
}

// Blacklist Service
export class BlacklistService {
  private blacklists = {
    users: new Set<string>(),
    emails: new Set<string>(),
    ips: new Set<string>(),
    cards: new Set<string>()
  };

  async checkBlacklists(data: {
    userId?: string,
    email?: string,
    ip?: string,
    cardLast4?: string
  }): Promise<{blocked: boolean, reason?: string}> {
    if (data.userId && this.blacklists.users.has(data.userId)) {
      return { blocked: true, reason: 'User blacklisted' };
    }
    if (data.email && this.blacklists.emails.has(data.email)) {
      return { blocked: true, reason: 'Email blacklisted' };
    }
    if (data.ip && this.blacklists.ips.has(data.ip)) {
      return { blocked: true, reason: 'IP blacklisted' };
    }
    return { blocked: false };
  }

  addToBlacklist(type: 'user' | 'email' | 'ip' | 'card', value: string) {
    switch(type) {
      case 'user': this.blacklists.users.add(value); break;
      case 'email': this.blacklists.emails.add(value); break;
      case 'ip': this.blacklists.ips.add(value); break;
      case 'card': this.blacklists.cards.add(value); break;
    }
  }
}

// Venue Subscription Plans
export class VenueSubscriptionService {
  private plans = {
    starter: {
      id: 'starter',
      name: 'Starter',
      price: 99,
      features: ['Up to 100 tickets/month', 'Basic analytics', 'Email support'],
      feePercentage: 8.2
    },
    pro: {
      id: 'pro',
      name: 'Pro',
      price: 499,
      features: ['Up to 1000 tickets/month', 'Advanced analytics', 'Priority support'],
      feePercentage: 7.9
    },
    enterprise: {
      id: 'enterprise',
      name: 'Enterprise',
      price: 999,
      features: ['Unlimited tickets', 'Custom analytics', 'Dedicated support'],
      feePercentage: 7.5
    }
  };

  getPlans() {
    return Object.values(this.plans);
  }

  async subscribeVenue(venueId: string, planId: string) {
    const plan = this.plans[planId as keyof typeof this.plans];
    if (!plan) throw new Error('Invalid plan');

    // In production: Create Stripe subscription
    return {
      subscriptionId: `sub_${Date.now()}`,
      venueId,
      plan,
      status: 'active',
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
  }

  getFeePercentage(planId: string): number {
    const plan = this.plans[planId as keyof typeof this.plans];
    return plan?.feePercentage || 8.2;
  }
}

// Multi-currency Support with integer-based math to prevent drift
export class CurrencyService {
  // Store rates as integers (multiplied by 10000 for 4 decimal precision)
  // This prevents floating point drift in currency calculations
  private ratesInCents = {
    USD: 10000,  // 1.0000 * 10000
    EUR: 8500,   // 0.8500 * 10000
    GBP: 7300,   // 0.7300 * 10000
    CAD: 12500   // 1.2500 * 10000
  };

  async convert(amount: number, from: string, to: string): Promise<number> {
    // Convert amount to cents (integer) to avoid float precision issues
    const amountInCents = Math.round(amount * 100);
    
    // Get rates as integers
    const fromRate = this.ratesInCents[from as keyof typeof this.ratesInCents];
    const toRate = this.ratesInCents[to as keyof typeof this.ratesInCents];
    
    if (!fromRate || !toRate) {
      throw new Error(`Unsupported currency: ${!fromRate ? from : to}`);
    }
    
    // Convert to USD base (all calculations in integers)
    // amountInCents * 10000 / fromRate gives us USD cents * 10000 / rate
    const usdCentsTimesBase = (amountInCents * 10000) / fromRate;
    
    // Convert from USD to target currency
    // usdCents * toRate / 10000 gives us target currency in cents
    const targetCents = Math.round((usdCentsTimesBase * toRate) / 10000);
    
    // Convert back to dollars (2 decimal places)
    return targetCents / 100;
  }

  // Helper method to convert with explicit rounding for display
  async convertForDisplay(amount: number, from: string, to: string): Promise<string> {
    const converted = await this.convert(amount, from, to);
    // Ensure exactly 2 decimal places for display
    return converted.toFixed(2);
  }

  getSupportedCurrencies() {
    return Object.keys(this.ratesInCents);
  }

  // Get exchange rate between two currencies (for display purposes)
  getExchangeRate(from: string, to: string): number {
    const fromRate = this.ratesInCents[from as keyof typeof this.ratesInCents];
    const toRate = this.ratesInCents[to as keyof typeof this.ratesInCents];
    
    if (!fromRate || !toRate) {
      throw new Error(`Unsupported currency: ${!fromRate ? from : to}`);
    }
    
    // Calculate rate with 4 decimal precision
    return Math.round((toRate / fromRate) * 10000) / 10000;
  }
}

// Instant Payout Service
export class InstantPayoutService {
  async requestPayout(venueId: string, amount: number, instant: boolean = false) {
    // Use integer math for fee calculation
    const amountInCents = Math.round(amount * 100);
    const feeCents = instant ? Math.round(amountInCents * 0.01) : 0; // 1% fee for instant
    const netAmountCents = amountInCents - feeCents;

    return {
      payoutId: `po_${Date.now()}`,
      venueId,
      amount: netAmountCents / 100,
      fee: feeCents / 100,
      type: instant ? 'instant' : 'standard',
      estimatedArrival: instant ? 'Within 30 minutes' : '1-2 business days',
      status: 'processing'
    };
  }
}
```

### FILE: src/services/marketplace/royalty-splitter.service.ts
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
  
  private async getEventRoyaltySettings(eventId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM event_royalty_settings WHERE event_id = $1',
      [eventId]
    );
    
    return result.rows[0];
  }
  
  async getRoyaltyReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRoyalties: number;
    transactionCount: number;
    averageRoyalty: number;
    byEvent: Array<{
      eventId: string;
      eventName: string;
      royalties: number;
      transactions: number;
    }>;
  }> {
    // Get total royalties for venue
    const totalQuery = `
      SELECT 
        COUNT(*) as transaction_count,
        SUM(amount) as total_royalties,
        AVG(amount) as average_royalty
      FROM royalty_distributions
      WHERE recipient_id = $1 
        AND recipient_type = 'venue'
        AND created_at BETWEEN $2 AND $3
    `;
    
    const totalResult = await query(totalQuery, [venueId, startDate, endDate]);
    
    // Get breakdown by event
    const byEventQuery = `
      SELECT 
        e.id as event_id,
        e.name as event_name,
        COUNT(rd.id) as transactions,
        SUM(rd.amount) as royalties
      FROM royalty_distributions rd
      JOIN payment_transactions pt ON rd.transaction_id = pt.id
      JOIN events e ON pt.event_id = e.id
      WHERE rd.recipient_id = $1 
        AND rd.recipient_type = 'venue'
        AND rd.created_at BETWEEN $2 AND $3
      GROUP BY e.id, e.name
      ORDER BY royalties DESC
    `;
    
    const byEventResult = await query(byEventQuery, [venueId, startDate, endDate]);
    
    return {
      totalRoyalties: parseFloat(totalResult.rows[0].total_royalties || 0),
      transactionCount: parseInt(totalResult.rows[0].transaction_count || 0),
      averageRoyalty: parseFloat(totalResult.rows[0].average_royalty || 0),
      byEvent: byEventResult.rows
    };
  }
}
```

### FILE: src/services/marketplace/escrow.service.ts
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
    );

    if (paymentIntent.status === 'requires_capture') {
      await this.updateEscrowStatus(escrowId, EscrowStatus.FUNDED);
      await this.startReleaseMonitoring(escrowId);
      return this.getEscrow(escrowId);
    } else {
      throw new Error('Payment confirmation failed');
    }
  }

  async releaseEscrow(escrowId: string): Promise<void> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const escrow = await this.getEscrow(escrowId);

      if (escrow.status !== EscrowStatus.FUNDED) {
        throw new Error('Escrow not in funded state');
      }

      const conditionsMet = await this.checkReleaseConditions(escrow.id);
      if (!conditionsMet) {
        throw new Error('Release conditions not met');
      }

      const paymentIntent = await this.stripe.paymentIntents.capture(
        escrow.stripePaymentIntentId
      );

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment capture failed');
      }

      // Create payout records (amounts in cents)
      await TransactionModel.create({
        userId: escrow.sellerId,
        amount: escrow.sellerPayout,
        status: TransactionStatus.COMPLETED,
        metadata: { escrowId, role: 'seller' }
      });

      const listing = await this.getListing(escrow.listingId);
      await VenueBalanceModel.updateBalance(
        listing.venueId,
        escrow.venueRoyalty,
        'available'
      );

      await this.updateEscrowStatus(escrowId, EscrowStatus.RELEASED);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async refundEscrow(escrowId: string, reason: string): Promise<void> {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status === EscrowStatus.RELEASED) {
      throw new Error('Escrow already released');
    }

    if (escrow.status === EscrowStatus.REFUNDED) {
      throw new Error('Escrow already refunded');
    }

    if (escrow.status === EscrowStatus.FUNDED) {
      await this.stripe.refunds.create({
        payment_intent: escrow.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: { escrowId, refundReason: reason }
      });
    } else {
      await this.stripe.paymentIntents.cancel(escrow.stripePaymentIntentId);
    }

    await this.updateEscrowStatus(escrowId, EscrowStatus.REFUNDED);
  }

  private calculatePaymentSplits(
    priceCents: number,
    venueRoyaltyPercentage: number
  ): {
    sellerPayout: number;
    venueRoyalty: number;
    platformFee: number;
  } {
    // Convert percentages to basis points
    const venueRoyaltyBps = Math.round(venueRoyaltyPercentage * 100);
    const platformFeeBps = 500; // 5%

    const venueRoyaltyCents = percentOfCents(priceCents, venueRoyaltyBps);
    const platformFeeCents = percentOfCents(priceCents, platformFeeBps);
    const sellerPayoutCents = priceCents - venueRoyaltyCents - platformFeeCents;

    return {
      sellerPayout: sellerPayoutCents,
      venueRoyalty: venueRoyaltyCents,
      platformFee: platformFeeCents
    };
  }

  private async setReleaseConditions(client: any, escrowId: string): Promise<void> {
    const conditions = [
      { type: 'nft_transferred', required: true },
      { type: 'cooling_period', required: true, duration: 600 }
    ];

    for (const condition of conditions) {
      await client.query(
        `INSERT INTO escrow_release_conditions
         (escrow_id, condition_type, required, metadata)
         VALUES ($1, $2, $3, $4)`,
        [escrowId, condition.type, condition.required, JSON.stringify(condition)]
      );
    }
  }

  private async checkReleaseConditions(escrowId: string): Promise<boolean> {
    const result = await query(
      `SELECT * FROM escrow_release_conditions
       WHERE escrow_id = $1 AND required = true`,
      [escrowId]
    );

    return result.rows.every((condition: any) => condition.satisfied);
  }

  private async startReleaseMonitoring(escrowId: string): Promise<void> {
    console.log(`Started monitoring release conditions for escrow ${escrowId}`);
  }

  private async getEscrow(escrowId: string): Promise<ExtendedEscrowTransaction> {
    const result = await query(
      'SELECT * FROM payment_escrows WHERE id = $1',
      [escrowId]
    );

    if (result.rows.length === 0) {
      throw new Error('Escrow not found');
    }

    return result.rows[0];
  }

  private async getListing(listingId: string): Promise<any> {
    return { venueId: 'mock-venue-id' };
  }

  private async updateEscrowStatus(
    escrowId: string,
    status: EscrowStatus
  ): Promise<void> {
    await query(
      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [escrowId, status]
    );
  }
}
```

### FILE: src/services/marketplace/price-enforcer.service.ts
```typescript
import { query } from '../../config/database';
import { ResaleListing } from '../../types';

export class PriceEnforcerService {
  async validateListingPrice(
    ticketId: string,
    listingPrice: number,
    venueId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    originalPrice?: number;
    maxAllowedPrice?: number;
    minAllowedPrice?: number;
  }> {
    // Get original ticket price
    const ticket = await this.getTicket(ticketId);
    const originalPrice = ticket.price;
    
    // Get venue price cap settings
    const priceRules = await this.getVenuePriceRules(venueId);
    
    // Calculate allowed price range
    const maxMarkup = priceRules?.maxMarkupPercentage ?? 150; // Default 150% markup
    const minMarkdown = priceRules?.minMarkdownPercentage ?? 50; // Can't sell below 50% of face value
    
    const maxAllowedPrice = originalPrice * (maxMarkup / 100);
    const minAllowedPrice = originalPrice * (minMarkdown / 100);
    
    // Validate listing price
    if (listingPrice > maxAllowedPrice) {
      return {
        valid: false,
        reason: `Price exceeds maximum allowed markup of ${maxMarkup - 100}%`,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    if (listingPrice < minAllowedPrice) {
      return {
        valid: false,
        reason: `Price below minimum allowed price (${minMarkdown}% of face value)`,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    // Check for suspicious pricing patterns
    const suspiciousPattern = await this.checkSuspiciousPricing(
      listingPrice,
      originalPrice,
      venueId
    );
    
    if (suspiciousPattern) {
      return {
        valid: false,
        reason: suspiciousPattern.reason,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    return {
      valid: true,
      originalPrice,
      maxAllowedPrice,
      minAllowedPrice
    };
  }
  
  async enforceDynamicPriceCaps(
    eventId: string,
    currentDemand: number
  ): Promise<{
    maxMarkupPercentage: number;
    reason: string;
  }> {
    // Get event details
    const event = await this.getEvent(eventId);
    const daysUntilEvent = this.getDaysUntilEvent(event.date);
    
    let maxMarkup = 150; // Base 150% markup
    let reason = 'Standard pricing rules';
    
    // Adjust based on time until event
    if (daysUntilEvent <= 1) {
      maxMarkup = 200; // Allow higher markup for last-minute sales
      reason = 'Last-minute pricing allowed';
    } else if (daysUntilEvent <= 7) {
      maxMarkup = 175;
      reason = 'Week-of-event pricing';
    }
    
    // Adjust based on demand
    if (currentDemand > 0.9) { // 90% sold
      maxMarkup = Math.min(maxMarkup + 50, 300); // Cap at 300%
      reason = 'High demand adjustment';
    }
    
    // Special events can have different rules
    if (event.category === 'charity') {
      maxMarkup = 100; // No markup for charity events
      reason = 'Charity event - no markup allowed';
    }
    
    return {
      maxMarkupPercentage: maxMarkup,
      reason
    };
  }
  
  private async checkSuspiciousPricing(
    listingPrice: number,
    originalPrice: number,
    venueId: string
  ): Promise<{ reason: string } | null> {
    // Check for round number scalping (e.g., $50 ticket listed at exactly $500)
    if (listingPrice % 100 === 0 && listingPrice / originalPrice > 5) {
      return { reason: 'Suspicious round number pricing detected' };
    }
    
    // Check for pattern of high markups from venue
    const recentListings = await this.getRecentListings(venueId, 24); // Last 24 hours
    const highMarkupCount = recentListings.filter(
      listing => listing.price / listing.originalPrice > 2
    ).length;
    
    if (highMarkupCount > 10) {
      return { reason: 'Unusual pattern of high markups detected' };
    }
    
    return null;
  }
  
  private async getTicket(ticketId: string): Promise<any> {
    // This would integrate with ticket service
    return { price: 50 }; // Mock
  }
  
  private async getEvent(eventId: string): Promise<any> {
    // This would integrate with event service
    return { date: new Date(), category: 'concert' }; // Mock
  }
  
  private async getVenuePriceRules(venueId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM venue_price_rules WHERE venue_id = $1',
      [venueId]
    );
    
    return result.rows[0];
  }
  
  private async getRecentListings(venueId: string, hours: number): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT * FROM resale_listings 
       WHERE venue_id = $1 AND created_at > $2`,
      [venueId, since]
    );
    
    return result.rows;
  }
  
  private getDaysUntilEvent(eventDate: Date): number {
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  async getPricingAnalytics(venueId: string): Promise<{
    averageMarkup: number;
    medianMarkup: number;
    violationsBlocked: number;
    totalListings: number;
  }> {
    const analyticsQuery = `
      SELECT 
        AVG((price - original_price) / original_price * 100) as avg_markup,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (price - original_price) / original_price * 100) as median_markup,
        COUNT(*) FILTER (WHERE status = 'blocked_price_violation') as violations_blocked,
        COUNT(*) as total_listings
      FROM resale_listings
      WHERE venue_id = $1
        AND created_at > CURRENT_DATE - INTERVAL '30 days'
    `;
    
    const result = await query(analyticsQuery, [venueId]);
    
    return {
      averageMarkup: parseFloat(result.rows[0].avg_markup || 0),
      medianMarkup: parseFloat(result.rows[0].median_markup || 0),
      violationsBlocked: parseInt(result.rows[0].violations_blocked || 0),
      totalListings: parseInt(result.rows[0].total_listings || 0)
    };
  }
}
```

### FILE: src/services/fraud/device-fingerprint.service.ts
```typescript
import crypto from 'crypto';
import { query } from '../../config/database';

export class DeviceFingerprintService {
  generateFingerprint(deviceData: {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    plugins?: string[];
    fonts?: string[];
    canvas?: string;
    webgl?: string;
  }): string {
    // Create a stable fingerprint from device characteristics
    const fingerprintData = {
      ua: deviceData.userAgent,
      sr: deviceData.screenResolution,
      tz: deviceData.timezone,
      lang: deviceData.language,
      plat: deviceData.platform,
      plugins: (deviceData.plugins || []).sort().join(','),
      fonts: (deviceData.fonts || []).slice(0, 20).sort().join(','),
      canvas: deviceData.canvas ? deviceData.canvas.substring(0, 50) : '',
      webgl: deviceData.webgl ? deviceData.webgl.substring(0, 50) : ''
    };
    
    const fingerprintString = JSON.stringify(fingerprintData);
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
    
    return hash;
  }
  
  async recordDeviceActivity(
    deviceFingerprint: string,
    userId: string,
    activity: string,
    metadata?: any
  ): Promise<void> {
    await query(
      `INSERT INTO device_activity 
       (device_fingerprint, user_id, activity_type, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [deviceFingerprint, userId, activity, JSON.stringify(metadata || {})]
    );
  }
  
  async getDeviceRiskScore(deviceFingerprint: string): Promise<{
    score: number;
    factors: Array<{
      factor: string;
      weight: number;
      value: any;
    }>;
  }> {
    const factors = [];
    let totalScore = 0;
    
    // Factor 1: Number of accounts associated
    const accountCount = await this.getAssociatedAccountCount(deviceFingerprint);
    if (accountCount > 1) {
      const accountFactor = {
        factor: 'multiple_accounts',
        weight: 0.3,
        value: accountCount
      };
      factors.push(accountFactor);
      totalScore += Math.min(accountCount / 5, 1) * accountFactor.weight;
    }
    
    // Factor 2: Suspicious activity patterns
    const suspiciousActivity = await this.getSuspiciousActivityCount(deviceFingerprint);
    if (suspiciousActivity > 0) {
      const activityFactor = {
        factor: 'suspicious_activity',
        weight: 0.25,
        value: suspiciousActivity
      };
      factors.push(activityFactor);
      totalScore += Math.min(suspiciousActivity / 10, 1) * activityFactor.weight;
    }
    
    // Factor 3: Geographic anomalies
    const geoAnomalies = await this.checkGeographicAnomalies(deviceFingerprint);
    if (geoAnomalies.hasAnomalies) {
      const geoFactor = {
        factor: 'geographic_anomalies',
        weight: 0.2,
        value: geoAnomalies
      };
      factors.push(geoFactor);
      totalScore += geoFactor.weight;
    }
    
    // Factor 4: Device age
    const deviceAge = await this.getDeviceAge(deviceFingerprint);
    if (deviceAge < 24) { // Less than 24 hours old
      const ageFactor = {
        factor: 'new_device',
        weight: 0.15,
        value: `${deviceAge} hours`
      };
      factors.push(ageFactor);
      totalScore += (1 - deviceAge / 24) * ageFactor.weight;
    }
    
    // Factor 5: Failed payment attempts
    const failedAttempts = await this.getFailedPaymentAttempts(deviceFingerprint);
    if (failedAttempts > 2) {
      const failedFactor = {
        factor: 'failed_payments',
        weight: 0.1,
        value: failedAttempts
      };
      factors.push(failedFactor);
      totalScore += Math.min(failedAttempts / 5, 1) * failedFactor.weight;
    }
    
    return {
      score: Math.min(totalScore, 1),
      factors
    };
  }
  
  private async getAssociatedAccountCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async getSuspiciousActivityCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM device_activity
       WHERE device_fingerprint = $1
         AND activity_type IN ('failed_payment', 'fraud_detected', 'account_locked')
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async checkGeographicAnomalies(deviceFingerprint: string): Promise<{
    hasAnomalies: boolean;
    details?: any;
  }> {
    // Check for impossible travel scenarios
    const geoQuery = `
      SELECT 
        da1.timestamp as time1,
        da1.metadata->>'location' as location1,
        da2.timestamp as time2,
        da2.metadata->>'location' as location2
      FROM device_activity da1
      JOIN device_activity da2 ON da1.device_fingerprint = da2.device_fingerprint
      WHERE da1.device_fingerprint = $1
        AND da2.timestamp > da1.timestamp
        AND da2.timestamp < da1.timestamp + INTERVAL '1 hour'
        AND da1.metadata->>'location' != da2.metadata->>'location'
      ORDER BY da1.timestamp DESC
      LIMIT 1
    `;
    
    const result = await query(geoQuery, [deviceFingerprint]);
    
    if (result.rows.length > 0) {
      const anomaly = result.rows[0];
      // In production, calculate actual distance between locations
      return {
        hasAnomalies: true,
        details: {
          location1: anomaly.location1,
          location2: anomaly.location2,
          timeDifference: anomaly.time2 - anomaly.time1
        }
      };
    }
    
    return { hasAnomalies: false };
  }
  
  private async getDeviceAge(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT MIN(timestamp) as first_seen
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    if (result.rows[0].first_seen) {
      const ageMs = Date.now() - new Date(result.rows[0].first_seen).getTime();
      return ageMs / (1000 * 60 * 60); // Convert to hours
    }
    
    return 0;
  }
  
  private async getFailedPaymentAttempts(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM payment_transactions
       WHERE device_fingerprint = $1
         AND status = 'failed'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async compareFingerprints(fp1: string, fp2: string): Promise<{
    similar: boolean;
    similarity: number;
  }> {
    // Simple comparison - in production would use more sophisticated matching
    if (fp1 === fp2) {
      return { similar: true, similarity: 1.0 };
    }
    
    // Check if fingerprints are similar (could be same device with minor changes)
    const distance = this.calculateHammingDistance(fp1, fp2);
    const similarity = 1 - (distance / Math.max(fp1.length, fp2.length));
    
    return {
      similar: similarity > 0.85,
      similarity
    };
  }
  
  private calculateHammingDistance(str1: string, str2: string): number {
    let distance = 0;
    const length = Math.min(str1.length, str2.length);
    
    for (let i = 0; i < length; i++) {
      if (str1[i] !== str2[i]) distance++;
    }
    
    distance += Math.abs(str1.length - str2.length);
    
    return distance;
  }
}
```

### FILE: src/services/fraud/scalper-detector.service.ts
```typescript
import { query } from '../../config/database';
import { FraudCheck, FraudSignal, SignalType, FraudDecision } from '../../types';
import { createClient } from 'redis';
import { config } from '../../config';

export class ScalperDetectorService {
  private redis: any;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private knownScalperPatterns: Set<string>;

  constructor() {
    this.knownScalperPatterns = new Set([
      'rapid_multi_event_purchases',
      'consistent_high_markup_resales',
      'bot_like_behavior',
      'multiple_payment_methods',
      'suspicious_account_creation'
    ]);
    
    this.initRedis();
  }

  private initRedis() {
    this.connectionPromise = this.connectRedis();
  }

  private async connectRedis(): Promise<void> {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.on('error', (err: any) => {
      console.error('Redis Client Error (Scalper):', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      console.log('Redis connected (Scalper)');
      this.isConnected = true;
    });

    try {
      await this.redis.connect();
      this.isConnected = true;
    } catch (err) {
      console.error('Failed to connect to Redis (Scalper):', err);
      this.isConnected = false;
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
    return this.isConnected;
  }

  async detectScalper(
    userId: string,
    purchaseData: any,
    deviceFingerprint: string
  ): Promise<FraudCheck> {
    // Ensure Redis is connected but don't block if it's not
    await this.ensureConnection();
    
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    // Check 1: Purchase velocity
    const velocitySignal = await this.checkPurchaseVelocity(userId);
    if (velocitySignal) {
      signals.push(velocitySignal);
      totalScore += velocitySignal.confidence * 0.3;
    }

    // Check 2: Resale patterns
    const resaleSignal = await this.checkResalePatterns(userId);
    if (resaleSignal) {
      signals.push(resaleSignal);
      totalScore += resaleSignal.confidence * 0.25;
    }

    // Check 3: Multiple accounts
    const multiAccountSignal = await this.checkMultipleAccounts(deviceFingerprint);
    if (multiAccountSignal) {
      signals.push(multiAccountSignal);
      totalScore += multiAccountSignal.confidence * 0.2;
    }

    // Check 4: High-demand targeting
    const demandSignal = await this.checkHighDemandTargeting(userId);
    if (demandSignal) {
      signals.push(demandSignal);
      totalScore += demandSignal.confidence * 0.15;
    }

    // Check 5: Known scalper database
    const knownScalperSignal = await this.checkKnownScalperDatabase(userId, deviceFingerprint);
    if (knownScalperSignal) {
      signals.push(knownScalperSignal);
      totalScore += knownScalperSignal.confidence * 0.1;
    }

    // Determine decision
    const decision = this.determineDecision(totalScore, signals);

    const fraudCheck: FraudCheck = {
      userId,
      ipAddress: purchaseData.ipAddress,
      deviceFingerprint,
      score: totalScore,
      signals,
      decision,
      timestamp: new Date()
    };

    // Store check result
    await this.storeFraudCheck(fraudCheck);

    return fraudCheck;
  }

  private async checkPurchaseVelocity(userId: string): Promise<FraudSignal | null> {
    // Check purchases in last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const velocityQuery = `
      SELECT
        COUNT(*) as purchase_count,
        COUNT(DISTINCT event_id) as unique_events,
        SUM(ticket_count) as total_tickets
      FROM payment_transactions
      WHERE user_id = $1
        AND created_at > $2
        AND status = 'completed'
    `;

    try {
      const result = await query(velocityQuery, [userId, hourAgo]);
      const stats = result.rows[0];

      const purchaseCount = parseInt(stats.purchase_count);
      const uniqueEvents = parseInt(stats.unique_events);
      const totalTickets = parseInt(stats.total_tickets);

      // Suspicious patterns
      if (purchaseCount > 5 || totalTickets > 20 || uniqueEvents > 3) {
        return {
          type: SignalType.RAPID_PURCHASES,
          severity: purchaseCount > 10 ? 'high' : 'medium',
          confidence: Math.min(purchaseCount / 10, 1),
          details: {
            purchaseCount,
            uniqueEvents,
            totalTickets,
            timeWindow: '1_hour'
          }
        };
      }
    } catch (err) {
      console.error('Error checking purchase velocity:', err);
    }

    return null;
  }

  private async checkResalePatterns(userId: string): Promise<FraudSignal | null> {
    // Check resale history
    const resaleQuery = `
      SELECT
        COUNT(*) as total_resales,
        AVG((rl.price - t.original_price) / t.original_price * 100) as avg_markup,
        COUNT(*) FILTER (WHERE rl.created_at < t.purchased_at + INTERVAL '24 hours') as quick_resales
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      WHERE rl.seller_id = $1
        AND rl.created_at > CURRENT_DATE - INTERVAL '30 days'
    `;

    try {
      const result = await query(resaleQuery, [userId]);
      const stats = result.rows[0];

      const totalResales = parseInt(stats.total_resales);
      const avgMarkup = parseFloat(stats.avg_markup) || 0;
      const quickResales = parseInt(stats.quick_resales);

      if (totalResales > 10 || avgMarkup > 100 || quickResales > 5) {
        return {
          type: SignalType.KNOWN_SCALPER,
          severity: avgMarkup > 200 ? 'high' : 'medium',
          confidence: Math.min((totalResales + quickResales) / 20, 1),
          details: {
            totalResales,
            averageMarkup: avgMarkup,
            quickResales,
            timeFrame: '30_days'
          }
        };
      }
    } catch (err) {
      console.error('Error checking resale patterns:', err);
    }

    return null;
  }

  private async checkMultipleAccounts(deviceFingerprint: string): Promise<FraudSignal | null> {
    // Check how many accounts use this device
    const deviceQuery = `
      SELECT
        COUNT(DISTINCT user_id) as account_count,
        COUNT(*) as total_transactions
      FROM payment_transactions
      WHERE device_fingerprint = $1
        AND created_at > CURRENT_DATE - INTERVAL '7 days'
    `;

    try {
      const result = await query(deviceQuery, [deviceFingerprint]);
      const stats = result.rows[0];

      const accountCount = parseInt(stats.account_count);
      const totalTransactions = parseInt(stats.total_transactions);

      if (accountCount > 2) {
        return {
          type: SignalType.MULTIPLE_ACCOUNTS,
          severity: accountCount > 5 ? 'high' : 'medium',
          confidence: Math.min(accountCount / 5, 1),
          details: {
            accountCount,
            totalTransactions,
            deviceFingerprint
          }
        };
      }
    } catch (err) {
      console.error('Error checking multiple accounts:', err);
    }

    return null;
  }

  private async checkHighDemandTargeting(userId: string): Promise<FraudSignal | null> {
    // Check if user only buys high-demand events
    const targetingQuery = `
      SELECT
        COUNT(*) FILTER (WHERE e.demand_score > 0.8) as high_demand_purchases,
        COUNT(*) as total_purchases,
        AVG(pt.ticket_count) as avg_tickets_per_purchase
      FROM payment_transactions pt
      JOIN events e ON pt.event_id = e.id
      WHERE pt.user_id = $1
        AND pt.created_at > CURRENT_DATE - INTERVAL '30 days'
        AND pt.status = 'completed'
    `;

    try {
      const result = await query(targetingQuery, [userId]);
      const stats = result.rows[0];

      const highDemandPurchases = parseInt(stats.high_demand_purchases);
      const totalPurchases = parseInt(stats.total_purchases);
      const avgTickets = parseFloat(stats.avg_tickets_per_purchase) || 0;

      const highDemandRatio = totalPurchases > 0 ? highDemandPurchases / totalPurchases : 0;

      if (highDemandRatio > 0.8 && totalPurchases > 5) {
        return {
          type: SignalType.BOT_BEHAVIOR,
          severity: 'medium',
          confidence: highDemandRatio,
          details: {
            highDemandPurchases,
            totalPurchases,
            highDemandRatio,
            averageTicketsPerPurchase: avgTickets
          }
        };
      }
    } catch (err) {
      console.error('Error checking high demand targeting:', err);
    }

    return null;
  }

  private async checkKnownScalperDatabase(
    userId: string,
    deviceFingerprint: string
  ): Promise<FraudSignal | null> {
    // Check if user or device is in known scalper database
    const knownQuery = `
      SELECT
        reason,
        confidence_score,
        added_at
      FROM known_scalpers
      WHERE user_id = $1 OR device_fingerprint = $2
      ORDER BY confidence_score DESC
      LIMIT 1
    `;

    try {
      const result = await query(knownQuery, [userId, deviceFingerprint]);

      if (result.rows.length > 0) {
        const scalper = result.rows[0];

        return {
          type: SignalType.KNOWN_SCALPER,
          severity: 'high',
          confidence: scalper.confidence_score,
          details: {
            reason: scalper.reason,
            addedAt: scalper.added_at,
            source: 'known_scalper_database'
          }
        };
      }
    } catch (err) {
      console.error('Error checking known scalper database:', err);
    }

    return null;
  }

  private determineDecision(score: number, signals: FraudSignal[]): FraudDecision {
    // Check for high-severity signals
    const hasHighSeverity = signals.some(s => s.severity === 'high');

    if (score >= 0.8 || hasHighSeverity) {
      return FraudDecision.DECLINE;
    } else if (score >= 0.6) {
      return FraudDecision.REVIEW;
    } else if (score >= 0.4) {
      return FraudDecision.CHALLENGE;
    } else {
      return FraudDecision.APPROVE;
    }
  }

  private async storeFraudCheck(fraudCheck: FraudCheck): Promise<void> {
    try {
      await query(
        `INSERT INTO fraud_checks
         (user_id, device_fingerprint, score, signals, decision, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          fraudCheck.userId,
          fraudCheck.deviceFingerprint,
          fraudCheck.score,
          JSON.stringify(fraudCheck.signals),
          fraudCheck.decision,
          fraudCheck.timestamp
        ]
      );
    } catch (err) {
      console.error('Error storing fraud check:', err);
    }
  }

  async reportScalper(
    reporterId: string,
    suspectedScalperId: string,
    evidence: any
  ): Promise<void> {
    try {
      // Store user report
      await query(
        `INSERT INTO scalper_reports
         (reporter_id, suspected_scalper_id, evidence, status)
         VALUES ($1, $2, $3, 'pending_review')`,
        [reporterId, suspectedScalperId, JSON.stringify(evidence)]
      );

      // Trigger review if multiple reports
      const reportCount = await this.getReportCount(suspectedScalperId);

      if (reportCount >= 3) {
        await this.triggerManualReview(suspectedScalperId);
      }
    } catch (err) {
      console.error('Error reporting scalper:', err);
    }
  }

  private async getReportCount(userId: string): Promise<number> {
    try {
      const result = await query(
        `SELECT COUNT(*) as count
         FROM scalper_reports
         WHERE suspected_scalper_id = $1
           AND created_at > CURRENT_DATE - INTERVAL '30 days'`,
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (err) {
      console.error('Error getting report count:', err);
      return 0;
    }
  }

  private async triggerManualReview(userId: string): Promise<void> {
    console.log(`Triggering manual review for suspected scalper: ${userId}`);

    try {
      // In production, this would create a task for the fraud team
      await query(
        `INSERT INTO fraud_review_queue
         (user_id, reason, priority, status)
         VALUES ($1, 'multiple_scalper_reports', 'high', 'pending')`,
        [userId]
      );
    } catch (err) {
      console.error('Error triggering manual review:', err);
    }
  }
}
```

### FILE: src/services/compliance/tax-calculator.service.ts
```typescript
import axios from 'axios';
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';
import { config } from '../../config';
import { percentOfCents } from '../../utils/money';

export class TaxCalculatorService {
  private taxJarClient: any;
  private taxCache: Map<string, any> = new Map();

  constructor() {
    if (config.taxJar.apiKey) {
      const Taxjar = require('taxjar');
      this.taxJarClient = new Taxjar({
        apiKey: config.taxJar.apiKey
      });
    }
  }

  // amount is in INTEGER CENTS
  async calculateTax(
    amountCents: number,
    venueAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
    },
    customerAddress?: {
      city?: string;
      state?: string;
      zip?: string;
    }
  ): Promise<{
    taxableAmount: number;
    stateTax: number;
    localTax: number;
    specialTax: number;
    totalTax: number;
    breakdown: any;
  }> {
    if (venueAddress.state === 'TN') {
      return this.calculateTennesseeTax(amountCents, venueAddress.city);
    }

    if (this.taxJarClient && customerAddress) {
      return this.calculateWithTaxJar(amountCents, venueAddress, customerAddress);
    }

    return this.calculateBasicTax(amountCents, venueAddress.state);
  }

  private async calculateTennesseeTax(
    amountCents: number,
    city: string
  ): Promise<any> {
    const stateTaxBps = complianceConfig.tax.tennessee.stateSalesRate * 100; // 7% = 700 bps
    let localTaxBps = 225; // Default Nashville 2.25%

    const cityLower = city.toLowerCase();
    const rates = complianceConfig.tax.tennessee.localRates as any;
    if (rates[cityLower]) {
      localTaxBps = Math.round(rates[cityLower] * 100);
    }

    const entertainmentTaxBps = ['nashville', 'memphis'].includes(cityLower) ? 100 : 0; // 1%

    const stateTaxCents = percentOfCents(amountCents, stateTaxBps);
    const localTaxCents = percentOfCents(amountCents, localTaxBps);
    const specialTaxCents = percentOfCents(amountCents, entertainmentTaxBps);
    const totalTaxCents = stateTaxCents + localTaxCents + specialTaxCents;

    return {
      taxableAmount: amountCents,
      stateTax: stateTaxCents,
      localTax: localTaxCents,
      specialTax: specialTaxCents,
      totalTax: totalTaxCents,
      breakdown: {
        state: {
          name: 'Tennessee Sales Tax',
          rate: stateTaxBps / 100,
          amount: stateTaxCents
        },
        local: {
          name: `${city} Local Tax`,
          rate: localTaxBps / 100,
          amount: localTaxCents
        },
        special: entertainmentTaxBps > 0 ? {
          name: 'Entertainment Tax',
          rate: entertainmentTaxBps / 100,
          amount: specialTaxCents
        } : null
      }
    };
  }

  private async calculateWithTaxJar(
    amountCents: number,
    venueAddress: any,
    customerAddress: any
  ): Promise<any> {
    try {
      // TaxJar expects dollars, convert cents to dollars
      const amountDollars = amountCents / 100;

      const taxData = await this.taxJarClient.taxForOrder({
        from_street: venueAddress.street,
        from_city: venueAddress.city,
        from_state: venueAddress.state,
        from_zip: venueAddress.zip,
        to_city: customerAddress.city,
        to_state: customerAddress.state,
        to_zip: customerAddress.zip,
        amount: amountDollars,
        shipping: 0,
        line_items: [{
          id: '1',
          quantity: 1,
          unit_price: amountDollars,
          product_tax_code: '20410'
        }]
      });

      // Convert TaxJar response back to cents
      return {
        taxableAmount: Math.round(taxData.tax.taxable_amount * 100),
        stateTax: Math.round(taxData.tax.state_amount * 100),
        localTax: Math.round((taxData.tax.city_amount + taxData.tax.county_amount) * 100),
        specialTax: Math.round(taxData.tax.special_district_amount * 100),
        totalTax: Math.round(taxData.tax.amount_to_collect * 100),
        breakdown: taxData.tax.breakdown
      };
    } catch (error) {
      console.error('TaxJar calculation failed:', error);
      return this.calculateBasicTax(amountCents, venueAddress.state);
    }
  }

  private async calculateBasicTax(amountCents: number, state: string): Promise<any> {
    // Tax rates in basis points (5.0% = 500 bps)
    const stateTaxRates: { [key: string]: number } = {
      'AL': 400, 'AK': 0, 'AZ': 560, 'AR': 650,
      'CA': 725, 'CO': 290, 'CT': 635, 'DE': 0,
      'FL': 600, 'GA': 400, 'HI': 400, 'ID': 600,
      'IL': 625, 'IN': 700, 'IA': 600, 'KS': 650,
      'KY': 600, 'LA': 445, 'ME': 550, 'MD': 600,
      'MA': 625, 'MI': 600, 'MN': 688, 'MS': 700,
      'MO': 423, 'MT': 0, 'NE': 550, 'NV': 685,
      'NH': 0, 'NJ': 663, 'NM': 513, 'NY': 400,
      'NC': 475, 'ND': 500, 'OH': 575, 'OK': 450,
      'OR': 0, 'PA': 600, 'RI': 700, 'SC': 600,
      'SD': 450, 'TN': 700, 'TX': 625, 'UT': 595,
      'VT': 600, 'VA': 530, 'WA': 650, 'WV': 600,
      'WI': 500, 'WY': 400
    };

    const taxBps = stateTaxRates[state] || 0;
    const stateTaxCents = percentOfCents(amountCents, taxBps);

    return {
      taxableAmount: amountCents,
      stateTax: stateTaxCents,
      localTax: 0,
      specialTax: 0,
      totalTax: stateTaxCents,
      breakdown: {
        state: {
          name: `${state} Sales Tax`,
          rate: taxBps / 100,
          amount: stateTaxCents
        }
      }
    };
  }

  async recordTaxCollection(
    transactionId: string,
    taxDetails: any
  ): Promise<void> {
    await query(
      `INSERT INTO tax_collections
       (transaction_id, state_tax, local_tax, special_tax,
        total_tax, jurisdiction, breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transactionId,
        taxDetails.stateTax,
        taxDetails.localTax,
        taxDetails.specialTax,
        taxDetails.totalTax,
        taxDetails.breakdown.state.name,
        JSON.stringify(taxDetails.breakdown)
      ]
    );
  }

  async getNexusStatus(state: string): Promise<{
    hasNexus: boolean;
    threshold: any;
    currentStatus: any;
  }> {
    const isNexusState = complianceConfig.tax.nexusStates.includes(state);

    if (!isNexusState) {
      const thresholdStatus = await this.checkNexusThreshold(state);
      return {
        hasNexus: false,
        threshold: this.getStateNexusThreshold(state),
        currentStatus: thresholdStatus
      };
    }

    return {
      hasNexus: true,
      threshold: this.getStateNexusThreshold(state),
      currentStatus: await this.getStateTransactionVolume(state)
    };
  }

  private async checkNexusThreshold(state: string): Promise<any> {
    const threshold = this.getStateNexusThreshold(state);
    const currentVolume = await this.getStateTransactionVolume(state);

    return {
      revenue: currentVolume.revenue,
      transactionCount: currentVolume.transactionCount,
      revenueThreshold: threshold.revenue,
      transactionThreshold: threshold.transactions,
      percentOfRevenueThreshold: (currentVolume.revenue / threshold.revenue) * 100,
      percentOfTransactionThreshold: (currentVolume.transactionCount / threshold.transactions) * 100
    };
  }

  private getStateNexusThreshold(state: string): any {
    const thresholds: { [key: string]: any } = {
      'AL': { revenue: 25000000, transactions: null }, // $250k in cents
      'AZ': { revenue: 10000000, transactions: null },
      'CA': { revenue: 50000000, transactions: null },
      'CO': { revenue: 10000000, transactions: null },
      'FL': { revenue: 10000000, transactions: null },
      'GA': { revenue: 10000000, transactions: 200 },
      'IL': { revenue: 10000000, transactions: 200 },
      'NY': { revenue: 50000000, transactions: 100 },
      'TX': { revenue: 50000000, transactions: null },
    };

    return thresholds[state] || { revenue: 10000000, transactions: 200 };
  }

  private async getStateTransactionVolume(state: string): Promise<any> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const result = await query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(pt.amount_cents) as revenue_cents
       FROM payment_transactions pt
       JOIN venues v ON pt.venue_id = v.id
       WHERE v.state = $1
         AND pt.created_at >= $2
         AND pt.status = 'completed'`,
      [state, yearStart]
    );

    return {
      transactionCount: parseInt(result.rows[0].transaction_count),
      revenue: parseInt(result.rows[0].revenue_cents) || 0 // Revenue in cents
    };
  }
}
```

### FILE: src/services/compliance/aml-checker.service.ts
```typescript
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';

export class AMLCheckerService {
  async checkTransaction(
    userId: string,
    amount: number,
    transactionType: string
  ): Promise<{
    passed: boolean;
    flags: string[];
    requiresReview: boolean;
    riskScore: number;
  }> {
    const flags: string[] = [];
    let riskScore = 0;
    
    // Check 1: Transaction amount threshold
    if (amount >= complianceConfig.aml.transactionThreshold) {
      flags.push('high_value_transaction');
      riskScore += 0.3;
    }
    
    // Check 2: Aggregate amount in rolling window
    const aggregateCheck = await this.checkAggregateAmount(userId);
    if (aggregateCheck.exceeds) {
      flags.push('aggregate_threshold_exceeded');
      riskScore += 0.25;
    }
    
    // Check 3: Suspicious patterns
    const patterns = await this.checkSuspiciousPatterns(userId);
    if (patterns.length > 0) {
      flags.push(...patterns.map(p => `pattern_${p.type}`));
      riskScore += patterns.reduce((sum, p) => sum + p.risk, 0);
    }
    
    // Check 4: Sanctions list
    const sanctionsCheck = await this.checkSanctionsList(userId);
    if (sanctionsCheck.matched) {
      flags.push('sanctions_list_match');
      riskScore = 1.0; // Automatic high risk
    }
    
    // Check 5: PEP (Politically Exposed Person)
    const pepCheck = await this.checkPEPStatus(userId);
    if (pepCheck.isPEP) {
      flags.push('politically_exposed_person');
      riskScore += 0.3;
    }
    
    const requiresReview = riskScore >= 0.5 || flags.includes('sanctions_list_match');
    const passed = !requiresReview;
    
    // Record AML check
    await this.recordAMLCheck(userId, amount, transactionType, {
      passed,
      flags,
      requiresReview,
      riskScore
    });
    
    return {
      passed,
      flags,
      requiresReview,
      riskScore
    };
  }
  
  private async checkAggregateAmount(userId: string): Promise<{
    exceeds: boolean;
    amount: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT SUM(amount) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > $2
         AND status = 'completed'`,
      [userId, thirtyDaysAgo]
    );
    
    const total = parseFloat(result.rows[0].total) || 0;
    
    return {
      exceeds: total >= complianceConfig.aml.aggregateThreshold,
      amount: total
    };
  }
  
  private async checkSuspiciousPatterns(userId: string): Promise<any[]> {
    const patterns = [];
    
    // Pattern 1: Rapid high-value transactions
    const rapidHighValue = await this.checkRapidHighValuePattern(userId);
    if (rapidHighValue.detected) {
      patterns.push({
        type: 'rapid_high_value',
        risk: 0.2,
        details: rapidHighValue
      });
    }
    
    // Pattern 2: Structured transactions (smurfing)
    const structuring = await this.checkStructuringPattern(userId);
    if (structuring.detected) {
      patterns.push({
        type: 'structured_transactions',
        risk: 0.3,
        details: structuring
      });
    }
    
    // Pattern 3: Unusual geographic patterns
    const geographic = await this.checkGeographicPattern(userId);
    if (geographic.detected) {
      patterns.push({
        type: 'unusual_geography',
        risk: 0.15,
        details: geographic
      });
    }
    
    return patterns;
  }
  
  private async checkRapidHighValuePattern(userId: string): Promise<any> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > $2
         AND amount > $3
         AND status = 'completed'`,
      [userId, oneDayAgo, 5000]
    );
    
    const count = parseInt(result.rows[0].count);
    const total = parseFloat(result.rows[0].total) || 0;
    
    return {
      detected: count >= 3 || total >= 20000,
      transactionCount: count,
      totalAmount: total
    };
  }
  
  private async checkStructuringPattern(userId: string): Promise<any> {
    // Check for multiple transactions just below reporting threshold
    const result = await query(
      `SELECT 
        COUNT(*) as count,
        AVG(amount) as avg_amount,
        STDDEV(amount) as stddev_amount
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > CURRENT_DATE - INTERVAL '7 days'
         AND amount BETWEEN $2 AND $3
         AND status = 'completed'`,
      [userId, 9000, 9999] // Just below $10k threshold
    );
    
    const count = parseInt(result.rows[0].count);
    const avgAmount = parseFloat(result.rows[0].avg_amount) || 0;
    const stdDev = parseFloat(result.rows[0].stddev_amount) || 0;
    
    // Low standard deviation with multiple transactions suggests structuring
    return {
      detected: count >= 3 && stdDev < 100,
      transactionCount: count,
      averageAmount: avgAmount,
      standardDeviation: stdDev
    };
  }
  
  private async checkGeographicPattern(userId: string): Promise<any> {
    // Check for transactions from unusual locations
    const result = await query(
      `SELECT 
        COUNT(DISTINCT country) as country_count,
        COUNT(DISTINCT state) as state_count,
        array_agg(DISTINCT country) as countries
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > CURRENT_DATE - INTERVAL '30 days'
         AND status = 'completed'`,
      [userId]
    );
    
    const countryCount = parseInt(result.rows[0].country_count);
    const stateCount = parseInt(result.rows[0].state_count);
    const countries = result.rows[0].countries || [];
    
    // High-risk countries
    const highRiskCountries = ['KP', 'IR', 'SY', 'CU', 'VE'];
    const hasHighRiskCountry = countries.some((c: string) => highRiskCountries.includes(c));
    
    return {
      detected: countryCount > 5 || hasHighRiskCountry,
      countryCount,
      stateCount,
      countries,
      hasHighRiskCountry
    };
  }
  
  private async checkSanctionsList(userId: string): Promise<{
    matched: boolean;
    listName?: string;
  }> {
    // In production, integrate with OFAC and other sanctions lists
    // For now, check local database
    const result = await query(
      `SELECT * FROM sanctions_list_matches
       WHERE user_id = $1 AND active = true`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        matched: true,
        listName: result.rows[0].list_name
      };
    }
    
    return { matched: false };
  }
  
  private async checkPEPStatus(userId: string): Promise<{
    isPEP: boolean;
    details?: any;
  }> {
    // Check if user is a Politically Exposed Person
    const result = await query(
      `SELECT * FROM pep_database
       WHERE user_id = $1 OR linked_user_ids @> ARRAY[$1]`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        isPEP: true,
        details: {
          position: result.rows[0].position,
          country: result.rows[0].country,
          since: result.rows[0].since_date
        }
      };
    }
    
    return { isPEP: false };
  }
  
  private async recordAMLCheck(
    userId: string,
    amount: number,
    transactionType: string,
    results: any
  ): Promise<void> {
    await query(
      `INSERT INTO aml_checks 
       (user_id, amount, transaction_type, passed, 
        flags, risk_score, requires_review, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        userId,
        amount,
        transactionType,
        results.passed,
        JSON.stringify(results.flags),
        results.riskScore,
        results.requiresReview
      ]
    );
  }
  
  async generateSAR(
    userId: string,
    transactionIds: string[],
    suspiciousActivity: string
  ): Promise<{
    sarId: string;
    filingDeadline: Date;
  }> {
    // Generate Suspicious Activity Report
    const sarId = `SAR-${Date.now()}-${userId.substring(0, 8)}`;
    const filingDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await query(
      `INSERT INTO suspicious_activity_reports 
       (sar_id, user_id, transaction_ids, activity_description,
        filing_deadline, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)`,
      [
        sarId,
        userId,
        transactionIds,
        suspiciousActivity,
        filingDeadline
      ]
    );
    
    // In production, notify compliance team
    console.log(`SAR generated: ${sarId} for user ${userId}`);
    
    return {
      sarId,
      filingDeadline
    };
  }
}
```

### FILE: src/services/compliance/form-1099-da.service.ts
```typescript
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';

export class Form1099DAService {
  async generateForm1099DA(
    userId: string,
    taxYear: number
  ): Promise<{
    required: boolean;
    formData?: any;
    transactions?: any[];
  }> {
    // Check if form is required (starting Jan 2025)
    const startDate = new Date(complianceConfig.tax.digitalAssetReporting.startDate);
    if (new Date() < startDate) {
      return { required: false };
    }

    // Get all NFT transactions for the user
    const transactions = await this.getUserNFTTransactions(userId, taxYear);

    // Calculate total proceeds
    const totalProceeds = transactions.reduce((sum, tx) => sum + tx.proceeds, 0);

    // Check if meets reporting threshold ($600)
    if (totalProceeds < complianceConfig.tax.digitalAssetReporting.threshold) {
      return {
        required: false,
        transactions
      };
    }

    // Get user information
    const userInfo = await this.getUserTaxInfo(userId);

    // Generate form data
    const formData = {
      recipientInfo: {
        name: userInfo.name,
        address: userInfo.address,
        tin: userInfo.tin // Taxpayer Identification Number
      },
      payerInfo: {
        name: 'TicketToken Inc.',
        address: '123 Music Row, Nashville, TN 37203',
        tin: '12-3456789' // Company EIN
      },
      taxYear,
      transactions: transactions.map(tx => ({
        dateAcquired: tx.acquiredDate,
        dateDisposed: tx.disposedDate,
        proceeds: tx.proceeds,
        costBasis: tx.costBasis,
        gain: tx.proceeds - tx.costBasis,
        assetDescription: `NFT Ticket - ${tx.eventName}`,
        transactionId: tx.transactionId
      })),
      summary: {
        totalProceeds,
        totalCostBasis: transactions.reduce((sum, tx) => sum + tx.costBasis, 0),
        totalGain: transactions.reduce((sum, tx) => sum + (tx.proceeds - tx.costBasis), 0),
        transactionCount: transactions.length
      }
    };

    return {
      required: true,
      formData,
      transactions
    };
  }

  private async getUserNFTTransactions(
    userId: string,
    taxYear: number
  ): Promise<any[]> {
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear + 1, 0, 1);

    const sqlQuery = `
      SELECT
        rl.id as transaction_id,
        rl.created_at as disposed_date,
        rl.price as proceeds,
        t.purchase_price as cost_basis,
        t.purchased_at as acquired_date,
        e.name as event_name,
        rl.ticket_id
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE rl.seller_id = $1
        AND rl.status = 'sold'
        AND rl.sold_at >= $2
        AND rl.sold_at < $3
      ORDER BY rl.sold_at`;
    
    const result = await query(sqlQuery, [userId, yearStart, yearEnd]);

    return result.rows.map((row: any) => ({
      transactionId: row.transaction_id,
      disposedDate: row.disposed_date,
      proceeds: parseFloat(row.proceeds),
      costBasis: parseFloat(row.cost_basis),
      acquiredDate: row.acquired_date,
      eventName: row.event_name,
      ticketId: row.ticket_id
    }));
  }

  private async getUserTaxInfo(userId: string): Promise<any> {
    // Get user tax information
    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.first_name || ' ' || u.last_name as name,
        uti.address,
        uti.tin,
        uti.tin_type
       FROM users u
       LEFT JOIN user_tax_info uti ON u.id = uti.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  }

  async recordFormGeneration(
    userId: string,
    taxYear: number,
    formData: any
  ): Promise<void> {
    await query(
      `INSERT INTO tax_forms_1099da
       (user_id, tax_year, form_data, total_proceeds,
        transaction_count, generated_at, status)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'generated')`,
      [
        userId,
        taxYear,
        JSON.stringify(formData),
        formData.summary.totalProceeds,
        formData.summary.transactionCount
      ]
    );
  }

  async batchGenerate1099DA(taxYear: number): Promise<{
    totalGenerated: number;
    totalRequired: number;
    errors: any[];
  }> {
    // Get all users who need 1099-DA
    const usersQuery = `
      SELECT DISTINCT
        rl.seller_id as user_id,
        SUM(rl.price) as total_proceeds,
        COUNT(*) as transaction_count
      FROM resale_listings rl
      WHERE rl.status = 'sold'
        AND EXTRACT(YEAR FROM rl.sold_at) = $1
      GROUP BY rl.seller_id
      HAVING SUM(rl.price) >= $2`;

    const users = await query(usersQuery, [
      taxYear,
      complianceConfig.tax.digitalAssetReporting.threshold
    ]);

    let generated = 0;
    const errors: any[] = [];

    for (const user of users.rows) {
      try {
        const form = await this.generateForm1099DA(user.user_id, taxYear);
        if (form.required && form.formData) {
          await this.recordFormGeneration(user.user_id, taxYear, form.formData);
          generated++;
        }
      } catch (error) {
        errors.push({
          userId: user.user_id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return {
      totalGenerated: generated,
      totalRequired: users.rows.length,
      errors
    };
  }

  async getFormStatus(userId: string, taxYear: number): Promise<{
    status: string;
    generatedAt?: Date;
    downloadUrl?: string;
    summary?: any;
  }> {
    const result = await query(
      `SELECT * FROM tax_forms_1099da
       WHERE user_id = $1 AND tax_year = $2
       ORDER BY generated_at DESC
       LIMIT 1`,
      [userId, taxYear]
    );

    if (result.rows.length === 0) {
      // Check if form is needed
      const formCheck = await this.generateForm1099DA(userId, taxYear);

      return {
        status: formCheck.required ? 'pending' : 'not_required',
        summary: formCheck.formData?.summary
      };
    }

    const form = result.rows[0];

    return {
      status: form.status,
      generatedAt: form.generated_at,
      downloadUrl: `/api/tax/forms/1099-da/${userId}/${taxYear}`,
      summary: JSON.parse(form.form_data).summary
    };
  }
}
```

### FILE: src/services/reconciliation/reconciliation-service.ts
```typescript
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import axios from 'axios';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';

export class ReconciliationService {
  private pool: Pool;
  private log = logger.child({ component: 'ReconciliationService' });
  private reconciliationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  async start() {
    this.log.info('Starting reconciliation service...');
    
    // Run every 5 minutes
    this.reconciliationInterval = setInterval(() => {
      this.reconcile();
    }, 5 * 60 * 1000);

    // Run immediately on start
    this.reconcile();
  }

  async stop() {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
    }
    this.log.info('Reconciliation service stopped');
  }

  async reconcile() {
    this.log.info('Starting reconciliation run...');

    try {
      await this.reconcileOrphanedPayments();
      await this.reconcileFailedOutboxEvents();
      await this.reconcilePendingOrders();
      
      this.log.info('Reconciliation run completed');
    } catch (error) {
      this.log.error('Reconciliation failed:', error);
    }
  }

  /**
   * Find orders marked as PAID but without tickets
   */
  private async reconcileOrphanedPayments() {
    const client = await this.pool.connect();

    try {
      // Find orders that are PAID but have no tickets after 5 minutes
      const result = await client.query(`
        SELECT o.* 
        FROM orders o
        LEFT JOIN tickets t ON t.order_id = o.id
        WHERE o.status = 'PAID'
          AND t.id IS NULL
          AND o.updated_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      if (result.rows.length > 0) {
        this.log.warn(`Found ${result.rows.length} orphaned paid orders without tickets`);

        for (const order of result.rows) {
          await this.fixOrphanedOrder(client, order);
        }
      }

    } catch (error) {
      this.log.error('Failed to reconcile orphaned payments:', error);
    } finally {
      client.release();
    }
  }

  private async fixOrphanedOrder(client: any, order: any) {
    this.log.info(`Fixing orphaned order ${order.id}`);

    try {
      // Check if there's already an outbox event for this order
      const existingOutbox = await client.query(`
        SELECT * FROM outbox
        WHERE aggregate_id = $1
          AND aggregate_type = 'order'
          AND event_type = 'order.paid'
          AND processed_at IS NULL
      `, [order.id]);

      if (existingOutbox.rows.length === 0) {
        // Create a new outbox event to trigger ticket creation
        await client.query(`
          INSERT INTO outbox (
            aggregate_id,
            aggregate_type,
            event_type,
            payload,
            created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [
          order.id,
          'order',
          'order.paid',
          JSON.stringify({
            orderId: order.id,
            paymentId: order.payment_intent_id,
            userId: order.user_id,
            eventId: order.event_id,
            amount: order.total_amount,
            ticketQuantity: order.ticket_quantity,
            reconciliation: true,
            timestamp: new Date().toISOString()
          })
        ]);

        this.log.info(`Created reconciliation outbox event for order ${order.id}`);
      } else {
        // Reset the existing outbox event for retry
        await client.query(`
          UPDATE outbox
          SET attempts = 0,
              last_attempt_at = NULL,
              last_error = 'Reset by reconciliation'
          WHERE id = $1
        `, [existingOutbox.rows[0].id]);

        this.log.info(`Reset outbox event for order ${order.id}`);
      }

    } catch (error) {
      this.log.error(`Failed to fix orphaned order ${order.id}:`, error);
    }
  }

  /**
   * Retry failed outbox events that haven't exceeded max attempts
   */
  private async reconcileFailedOutboxEvents() {
    const client = await this.pool.connect();

    try {
      // Find stuck outbox events (not processed after 10 minutes)
      const result = await client.query(`
        UPDATE outbox
        SET attempts = 0,
            last_attempt_at = NULL,
            last_error = 'Reset by reconciliation'
        WHERE processed_at IS NULL
          AND attempts < 5
          AND created_at < NOW() - INTERVAL '10 minutes'
          AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '5 minutes')
        RETURNING id
      `);

      if (result.rows.length > 0) {
        this.log.info(`Reset ${result.rows.length} stuck outbox events`);
      }

    } catch (error) {
      this.log.error('Failed to reconcile outbox events:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Check for orders stuck in PENDING state
   */
  private async reconcilePendingOrders() {
    const client = await this.pool.connect();

    try {
      // Find orders stuck in PENDING for more than 15 minutes
      const result = await client.query(`
        SELECT o.*, pi.status as payment_status
        FROM orders o
        LEFT JOIN payment_intents pi ON pi.order_id = o.id
        WHERE o.status = 'PENDING'
          AND o.created_at < NOW() - INTERVAL '15 minutes'
        LIMIT 10
      `);

      for (const order of result.rows) {
        if (order.payment_status === 'succeeded') {
          // Payment succeeded but order not updated
          this.log.warn(`Found order ${order.id} in PENDING with successful payment`);

          await client.query(`
            UPDATE orders
            SET status = 'PAID',
                updated_at = NOW()
            WHERE id = $1 AND status = 'PENDING'
          `, [order.id]);

          // Create outbox event for ticket creation
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            order.id,
            'order',
            'order.paid',
            JSON.stringify({
              orderId: order.id,
              paymentId: order.payment_intent_id,
              userId: order.user_id,
              eventId: order.event_id,
              amount: order.total_amount,
              ticketQuantity: order.ticket_quantity,
              reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

        } else {
          // Payment failed or expired
          this.log.info(`Expiring stale PENDING order ${order.id}`);

          await client.query(`
            UPDATE orders
            SET status = 'EXPIRED',
                updated_at = NOW()
            WHERE id = $1 AND status = 'PENDING'
          `, [order.id]);
        }
      }

      if (result.rows.length > 0) {
        this.log.info(`Reconciled ${result.rows.length} pending orders`);
      }

    } catch (error) {
      this.log.error('Failed to reconcile pending orders:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Manual reconciliation for specific order
   */
  async reconcileOrder(orderId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const order = await client.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      if (order.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderData = order.rows[0];

      // Check payment status
      const payment = await client.query(`
        SELECT * FROM payment_intents WHERE order_id = $1
      `, [orderId]);

      if (payment.rows.length > 0 && payment.rows[0].status === 'succeeded') {
        // Ensure order is marked as paid
        if (orderData.status !== 'PAID') {
          await client.query(`
            UPDATE orders SET status = 'PAID', updated_at = NOW()
            WHERE id = $1
          `, [orderId]);
        }

        // Check for tickets
        const tickets = await client.query(`
          SELECT COUNT(*) as count FROM tickets WHERE order_id = $1
        `, [orderId]);

        if (tickets.rows[0].count === 0) {
          // Create outbox event to generate tickets
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            orderId,
            'order',
            'order.paid',
            JSON.stringify({
              orderId: orderId,
              paymentId: payment.rows[0].stripe_intent_id,
              userId: orderData.user_id,
              eventId: orderData.event_id,
              amount: orderData.total_amount,
              ticketQuantity: orderData.ticket_quantity,
              manual_reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

          this.log.info(`Created manual reconciliation event for order ${orderId}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const reconciliationService = new ReconciliationService();
```

### FILE: src/services/high-demand/purchase-limiter.service.ts
```typescript
import { query } from '../../config/database';
import { createClient } from 'redis';
import { config } from '../../config';

export class PurchaseLimiterService {
  private redis: any; // TODO: Add proper Redis client type

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });
    
    this.redis.connect().catch(console.error);
  }

  async checkPurchaseLimit(
    userId: string,
    eventId: string,
    requestedQuantity: number,
    paymentMethod: {
      type: string;
      fingerprint?: string;
      last4?: string;
    }
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limits: {
      perUser: number;
      perPaymentMethod: number;
      perAddress: number;
      perEvent: number;
    };
    current: {
      userPurchases: number;
      paymentMethodPurchases: number;
      addressPurchases: number;
    };
  }> {
    // Get event limits
    const eventLimits = await this.getEventLimits(eventId);

    // Check user limit
    const userPurchases = await this.getUserPurchaseCount(userId, eventId);
    if (userPurchases + requestedQuantity > eventLimits.perUser) {
      return {
        allowed: false,
        reason: `Maximum ${eventLimits.perUser} tickets per person for this event`,
        limits: eventLimits,
        current: {
          userPurchases,
          paymentMethodPurchases: 0,
          addressPurchases: 0
        }
      };
    }

    // Check payment method limit
    if (paymentMethod.fingerprint) {
      const paymentMethodPurchases = await this.getPaymentMethodPurchaseCount(
        paymentMethod.fingerprint,
        eventId
      );

      if (paymentMethodPurchases + requestedQuantity > eventLimits.perPaymentMethod) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perPaymentMethod} tickets per payment method`,
          limits: eventLimits,
          current: {
            userPurchases,
            paymentMethodPurchases,
            addressPurchases: 0
          }
        };
      }
    }

    // Check address limit
    const userAddress = await this.getUserAddress(userId);
    if (userAddress) {
      const addressPurchases = await this.getAddressPurchaseCount(
        userAddress,
        eventId
      );

      if (addressPurchases + requestedQuantity > eventLimits.perAddress) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perAddress} tickets per household`,
          limits: eventLimits,
          current: {
            userPurchases,
            paymentMethodPurchases: 0,
            addressPurchases
          }
        };
      }
    }

    // Check cooldown period
    const cooldownCheck = await this.checkCooldownPeriod(userId, eventId);
    if (!cooldownCheck.allowed) {
      return {
        allowed: false,
        reason: cooldownCheck.reason,
        limits: eventLimits,
        current: {
          userPurchases,
          paymentMethodPurchases: 0,
          addressPurchases: 0
        }
      };
    }

    return {
      allowed: true,
      limits: eventLimits,
      current: {
        userPurchases,
        paymentMethodPurchases: 0,
        addressPurchases: 0
      }
    };
  }

  private async getEventLimits(eventId: string): Promise<any> {
    const result = await query(
      `SELECT
        purchase_limit_per_user,
        purchase_limit_per_payment_method,
        purchase_limit_per_address,
        max_tickets_per_order
       FROM event_purchase_limits
       WHERE event_id = $1`,
      [eventId]
    );

    if (result.rows.length > 0) {
      return {
        perUser: result.rows[0].purchase_limit_per_user || 4,
        perPaymentMethod: result.rows[0].purchase_limit_per_payment_method || 4,
        perAddress: result.rows[0].purchase_limit_per_address || 8,
        perEvent: result.rows[0].max_tickets_per_order || 4
      };
    }

    // Default limits
    return {
      perUser: 4,
      perPaymentMethod: 4,
      perAddress: 8,
      perEvent: 4
    };
  }

  private async getUserPurchaseCount(
    userId: string,
    eventId: string
  ): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND event_id = $2
         AND status IN ('completed', 'processing')`,
      [userId, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private async getPaymentMethodPurchaseCount(
    paymentFingerprint: string,
    eventId: string
  ): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total
       FROM payment_transactions
       WHERE payment_method_fingerprint = $1
         AND event_id = $2
         AND status IN ('completed', 'processing')`,
      [paymentFingerprint, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private async getAddressPurchaseCount(
    address: string,
    eventId: string
  ): Promise<number> {
    // Normalize address for comparison
    const normalizedAddress = this.normalizeAddress(address);

    const result = await query(
      `SELECT SUM(pt.ticket_count) as total
       FROM payment_transactions pt
       JOIN user_addresses ua ON pt.user_id = ua.user_id
       WHERE ua.normalized_address = $1
         AND pt.event_id = $2
         AND pt.status IN ('completed', 'processing')`,
      [normalizedAddress, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private normalizeAddress(address: string): string {
    // Simple normalization - in production use address validation service
    return address.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async getUserAddress(userId: string): Promise<string | null> {
    const result = await query(
      `SELECT billing_address FROM users WHERE id = $1`,
      [userId]
    );

    return result.rows[0]?.billing_address || null;
  }

  private async checkCooldownPeriod(
    userId: string,
    eventId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
    const cooldownKey = `cooldown:${userId}:${eventId}`;

    const exists = await this.redis.exists(cooldownKey);

    if (exists) {
      const ttl = await this.redis.ttl(cooldownKey);
      const minutesRemaining = Math.ceil(ttl / 60);

      return {
        allowed: false,
        reason: `Please wait ${minutesRemaining} minutes before purchasing more tickets`
      };
    }

    return { allowed: true };
  }

  async recordPurchase(
    userId: string,
    eventId: string,
    quantity: number,
    paymentMethod: any
  ): Promise<void> {
    // Set cooldown
    const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
    const cooldownKey = `cooldown:${userId}:${eventId}`;

    await this.redis.setEx(cooldownKey, cooldownMinutes * 60, '1');

    // Update purchase counts (handled by transaction creation)
  }

  async enforceDynamicLimits(
    eventId: string,
    demandLevel: number
  ): Promise<void> {
    // Adjust limits based on demand
    let perUserLimit = 4;
    let perPaymentLimit = 4;

    if (demandLevel > 0.9) {
      // Very high demand - strict limits
      perUserLimit = 2;
      perPaymentLimit = 2;
    } else if (demandLevel > 0.7) {
      // High demand - moderate limits
      perUserLimit = 3;
      perPaymentLimit = 3;
    }

    await query(
      `UPDATE event_purchase_limits
       SET purchase_limit_per_user = $2,
           purchase_limit_per_payment_method = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1`,
      [eventId, perUserLimit, perPaymentLimit]
    );
  }

  async getPurchaseLimitStats(eventId: string): Promise<{
    uniquePurchasers: number;
    averageTicketsPerPurchaser: number;
    maxTicketsPurchased: number;
    limitViolationsBlocked: number;
  }> {
    const statsQuery = `
      SELECT
        COUNT(DISTINCT user_id) as unique_purchasers,
        AVG(tickets_per_user) as avg_tickets,
        MAX(tickets_per_user) as max_tickets,
        COUNT(*) FILTER (WHERE violation_type IS NOT NULL) as violations
      FROM (
        SELECT
          user_id,
          SUM(ticket_count) as tickets_per_user,
          NULL as violation_type
        FROM payment_transactions
        WHERE event_id = $1 AND status = 'completed'
        GROUP BY user_id

        UNION ALL

        SELECT
          user_id,
          0 as tickets_per_user,
          reason as violation_type
        FROM purchase_limit_violations
        WHERE event_id = $1
      ) as purchase_stats
    `;

    const result = await query(statsQuery, [eventId]);

    return {
      uniquePurchasers: parseInt(result.rows[0].unique_purchasers),
      averageTicketsPerPurchaser: parseFloat(result.rows[0].avg_tickets) || 0,
      maxTicketsPurchased: parseInt(result.rows[0].max_tickets) || 0,
      limitViolationsBlocked: parseInt(result.rows[0].violations) || 0
    };
  }
}
```

### FILE: src/services/high-demand/waiting-room.service.ts
```typescript
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { query } from '../../config/database';

// SECURITY FIX: Phase 2.2 - Use cryptographically signed JWT tokens
const QUEUE_TOKEN_SECRET = process.env.QUEUE_TOKEN_SECRET || (() => {
  console.error('WARNING: QUEUE_TOKEN_SECRET not set. Using default for development only.');
  return 'dev-secret-change-in-production';
})();

export interface QueueTokenPayload {
  sub: string;      // userId
  evt: string;      // eventId  
  qid: string;      // queueId
  scope: 'queue';
  iat: number;
  exp: number;
  jti: string;      // unique token ID
}

export class WaitingRoomService {
  private redis: any; // TODO: Add proper Redis client type
  private processingRate: number = 100; // Users per minute

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.connect().catch(console.error);
  }

  async joinWaitingRoom(
    eventId: string,
    userId: string,
    sessionId: string,
    priority: number = 0
  ): Promise<{
    queueId: string;
    position: number;
    estimatedWaitTime: number;
    status: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const queueId = uuidv4();
    const timestamp = Date.now();

    // Check if user already in queue
    const existingPosition = await this.getUserPosition(eventId, userId);
    if (existingPosition) {
      return existingPosition;
    }

    // Calculate score (lower timestamp = higher priority, with priority boost)
    const score = timestamp - (priority * 1000000); // Priority users get million-point boost

    // Add to sorted set
    await this.redis.zAdd(queueKey, {
      score: score,
      value: JSON.stringify({
        queueId,
        userId,
        sessionId,
        timestamp,
        priority
      })
    });

    // Set queue expiry (2 hours)
    await this.redis.expire(queueKey, 7200);

    // Get position and estimate
    const position = await this.getQueuePosition(queueKey, queueId);
    const estimatedWaitTime = this.calculateWaitTime(position);

    // Record queue join
    await this.recordQueueActivity(eventId, userId, 'joined', { queueId, position });

    return {
      queueId,
      position,
      estimatedWaitTime,
      status: position === 1 ? 'ready' : 'waiting'
    };
  }

  async checkPosition(
    eventId: string,
    queueId: string
  ): Promise<{
    position: number;
    estimatedWaitTime: number;
    status: string;
    accessToken?: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;

    // Get current position
    const position = await this.getQueuePosition(queueKey, queueId);

    if (position === 0) {
      return {
        position: 0,
        estimatedWaitTime: 0,
        status: 'expired'
      };
    }

    // Check if user's turn
    const activeSlots = await this.getActiveSlots(eventId);

    if (position <= activeSlots) {
      // Generate access token - SECURITY FIX: Use JWT instead of predictable string
      const accessToken = await this.generateAccessToken(eventId, queueId);

      return {
        position,
        estimatedWaitTime: 0,
        status: 'ready',
        accessToken
      };
    }

    return {
      position,
      estimatedWaitTime: this.calculateWaitTime(position - activeSlots),
      status: 'waiting'
    };
  }

  async processQueue(eventId: string): Promise<{
    processed: number;
    remaining: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const processingKey = `processing:${eventId}`;

    // Get current queue size
    const queueSize = await this.redis.zCard(queueKey) || 0;

    if (queueSize === 0) {
      return { processed: 0, remaining: 0 };
    }

    // Calculate how many to process
    const activeCount = await this.getActiveUserCount(eventId);
    const maxActive = await this.getMaxActiveUsers(eventId);
    const toProcess = Math.min(
      maxActive - activeCount,
      this.processingRate,
      queueSize
    );

    if (toProcess <= 0) {
      return { processed: 0, remaining: queueSize };
    }

    // Get next batch of users
    const users = await this.redis.zRange(queueKey, 0, toProcess - 1) || [];

    // Process each user
    let processed = 0;
    for (const userJson of users) {
      const user = JSON.parse(userJson);

      // Move to processing
      await this.moveToProcessing(eventId, user);
      processed++;

      // Remove from queue
      await this.redis.zRem(queueKey, userJson);
    }

    return {
      processed,
      remaining: queueSize - processed
    };
  }

  private async getQueuePosition(
    queueKey: string,
    queueId: string
  ): Promise<number> {
    // Find member with this queueId
    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.queueId === queueId) {
        return i + 1; // 1-indexed position
      }
    }

    return 0; // Not found
  }

  private calculateWaitTime(position: number): number {
    // Estimate based on processing rate
    const minutes = Math.ceil(position / this.processingRate);
    return minutes;
  }

  // SECURITY FIX: Phase 2.2 - Replace predictable token with signed JWT
  private async generateAccessToken(
    eventId: string,
    queueId: string,
    userId?: string
  ): Promise<string> {
    // Get userId from queue if not provided
    if (!userId) {
      const queueKey = `waiting_room:${eventId}`;
      const members = await this.redis.zRange(queueKey, 0, -1) || [];
      for (const memberJson of members) {
        const member = JSON.parse(memberJson);
        if (member.queueId === queueId) {
          userId = member.userId;
          break;
        }
      }
    }

    const payload: QueueTokenPayload = {
      sub: userId || 'unknown',
      evt: eventId,
      qid: queueId,
      scope: 'queue',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 min validity
      jti: uuidv4() // Unique token ID
    };

    // Sign the token
    const token = jwt.sign(payload, QUEUE_TOKEN_SECRET, {
      algorithm: 'HS256',
      issuer: 'waiting-room'
    });

    // Still store in Redis for quick validation and revocation
    const tokenKey = `access_token:${payload.jti}`;
    await this.redis.setEx(tokenKey, 600, JSON.stringify({
      eventId,
      queueId,
      userId: userId || 'unknown',
      grantedAt: new Date()
    }));

    return token;
  }

  // SECURITY FIX: Phase 2.2 - Validate JWT signature
  async validateAccessToken(token: string): Promise<{
    valid: boolean;
    eventId?: string;
  }> {
    try {
      // Verify JWT signature
      const decoded = jwt.verify(token, QUEUE_TOKEN_SECRET, {
        algorithms: ['HS256'],
        issuer: 'waiting-room'
      }) as QueueTokenPayload;

      // Check if token scope is correct
      if (decoded.scope !== 'queue') {
        return { valid: false };
      }

      // Check if token still exists in Redis (for revocation)
      const tokenKey = `access_token:${decoded.jti}`;
      const redisData = await this.redis.get(tokenKey);

      if (!redisData) {
        // Token was revoked or expired in Redis
        return { valid: false };
      }

      return {
        valid: true,
        eventId: decoded.evt
      };
    } catch (err) {
      // Invalid signature, expired, or malformed token
      return { valid: false };
    }
  }

  private async getActiveSlots(eventId: string): Promise<number> {
    // Get event configuration
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async getActiveUserCount(eventId: string): Promise<number> {
    const activeKey = `active_users:${eventId}`;
    return await this.redis.sCard(activeKey) || 0;
  }

  private async getMaxActiveUsers(eventId: string): Promise<number> {
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async moveToProcessing(eventId: string, user: any): Promise<void> {
    const activeKey = `active_users:${eventId}`;

    await this.redis.sAdd(activeKey, user.userId);

    // Set expiry on active user (10 minutes to complete purchase)
    await this.redis.expire(activeKey, 600);
  }

  private async recordQueueActivity(
    eventId: string,
    userId: string,
    action: string,
    metadata: any
  ): Promise<void> {
    await query(
      `INSERT INTO waiting_room_activity
       (event_id, user_id, action, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [eventId, userId, action, JSON.stringify(metadata)]
    );
  }

  private async getEventConfig(eventId: string): Promise<any> {
    // In production, get from event service
    return {
      maxConcurrentPurchasers: 100,
      processingRate: 100
    };
  }

  private async getUserPosition(
    eventId: string,
    userId: string
  ): Promise<any | null> {
    const queueKey = `waiting_room:${eventId}`;

    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.userId === userId) {
        return {
          queueId: member.queueId,
          position: i + 1,
          estimatedWaitTime: this.calculateWaitTime(i + 1),
          status: 'waiting'
        };
      }
    }

    return null;
  }

  async getQueueStats(eventId: string): Promise<{
    totalInQueue: number;
    activeUsers: number;
    processingRate: number;
    averageWaitTime: number;
    abandonmentRate: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const activeKey = `active_users:${eventId}`;

    const [queueSize, activeCount] = await Promise.all([
      this.redis.zCard(queueKey),
      this.redis.sCard(activeKey)
    ]);

    // Calculate abandonment rate from activity logs
    const abandonmentStats = await query(
      `SELECT
        COUNT(*) FILTER (WHERE action = 'abandoned') as abandoned,
        COUNT(*) FILTER (WHERE action = 'joined') as joined
       FROM waiting_room_activity
       WHERE event_id = $1
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      [eventId]
    );

    const abandoned = parseInt(abandonmentStats.rows[0].abandoned);
    const joined = parseInt(abandonmentStats.rows[0].joined);
    const abandonmentRate = joined > 0 ? (abandoned / joined) * 100 : 0;

    return {
      totalInQueue: queueSize || 0,
      activeUsers: activeCount || 0,
      processingRate: this.processingRate,
      averageWaitTime: queueSize && queueSize > 0 ? Math.ceil(queueSize / this.processingRate) : 0,
      abandonmentRate
    };
  }
}
```

### FILE: src/services/high-demand/bot-detector.service.ts
```typescript
import { query } from '../../config/database';

export class BotDetectorService {
  private botIndicators = {
    // Timing patterns
    rapidClicking: { weight: 0.3, threshold: 100 }, // ms between actions
    consistentTiming: { weight: 0.2, threshold: 0.1 }, // timing variance
    impossibleSpeed: { weight: 0.4, threshold: 50 }, // ms to complete form
    
    // Behavior patterns
    noMouseMovement: { weight: 0.3, threshold: 0 },
    linearMousePath: { weight: 0.2, threshold: 0.9 },
    noScrolling: { weight: 0.1, threshold: 0 },
    
    // Technical indicators
    headlessBrowser: { weight: 0.4, threshold: 1 },
    automationTools: { weight: 0.5, threshold: 1 },
    suspiciousUserAgent: { weight: 0.3, threshold: 1 }
  };
  
  async detectBot(sessionData: {
    userId: string;
    sessionId: string;
    userAgent: string;
    actions: Array<{
      type: string;
      timestamp: number;
      x?: number;
      y?: number;
    }>;
    browserFeatures: {
      webdriver?: boolean;
      languages?: string[];
      plugins?: any[];
      permissions?: any;
      webgl?: string;
    };
  }): Promise<{
    isBot: boolean;
    confidence: number;
    indicators: string[];
    recommendation: string;
  }> {
    const indicators: string[] = [];
    let totalScore = 0;
    
    // Check timing patterns
    const timingScore = this.analyzeTimingPatterns(sessionData.actions);
    if (timingScore.score > 0) {
      indicators.push(...timingScore.indicators);
      totalScore += timingScore.score;
    }
    
    // Check mouse patterns
    const mouseScore = this.analyzeMousePatterns(sessionData.actions);
    if (mouseScore.score > 0) {
      indicators.push(...mouseScore.indicators);
      totalScore += mouseScore.score;
    }
    
    // Check browser features
    const browserScore = this.analyzeBrowserFeatures(
      sessionData.browserFeatures,
      sessionData.userAgent
    );
    if (browserScore.score > 0) {
      indicators.push(...browserScore.indicators);
      totalScore += browserScore.score;
    }
    
    // Check historical patterns
    const historicalScore = await this.analyzeHistoricalPatterns(
      sessionData.userId,
      sessionData.sessionId
    );
    if (historicalScore.score > 0) {
      indicators.push(...historicalScore.indicators);
      totalScore += historicalScore.score;
    }
    
    // Determine if bot
    const confidence = Math.min(totalScore, 1);
    const isBot = confidence >= 0.7;
    
    // Record detection
    await this.recordBotDetection(sessionData, {
      isBot,
      confidence,
      indicators
    });
    
    return {
      isBot,
      confidence,
      indicators,
      recommendation: this.getRecommendation(confidence, indicators)
    };
  }
  
  private analyzeTimingPatterns(actions: any[]): {
    score: number;
    indicators: string[];
  } {
    if (actions.length < 2) {
      return { score: 0, indicators: [] };
    }
    
    const indicators: string[] = [];
    let score = 0;
    
    // Calculate time between actions
    const timeDiffs: number[] = [];
    for (let i = 1; i < actions.length; i++) {
      timeDiffs.push(actions[i].timestamp - actions[i - 1].timestamp);
    }
    
    // Check for rapid clicking
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    if (avgTimeDiff < this.botIndicators.rapidClicking.threshold) {
      indicators.push('rapid_clicking');
      score += this.botIndicators.rapidClicking.weight;
    }
    
    // Check for consistent timing (low variance)
    const variance = this.calculateVariance(timeDiffs);
    const coefficientOfVariation = variance / avgTimeDiff;
    
    if (coefficientOfVariation < this.botIndicators.consistentTiming.threshold) {
      indicators.push('consistent_timing');
      score += this.botIndicators.consistentTiming.weight;
    }
    
    // Check for impossible speed
    const formCompletionTime = actions[actions.length - 1].timestamp - actions[0].timestamp;
    if (formCompletionTime < this.botIndicators.impossibleSpeed.threshold) {
      indicators.push('impossible_speed');
      score += this.botIndicators.impossibleSpeed.weight;
    }
    
    return { score, indicators };
  }
  
  private analyzeMousePatterns(actions: any[]): {
    score: number;
    indicators: string[];
  } {
    const mouseActions = actions.filter(a => 
      a.type === 'mousemove' || a.type === 'click'
    );
    
    if (mouseActions.length < 5) {
      return { score: 0, indicators: [] };
    }
    
    const indicators: string[] = [];
    let score = 0;
    
    // Check for mouse movement
    const hasMouseMovement = mouseActions.some(a => a.type === 'mousemove');
    if (!hasMouseMovement) {
      indicators.push('no_mouse_movement');
      score += this.botIndicators.noMouseMovement.weight;
    }
    
    // Check for linear paths
    if (mouseActions.length >= 3) {
      const linearity = this.calculatePathLinearity(mouseActions);
      if (linearity > this.botIndicators.linearMousePath.threshold) {
        indicators.push('linear_mouse_path');
        score += this.botIndicators.linearMousePath.weight;
      }
    }
    
    // Check for scrolling
    const hasScrolling = actions.some(a => a.type === 'scroll');
    if (!hasScrolling && actions.length > 10) {
      indicators.push('no_scrolling');
      score += this.botIndicators.noScrolling.weight;
    }
    
    return { score, indicators };
  }
  
  private analyzeBrowserFeatures(
    features: any,
    userAgent: string
  ): {
    score: number;
    indicators: string[];
  } {
    const indicators: string[] = [];
    let score = 0;
    
    // Check for webdriver
    if (features.webdriver) {
      indicators.push('webdriver_detected');
      score += this.botIndicators.headlessBrowser.weight;
    }
    
    // Check for headless browser indicators
    if (!features.plugins || features.plugins.length === 0) {
      indicators.push('no_plugins');
      score += 0.1;
    }
    
    if (!features.languages || features.languages.length === 0) {
      indicators.push('no_languages');
      score += 0.1;
    }
    
    // Check user agent
    const suspiciousPatterns = [
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i,
      /playwright/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      indicators.push('suspicious_user_agent');
      score += this.botIndicators.suspiciousUserAgent.weight;
    }
    
    return { score, indicators };
  }
  
  private async analyzeHistoricalPatterns(
    userId: string,
    sessionId: string
  ): Promise<{
    score: number;
    indicators: string[];
  }> {
    const indicators: string[] = [];
    let score = 0;
    
    // Check for multiple failed attempts
    const failedAttempts = await query(
      `SELECT COUNT(*) as count
       FROM bot_detections
       WHERE user_id = $1
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
         AND is_bot = true`,
      [userId]
    );
    
    if (parseInt(failedAttempts.rows[0].count) > 3) {
      indicators.push('multiple_bot_detections');
      score += 0.3;
    }
    
    // Check for IP reputation
    const ipReputation = await this.checkIPReputation(sessionId);
    if (ipReputation.suspicious) {
      indicators.push('suspicious_ip');
      score += 0.2;
    }
    
    return { score, indicators };
  }
  
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }
  
  private calculatePathLinearity(mouseActions: any[]): number {
    if (mouseActions.length < 3) return 0;
    
    // Calculate the straightness of the path
    let totalDistance = 0;
    let directDistance = 0;
    
    for (let i = 1; i < mouseActions.length; i++) {
      const dx = mouseActions[i].x - mouseActions[i - 1].x;
      const dy = mouseActions[i].y - mouseActions[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    
    const firstPoint = mouseActions[0];
    const lastPoint = mouseActions[mouseActions.length - 1];
    const dx = lastPoint.x - firstPoint.x;
    const dy = lastPoint.y - firstPoint.y;
    directDistance = Math.sqrt(dx * dx + dy * dy);
    
    return directDistance / (totalDistance || 1);
  }
  
  private async checkIPReputation(sessionId: string): Promise<{
    suspicious: boolean;
  }> {
    // Check if IP is from known bot networks, VPNs, or proxies
    // In production, integrate with IP reputation service
    return { suspicious: false };
  }
  
  private getRecommendation(confidence: number, indicators: string[]): string {
    if (confidence >= 0.9) {
      return 'block_immediately';
    } else if (confidence >= 0.7) {
      return 'require_captcha';
    } else if (confidence >= 0.5) {
      return 'increase_monitoring';
    } else {
      return 'allow';
    }
  }
  
  private async recordBotDetection(
    sessionData: any,
    detection: any
  ): Promise<void> {
    await query(
      `INSERT INTO bot_detections 
       (user_id, session_id, is_bot, confidence, 
        indicators, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        sessionData.userId,
        sessionData.sessionId,
        detection.isBot,
        detection.confidence,
        JSON.stringify(detection.indicators),
        sessionData.userAgent
      ]
    );
  }
  
  async trainModel(verifiedData: Array<{
    sessionId: string;
    wasBot: boolean;
  }>): Promise<void> {
    // Update bot detection model based on verified data
    // In production, this would update ML model weights
    console.log(`Training bot detection model with ${verifiedData.length} samples`);
  }
}
```

### FILE: src/services/state-machine/transitions.ts
```typescript
import { PaymentState, PaymentStateMachine } from './payment-state-machine';
import { OrderState, OrderStateMachine } from './order-state-machine';
import { Pool } from 'pg';

export interface TransitionContext {
  paymentId: string;
  orderId: string;
  provider: string;
  amount: number;
  metadata?: Record<string, any>;
}

export class StateTransitionService {
  private paymentStateMachine: PaymentStateMachine;
  private db: Pool;

  constructor(db: Pool) {
    this.paymentStateMachine = new PaymentStateMachine();
    this.db = db;
  }

  async handlePaymentEvent(
    event: string,
    currentState: PaymentState,
    context: TransitionContext
  ): Promise<PaymentState> {
    if (!this.paymentStateMachine.canTransition(currentState, event)) {
      throw new Error(`Invalid transition: ${currentState} cannot handle ${event}`);
    }

    const newState = this.paymentStateMachine.transition(currentState, event);

    // Update database
    await this.db.query(
      'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
      [newState, context.paymentId]
    );

    // Update order state based on payment state
    await this.syncOrderState(context.orderId, newState);

    return newState;
  }

  private async syncOrderState(orderId: string, paymentState: PaymentState): Promise<void> {
    const orderStateMap: Record<PaymentState, OrderState> = {
      [PaymentState.PENDING]: OrderState.PAYMENT_PENDING,
      [PaymentState.PROCESSING]: OrderState.PAYMENT_PROCESSING,
      [PaymentState.COMPLETED]: OrderState.PAID,
      [PaymentState.FAILED]: OrderState.PAYMENT_FAILED,
      [PaymentState.REFUNDED]: OrderState.REFUNDED,
      [PaymentState.CANCELLED]: OrderState.CANCELLED
    };

    const newOrderState = orderStateMap[paymentState];
    if (newOrderState) {
      await this.db.query(
        'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
        [newOrderState, orderId]
      );
    }
  }
}
```

### FILE: src/services/state-machine/payment-state-machine.ts
```typescript
export enum PaymentState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export interface PaymentTransition {
  from: PaymentState;
  to: PaymentState;
  event: string;
  guard?: (context: any) => boolean;
}

export class PaymentStateMachine {
  private transitions: Map<string, PaymentTransition[]> = new Map();
  
  constructor() {
    this.setupTransitions();
  }

  private setupTransitions() {
    // Define valid state transitions
    this.addTransition(PaymentState.PENDING, PaymentState.PROCESSING, 'process');
    this.addTransition(PaymentState.PROCESSING, PaymentState.COMPLETED, 'complete');
    this.addTransition(PaymentState.PROCESSING, PaymentState.FAILED, 'fail');
    this.addTransition(PaymentState.FAILED, PaymentState.PROCESSING, 'retry');
    this.addTransition(PaymentState.COMPLETED, PaymentState.REFUNDED, 'refund');
    this.addTransition(PaymentState.PENDING, PaymentState.CANCELLED, 'cancel');
  }

  private addTransition(from: PaymentState, to: PaymentState, event: string) {
    const key = `${from}-${event}`;
    if (!this.transitions.has(key)) {
      this.transitions.set(key, []);
    }
    this.transitions.get(key)!.push({ from, to, event });
  }

  canTransition(from: PaymentState, event: string): boolean {
    const key = `${from}-${event}`;
    return this.transitions.has(key);
  }

  transition(from: PaymentState, event: string): PaymentState {
    const key = `${from}-${event}`;
    const transitions = this.transitions.get(key);
    if (!transitions || transitions.length === 0) {
      throw new Error(`Invalid transition: ${from} -> ${event}`);
    }
    return transitions[0].to;
  }
}
```

### FILE: src/services/databaseService.ts
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

### FILE: src/services/core/venue-balance.service.ts
```typescript
import { VenueBalanceModel } from '../../models';
import { VenueBalance } from '../../types';
import { chargebackReserves, payoutThresholds } from '../../config/fees';

export class VenueBalanceService {
  async getBalance(venueId: string): Promise<VenueBalance> {
    return VenueBalanceModel.getBalance(venueId);
  }
  
  async calculatePayoutAmount(venueId: string): Promise<{
    available: number;
    reserved: number;
    payable: number;
  }> {
    const balance = await this.getBalance(venueId);
    
    // Calculate required reserve based on venue risk
    const riskLevel = await this.getVenueRiskLevel(venueId);
    const reservePercentage = chargebackReserves[riskLevel];
    const requiredReserve = balance.available * (reservePercentage / 100);
    
    // Ensure minimum reserve
    const currentReserve = balance.reserved;
    const additionalReserve = Math.max(0, requiredReserve - currentReserve);
    
    // Calculate payable amount
    const payable = Math.max(
      0,
      balance.available - additionalReserve - payoutThresholds.minimum
    );
    
    return {
      available: balance.available,
      reserved: requiredReserve,
      payable: payable >= payoutThresholds.minimum ? payable : 0
    };
  }
  
  private async getVenueRiskLevel(venueId: string): Promise<'low' | 'medium' | 'high'> {
    // In production, this would analyze:
    // - Chargeback history
    // - Time in business
    // - Transaction volume
    // - Event types
    
    // Placeholder
    return 'medium';
  }
  
  async processPayout(venueId: string, amount: number): Promise<void> {
    const { payable } = await this.calculatePayoutAmount(venueId);
    
    if (amount > payable) {
      throw new Error('Insufficient funds for payout');
    }
    
    if (amount > payoutThresholds.maximumDaily) {
      throw new Error('Exceeds daily payout limit');
    }
    
    // Move from available to processing
    await VenueBalanceModel.updateBalance(venueId, -amount, 'available');
    
    // In production, would initiate actual bank transfer here
    // For now, just mark as processed
    console.log(`Processing payout of $${amount} for venue ${venueId}`);
  }
}
```

### FILE: src/services/webhooks/outbound-webhook.ts
```typescript
import axios from 'axios';
import crypto from 'crypto';
import { Pool } from 'pg';

export interface OutboundWebhook {
  url: string;
  event: string;
  payload: any;
  secret: string;
}

export class OutboundWebhookService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async send(webhook: OutboundWebhook): Promise<void> {
    const signature = this.generateSignature(webhook.payload, webhook.secret);
    
    try {
      const response = await axios.post(webhook.url, webhook.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': webhook.event
        },
        timeout: 5000
      });

      await this.logWebhook(webhook, response.status, null);
    } catch (error: any) {
      await this.logWebhook(webhook, error.response?.status || 0, error.message);
      throw error;
    }
  }

  private generateSignature(payload: any, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  private async logWebhook(webhook: OutboundWebhook, status: number, error: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO outbound_webhooks (url, event, payload, status, error, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [webhook.url, webhook.event, JSON.stringify(webhook.payload), status, error]
    );
  }
}
```

### FILE: src/services/queueService.ts
```typescript
const amqp = require('amqplib');
// import { QUEUES } from '@tickettoken/shared/src/mq/queues'; // Commented out - unused

export class QueueService {
  private connection: any = null;
  private channel: any = null;

  async connect(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect(process.env.AMQP_URL || 'amqp://rabbitmq:5672');
      this.channel = await this.connection.createChannel();
    }
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    await this.channel.assertQueue(queue, { durable: true });
    const buffer = Buffer.from(JSON.stringify(message));
    await this.channel.sendToQueue(queue, buffer, { persistent: true });
  }

  async close(): Promise<void> {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    this.channel = null;
    this.connection = null;
  }
}

export const queueService = new QueueService();
```

### FILE: src/webhooks/stripe-handler.ts
```typescript
import Stripe from 'stripe';
import { Pool } from 'pg';
import { StateTransitionService } from '../services/state-machine/transitions';
import { PaymentState } from '../services/state-machine/payment-state-machine';

export class StripeWebhookHandler {
  private stripe: Stripe;
  private db: Pool;
  private stateService: StateTransitionService;

  constructor(stripe: Stripe, db: Pool) {
    this.stripe = stripe;
    this.db = db;
    this.stateService = new StateTransitionService(db);
  }

  async handleWebhook(payload: string, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err}`);
    }

    // Store in webhook inbox for idempotency
    const existingWebhook = await this.db.query(
      'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
      [event.id]
    );

    if (existingWebhook.rows.length > 0) {
      console.log(`Webhook ${event.id} already processed, skipping`);
      return;
    }

    await this.db.query(
      `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
       VALUES ($1, $2, $3, $4, $5)`,
      [event.id, 'stripe', event.type, JSON.stringify(event), false]
    );

    // Process based on event type
    await this.processEvent(event);

    // Mark as processed
    await this.db.query(
      'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE webhook_id = $1',
      [event.id]
    );
  }

  private async processEvent(event: Stripe.Event): Promise<void> {
    const eventMap: Record<string, string> = {
      'payment_intent.succeeded': 'complete',
      'payment_intent.payment_failed': 'fail',
      'payment_intent.processing': 'process',
      'payment_intent.canceled': 'cancel',
      'charge.refunded': 'refund'
    };

    const stateEvent = eventMap[event.type];
    if (!stateEvent) {
      console.log(`Unhandled event type: ${event.type}`);
      return;
    }

    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    
    // Get current payment state from database
    const payment = await this.db.query(
      'SELECT id, state, order_id FROM payments WHERE provider_payment_id = $1',
      [paymentIntent.id]
    );

    if (payment.rows.length === 0) {
      console.error(`Payment not found for intent: ${paymentIntent.id}`);
      return;
    }

    const currentState = payment.rows[0].state as PaymentState;
    
    await this.stateService.handlePaymentEvent(stateEvent, currentState, {
      paymentId: payment.rows[0].id,
      orderId: payment.rows[0].order_id,
      provider: 'stripe',
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata
    });
  }
}
```

### FILE: src/workers/outbox.processor.ts
```typescript
import { Pool } from 'pg';
import axios from 'axios';
import crypto from 'crypto';
import { logger } from '../utils/logger';

const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';
const MAX_RETRY_ATTEMPTS = 5;
const INITIAL_RETRY_DELAY = 1000; // 1 second

export class OutboxProcessor {
  private pool: Pool;
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private log = logger.child({ component: 'OutboxProcessor' });

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL || 
        `postgresql://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`
    });
  }

  async start() {
    this.log.info('Starting outbox processor...');
    // Process every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processOutboxEvents();
    }, 5000);
    
    // Also process immediately
    this.processOutboxEvents();
  }

  async stop() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.log.info('Outbox processor stopped');
  }

  private createSignature(payload: any, timestamp: string, nonce: string): string {
    const signaturePayload = `${timestamp}.${nonce}.${JSON.stringify(payload)}`;
    return crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(signaturePayload)
      .digest('hex');
  }

  private calculateRetryDelay(attempts: number): number {
    // Exponential backoff with jitter
    const baseDelay = INITIAL_RETRY_DELAY * Math.pow(2, attempts);
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    return Math.min(baseDelay + jitter, 60000); // Max 1 minute
  }

  private async processOutboxEvents() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    const client = await this.pool.connect();

    try {
      // Get unprocessed events or events that need retry
      const result = await client.query(`
        SELECT * FROM outbox 
        WHERE processed_at IS NULL 
          AND attempts < $1
          AND (
            last_attempt_at IS NULL 
            OR last_attempt_at < NOW() - INTERVAL '1 second' * $2
          )
        ORDER BY created_at ASC
        LIMIT 10
        FOR UPDATE SKIP LOCKED
      `, [MAX_RETRY_ATTEMPTS, this.calculateRetryDelay(0) / 1000]);

      for (const event of result.rows) {
        await this.processEvent(client, event);
      }

      if (result.rows.length > 0) {
        this.log.info(`Processed ${result.rows.length} outbox events`);
      }

    } catch (error) {
      this.log.error('Error processing outbox events:', error);
    } finally {
      client.release();
      this.isProcessing = false;
    }
  }

  private async processEvent(client: any, event: any) {
    const retryDelay = this.calculateRetryDelay(event.attempts || 0);

    try {
      // Check if we should wait before retrying
      if (event.last_attempt_at) {
        const timeSinceLastAttempt = Date.now() - new Date(event.last_attempt_at).getTime();
        if (timeSinceLastAttempt < retryDelay) {
          return; // Skip this event for now
        }
      }

      this.log.info(`Processing outbox event: ${event.event_type}`, {
        eventId: event.id,
        aggregateId: event.aggregate_id,
        attempts: event.attempts
      });

      let success = false;

      switch (event.event_type) {
        case 'order.paid':
          success = await this.handleOrderPaid(event);
          break;
        case 'order.payment_failed':
          success = await this.handlePaymentFailed(event);
          break;
        case 'tickets.create':
          success = await this.handleTicketCreation(event);
          break;
        default:
          this.log.warn(`Unknown event type: ${event.event_type}`);
          success = true; // Mark as processed to avoid infinite loop
      }

      if (success) {
        // Mark as processed
        await client.query(`
          UPDATE outbox 
          SET processed_at = NOW()
          WHERE id = $1
        `, [event.id]);

        this.log.info(`Successfully processed event ${event.id}`);
      } else {
        // Update retry attempt
        await client.query(`
          UPDATE outbox 
          SET attempts = attempts + 1,
              last_attempt_at = NOW(),
              last_error = 'Processing failed'
          WHERE id = $1
        `, [event.id]);

        this.log.warn(`Failed to process event ${event.id}, will retry`);
      }

    } catch (error: any) {
      this.log.error(`Error processing event ${event.id}:`, error);

      // Update retry attempt with error message
      await client.query(`
        UPDATE outbox 
        SET attempts = attempts + 1,
            last_attempt_at = NOW(),
            last_error = $2
        WHERE id = $1
      `, [event.id, error.message || 'Unknown error']);

      // If we've exceeded max attempts, move to DLQ
      if ((event.attempts || 0) + 1 >= MAX_RETRY_ATTEMPTS) {
        await this.moveToDeadLetterQueue(client, event, error.message);
      }
    }
  }

  private async handleOrderPaid(event: any): Promise<boolean> {
    const payload = event.payload;
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    try {
      const requestBody = {
        orderId: payload.orderId,
        paymentId: payload.paymentId,
        userId: payload.userId,
        eventId: payload.eventId,
        amount: payload.amount,
        ticketQuantity: payload.ticketQuantity || payload.quantity,
        idempotencyKey: `payment-${payload.orderId}-${payload.paymentId}`,
        timestamp: new Date().toISOString()
      };

      const signature = this.createSignature(requestBody, timestamp, nonce);

      // Notify ticket service to create tickets
      const response = await axios.post(
        'http://ticket:3004/api/v1/webhooks/payment-confirmed',
        requestBody,
        {
          headers: {
            'x-internal-signature': signature,
            'x-webhook-timestamp': timestamp,
            'x-webhook-nonce': nonce,
            'x-idempotency-key': requestBody.idempotencyKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.status >= 200 && response.status < 300;

    } catch (error: any) {
      this.log.error('Failed to notify ticket service of payment:', {
        orderId: payload.orderId,
        error: error.message
      });

      // Return false to trigger retry
      return false;
    }
  }

  private async handlePaymentFailed(event: any): Promise<boolean> {
    const payload = event.payload;
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();

    try {
      const requestBody = {
        orderId: payload.orderId,
        reason: payload.reason || 'Payment failed',
        timestamp: new Date().toISOString()
      };

      const signature = this.createSignature(requestBody, timestamp, nonce);

      const response = await axios.post(
        'http://ticket:3004/api/v1/webhooks/payment-failed',
        requestBody,
        {
          headers: {
            'x-internal-signature': signature,
            'x-webhook-timestamp': timestamp,
            'x-webhook-nonce': nonce,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.status >= 200 && response.status < 300;

    } catch (error: any) {
      this.log.error('Failed to notify ticket service of payment failure:', {
        orderId: payload.orderId,
        error: error.message
      });
      return false;
    }
  }

  private async handleTicketCreation(event: any): Promise<boolean> {
    const payload = event.payload;
    
    try {
      // Send to minting service queue
      const queueService = require('../services/queueService').queueService;
      await queueService.publish('ticket.mint', payload);
      
      this.log.info('Queued tickets for minting:', {
        orderId: payload.orderId,
        quantity: payload.tickets?.length || 0
      });

      return true;

    } catch (error: any) {
      this.log.error('Failed to queue tickets for minting:', {
        orderId: payload.orderId,
        error: error.message
      });
      return false;
    }
  }

  private async moveToDeadLetterQueue(client: any, event: any, error: string) {
    try {
      await client.query(`
        INSERT INTO outbox_dlq (
          original_id,
          aggregate_id,
          aggregate_type,
          event_type,
          payload,
          attempts,
          last_error,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.id,
        event.aggregate_id,
        event.aggregate_type,
        event.event_type,
        event.payload,
        event.attempts,
        error,
        event.created_at
      ]);

      // Mark original as processed (moved to DLQ)
      await client.query(`
        UPDATE outbox 
        SET processed_at = NOW(),
            last_error = 'Moved to DLQ after max retries'
        WHERE id = $1
      `, [event.id]);

      this.log.warn(`Moved event ${event.id} to dead letter queue after ${event.attempts} attempts`);

    } catch (dlqError) {
      this.log.error(`Failed to move event ${event.id} to DLQ:`, dlqError);
    }
  }
}

export const outboxProcessor = new OutboxProcessor();
```

### FILE: src/validators/payment-request.ts
```typescript
export interface PaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  customerId: string;
  paymentMethod?: string;
  metadata?: Record<string, any>;
}

export class PaymentRequestValidator {
  static validate(request: PaymentRequest): string[] {
    const errors: string[] = [];

    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!request.currency || request.currency.length !== 3) {
      errors.push('Currency must be a 3-letter ISO code');
    }

    if (!request.orderId) {
      errors.push('Order ID is required');
    }

    if (!request.customerId) {
      errors.push('Customer ID is required');
    }

    // Validate amount doesn't exceed maximum
    if (request.amount > 99999999) {
      errors.push('Amount exceeds maximum allowed');
    }

    // Validate currency is supported
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD'];
    if (request.currency && !supportedCurrencies.includes(request.currency.toUpperCase())) {
      errors.push(`Currency ${request.currency} is not supported`);
    }

    return errors;
  }

  static sanitize(request: PaymentRequest): PaymentRequest {
    return {
      ...request,
      amount: Math.round(request.amount), // Ensure integer for cents
      currency: request.currency.toUpperCase(),
      orderId: request.orderId.trim(),
      customerId: request.customerId.trim()
    };
  }
}
```

### FILE: src/validators/webhook-payload.ts
```typescript
export interface WebhookPayload {
  id: string;
  type: string;
  data: any;
  created: number;
}

export class WebhookPayloadValidator {
  static validateStripePayload(payload: any): boolean {
    if (!payload.id || !payload.type || !payload.data) {
      return false;
    }

    // Check required fields based on event type
    if (payload.type.startsWith('payment_intent.')) {
      return this.validatePaymentIntent(payload.data.object);
    }

    if (payload.type.startsWith('charge.')) {
      return this.validateCharge(payload.data.object);
    }

    return true;
  }

  private static validatePaymentIntent(intent: any): boolean {
    return !!(
      intent.id &&
      intent.amount &&
      intent.currency &&
      intent.status
    );
  }

  private static validateCharge(charge: any): boolean {
    return !!(
      charge.id &&
      charge.amount &&
      charge.currency &&
      charge.paid !== undefined
    );
  }

  static validateSquarePayload(payload: any): boolean {
    // Add Square validation when you implement it
    return !!(payload.merchant_id && payload.type && payload.data);
  }
}
```

### FILE: src/types/payment.types.ts
```typescript
export interface PaymentRequest {
  userId: string;
  venueId: string;
  eventId: string;
  tickets: TicketSelection[];
  paymentMethod: PaymentMethod;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

export interface TicketSelection {
  ticketTypeId: string;
  quantity: number;
  price: number;  // STORED AS INTEGER CENTS
  seatNumbers?: string[];
}

export interface PaymentMethod {
  type: 'card' | 'ach' | 'paypal' | 'crypto';
  token?: string;
  paymentMethodId?: string;
}

// All monetary values stored as INTEGER CENTS, not decimal dollars
export interface DynamicFees {
  platform: number;      // cents
  platformPercentage: number;  // for display (7.5 = 7.5%)
  gasEstimate: number;   // cents
  tax: number;           // cents
  total: number;         // cents
  breakdown: FeeBreakdown;
}

export interface FeeBreakdown {
  ticketPrice: number;   // cents
  platformFee: number;   // cents
  gasEstimate: number;   // cents
  stateTax: number;      // cents
  localTax: number;      // cents
  total: number;         // cents
}

export enum VenueTier {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}

// All monetary values stored as INTEGER CENTS
export interface VenueBalance {
  available: number;  // cents
  pending: number;    // cents
  reserved: number;   // cents
  currency: string;
  lastPayout?: Date;
}

// All monetary values stored as INTEGER CENTS
export interface Transaction {
  id: string;
  venueId: string;
  userId: string;
  eventId: string;
  amount: number;         // cents
  currency: string;
  status: TransactionStatus;
  platformFee: number;    // cents
  venuePayout: number;    // cents
  gasFeePaid?: number;    // cents
  taxAmount?: number;     // cents
  totalAmount?: number;   // cents
  stripePaymentIntentId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}
```

### FILE: src/types/blockchain.types.ts
```typescript
export interface NFTMintRequest {
  paymentId: string;
  ticketIds: string[];
  venueId: string;
  eventId: string;
  blockchain: 'solana' | 'polygon';
  priority: 'standard' | 'high' | 'urgent';
}

export interface GasEstimate {
  blockchain: string;
  estimatedFee: number;
  feeInUSD: number;
  congestionLevel: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface MintBatch {
  id: string;
  ticketIds: string[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'collecting';
  transactionHash?: string;
  gasUsed?: number;
  attempts: number;
  error?: string;
}
```

### FILE: src/types/group.types.ts
```typescript
import { TicketSelection } from './payment.types';

export interface GroupPayment {
  id: string;
  organizerId: string;
  eventId: string;
  totalAmount: number;
  ticketSelections: TicketSelection[];
  members: GroupMember[];
  expiresAt: Date;
  status: GroupPaymentStatus;
  createdAt: Date;
}

export interface GroupMember {
  id: string;
  userId?: string;
  email: string;
  name: string;
  amountDue: number;
  paid: boolean;
  paidAt?: Date;
  paymentId?: string;
  remindersSent: number;
}

export enum GroupPaymentStatus {
  COLLECTING = 'collecting',
  COMPLETED = 'completed',
  PARTIALLY_PAID = 'partially_paid',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}
```

### FILE: src/types/marketplace.types.ts
```typescript
export interface ResaleListing {
  id: string;
  ticketId: string;
  sellerId: string;
  price: number;
  originalPrice: number;
  venueRoyaltyPercentage: number;
  status: ListingStatus;
  createdAt: Date;
}

export enum ListingStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SOLD = 'sold',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface EscrowTransaction {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  sellerPayout: number;
  venueRoyalty: number;
  platformFee: number;
  status: EscrowStatus;
  releaseConditions: ReleaseCondition[];
}

export enum EscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

export interface ReleaseCondition {
  type: 'nft_transferred' | 'event_completed' | 'manual_approval';
  satisfied: boolean;
  satisfiedAt?: Date;
}
```

### FILE: src/types/fraud.types.ts
```typescript
export interface FraudCheck {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  score: number;
  signals: FraudSignal[];
  decision: FraudDecision;
  timestamp: Date;
}

export interface FraudSignal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  details: Record<string, any>;
}

export enum SignalType {
  KNOWN_SCALPER = 'known_scalper',
  RAPID_PURCHASES = 'rapid_purchases',
  MULTIPLE_ACCOUNTS = 'multiple_accounts',
  PROXY_DETECTED = 'proxy_detected',
  SUSPICIOUS_CARD = 'suspicious_card',
  BOT_BEHAVIOR = 'bot_behavior'
}

export enum FraudDecision {
  APPROVE = 'approve',
  REVIEW = 'review',
  CHALLENGE = 'challenge',
  DECLINE = 'decline'
}
```

### FILE: src/types/express.d.ts
```typescript
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        venues?: string[];
        isAdmin?: boolean;
      };
      sessionId?: string;
    }
  }
}

export {};
```


================================================================================
## SECTION 2: ALL MODEL/ENTITY/INTERFACE DEFINITIONS
================================================================================

### FILE: src/models/refund.model.ts
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

### FILE: src/models/venue-balance.model.ts
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

### FILE: src/models/transaction.model.ts
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

### FILE: src/middleware/rate-limiter.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { config } from '../config';
import { AuthRequest } from './auth';

const redis = createClient({
  socket: {
    host: config.redis.host,
    port: config.redis.port
  }
});

interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

export function createRateLimiter(options: RateLimitConfig) {
  const {
    windowMs = 60000,
    max = 100,
    message = 'Too many requests',
    keyGenerator = (req: Request) => req.ip,
    skip = () => false
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (skip(req)) {
      return next();
    }

    try {
      const key = `rate-limit:${keyGenerator(req)}`;
      const current = await redis.incr(key);
      
      if (current === 1) {
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      if (current > max) {
        return res.status(429).json({ error: message });
      }

      next();
    } catch (error) {
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

// Connect Redis
redis.connect().catch(console.error);

// Export for backwards compatibility
export const rateLimiter = (name: string, max: number, windowSeconds: number) => {
  return createRateLimiter({
    windowMs: windowSeconds * 1000,
    max: max,
    message: `Too many ${name} requests`
  });
};
```

### FILE: src/middleware/idempotency.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '../services/redisService';
import { validate as isUUID } from 'uuid';

interface IdempotencyOptions {
  ttlMs: number;
}

export function idempotencyMiddleware(options: IdempotencyOptions) {
  const { ttlMs } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers['idempotency-key'] as string;

    // 1. Require key for mutations
    if (!idempotencyKey) {
      return res.status(400).json({
        error: 'Idempotency-Key header required',
        code: 'IDEMPOTENCY_KEY_MISSING',
        details: 'All payment operations require an Idempotency-Key header with a UUID value'
      });
    }

    // 2. Validate format (must be UUID)
    if (!isUUID(idempotencyKey)) {
      return res.status(400).json({
        error: 'Idempotency-Key must be a valid UUID',
        code: 'IDEMPOTENCY_KEY_INVALID',
        details: 'Use a UUID v4 format like: 123e4567-e89b-12d3-a456-426614174000'
      });
    }

    // 3. Scope by user (required)
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Use tenantId if available, otherwise use userId as scope
    const tenantId = (req as any).user?.tenantId || userId;
    const redisKey = `idempotency:${tenantId}:${userId}:${idempotencyKey}`;

    try {
      // 4. Check if request already processed
      const cached = await RedisService.get(redisKey);

      if (cached) {
        const cachedResponse = JSON.parse(cached);

        // If still processing (102), return 409
        if (cachedResponse.statusCode === 102) {
          console.warn('Concurrent duplicate request detected', {
            idempotencyKey,
            userId,
            tenantId,
            path: req.path
          });

          return res.status(409).json({
            error: 'Request already processing',
            code: 'DUPLICATE_IN_PROGRESS',
            details: 'A request with this idempotency key is currently being processed'
          });
        }

        // Return cached response
        console.info('Returning cached idempotent response', {
          idempotencyKey,
          userId,
          tenantId,
          originalStatus: cachedResponse.statusCode
        });

        return res.status(cachedResponse.statusCode).json(cachedResponse.body);
      }

      // 5. Mark as in-progress to prevent concurrent duplicates
      await RedisService.set(
        redisKey,
        JSON.stringify({
          statusCode: 102,
          body: { processing: true },
          startedAt: new Date().toISOString()
        }),
        Math.floor(ttlMs / 1000)
      );

      // 6. Intercept response to cache result
      const originalJson = res.json?.bind(res);
      const originalSend = res.send?.bind(res);
      
      if (!originalJson) {
        // If json method doesn't exist, skip response wrapping (test environment)
        console.warn('res.json not available, skipping response caching');
        return next();
      }

      let responseSent = false;

      const cacheResponse = async (body: any) => {
        if (responseSent) return;
        responseSent = true;

        const statusCode = res.statusCode;

        // Cache successful responses (2xx) for 24 hours
        if (statusCode >= 200 && statusCode < 300) {
          await RedisService.set(
            redisKey,
            JSON.stringify({
              statusCode,
              body,
              completedAt: new Date().toISOString()
            }),
            86400  // 24 hours
          ).catch(err => {
            console.error('Failed to cache successful response', { err, idempotencyKey });
          });
        }
        // Delete key on server errors (5xx) to allow retry
        else if (statusCode >= 500) {
          await RedisService.del(redisKey).catch(err => {
            console.error('Failed to delete key after server error', { err, idempotencyKey });
          });
        }
        // Keep key for client errors (4xx) to prevent retry
        else if (statusCode >= 400 && statusCode < 500) {
          await RedisService.set(
            redisKey,
            JSON.stringify({
              statusCode,
              body,
              completedAt: new Date().toISOString()
            }),
            3600  // 1 hour for errors
          ).catch(err => {
            console.error('Failed to cache error response', { err, idempotencyKey });
          });
        }
      };

      // Override json method
      res.json = function(body: any) {
        cacheResponse(body).then(() => {
          if (originalJson) {
            originalJson(body);
          }
        }).catch(err => {
          console.error('Cache response failed', { err });
          if (originalJson) {
            originalJson(body);
          }
        });
        return res;
      };

      // Override send method if it exists
      if (originalSend) {
        res.send = function(body: any) {
          cacheResponse(body).then(() => {
            originalSend(body);
          }).catch(err => {
            console.error('Cache response failed', { err });
            originalSend(body);
          });
          return res;
        };
      }

      next();

    } catch (err) {
      console.error('Idempotency middleware error', { err, idempotencyKey });
      // On Redis failure, proceed without idempotency (degraded mode)
      next();
    }
  };
}
```

### FILE: src/middleware/request-logger.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export interface RequestWithId extends Request {
  id: string;
  startTime: number;
}

export const requestLogger = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
) => {
  // Assign unique request ID
  req.id = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Set request ID in response headers
  res.setHeader('X-Request-ID', req.id);
  
  // Log request
  console.log('Incoming request:', {
    id: req.id,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
  
  // Capture response
  const originalSend = res.send;
  res.send = function(data: any) {
    res.send = originalSend;
    
    // Log response
    const duration = Date.now() - req.startTime;
    console.log('Outgoing response:', {
      id: req.id,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    // Set response time header
    res.setHeader('X-Response-Time', `${duration}ms`);
    
    return res.send(data);
  };
  
  next();
};

// Performance monitoring
export const performanceMonitor = (
  req: RequestWithId,
  res: Response,
  next: NextFunction
) => {
  const checkpoints: { [key: string]: number } = {
    start: Date.now()
  };
  
  // Add checkpoint function to request
  (req as any).checkpoint = (name: string) => {
    checkpoints[name] = Date.now();
  };
  
  // Log performance metrics on response
  res.on('finish', () => {
    const total = Date.now() - checkpoints.start;
    
    if (total > 1000) { // Log slow requests
      console.warn('Slow request detected:', {
        id: req.id,
        path: req.path,
        totalTime: `${total}ms`,
        checkpoints: Object.entries(checkpoints).map(([name, time]) => ({
          name,
          elapsed: `${time - checkpoints.start}ms`
        }))
      });
    }
  });
  
  next();
};
```

### FILE: src/processors/payment-event-processor.ts
```typescript
import { Pool } from 'pg';
import Bull from 'bull';

export interface PaymentEvent {
  id: string;
  type: 'payment.created' | 'payment.updated' | 'payment.completed' | 'payment.failed';
  paymentId: string;
  orderId: string;
  amount: number;
  currency: string;
  provider: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class PaymentEventProcessor {
  private db: Pool;
  private queue: Bull.Queue;

  constructor(db: Pool, queue: Bull.Queue) {
    this.db = db;
    this.queue = queue;
  }

  async processPaymentEvent(event: PaymentEvent): Promise<void> {
    // Log event
    await this.db.query(
      `INSERT INTO payment_events (event_id, event_type, payment_id, order_id, provider, payload, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [event.id, event.type, event.paymentId, event.orderId, event.provider, JSON.stringify(event), event.timestamp]
    );

    // Handle different event types
    switch (event.type) {
      case 'payment.completed':
        await this.handlePaymentCompleted(event);
        break;
      case 'payment.failed':
        await this.handlePaymentFailed(event);
        break;
      default:
        console.log(`Processing event type: ${event.type}`);
    }
  }

  private async handlePaymentCompleted(event: PaymentEvent): Promise<void> {
    // Queue order fulfillment
    await this.queue.add('order.fulfill', {
      orderId: event.orderId,
      paymentId: event.paymentId
    }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 }
    });

    // Queue email notification
    await this.queue.add('email.payment_success', {
      orderId: event.orderId,
      amount: event.amount,
      currency: event.currency
    });
  }

  private async handlePaymentFailed(event: PaymentEvent): Promise<void> {
    // Queue retry if applicable
    const payment = await this.db.query(
      'SELECT retry_count FROM payments WHERE id = $1',
      [event.paymentId]
    );

    if (payment.rows[0]?.retry_count < 3) {
      await this.queue.add('payment.retry', {
        paymentId: event.paymentId,
        attemptNumber: payment.rows[0].retry_count + 1
      }, {
        delay: 3600000 // Retry in 1 hour
      });
    }
  }
}
```

### FILE: src/processors/order-event-processor.ts
```typescript
import { Pool } from 'pg';
import { OrderState } from '../services/state-machine/order-state-machine';

export interface OrderEvent {
  orderId: string;
  type: string;
  payload: any;
  timestamp: Date;
}

export class OrderEventProcessor {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async processOrderEvent(event: OrderEvent): Promise<void> {
    const order = await this.db.query(
      'SELECT state FROM orders WHERE id = $1',
      [event.orderId]
    );

    if (order.rows.length === 0) {
      throw new Error(`Order ${event.orderId} not found`);
    }

    const currentState = order.rows[0].state as OrderState;
    
    // Process based on event type and current state
    switch (event.type) {
      case 'order.payment_received':
        if (currentState === OrderState.PAYMENT_PROCESSING) {
          await this.updateOrderState(event.orderId, OrderState.PAID);
        }
        break;
      case 'order.items_shipped':
        if (currentState === OrderState.PAID) {
          await this.updateOrderState(event.orderId, OrderState.FULFILLED);
        }
        break;
      case 'order.cancelled':
        await this.handleOrderCancellation(event.orderId, currentState);
        break;
    }
  }

  private async updateOrderState(orderId: string, newState: OrderState): Promise<void> {
    await this.db.query(
      'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
      [newState, orderId]
    );
  }

  private async handleOrderCancellation(orderId: string, currentState: OrderState): Promise<void> {
    // Can only cancel if not already fulfilled or refunded
    const cancellableStates = [
      OrderState.CREATED,
      OrderState.PAYMENT_PENDING,
      OrderState.PAYMENT_FAILED
    ];

    if (cancellableStates.includes(currentState)) {
      await this.updateOrderState(orderId, OrderState.CANCELLED);
    }
  }
}
```

### FILE: src/services/paymentService.ts
```typescript
import { DatabaseService } from './databaseService';
import { QUEUES } from "@tickettoken/shared";
import { QueueService } from './queueService';
import { logger } from '../utils/logger';
import { StripeMock } from './providers/stripeMock';

const log = logger.child({ component: 'PaymentService' });

let stripe: any;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
  log.info('Using real Stripe API');
} else {
  stripe = new StripeMock();
  log.info('Using mock Stripe (no valid key found)');
}

interface CreateIntentParams {
  orderId: string;
  amount: number;        // INTEGER CENTS
  platformFee: number;   // INTEGER CENTS
  venueId?: string;
  metadata?: any;
}

class PaymentServiceClass {
  async createPaymentIntent(params: CreateIntentParams) {
    const db = DatabaseService.getPool();

    // Stripe expects amount in cents (params already in cents)
    const stripeIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      application_fee_amount: params.platformFee,
      metadata: {
        orderId: params.orderId,
        venueId: params.venueId || '',
        ...params.metadata
      }
    });

    // Store in database (amounts in cents)
    const result = await db.query(
      `INSERT INTO payment_intents
       (order_id, stripe_intent_id, amount, platform_fee, venue_id, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.orderId,
        stripeIntent.id,
        params.amount,
        params.platformFee,
        params.venueId,
        JSON.stringify(params.metadata || {}),
        stripeIntent.status
      ]
    );

    const intent = result.rows[0];

    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        intent.id,
        'payment_intent',
        'payments.intent_created',
        JSON.stringify({
          orderId: params.orderId,
          intentId: intent.id,
          stripeIntentId: stripeIntent.id,
          amount: params.amount
        })
      ]
    );

    log.info('Payment intent created', {
      intentId: intent.id,
      stripeId: stripeIntent.id,
      amount: params.amount
    });

    return {
      id: intent.id,
      stripeIntentId: stripeIntent.id,
      clientSecret: stripeIntent.client_secret,
      amount: params.amount,
      platformFee: params.platformFee
    };
  }

  async confirmPayment(stripeIntentId: string) {
    const intent = await stripe.paymentIntents.retrieve(stripeIntentId);

    const db = DatabaseService.getPool();
    const result = await db.query(
      `UPDATE payment_intents
       SET status = $2, updated_at = NOW()
       WHERE stripe_intent_id = $1
       RETURNING *`,
      [stripeIntentId, intent.status]
    );

    if (result.rows.length > 0) {
      const payment = result.rows[0];

      await db.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.id,
          'payment',
          'payment.confirmed',
          JSON.stringify({
            orderId: payment.order_id,
            paymentId: payment.id,
            amount: payment.amount
          })
        ]
      );
    }

    return result.rows[0];
  }
}

export const PaymentService = new PaymentServiceClass();
```

### FILE: src/services/event-ordering.service.ts
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
          order_id,
          event_type,
          sequence_number,
          event_timestamp,
          stripe_event_id,
          idempotency_key,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.paymentId,
        event.orderId,
        event.eventType,
        sequenceNumber,
        event.eventTimestamp,
        event.stripeEventId,
        idempotencyKey,
        JSON.stringify(event.payload)
      ]);

      // Check if this is the next expected event
      const isInOrder = await this.checkEventOrder(client, event.paymentId, sequenceNumber);

      if (isInOrder) {
        // Process this event and any queued events
        await this.processEventInOrder(client, event);
        await this.processQueuedEvents(client, event.paymentId);
      } else {
        this.log.warn('Event received out of order, queuing for later', {
          paymentId: event.paymentId,
          sequenceNumber,
          eventType: event.eventType
        });
      }

      await client.query('COMMIT');

      return {
        sequenceNumber,
        processed: isInOrder
      };

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error('Failed to process payment event', {
        error,
        event
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async checkEventOrder(
    client: any,
    paymentId: string,
    sequenceNumber: number
  ): Promise<boolean> {
    // Get the last processed sequence number
    const result = await client.query(`
      SELECT MAX(sequence_number) as last_processed
      FROM payment_event_sequence
      WHERE payment_id = $1 AND processed_at IS NOT NULL
    `, [paymentId]);

    const lastProcessed = result.rows[0].last_processed || 0;
    return sequenceNumber === lastProcessed + 1;
  }

  private async processEventInOrder(client: any, event: PaymentEvent): Promise<void> {
    // Get current payment state
    const paymentResult = await client.query(`
      SELECT status, version FROM payment_intents WHERE id = $1
    `, [event.paymentId]);

    if (paymentResult.rows.length === 0) {
      throw new Error(`Payment not found: ${event.paymentId}`);
    }

    const currentStatus = paymentResult.rows[0].status;
    const currentVersion = paymentResult.rows[0].version;

    // Determine new state based on event
    const newStatus = this.getNewStatus(event.eventType, currentStatus);

    // Validate state transition
    const isValid = await client.query(
      'SELECT validate_payment_state_transition($1, $2, $3) as valid',
      [currentStatus, newStatus, event.eventType]
    );

    if (!isValid.rows[0].valid) {
      this.log.warn('Invalid state transition', {
        paymentId: event.paymentId,
        from: currentStatus,
        to: newStatus,
        event: event.eventType
      });
      
      // Mark event as processed but don't change state
      await client.query(`
        UPDATE payment_event_sequence
        SET processed_at = NOW()
        WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
      `, [event.paymentId, event.eventType, event.idempotencyKey]);
      
      return;
    }

    // Update payment state with optimistic locking
    const updateResult = await client.query(`
      UPDATE payment_intents
      SET status = $1,
          version = version + 1,
          last_event_timestamp = $2,
          updated_at = NOW()
      WHERE id = $3 AND version = $4
    `, [newStatus, event.eventTimestamp, event.paymentId, currentVersion]);

    if (updateResult.rowCount === 0) {
      throw new Error('Concurrent update detected');
    }

    // Record state transition
    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id,
        order_id,
        from_state,
        to_state,
        metadata
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      event.paymentId,
      event.orderId,
      currentStatus,
      newStatus,
      JSON.stringify({
        event_type: event.eventType,
        event_timestamp: event.eventTimestamp,
        stripe_event_id: event.stripeEventId
      })
    ]);

    // Mark event as processed
    await client.query(`
      UPDATE payment_event_sequence
      SET processed_at = NOW()
      WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
    `, [event.paymentId, event.eventType, event.idempotencyKey]);

    // Write to outbox for downstream services
    await client.query(`
      INSERT INTO outbox (
        aggregate_id,
        aggregate_type,
        event_type,
        payload
      ) VALUES ($1, $2, $3, $4)
    `, [
      event.orderId || event.paymentId,
      'payment',
      event.eventType,
      JSON.stringify({
        paymentId: event.paymentId,
        orderId: event.orderId,
        status: newStatus,
        previousStatus: currentStatus,
        ...event.payload
      })
    ]);

    this.log.info('Payment event processed in order', {
      paymentId: event.paymentId,
      eventType: event.eventType,
      fromState: currentStatus,
      toState: newStatus
    });
  }

  private async processQueuedEvents(client: any, paymentId: string): Promise<void> {
    // Process any events that were waiting for this one
    const queuedEvents = await client.query(`
      SELECT * FROM payment_event_sequence
      WHERE payment_id = $1
        AND processed_at IS NULL
      ORDER BY sequence_number ASC
      LIMIT 10
    `, [paymentId]);

    for (const queuedEvent of queuedEvents.rows) {
      const isInOrder = await this.checkEventOrder(client, paymentId, queuedEvent.sequence_number);
      
      if (isInOrder) {
        await this.processEventInOrder(client, {
          paymentId: queuedEvent.payment_id,
          orderId: queuedEvent.order_id,
          eventType: queuedEvent.event_type,
          eventTimestamp: queuedEvent.event_timestamp,
          stripeEventId: queuedEvent.stripe_event_id,
          idempotencyKey: queuedEvent.idempotency_key,
          payload: queuedEvent.payload
        });
      } else {
        // Stop processing as we hit another gap
        break;
      }
    }
  }

  private getNewStatus(eventType: string, currentStatus: string): string {
    const statusMap: Record<string, string> = {
      'payment.processing': 'PROCESSING',
      'payment.succeeded': 'PAID',
      'payment_intent.succeeded': 'PAID',
      'payment.failed': 'PAYMENT_FAILED',
      'payment_intent.payment_failed': 'PAYMENT_FAILED',
      'payment.cancelled': 'CANCELLED',
      'refund.initiated': 'REFUNDING',
      'refund.partial': 'PARTIALLY_REFUNDED',
      'refund.completed': 'REFUNDED',
      'refund.failed': currentStatus === 'REFUNDING' ? 'PAID' : currentStatus
    };

    return statusMap[eventType] || currentStatus;
  }

  private generateIdempotencyKey(event: PaymentEvent): string {
    const data = `${event.paymentId}-${event.eventType}-${event.eventTimestamp.getTime()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Background processor for stuck events
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processStuckEvents();
      } catch (error) {
        this.log.error('Background processor error', error);
      }
    }, 30000); // Run every 30 seconds
  }

  private async processStuckEvents(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find payments with unprocessed events older than 5 minutes
      const stuckPayments = await client.query(`
        SELECT DISTINCT payment_id
        FROM payment_event_sequence
        WHERE processed_at IS NULL
          AND created_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      for (const row of stuckPayments.rows) {
        await this.reprocessPaymentEvents(row.payment_id);
      }

    } finally {
      client.release();
    }
  }

  private async reprocessPaymentEvents(paymentId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get all unprocessed events in order
      const events = await client.query(`
        SELECT * FROM payment_event_sequence
        WHERE payment_id = $1
          AND processed_at IS NULL
        ORDER BY sequence_number ASC
      `, [paymentId]);

      this.log.info(`Reprocessing ${events.rows.length} stuck events for payment ${paymentId}`);

      for (const event of events.rows) {
        const isInOrder = await this.checkEventOrder(client, paymentId, event.sequence_number);
        
        if (isInOrder) {
          await this.processEventInOrder(client, {
            paymentId: event.payment_id,
            orderId: event.order_id,
            eventType: event.event_type,
            eventTimestamp: event.event_timestamp,
            stripeEventId: event.stripe_event_id,
            idempotencyKey: event.idempotency_key,
            payload: event.payload
          });
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error(`Failed to reprocess events for payment ${paymentId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * Handle idempotent payment operations
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operation: string,
    request: any,
    handler: () => Promise<T>
  ): Promise<T> {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing idempotent response
      const existing = await client.query(`
        SELECT response, status_code
        FROM payment_idempotency
        WHERE idempotency_key = $1
      `, [idempotencyKey]);

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        
        // Verify request hasn't changed
        const existingHash = await client.query(`
          SELECT request_hash FROM payment_idempotency WHERE idempotency_key = $1
        `, [idempotencyKey]);

        if (existingHash.rows[0].request_hash !== requestHash) {
          throw new Error('Idempotency key reused with different request');
        }

        await client.query('COMMIT');
        
        this.log.info('Returning idempotent response', { idempotencyKey, operation });
        return row.response as T;
      }

      // Execute the operation
      const result = await handler();

      // Store idempotent response
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await client.query(`
        INSERT INTO payment_idempotency (
          idempotency_key,
          operation,
          request_hash,
          response,
          status_code,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        idempotencyKey,
        operation,
        requestHash,
        JSON.stringify(result),
        200,
        expiresAt
      ]);

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### FILE: src/services/marketplace/escrow.service.ts
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
    );

    if (paymentIntent.status === 'requires_capture') {
      await this.updateEscrowStatus(escrowId, EscrowStatus.FUNDED);
      await this.startReleaseMonitoring(escrowId);
      return this.getEscrow(escrowId);
    } else {
      throw new Error('Payment confirmation failed');
    }
  }

  async releaseEscrow(escrowId: string): Promise<void> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const escrow = await this.getEscrow(escrowId);

      if (escrow.status !== EscrowStatus.FUNDED) {
        throw new Error('Escrow not in funded state');
      }

      const conditionsMet = await this.checkReleaseConditions(escrow.id);
      if (!conditionsMet) {
        throw new Error('Release conditions not met');
      }

      const paymentIntent = await this.stripe.paymentIntents.capture(
        escrow.stripePaymentIntentId
      );

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment capture failed');
      }

      // Create payout records (amounts in cents)
      await TransactionModel.create({
        userId: escrow.sellerId,
        amount: escrow.sellerPayout,
        status: TransactionStatus.COMPLETED,
        metadata: { escrowId, role: 'seller' }
      });

      const listing = await this.getListing(escrow.listingId);
      await VenueBalanceModel.updateBalance(
        listing.venueId,
        escrow.venueRoyalty,
        'available'
      );

      await this.updateEscrowStatus(escrowId, EscrowStatus.RELEASED);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async refundEscrow(escrowId: string, reason: string): Promise<void> {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status === EscrowStatus.RELEASED) {
      throw new Error('Escrow already released');
    }

    if (escrow.status === EscrowStatus.REFUNDED) {
      throw new Error('Escrow already refunded');
    }

    if (escrow.status === EscrowStatus.FUNDED) {
      await this.stripe.refunds.create({
        payment_intent: escrow.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: { escrowId, refundReason: reason }
      });
    } else {
      await this.stripe.paymentIntents.cancel(escrow.stripePaymentIntentId);
    }

    await this.updateEscrowStatus(escrowId, EscrowStatus.REFUNDED);
  }

  private calculatePaymentSplits(
    priceCents: number,
    venueRoyaltyPercentage: number
  ): {
    sellerPayout: number;
    venueRoyalty: number;
    platformFee: number;
  } {
    // Convert percentages to basis points
    const venueRoyaltyBps = Math.round(venueRoyaltyPercentage * 100);
    const platformFeeBps = 500; // 5%

    const venueRoyaltyCents = percentOfCents(priceCents, venueRoyaltyBps);
    const platformFeeCents = percentOfCents(priceCents, platformFeeBps);
    const sellerPayoutCents = priceCents - venueRoyaltyCents - platformFeeCents;

    return {
      sellerPayout: sellerPayoutCents,
      venueRoyalty: venueRoyaltyCents,
      platformFee: platformFeeCents
    };
  }

  private async setReleaseConditions(client: any, escrowId: string): Promise<void> {
    const conditions = [
      { type: 'nft_transferred', required: true },
      { type: 'cooling_period', required: true, duration: 600 }
    ];

    for (const condition of conditions) {
      await client.query(
        `INSERT INTO escrow_release_conditions
         (escrow_id, condition_type, required, metadata)
         VALUES ($1, $2, $3, $4)`,
        [escrowId, condition.type, condition.required, JSON.stringify(condition)]
      );
    }
  }

  private async checkReleaseConditions(escrowId: string): Promise<boolean> {
    const result = await query(
      `SELECT * FROM escrow_release_conditions
       WHERE escrow_id = $1 AND required = true`,
      [escrowId]
    );

    return result.rows.every((condition: any) => condition.satisfied);
  }

  private async startReleaseMonitoring(escrowId: string): Promise<void> {
    console.log(`Started monitoring release conditions for escrow ${escrowId}`);
  }

  private async getEscrow(escrowId: string): Promise<ExtendedEscrowTransaction> {
    const result = await query(
      'SELECT * FROM payment_escrows WHERE id = $1',
      [escrowId]
    );

    if (result.rows.length === 0) {
      throw new Error('Escrow not found');
    }

    return result.rows[0];
  }

  private async getListing(listingId: string): Promise<any> {
    return { venueId: 'mock-venue-id' };
  }

  private async updateEscrowStatus(
    escrowId: string,
    status: EscrowStatus
  ): Promise<void> {
    await query(
      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [escrowId, status]
    );
  }
}
```

### FILE: src/services/fraud/device-fingerprint.service.ts
```typescript
import crypto from 'crypto';
import { query } from '../../config/database';

export class DeviceFingerprintService {
  generateFingerprint(deviceData: {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    plugins?: string[];
    fonts?: string[];
    canvas?: string;
    webgl?: string;
  }): string {
    // Create a stable fingerprint from device characteristics
    const fingerprintData = {
      ua: deviceData.userAgent,
      sr: deviceData.screenResolution,
      tz: deviceData.timezone,
      lang: deviceData.language,
      plat: deviceData.platform,
      plugins: (deviceData.plugins || []).sort().join(','),
      fonts: (deviceData.fonts || []).slice(0, 20).sort().join(','),
      canvas: deviceData.canvas ? deviceData.canvas.substring(0, 50) : '',
      webgl: deviceData.webgl ? deviceData.webgl.substring(0, 50) : ''
    };
    
    const fingerprintString = JSON.stringify(fingerprintData);
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
    
    return hash;
  }
  
  async recordDeviceActivity(
    deviceFingerprint: string,
    userId: string,
    activity: string,
    metadata?: any
  ): Promise<void> {
    await query(
      `INSERT INTO device_activity 
       (device_fingerprint, user_id, activity_type, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [deviceFingerprint, userId, activity, JSON.stringify(metadata || {})]
    );
  }
  
  async getDeviceRiskScore(deviceFingerprint: string): Promise<{
    score: number;
    factors: Array<{
      factor: string;
      weight: number;
      value: any;
    }>;
  }> {
    const factors = [];
    let totalScore = 0;
    
    // Factor 1: Number of accounts associated
    const accountCount = await this.getAssociatedAccountCount(deviceFingerprint);
    if (accountCount > 1) {
      const accountFactor = {
        factor: 'multiple_accounts',
        weight: 0.3,
        value: accountCount
      };
      factors.push(accountFactor);
      totalScore += Math.min(accountCount / 5, 1) * accountFactor.weight;
    }
    
    // Factor 2: Suspicious activity patterns
    const suspiciousActivity = await this.getSuspiciousActivityCount(deviceFingerprint);
    if (suspiciousActivity > 0) {
      const activityFactor = {
        factor: 'suspicious_activity',
        weight: 0.25,
        value: suspiciousActivity
      };
      factors.push(activityFactor);
      totalScore += Math.min(suspiciousActivity / 10, 1) * activityFactor.weight;
    }
    
    // Factor 3: Geographic anomalies
    const geoAnomalies = await this.checkGeographicAnomalies(deviceFingerprint);
    if (geoAnomalies.hasAnomalies) {
      const geoFactor = {
        factor: 'geographic_anomalies',
        weight: 0.2,
        value: geoAnomalies
      };
      factors.push(geoFactor);
      totalScore += geoFactor.weight;
    }
    
    // Factor 4: Device age
    const deviceAge = await this.getDeviceAge(deviceFingerprint);
    if (deviceAge < 24) { // Less than 24 hours old
      const ageFactor = {
        factor: 'new_device',
        weight: 0.15,
        value: `${deviceAge} hours`
      };
      factors.push(ageFactor);
      totalScore += (1 - deviceAge / 24) * ageFactor.weight;
    }
    
    // Factor 5: Failed payment attempts
    const failedAttempts = await this.getFailedPaymentAttempts(deviceFingerprint);
    if (failedAttempts > 2) {
      const failedFactor = {
        factor: 'failed_payments',
        weight: 0.1,
        value: failedAttempts
      };
      factors.push(failedFactor);
      totalScore += Math.min(failedAttempts / 5, 1) * failedFactor.weight;
    }
    
    return {
      score: Math.min(totalScore, 1),
      factors
    };
  }
  
  private async getAssociatedAccountCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async getSuspiciousActivityCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM device_activity
       WHERE device_fingerprint = $1
         AND activity_type IN ('failed_payment', 'fraud_detected', 'account_locked')
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async checkGeographicAnomalies(deviceFingerprint: string): Promise<{
    hasAnomalies: boolean;
    details?: any;
  }> {
    // Check for impossible travel scenarios
    const geoQuery = `
      SELECT 
        da1.timestamp as time1,
        da1.metadata->>'location' as location1,
        da2.timestamp as time2,
        da2.metadata->>'location' as location2
      FROM device_activity da1
      JOIN device_activity da2 ON da1.device_fingerprint = da2.device_fingerprint
      WHERE da1.device_fingerprint = $1
        AND da2.timestamp > da1.timestamp
        AND da2.timestamp < da1.timestamp + INTERVAL '1 hour'
        AND da1.metadata->>'location' != da2.metadata->>'location'
      ORDER BY da1.timestamp DESC
      LIMIT 1
    `;
    
    const result = await query(geoQuery, [deviceFingerprint]);
    
    if (result.rows.length > 0) {
      const anomaly = result.rows[0];
      // In production, calculate actual distance between locations
      return {
        hasAnomalies: true,
        details: {
          location1: anomaly.location1,
          location2: anomaly.location2,
          timeDifference: anomaly.time2 - anomaly.time1
        }
      };
    }
    
    return { hasAnomalies: false };
  }
  
  private async getDeviceAge(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT MIN(timestamp) as first_seen
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    if (result.rows[0].first_seen) {
      const ageMs = Date.now() - new Date(result.rows[0].first_seen).getTime();
      return ageMs / (1000 * 60 * 60); // Convert to hours
    }
    
    return 0;
  }
  
  private async getFailedPaymentAttempts(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM payment_transactions
       WHERE device_fingerprint = $1
         AND status = 'failed'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async compareFingerprints(fp1: string, fp2: string): Promise<{
    similar: boolean;
    similarity: number;
  }> {
    // Simple comparison - in production would use more sophisticated matching
    if (fp1 === fp2) {
      return { similar: true, similarity: 1.0 };
    }
    
    // Check if fingerprints are similar (could be same device with minor changes)
    const distance = this.calculateHammingDistance(fp1, fp2);
    const similarity = 1 - (distance / Math.max(fp1.length, fp2.length));
    
    return {
      similar: similarity > 0.85,
      similarity
    };
  }
  
  private calculateHammingDistance(str1: string, str2: string): number {
    let distance = 0;
    const length = Math.min(str1.length, str2.length);
    
    for (let i = 0; i < length; i++) {
      if (str1[i] !== str2[i]) distance++;
    }
    
    distance += Math.abs(str1.length - str2.length);
    
    return distance;
  }
}
```

### FILE: src/services/high-demand/purchase-limiter.service.ts
```typescript
import { query } from '../../config/database';
import { createClient } from 'redis';
import { config } from '../../config';

export class PurchaseLimiterService {
  private redis: any; // TODO: Add proper Redis client type

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });
    
    this.redis.connect().catch(console.error);
  }

  async checkPurchaseLimit(
    userId: string,
    eventId: string,
    requestedQuantity: number,
    paymentMethod: {
      type: string;
      fingerprint?: string;
      last4?: string;
    }
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limits: {
      perUser: number;
      perPaymentMethod: number;
      perAddress: number;
      perEvent: number;
    };
    current: {
      userPurchases: number;
      paymentMethodPurchases: number;
      addressPurchases: number;
    };
  }> {
    // Get event limits
    const eventLimits = await this.getEventLimits(eventId);

    // Check user limit
    const userPurchases = await this.getUserPurchaseCount(userId, eventId);
    if (userPurchases + requestedQuantity > eventLimits.perUser) {
      return {
        allowed: false,
        reason: `Maximum ${eventLimits.perUser} tickets per person for this event`,
        limits: eventLimits,
        current: {
          userPurchases,
          paymentMethodPurchases: 0,
          addressPurchases: 0
        }
      };
    }

    // Check payment method limit
    if (paymentMethod.fingerprint) {
      const paymentMethodPurchases = await this.getPaymentMethodPurchaseCount(
        paymentMethod.fingerprint,
        eventId
      );

      if (paymentMethodPurchases + requestedQuantity > eventLimits.perPaymentMethod) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perPaymentMethod} tickets per payment method`,
          limits: eventLimits,
          current: {
            userPurchases,
            paymentMethodPurchases,
            addressPurchases: 0
          }
        };
      }
    }

    // Check address limit
    const userAddress = await this.getUserAddress(userId);
    if (userAddress) {
      const addressPurchases = await this.getAddressPurchaseCount(
        userAddress,
        eventId
      );

      if (addressPurchases + requestedQuantity > eventLimits.perAddress) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perAddress} tickets per household`,
          limits: eventLimits,
          current: {
            userPurchases,
            paymentMethodPurchases: 0,
            addressPurchases
          }
        };
      }
    }

    // Check cooldown period
    const cooldownCheck = await this.checkCooldownPeriod(userId, eventId);
    if (!cooldownCheck.allowed) {
      return {
        allowed: false,
        reason: cooldownCheck.reason,
        limits: eventLimits,
        current: {
          userPurchases,
          paymentMethodPurchases: 0,
          addressPurchases: 0
        }
      };
    }

    return {
      allowed: true,
      limits: eventLimits,
      current: {
        userPurchases,
        paymentMethodPurchases: 0,
        addressPurchases: 0
      }
    };
  }

  private async getEventLimits(eventId: string): Promise<any> {
    const result = await query(
      `SELECT
        purchase_limit_per_user,
        purchase_limit_per_payment_method,
        purchase_limit_per_address,
        max_tickets_per_order
       FROM event_purchase_limits
       WHERE event_id = $1`,
      [eventId]
    );

    if (result.rows.length > 0) {
      return {
        perUser: result.rows[0].purchase_limit_per_user || 4,
        perPaymentMethod: result.rows[0].purchase_limit_per_payment_method || 4,
        perAddress: result.rows[0].purchase_limit_per_address || 8,
        perEvent: result.rows[0].max_tickets_per_order || 4
      };
    }

    // Default limits
    return {
      perUser: 4,
      perPaymentMethod: 4,
      perAddress: 8,
      perEvent: 4
    };
  }

  private async getUserPurchaseCount(
    userId: string,
    eventId: string
  ): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND event_id = $2
         AND status IN ('completed', 'processing')`,
      [userId, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private async getPaymentMethodPurchaseCount(
    paymentFingerprint: string,
    eventId: string
  ): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total
       FROM payment_transactions
       WHERE payment_method_fingerprint = $1
         AND event_id = $2
         AND status IN ('completed', 'processing')`,
      [paymentFingerprint, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private async getAddressPurchaseCount(
    address: string,
    eventId: string
  ): Promise<number> {
    // Normalize address for comparison
    const normalizedAddress = this.normalizeAddress(address);

    const result = await query(
      `SELECT SUM(pt.ticket_count) as total
       FROM payment_transactions pt
       JOIN user_addresses ua ON pt.user_id = ua.user_id
       WHERE ua.normalized_address = $1
         AND pt.event_id = $2
         AND pt.status IN ('completed', 'processing')`,
      [normalizedAddress, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private normalizeAddress(address: string): string {
    // Simple normalization - in production use address validation service
    return address.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async getUserAddress(userId: string): Promise<string | null> {
    const result = await query(
      `SELECT billing_address FROM users WHERE id = $1`,
      [userId]
    );

    return result.rows[0]?.billing_address || null;
  }

  private async checkCooldownPeriod(
    userId: string,
    eventId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
    const cooldownKey = `cooldown:${userId}:${eventId}`;

    const exists = await this.redis.exists(cooldownKey);

    if (exists) {
      const ttl = await this.redis.ttl(cooldownKey);
      const minutesRemaining = Math.ceil(ttl / 60);

      return {
        allowed: false,
        reason: `Please wait ${minutesRemaining} minutes before purchasing more tickets`
      };
    }

    return { allowed: true };
  }

  async recordPurchase(
    userId: string,
    eventId: string,
    quantity: number,
    paymentMethod: any
  ): Promise<void> {
    // Set cooldown
    const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
    const cooldownKey = `cooldown:${userId}:${eventId}`;

    await this.redis.setEx(cooldownKey, cooldownMinutes * 60, '1');

    // Update purchase counts (handled by transaction creation)
  }

  async enforceDynamicLimits(
    eventId: string,
    demandLevel: number
  ): Promise<void> {
    // Adjust limits based on demand
    let perUserLimit = 4;
    let perPaymentLimit = 4;

    if (demandLevel > 0.9) {
      // Very high demand - strict limits
      perUserLimit = 2;
      perPaymentLimit = 2;
    } else if (demandLevel > 0.7) {
      // High demand - moderate limits
      perUserLimit = 3;
      perPaymentLimit = 3;
    }

    await query(
      `UPDATE event_purchase_limits
       SET purchase_limit_per_user = $2,
           purchase_limit_per_payment_method = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1`,
      [eventId, perUserLimit, perPaymentLimit]
    );
  }

  async getPurchaseLimitStats(eventId: string): Promise<{
    uniquePurchasers: number;
    averageTicketsPerPurchaser: number;
    maxTicketsPurchased: number;
    limitViolationsBlocked: number;
  }> {
    const statsQuery = `
      SELECT
        COUNT(DISTINCT user_id) as unique_purchasers,
        AVG(tickets_per_user) as avg_tickets,
        MAX(tickets_per_user) as max_tickets,
        COUNT(*) FILTER (WHERE violation_type IS NOT NULL) as violations
      FROM (
        SELECT
          user_id,
          SUM(ticket_count) as tickets_per_user,
          NULL as violation_type
        FROM payment_transactions
        WHERE event_id = $1 AND status = 'completed'
        GROUP BY user_id

        UNION ALL

        SELECT
          user_id,
          0 as tickets_per_user,
          reason as violation_type
        FROM purchase_limit_violations
        WHERE event_id = $1
      ) as purchase_stats
    `;

    const result = await query(statsQuery, [eventId]);

    return {
      uniquePurchasers: parseInt(result.rows[0].unique_purchasers),
      averageTicketsPerPurchaser: parseFloat(result.rows[0].avg_tickets) || 0,
      maxTicketsPurchased: parseInt(result.rows[0].max_tickets) || 0,
      limitViolationsBlocked: parseInt(result.rows[0].violations) || 0
    };
  }
}
```

### FILE: src/services/high-demand/waiting-room.service.ts
```typescript
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { query } from '../../config/database';

// SECURITY FIX: Phase 2.2 - Use cryptographically signed JWT tokens
const QUEUE_TOKEN_SECRET = process.env.QUEUE_TOKEN_SECRET || (() => {
  console.error('WARNING: QUEUE_TOKEN_SECRET not set. Using default for development only.');
  return 'dev-secret-change-in-production';
})();

export interface QueueTokenPayload {
  sub: string;      // userId
  evt: string;      // eventId  
  qid: string;      // queueId
  scope: 'queue';
  iat: number;
  exp: number;
  jti: string;      // unique token ID
}

export class WaitingRoomService {
  private redis: any; // TODO: Add proper Redis client type
  private processingRate: number = 100; // Users per minute

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.connect().catch(console.error);
  }

  async joinWaitingRoom(
    eventId: string,
    userId: string,
    sessionId: string,
    priority: number = 0
  ): Promise<{
    queueId: string;
    position: number;
    estimatedWaitTime: number;
    status: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const queueId = uuidv4();
    const timestamp = Date.now();

    // Check if user already in queue
    const existingPosition = await this.getUserPosition(eventId, userId);
    if (existingPosition) {
      return existingPosition;
    }

    // Calculate score (lower timestamp = higher priority, with priority boost)
    const score = timestamp - (priority * 1000000); // Priority users get million-point boost

    // Add to sorted set
    await this.redis.zAdd(queueKey, {
      score: score,
      value: JSON.stringify({
        queueId,
        userId,
        sessionId,
        timestamp,
        priority
      })
    });

    // Set queue expiry (2 hours)
    await this.redis.expire(queueKey, 7200);

    // Get position and estimate
    const position = await this.getQueuePosition(queueKey, queueId);
    const estimatedWaitTime = this.calculateWaitTime(position);

    // Record queue join
    await this.recordQueueActivity(eventId, userId, 'joined', { queueId, position });

    return {
      queueId,
      position,
      estimatedWaitTime,
      status: position === 1 ? 'ready' : 'waiting'
    };
  }

  async checkPosition(
    eventId: string,
    queueId: string
  ): Promise<{
    position: number;
    estimatedWaitTime: number;
    status: string;
    accessToken?: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;

    // Get current position
    const position = await this.getQueuePosition(queueKey, queueId);

    if (position === 0) {
      return {
        position: 0,
        estimatedWaitTime: 0,
        status: 'expired'
      };
    }

    // Check if user's turn
    const activeSlots = await this.getActiveSlots(eventId);

    if (position <= activeSlots) {
      // Generate access token - SECURITY FIX: Use JWT instead of predictable string
      const accessToken = await this.generateAccessToken(eventId, queueId);

      return {
        position,
        estimatedWaitTime: 0,
        status: 'ready',
        accessToken
      };
    }

    return {
      position,
      estimatedWaitTime: this.calculateWaitTime(position - activeSlots),
      status: 'waiting'
    };
  }

  async processQueue(eventId: string): Promise<{
    processed: number;
    remaining: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const processingKey = `processing:${eventId}`;

    // Get current queue size
    const queueSize = await this.redis.zCard(queueKey) || 0;

    if (queueSize === 0) {
      return { processed: 0, remaining: 0 };
    }

    // Calculate how many to process
    const activeCount = await this.getActiveUserCount(eventId);
    const maxActive = await this.getMaxActiveUsers(eventId);
    const toProcess = Math.min(
      maxActive - activeCount,
      this.processingRate,
      queueSize
    );

    if (toProcess <= 0) {
      return { processed: 0, remaining: queueSize };
    }

    // Get next batch of users
    const users = await this.redis.zRange(queueKey, 0, toProcess - 1) || [];

    // Process each user
    let processed = 0;
    for (const userJson of users) {
      const user = JSON.parse(userJson);

      // Move to processing
      await this.moveToProcessing(eventId, user);
      processed++;

      // Remove from queue
      await this.redis.zRem(queueKey, userJson);
    }

    return {
      processed,
      remaining: queueSize - processed
    };
  }

  private async getQueuePosition(
    queueKey: string,
    queueId: string
  ): Promise<number> {
    // Find member with this queueId
    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.queueId === queueId) {
        return i + 1; // 1-indexed position
      }
    }

    return 0; // Not found
  }

  private calculateWaitTime(position: number): number {
    // Estimate based on processing rate
    const minutes = Math.ceil(position / this.processingRate);
    return minutes;
  }

  // SECURITY FIX: Phase 2.2 - Replace predictable token with signed JWT
  private async generateAccessToken(
    eventId: string,
    queueId: string,
    userId?: string
  ): Promise<string> {
    // Get userId from queue if not provided
    if (!userId) {
      const queueKey = `waiting_room:${eventId}`;
      const members = await this.redis.zRange(queueKey, 0, -1) || [];
      for (const memberJson of members) {
        const member = JSON.parse(memberJson);
        if (member.queueId === queueId) {
          userId = member.userId;
          break;
        }
      }
    }

    const payload: QueueTokenPayload = {
      sub: userId || 'unknown',
      evt: eventId,
      qid: queueId,
      scope: 'queue',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 min validity
      jti: uuidv4() // Unique token ID
    };

    // Sign the token
    const token = jwt.sign(payload, QUEUE_TOKEN_SECRET, {
      algorithm: 'HS256',
      issuer: 'waiting-room'
    });

    // Still store in Redis for quick validation and revocation
    const tokenKey = `access_token:${payload.jti}`;
    await this.redis.setEx(tokenKey, 600, JSON.stringify({
      eventId,
      queueId,
      userId: userId || 'unknown',
      grantedAt: new Date()
    }));

    return token;
  }

  // SECURITY FIX: Phase 2.2 - Validate JWT signature
  async validateAccessToken(token: string): Promise<{
    valid: boolean;
    eventId?: string;
  }> {
    try {
      // Verify JWT signature
      const decoded = jwt.verify(token, QUEUE_TOKEN_SECRET, {
        algorithms: ['HS256'],
        issuer: 'waiting-room'
      }) as QueueTokenPayload;

      // Check if token scope is correct
      if (decoded.scope !== 'queue') {
        return { valid: false };
      }

      // Check if token still exists in Redis (for revocation)
      const tokenKey = `access_token:${decoded.jti}`;
      const redisData = await this.redis.get(tokenKey);

      if (!redisData) {
        // Token was revoked or expired in Redis
        return { valid: false };
      }

      return {
        valid: true,
        eventId: decoded.evt
      };
    } catch (err) {
      // Invalid signature, expired, or malformed token
      return { valid: false };
    }
  }

  private async getActiveSlots(eventId: string): Promise<number> {
    // Get event configuration
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async getActiveUserCount(eventId: string): Promise<number> {
    const activeKey = `active_users:${eventId}`;
    return await this.redis.sCard(activeKey) || 0;
  }

  private async getMaxActiveUsers(eventId: string): Promise<number> {
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async moveToProcessing(eventId: string, user: any): Promise<void> {
    const activeKey = `active_users:${eventId}`;

    await this.redis.sAdd(activeKey, user.userId);

    // Set expiry on active user (10 minutes to complete purchase)
    await this.redis.expire(activeKey, 600);
  }

  private async recordQueueActivity(
    eventId: string,
    userId: string,
    action: string,
    metadata: any
  ): Promise<void> {
    await query(
      `INSERT INTO waiting_room_activity
       (event_id, user_id, action, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [eventId, userId, action, JSON.stringify(metadata)]
    );
  }

  private async getEventConfig(eventId: string): Promise<any> {
    // In production, get from event service
    return {
      maxConcurrentPurchasers: 100,
      processingRate: 100
    };
  }

  private async getUserPosition(
    eventId: string,
    userId: string
  ): Promise<any | null> {
    const queueKey = `waiting_room:${eventId}`;

    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.userId === userId) {
        return {
          queueId: member.queueId,
          position: i + 1,
          estimatedWaitTime: this.calculateWaitTime(i + 1),
          status: 'waiting'
        };
      }
    }

    return null;
  }

  async getQueueStats(eventId: string): Promise<{
    totalInQueue: number;
    activeUsers: number;
    processingRate: number;
    averageWaitTime: number;
    abandonmentRate: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const activeKey = `active_users:${eventId}`;

    const [queueSize, activeCount] = await Promise.all([
      this.redis.zCard(queueKey),
      this.redis.sCard(activeKey)
    ]);

    // Calculate abandonment rate from activity logs
    const abandonmentStats = await query(
      `SELECT
        COUNT(*) FILTER (WHERE action = 'abandoned') as abandoned,
        COUNT(*) FILTER (WHERE action = 'joined') as joined
       FROM waiting_room_activity
       WHERE event_id = $1
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      [eventId]
    );

    const abandoned = parseInt(abandonmentStats.rows[0].abandoned);
    const joined = parseInt(abandonmentStats.rows[0].joined);
    const abandonmentRate = joined > 0 ? (abandoned / joined) * 100 : 0;

    return {
      totalInQueue: queueSize || 0,
      activeUsers: activeCount || 0,
      processingRate: this.processingRate,
      averageWaitTime: queueSize && queueSize > 0 ? Math.ceil(queueSize / this.processingRate) : 0,
      abandonmentRate
    };
  }
}
```

### FILE: src/services/state-machine/transitions.ts
```typescript
import { PaymentState, PaymentStateMachine } from './payment-state-machine';
import { OrderState, OrderStateMachine } from './order-state-machine';
import { Pool } from 'pg';

export interface TransitionContext {
  paymentId: string;
  orderId: string;
  provider: string;
  amount: number;
  metadata?: Record<string, any>;
}

export class StateTransitionService {
  private paymentStateMachine: PaymentStateMachine;
  private db: Pool;

  constructor(db: Pool) {
    this.paymentStateMachine = new PaymentStateMachine();
    this.db = db;
  }

  async handlePaymentEvent(
    event: string,
    currentState: PaymentState,
    context: TransitionContext
  ): Promise<PaymentState> {
    if (!this.paymentStateMachine.canTransition(currentState, event)) {
      throw new Error(`Invalid transition: ${currentState} cannot handle ${event}`);
    }

    const newState = this.paymentStateMachine.transition(currentState, event);

    // Update database
    await this.db.query(
      'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
      [newState, context.paymentId]
    );

    // Update order state based on payment state
    await this.syncOrderState(context.orderId, newState);

    return newState;
  }

  private async syncOrderState(orderId: string, paymentState: PaymentState): Promise<void> {
    const orderStateMap: Record<PaymentState, OrderState> = {
      [PaymentState.PENDING]: OrderState.PAYMENT_PENDING,
      [PaymentState.PROCESSING]: OrderState.PAYMENT_PROCESSING,
      [PaymentState.COMPLETED]: OrderState.PAID,
      [PaymentState.FAILED]: OrderState.PAYMENT_FAILED,
      [PaymentState.REFUNDED]: OrderState.REFUNDED,
      [PaymentState.CANCELLED]: OrderState.CANCELLED
    };

    const newOrderState = orderStateMap[paymentState];
    if (newOrderState) {
      await this.db.query(
        'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
        [newOrderState, orderId]
      );
    }
  }
}
```

### FILE: src/services/state-machine/order-state-machine.ts
```typescript
export enum OrderState {
  CREATED = 'created',
  PAYMENT_PENDING = 'payment_pending',
  PAYMENT_PROCESSING = 'payment_processing',
  PAID = 'paid',
  PAYMENT_FAILED = 'payment_failed',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded'
}

export class OrderStateMachine {
  private currentState: OrderState;
  
  constructor(initialState: OrderState = OrderState.CREATED) {
    this.currentState = initialState;
  }

  canTransition(to: OrderState): boolean {
    const transitions: Record<OrderState, OrderState[]> = {
      [OrderState.CREATED]: [OrderState.PAYMENT_PENDING, OrderState.CANCELLED],
      [OrderState.PAYMENT_PENDING]: [OrderState.PAYMENT_PROCESSING, OrderState.CANCELLED],
      [OrderState.PAYMENT_PROCESSING]: [OrderState.PAID, OrderState.PAYMENT_FAILED],
      [OrderState.PAYMENT_FAILED]: [OrderState.PAYMENT_PENDING, OrderState.CANCELLED],
      [OrderState.PAID]: [OrderState.FULFILLED, OrderState.REFUNDED],
      [OrderState.FULFILLED]: [OrderState.REFUNDED],
      [OrderState.CANCELLED]: [],
      [OrderState.REFUNDED]: []
    };
    
    return transitions[this.currentState]?.includes(to) ?? false;
  }

  transition(to: OrderState): void {
    if (!this.canTransition(to)) {
      throw new Error(`Cannot transition from ${this.currentState} to ${to}`);
    }
    this.currentState = to;
  }

  getState(): OrderState {
    return this.currentState;
  }
}
```

### FILE: src/services/state-machine/payment-state-machine.ts
```typescript
export enum PaymentState {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  CANCELLED = 'cancelled'
}

export interface PaymentTransition {
  from: PaymentState;
  to: PaymentState;
  event: string;
  guard?: (context: any) => boolean;
}

export class PaymentStateMachine {
  private transitions: Map<string, PaymentTransition[]> = new Map();
  
  constructor() {
    this.setupTransitions();
  }

  private setupTransitions() {
    // Define valid state transitions
    this.addTransition(PaymentState.PENDING, PaymentState.PROCESSING, 'process');
    this.addTransition(PaymentState.PROCESSING, PaymentState.COMPLETED, 'complete');
    this.addTransition(PaymentState.PROCESSING, PaymentState.FAILED, 'fail');
    this.addTransition(PaymentState.FAILED, PaymentState.PROCESSING, 'retry');
    this.addTransition(PaymentState.COMPLETED, PaymentState.REFUNDED, 'refund');
    this.addTransition(PaymentState.PENDING, PaymentState.CANCELLED, 'cancel');
  }

  private addTransition(from: PaymentState, to: PaymentState, event: string) {
    const key = `${from}-${event}`;
    if (!this.transitions.has(key)) {
      this.transitions.set(key, []);
    }
    this.transitions.get(key)!.push({ from, to, event });
  }

  canTransition(from: PaymentState, event: string): boolean {
    const key = `${from}-${event}`;
    return this.transitions.has(key);
  }

  transition(from: PaymentState, event: string): PaymentState {
    const key = `${from}-${event}`;
    const transitions = this.transitions.get(key);
    if (!transitions || transitions.length === 0) {
      throw new Error(`Invalid transition: ${from} -> ${event}`);
    }
    return transitions[0].to;
  }
}
```

### FILE: src/services/webhooks/outbound-webhook.ts
```typescript
import axios from 'axios';
import crypto from 'crypto';
import { Pool } from 'pg';

export interface OutboundWebhook {
  url: string;
  event: string;
  payload: any;
  secret: string;
}

export class OutboundWebhookService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async send(webhook: OutboundWebhook): Promise<void> {
    const signature = this.generateSignature(webhook.payload, webhook.secret);
    
    try {
      const response = await axios.post(webhook.url, webhook.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': webhook.event
        },
        timeout: 5000
      });

      await this.logWebhook(webhook, response.status, null);
    } catch (error: any) {
      await this.logWebhook(webhook, error.response?.status || 0, error.message);
      throw error;
    }
  }

  private generateSignature(payload: any, secret: string): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return hmac.digest('hex');
  }

  private async logWebhook(webhook: OutboundWebhook, status: number, error: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO outbound_webhooks (url, event, payload, status, error, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [webhook.url, webhook.event, JSON.stringify(webhook.payload), status, error]
    );
  }
}
```

### FILE: src/validators/payment-request.ts
```typescript
export interface PaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  customerId: string;
  paymentMethod?: string;
  metadata?: Record<string, any>;
}

export class PaymentRequestValidator {
  static validate(request: PaymentRequest): string[] {
    const errors: string[] = [];

    if (!request.amount || request.amount <= 0) {
      errors.push('Amount must be greater than 0');
    }

    if (!request.currency || request.currency.length !== 3) {
      errors.push('Currency must be a 3-letter ISO code');
    }

    if (!request.orderId) {
      errors.push('Order ID is required');
    }

    if (!request.customerId) {
      errors.push('Customer ID is required');
    }

    // Validate amount doesn't exceed maximum
    if (request.amount > 99999999) {
      errors.push('Amount exceeds maximum allowed');
    }

    // Validate currency is supported
    const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD'];
    if (request.currency && !supportedCurrencies.includes(request.currency.toUpperCase())) {
      errors.push(`Currency ${request.currency} is not supported`);
    }

    return errors;
  }

  static sanitize(request: PaymentRequest): PaymentRequest {
    return {
      ...request,
      amount: Math.round(request.amount), // Ensure integer for cents
      currency: request.currency.toUpperCase(),
      orderId: request.orderId.trim(),
      customerId: request.customerId.trim()
    };
  }
}
```

### FILE: src/validators/webhook-payload.ts
```typescript
export interface WebhookPayload {
  id: string;
  type: string;
  data: any;
  created: number;
}

export class WebhookPayloadValidator {
  static validateStripePayload(payload: any): boolean {
    if (!payload.id || !payload.type || !payload.data) {
      return false;
    }

    // Check required fields based on event type
    if (payload.type.startsWith('payment_intent.')) {
      return this.validatePaymentIntent(payload.data.object);
    }

    if (payload.type.startsWith('charge.')) {
      return this.validateCharge(payload.data.object);
    }

    return true;
  }

  private static validatePaymentIntent(intent: any): boolean {
    return !!(
      intent.id &&
      intent.amount &&
      intent.currency &&
      intent.status
    );
  }

  private static validateCharge(charge: any): boolean {
    return !!(
      charge.id &&
      charge.amount &&
      charge.currency &&
      charge.paid !== undefined
    );
  }

  static validateSquarePayload(payload: any): boolean {
    // Add Square validation when you implement it
    return !!(payload.merchant_id && payload.type && payload.data);
  }
}
```

### FILE: src/types/payment.types.ts
```typescript
export interface PaymentRequest {
  userId: string;
  venueId: string;
  eventId: string;
  tickets: TicketSelection[];
  paymentMethod: PaymentMethod;
  metadata?: Record<string, any>;
  idempotencyKey: string;
}

export interface TicketSelection {
  ticketTypeId: string;
  quantity: number;
  price: number;  // STORED AS INTEGER CENTS
  seatNumbers?: string[];
}

export interface PaymentMethod {
  type: 'card' | 'ach' | 'paypal' | 'crypto';
  token?: string;
  paymentMethodId?: string;
}

// All monetary values stored as INTEGER CENTS, not decimal dollars
export interface DynamicFees {
  platform: number;      // cents
  platformPercentage: number;  // for display (7.5 = 7.5%)
  gasEstimate: number;   // cents
  tax: number;           // cents
  total: number;         // cents
  breakdown: FeeBreakdown;
}

export interface FeeBreakdown {
  ticketPrice: number;   // cents
  platformFee: number;   // cents
  gasEstimate: number;   // cents
  stateTax: number;      // cents
  localTax: number;      // cents
  total: number;         // cents
}

export enum VenueTier {
  STARTER = 'starter',
  PRO = 'pro',
  ENTERPRISE = 'enterprise'
}

// All monetary values stored as INTEGER CENTS
export interface VenueBalance {
  available: number;  // cents
  pending: number;    // cents
  reserved: number;   // cents
  currency: string;
  lastPayout?: Date;
}

// All monetary values stored as INTEGER CENTS
export interface Transaction {
  id: string;
  venueId: string;
  userId: string;
  eventId: string;
  amount: number;         // cents
  currency: string;
  status: TransactionStatus;
  platformFee: number;    // cents
  venuePayout: number;    // cents
  gasFeePaid?: number;    // cents
  taxAmount?: number;     // cents
  totalAmount?: number;   // cents
  stripePaymentIntentId?: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}
```

### FILE: src/types/blockchain.types.ts
```typescript
export interface NFTMintRequest {
  paymentId: string;
  ticketIds: string[];
  venueId: string;
  eventId: string;
  blockchain: 'solana' | 'polygon';
  priority: 'standard' | 'high' | 'urgent';
}

export interface GasEstimate {
  blockchain: string;
  estimatedFee: number;
  feeInUSD: number;
  congestionLevel: 'low' | 'medium' | 'high';
  timestamp: Date;
}

export interface MintBatch {
  id: string;
  ticketIds: string[];
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'collecting';
  transactionHash?: string;
  gasUsed?: number;
  attempts: number;
  error?: string;
}
```

### FILE: src/types/group.types.ts
```typescript
import { TicketSelection } from './payment.types';

export interface GroupPayment {
  id: string;
  organizerId: string;
  eventId: string;
  totalAmount: number;
  ticketSelections: TicketSelection[];
  members: GroupMember[];
  expiresAt: Date;
  status: GroupPaymentStatus;
  createdAt: Date;
}

export interface GroupMember {
  id: string;
  userId?: string;
  email: string;
  name: string;
  amountDue: number;
  paid: boolean;
  paidAt?: Date;
  paymentId?: string;
  remindersSent: number;
}

export enum GroupPaymentStatus {
  COLLECTING = 'collecting',
  COMPLETED = 'completed',
  PARTIALLY_PAID = 'partially_paid',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled'
}
```

### FILE: src/types/marketplace.types.ts
```typescript
export interface ResaleListing {
  id: string;
  ticketId: string;
  sellerId: string;
  price: number;
  originalPrice: number;
  venueRoyaltyPercentage: number;
  status: ListingStatus;
  createdAt: Date;
}

export enum ListingStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SOLD = 'sold',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export interface EscrowTransaction {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: number;
  sellerPayout: number;
  venueRoyalty: number;
  platformFee: number;
  status: EscrowStatus;
  releaseConditions: ReleaseCondition[];
}

export enum EscrowStatus {
  CREATED = 'created',
  FUNDED = 'funded',
  RELEASED = 'released',
  REFUNDED = 'refunded',
  DISPUTED = 'disputed'
}

export interface ReleaseCondition {
  type: 'nft_transferred' | 'event_completed' | 'manual_approval';
  satisfied: boolean;
  satisfiedAt?: Date;
}
```

### FILE: src/types/fraud.types.ts
```typescript
export interface FraudCheck {
  userId: string;
  ipAddress: string;
  deviceFingerprint: string;
  score: number;
  signals: FraudSignal[];
  decision: FraudDecision;
  timestamp: Date;
}

export interface FraudSignal {
  type: SignalType;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  details: Record<string, any>;
}

export enum SignalType {
  KNOWN_SCALPER = 'known_scalper',
  RAPID_PURCHASES = 'rapid_purchases',
  MULTIPLE_ACCOUNTS = 'multiple_accounts',
  PROXY_DETECTED = 'proxy_detected',
  SUSPICIOUS_CARD = 'suspicious_card',
  BOT_BEHAVIOR = 'bot_behavior'
}

export enum FraudDecision {
  APPROVE = 'approve',
  REVIEW = 'review',
  CHALLENGE = 'challenge',
  DECLINE = 'decline'
}
```

### FILE: src/types/express.d.ts
```typescript
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: string;
        venues?: string[];
        isAdmin?: boolean;
      };
      sessionId?: string;
    }
  }
}

export {};
```


================================================================================
## SECTION 3: RAW PATTERN EXTRACTION
================================================================================

### All .table() and .from() calls:

### All SQL keywords (SELECT, INSERT, UPDATE, DELETE):
backend/services/payment-service//src/routes/internal.routes.ts:11:    // Update payment_transactions table which actually exists
backend/services/payment-service//src/routes/internal.routes.ts:14:      .update({
backend/services/payment-service//src/routes/internal.routes.ts:16:        updated_at: new Date()
backend/services/payment-service//src/routes/health.routes.ts:12:    await pool.query('SELECT 1');
backend/services/payment-service//src/jobs/process-webhook-queue.ts:17:      `SELECT * FROM webhook_inbox 
backend/services/payment-service//src/jobs/process-webhook-queue.ts:43:        'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE id = $1',
backend/services/payment-service//src/jobs/process-webhook-queue.ts:47:      // Update retry count and error
backend/services/payment-service//src/jobs/process-webhook-queue.ts:49:        `UPDATE webhook_inbox 
backend/services/payment-service//src/jobs/process-webhook-queue.ts:52:             updated_at = NOW()
backend/services/payment-service//src/jobs/retry-failed-payments.ts:17:      `SELECT * FROM payments 
backend/services/payment-service//src/jobs/retry-failed-payments.ts:20:       AND updated_at < NOW() - INTERVAL '1 hour'
backend/services/payment-service//src/jobs/retry-failed-payments.ts:32:      // Update retry count
backend/services/payment-service//src/jobs/retry-failed-payments.ts:34:        'UPDATE payments SET retry_count = retry_count + 1, updated_at = NOW() WHERE id = $1',
backend/services/payment-service//src/tests/helpers/fixture-builder.ts:17:      updated_at: new Date(),
backend/services/payment-service//src/tests/helpers/fixture-builder.ts:31:      updated_at: new Date(),
backend/services/payment-service//src/migrations/001_initial_schema.sql:19:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
backend/services/payment-service//src/migrations/001_initial_schema.sql:32:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
backend/services/payment-service//src/migrations/001_initial_schema.sql:46:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
backend/services/payment-service//src/migrations/001_initial_schema.sql:64:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
backend/services/payment-service//src/migrations/001_initial_schema.sql:74:    ticket_selections JSONB NOT NULL,
backend/services/payment-service//src/migrations/001_initial_schema.sql:81:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
backend/services/payment-service//src/migrations/001_initial_schema.sql:100:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
backend/services/payment-service//src/migrations/001_initial_schema.sql:120:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
backend/services/payment-service//src/migrations/001_initial_schema.sql:189:    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
backend/services/payment-service//src/migrations/001_initial_schema.sql:259:-- Create update timestamp trigger function
backend/services/payment-service//src/migrations/001_initial_schema.sql:260:CREATE OR REPLACE FUNCTION update_updated_at_column()
backend/services/payment-service//src/migrations/001_initial_schema.sql:263:    NEW.updated_at = CURRENT_TIMESTAMP;
backend/services/payment-service//src/migrations/001_initial_schema.sql:268:-- Apply update timestamp triggers
backend/services/payment-service//src/migrations/001_initial_schema.sql:269:CREATE TRIGGER update_payment_transactions_updated_at BEFORE UPDATE ON payment_transactions
backend/services/payment-service//src/migrations/001_initial_schema.sql:270:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:272:CREATE TRIGGER update_venue_balances_updated_at BEFORE UPDATE ON venue_balances
backend/services/payment-service//src/migrations/001_initial_schema.sql:273:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:275:CREATE TRIGGER update_payment_refunds_updated_at BEFORE UPDATE ON payment_refunds
backend/services/payment-service//src/migrations/001_initial_schema.sql:276:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:278:CREATE TRIGGER update_payment_escrows_updated_at BEFORE UPDATE ON payment_escrows
backend/services/payment-service//src/migrations/001_initial_schema.sql:279:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:281:CREATE TRIGGER update_group_payments_updated_at BEFORE UPDATE ON group_payments
backend/services/payment-service//src/migrations/001_initial_schema.sql:282:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:284:CREATE TRIGGER update_group_payment_members_updated_at BEFORE UPDATE ON group_payment_members
backend/services/payment-service//src/migrations/001_initial_schema.sql:285:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:287:CREATE TRIGGER update_nft_mint_queue_updated_at BEFORE UPDATE ON nft_mint_queue
backend/services/payment-service//src/migrations/001_initial_schema.sql:288:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/001_initial_schema.sql:290:CREATE TRIGGER update_event_purchase_limits_updated_at BEFORE UPDATE ON event_purchase_limits
backend/services/payment-service//src/migrations/001_initial_schema.sql:291:    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
backend/services/payment-service//src/migrations/005_event_ordering.sql:50:INSERT INTO payment_state_machine (from_state, to_state, event_type) VALUES
backend/services/payment-service//src/migrations/005_event_ordering.sql:74:        SELECT 1 FROM payment_state_machine
backend/services/payment-service//src/migrations/005_event_ordering.sql:89:    UPDATE payment_intents
backend/services/payment-service//src/migrations/20250930143102_fix_transactions_idempotency.sql:43:  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
backend/services/payment-service//src/migrations/20250930143102_fix_transactions_idempotency.sql:46:SELECT indexname, indexdef 
backend/services/payment-service//src/migrations/001_create_tenants.sql:9:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
backend/services/payment-service//src/migrations/001_create_tenants.sql:13:INSERT INTO tenants (id, name, slug)
backend/services/payment-service//src/migrations/20250930142553_fix_idempotency_constraints.sql:39:SELECT 
backend/services/payment-service//src/migrations/004_outbox_enhancements.sql:24:CREATE INDEX IF NOT EXISTS idx_orders_status_updated ON orders(status, updated_at);
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:16:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:26:-- Update trigger
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:27:CREATE OR REPLACE FUNCTION update_webhook_inbox_updated_at()
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:30:  NEW.updated_at = NOW();
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:35:DROP TRIGGER IF EXISTS webhook_inbox_updated_at ON webhook_inbox;
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:36:CREATE TRIGGER webhook_inbox_updated_at
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:37:  BEFORE UPDATE ON webhook_inbox
backend/services/payment-service//src/migrations/002_create_webhook_inbox.sql:39:  EXECUTE FUNCTION update_webhook_inbox_updated_at();
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:16:  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:25:-- Function to update updated_at
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:26:CREATE OR REPLACE FUNCTION update_webhook_inbox_updated_at()
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:29:  NEW.updated_at = NOW();
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:34:-- Trigger for updated_at
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:35:CREATE TRIGGER webhook_inbox_updated_at
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:36:  BEFORE UPDATE ON webhook_inbox
backend/services/payment-service//src/migrations/create_webhook_inbox.sql:38:  EXECUTE FUNCTION update_webhook_inbox_updated_at();
backend/services/payment-service//src/migrations/001_payment_tables.sql:13:    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
backend/services/payment-service//src/index.ts:106:    const dbHealthy = await DatabaseService.getPool().query('SELECT 1');
backend/services/payment-service//src/index.ts:159:      SELECT
backend/services/payment-service//src/controllers/webhook.controller.ts:90:      // 6. Update Redis to mark as completed
backend/services/payment-service//src/controllers/webhook.controller.ts:148:    // Update transaction status in database
backend/services/payment-service//src/controllers/webhook.controller.ts:151:      .update({
backend/services/payment-service//src/controllers/webhook.controller.ts:153:        updated_at: new Date()
backend/services/payment-service//src/controllers/webhook.controller.ts:164:      .update({
backend/services/payment-service//src/controllers/webhook.controller.ts:166:        updated_at: new Date()
backend/services/payment-service//src/controllers/webhook.controller.ts:187:      .update({
backend/services/payment-service//src/controllers/webhook.controller.ts:189:        updated_at: new Date()
backend/services/payment-service//src/controllers/webhook.controller.ts:201:        .update(body)
backend/services/payment-service//src/controllers/webhookController.ts:20:        `INSERT INTO webhook_inbox (webhook_id, source, event_type, payload, signature)
backend/services/payment-service//src/controllers/group-payment.controller.ts:17:      const { eventId, ticketSelections, members } = req.body;
backend/services/payment-service//src/controllers/group-payment.controller.ts:24:        ticketSelections,
backend/services/payment-service//src/controllers/refundController.ts:40:        `SELECT pi.*, o.tenant_id 
backend/services/payment-service//src/controllers/refundController.ts:83:        await client.query("SELECT set_config('app.tenant_id', $1, false)", [tenantId]);
backend/services/payment-service//src/controllers/refundController.ts:87:          `INSERT INTO refunds (id, payment_intent_id, amount, status, reason, tenant_id, created_at)
backend/services/payment-service//src/controllers/refundController.ts:92:        // Update payment intent status
backend/services/payment-service//src/controllers/refundController.ts:94:          `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
backend/services/payment-service//src/controllers/refundController.ts:101:          `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload, tenant_id)
backend/services/payment-service//src/models/refund.model.ts:18:      INSERT INTO payment_refunds (
backend/services/payment-service//src/models/refund.model.ts:38:  static async updateStatus(id: string, status: string, stripeRefundId?: string): Promise<Refund> {
backend/services/payment-service//src/models/refund.model.ts:40:      UPDATE payment_refunds 
backend/services/payment-service//src/models/refund.model.ts:44:          updated_at = CURRENT_TIMESTAMP
backend/services/payment-service//src/models/venue-balance.model.ts:7:      SELECT 
backend/services/payment-service//src/models/venue-balance.model.ts:33:  static async updateBalance(
backend/services/payment-service//src/models/venue-balance.model.ts:43:      // Insert or update the balance for this type
backend/services/payment-service//src/models/venue-balance.model.ts:45:        INSERT INTO venue_balances (venue_id, amount, balance_type)
backend/services/payment-service//src/models/venue-balance.model.ts:48:        DO UPDATE SET 
backend/services/payment-service//src/models/venue-balance.model.ts:50:          updated_at = CURRENT_TIMESTAMP
backend/services/payment-service//src/models/venue-balance.model.ts:56:      // Get the updated balances
backend/services/payment-service//src/models/venue-balance.model.ts:75:        `INSERT INTO venue_balances (venue_id, amount, balance_type)
backend/services/payment-service//src/models/transaction.model.ts:7:      INSERT INTO transactions (
backend/services/payment-service//src/models/transaction.model.ts:47:      SELECT * FROM transactions WHERE id = $1
backend/services/payment-service//src/models/transaction.model.ts:61:      SELECT * FROM transactions WHERE stripe_payment_intent_id = $1
backend/services/payment-service//src/models/transaction.model.ts:73:  static async updateStatus(id: string, status: TransactionStatus): Promise<Transaction> {
backend/services/payment-service//src/models/transaction.model.ts:75:      UPDATE transactions
backend/services/payment-service//src/models/transaction.model.ts:76:      SET status = $2, updated_at = CURRENT_TIMESTAMP
backend/services/payment-service//src/models/transaction.model.ts:90:  static async update(id: string, data: Partial<Transaction>): Promise<Transaction> {
backend/services/payment-service//src/models/transaction.model.ts:94:    const updates: string[] = [];
backend/services/payment-service//src/models/transaction.model.ts:99:      updates.push(`status = $${paramIndex++}`);
backend/services/payment-service//src/models/transaction.model.ts:104:      updates.push(`amount = $${paramIndex++}`);
backend/services/payment-service//src/models/transaction.model.ts:109:      updates.push(`platform_fee = $${paramIndex++}`);
backend/services/payment-service//src/models/transaction.model.ts:114:      updates.push(`venue_payout = $${paramIndex++}`);
backend/services/payment-service//src/models/transaction.model.ts:119:      updates.push(`gas_fee_paid = $${paramIndex++}`);
backend/services/payment-service//src/models/transaction.model.ts:124:      updates.push(`metadata = $${paramIndex++}`);
backend/services/payment-service//src/models/transaction.model.ts:128:    if (updates.length === 0) {
backend/services/payment-service//src/models/transaction.model.ts:129:      throw new Error('No fields to update');
backend/services/payment-service//src/models/transaction.model.ts:132:    updates.push('updated_at = CURRENT_TIMESTAMP');
backend/services/payment-service//src/models/transaction.model.ts:136:    // The ${updates.join(', ')} only contains column names and parameter placeholders
backend/services/payment-service//src/models/transaction.model.ts:138:      UPDATE transactions
backend/services/payment-service//src/models/transaction.model.ts:139:      SET ${updates.join(', ')}
backend/services/payment-service//src/models/transaction.model.ts:159:      SELECT * FROM transactions
backend/services/payment-service//src/models/transaction.model.ts:175:      SELECT * FROM transactions
backend/services/payment-service//src/models/transaction.model.ts:202:      updatedAt: row.updated_at
backend/services/payment-service//src/middleware/internal-auth.ts:49:    .update(payload)
backend/services/payment-service//src/middleware/validation.ts:61:    ticketSelections: Joi.array().items(
backend/services/payment-service//src/cron/webhook-cleanup.ts:15:      `DELETE FROM webhook_inbox 
backend/services/payment-service//src/cron/webhook-cleanup.ts:24:      `SELECT * FROM webhook_inbox 
backend/services/payment-service//src/cron/payment-reconciliation.ts:19:      `SELECT * FROM payments 
backend/services/payment-service//src/cron/payment-reconciliation.ts:21:       AND updated_at < NOW() - INTERVAL '10 minutes'`,
backend/services/payment-service//src/cron/payment-reconciliation.ts:40:        // Update local state based on Stripe's truth
backend/services/payment-service//src/cron/payment-reconciliation.ts:44:            'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/cron/payment-reconciliation.ts:74:        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
backend/services/payment-service//src/cron/payment-reconciliation.ts:82:          `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
backend/services/payment-service//src/processors/payment-event-processor.ts:6:  type: 'payment.created' | 'payment.updated' | 'payment.completed' | 'payment.failed';
backend/services/payment-service//src/processors/payment-event-processor.ts:28:      `INSERT INTO payment_events (event_id, event_type, payment_id, order_id, provider, payload, created_at)
backend/services/payment-service//src/processors/payment-event-processor.ts:67:      'SELECT retry_count FROM payments WHERE id = $1',
backend/services/payment-service//src/processors/order-event-processor.ts:20:      'SELECT state FROM orders WHERE id = $1',
backend/services/payment-service//src/processors/order-event-processor.ts:34:          await this.updateOrderState(event.orderId, OrderState.PAID);
backend/services/payment-service//src/processors/order-event-processor.ts:39:          await this.updateOrderState(event.orderId, OrderState.FULFILLED);
backend/services/payment-service//src/processors/order-event-processor.ts:48:  private async updateOrderState(orderId: string, newState: OrderState): Promise<void> {
backend/services/payment-service//src/processors/order-event-processor.ts:50:      'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/processors/order-event-processor.ts:64:      await this.updateOrderState(orderId, OrderState.CANCELLED);
backend/services/payment-service//src/services/paymentService.ts:47:      `INSERT INTO payment_intents
backend/services/payment-service//src/services/paymentService.ts:65:      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/payment-service//src/services/paymentService.ts:100:      `UPDATE payment_intents
backend/services/payment-service//src/services/paymentService.ts:101:       SET status = $2, updated_at = NOW()
backend/services/payment-service//src/services/paymentService.ts:111:        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:11:      INSERT INTO group_contributions (
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:42:      SELECT 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:58:      SELECT 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:67:      SELECT 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:92:      `INSERT INTO group_contribution_failures 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:104:        `UPDATE group_payment_members 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:106:             updated_at = CURRENT_TIMESTAMP
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:118:      `SELECT COUNT(*) as count 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:139:      SELECT 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:145:        SELECT 
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:160:      SELECT 
backend/services/payment-service//src/services/group/reminder-engine.service.ts:54:        SELECT 
backend/services/payment-service//src/services/group/reminder-engine.service.ts:76:      // Update reminder count
backend/services/payment-service//src/services/group/reminder-engine.service.ts:78:        `UPDATE group_payment_members 
backend/services/payment-service//src/services/group/reminder-engine.service.ts:114:      `INSERT INTO reminder_history 
backend/services/payment-service//src/services/group/reminder-engine.service.ts:166:      SELECT 
backend/services/payment-service//src/services/group/group-payment.service.ts:2:import { GroupPayment, GroupMember, GroupPaymentStatus, TicketSelection } from '../../types';
backend/services/payment-service//src/services/group/group-payment.service.ts:34:    ticketSelections: TicketSelection[],
backend/services/payment-service//src/services/group/group-payment.service.ts:43:      const totalAmount = ticketSelections.reduce(
backend/services/payment-service//src/services/group/group-payment.service.ts:48:      const totalTickets = ticketSelections.reduce(
backend/services/payment-service//src/services/group/group-payment.service.ts:60:        INSERT INTO group_payments (
backend/services/payment-service//src/services/group/group-payment.service.ts:62:          ticket_selections, expires_at, status
backend/services/payment-service//src/services/group/group-payment.service.ts:72:        JSON.stringify(ticketSelections),
backend/services/payment-service//src/services/group/group-payment.service.ts:88:          INSERT INTO group_payment_members (
backend/services/payment-service//src/services/group/group-payment.service.ts:148:        SELECT * FROM group_payment_members 
backend/services/payment-service//src/services/group/group-payment.service.ts:168:      // Update member status
backend/services/payment-service//src/services/group/group-payment.service.ts:169:      const updateQuery = `
backend/services/payment-service//src/services/group/group-payment.service.ts:170:        UPDATE group_payment_members
backend/services/payment-service//src/services/group/group-payment.service.ts:176:      await client.query(updateQuery, [memberId, groupId, paymentId]);
backend/services/payment-service//src/services/group/group-payment.service.ts:180:        `SELECT COUNT(*) as unpaid FROM group_payment_members 
backend/services/payment-service//src/services/group/group-payment.service.ts:186:        // All paid - update group status
backend/services/payment-service//src/services/group/group-payment.service.ts:188:          `UPDATE group_payments 
backend/services/payment-service//src/services/group/group-payment.service.ts:220:        // Update reminder count
backend/services/payment-service//src/services/group/group-payment.service.ts:222:          `UPDATE group_payment_members 
backend/services/payment-service//src/services/group/group-payment.service.ts:317:    console.log(`Tickets:`, group.ticketSelections);
backend/services/payment-service//src/services/group/group-payment.service.ts:322:      `UPDATE group_payments 
backend/services/payment-service//src/services/group/group-payment.service.ts:335:    // Update status to partially paid
backend/services/payment-service//src/services/group/group-payment.service.ts:337:      `UPDATE group_payments 
backend/services/payment-service//src/services/group/group-payment.service.ts:351:      'SELECT * FROM group_payments WHERE id = $1',
backend/services/payment-service//src/services/group/group-payment.service.ts:356:      'SELECT * FROM group_payment_members WHERE group_payment_id = $1',
backend/services/payment-service//src/services/group/group-payment.service.ts:368:      'SELECT * FROM group_payment_members WHERE group_payment_id = $1 AND paid = false',
backend/services/payment-service//src/services/event-ordering.service.ts:70:        SELECT sequence_number, processed_at 
backend/services/payment-service//src/services/event-ordering.service.ts:92:        'SELECT get_next_sequence_number($1) as seq',
backend/services/payment-service//src/services/event-ordering.service.ts:99:        INSERT INTO payment_event_sequence (
backend/services/payment-service//src/services/event-ordering.service.ts:161:      SELECT MAX(sequence_number) as last_processed
backend/services/payment-service//src/services/event-ordering.service.ts:173:      SELECT status, version FROM payment_intents WHERE id = $1
backend/services/payment-service//src/services/event-ordering.service.ts:188:      'SELECT validate_payment_state_transition($1, $2, $3) as valid',
backend/services/payment-service//src/services/event-ordering.service.ts:202:        UPDATE payment_event_sequence
backend/services/payment-service//src/services/event-ordering.service.ts:210:    // Update payment state with optimistic locking
backend/services/payment-service//src/services/event-ordering.service.ts:211:    const updateResult = await client.query(`
backend/services/payment-service//src/services/event-ordering.service.ts:212:      UPDATE payment_intents
backend/services/payment-service//src/services/event-ordering.service.ts:216:          updated_at = NOW()
backend/services/payment-service//src/services/event-ordering.service.ts:220:    if (updateResult.rowCount === 0) {
backend/services/payment-service//src/services/event-ordering.service.ts:221:      throw new Error('Concurrent update detected');
backend/services/payment-service//src/services/event-ordering.service.ts:226:      INSERT INTO payment_state_transitions (
backend/services/payment-service//src/services/event-ordering.service.ts:247:      UPDATE payment_event_sequence
backend/services/payment-service//src/services/event-ordering.service.ts:254:      INSERT INTO outbox (
backend/services/payment-service//src/services/event-ordering.service.ts:284:      SELECT * FROM payment_event_sequence
backend/services/payment-service//src/services/event-ordering.service.ts:330:    return crypto.createHash('sha256').update(data).digest('hex');
backend/services/payment-service//src/services/event-ordering.service.ts:352:        SELECT DISTINCT payment_id
backend/services/payment-service//src/services/event-ordering.service.ts:376:        SELECT * FROM payment_event_sequence
backend/services/payment-service//src/services/event-ordering.service.ts:421:      .update(JSON.stringify(request))
backend/services/payment-service//src/services/event-ordering.service.ts:431:        SELECT response, status_code
backend/services/payment-service//src/services/event-ordering.service.ts:441:          SELECT request_hash FROM payment_idempotency WHERE idempotency_key = $1
backend/services/payment-service//src/services/event-ordering.service.ts:460:        INSERT INTO payment_idempotency (
backend/services/payment-service//src/services/webhookProcessor.ts:14:      `SELECT * FROM webhook_inbox WHERE webhook_id = $1`,
backend/services/payment-service//src/services/webhookProcessor.ts:41:        `UPDATE webhook_inbox 
backend/services/payment-service//src/services/webhookProcessor.ts:50:      // Update attempts
backend/services/payment-service//src/services/webhookProcessor.ts:52:        `UPDATE webhook_inbox 
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:78:          `INSERT INTO royalty_distributions 
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:95:      'SELECT * FROM venue_royalty_settings WHERE venue_id = $1',
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:104:      'SELECT * FROM event_royalty_settings WHERE event_id = $1',
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:128:      SELECT 
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:142:      SELECT 
backend/services/payment-service//src/services/marketplace/escrow.service.ts:57:        INSERT INTO payment_escrows (
backend/services/payment-service//src/services/marketplace/escrow.service.ts:104:      await this.updateEscrowStatus(escrowId, EscrowStatus.FUNDED);
backend/services/payment-service//src/services/marketplace/escrow.service.ts:146:      await VenueBalanceModel.updateBalance(
backend/services/payment-service//src/services/marketplace/escrow.service.ts:152:      await this.updateEscrowStatus(escrowId, EscrowStatus.RELEASED);
backend/services/payment-service//src/services/marketplace/escrow.service.ts:183:    await this.updateEscrowStatus(escrowId, EscrowStatus.REFUNDED);
backend/services/payment-service//src/services/marketplace/escrow.service.ts:217:        `INSERT INTO escrow_release_conditions
backend/services/payment-service//src/services/marketplace/escrow.service.ts:227:      `SELECT * FROM escrow_release_conditions
backend/services/payment-service//src/services/marketplace/escrow.service.ts:241:      'SELECT * FROM payment_escrows WHERE id = $1',
backend/services/payment-service//src/services/marketplace/escrow.service.ts:256:  private async updateEscrowStatus(
backend/services/payment-service//src/services/marketplace/escrow.service.ts:261:      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:152:      'SELECT * FROM venue_price_rules WHERE venue_id = $1',
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:163:      `SELECT * FROM resale_listings 
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:184:      SELECT 
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:30:    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:42:      `INSERT INTO device_activity 
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:128:      `SELECT COUNT(DISTINCT user_id) as count
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:139:      `SELECT COUNT(*) as count
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:156:      SELECT 
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:191:      `SELECT MIN(timestamp) as first_seen
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:207:      `SELECT COUNT(*) as count
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:132:      SELECT
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:174:      SELECT
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:215:      SELECT
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:252:      SELECT
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:299:      SELECT
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:351:        `INSERT INTO fraud_checks
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:376:        `INSERT INTO scalper_reports
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:396:        `SELECT COUNT(*) as count
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:416:        `INSERT INTO fraud_review_queue
backend/services/payment-service//src/services/compliance/tax-calculator.service.ts:183:      `INSERT INTO tax_collections
backend/services/payment-service//src/services/compliance/tax-calculator.service.ts:256:      `SELECT
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:78:      `SELECT SUM(amount) as total
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:134:      `SELECT COUNT(*) as count, SUM(amount) as total
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:156:      `SELECT 
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:184:      `SELECT 
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:219:      `SELECT * FROM sanctions_list_matches
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:240:      `SELECT * FROM pep_database
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:266:      `INSERT INTO aml_checks 
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:295:      `INSERT INTO suspicious_activity_reports 
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:81:      SELECT
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:114:      `SELECT
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:140:      `INSERT INTO tax_forms_1099da
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:161:      SELECT DISTINCT
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:208:      `SELECT * FROM tax_forms_1099da
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:62:        SELECT o.* 
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:67:          AND o.updated_at < NOW() - INTERVAL '5 minutes'
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:92:        SELECT * FROM outbox
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:102:          INSERT INTO outbox (
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:129:          UPDATE outbox
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:153:        UPDATE outbox
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:184:        SELECT o.*, pi.status as payment_status
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:194:          // Payment succeeded but order not updated
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:198:            UPDATE orders
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:200:                updated_at = NOW()
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:206:            INSERT INTO outbox (
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:233:            UPDATE orders
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:235:                updated_at = NOW()
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:262:        SELECT * FROM orders WHERE id = $1
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:273:        SELECT * FROM payment_intents WHERE order_id = $1
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:280:            UPDATE orders SET status = 'PAID', updated_at = NOW()
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:287:          SELECT COUNT(*) as count FROM tickets WHERE order_id = $1
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:293:            INSERT INTO outbox (
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:132:      `SELECT
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:165:      `SELECT SUM(ticket_count) as total
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:181:      `SELECT SUM(ticket_count) as total
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:200:      `SELECT SUM(pt.ticket_count) as total
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:222:      `SELECT billing_address FROM users WHERE id = $1`,
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:263:    // Update purchase counts (handled by transaction creation)
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:285:      `UPDATE event_purchase_limits
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:288:           updated_at = CURRENT_TIMESTAMP
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:301:      SELECT
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:307:        SELECT
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:317:        SELECT
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:323:      `INSERT INTO waiting_room_activity
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:378:      `SELECT
backend/services/payment-service//src/services/high-demand/bot-detector.service.ts:240:      `SELECT COUNT(*) as count
backend/services/payment-service//src/services/high-demand/bot-detector.service.ts:316:      `INSERT INTO bot_detections 
backend/services/payment-service//src/services/high-demand/bot-detector.service.ts:335:    // Update bot detection model based on verified data
backend/services/payment-service//src/services/high-demand/bot-detector.service.ts:336:    // In production, this would update ML model weights
backend/services/payment-service//src/services/blockchain/mint-batcher.service.ts:56:    // Update status
backend/services/payment-service//src/services/state-machine/transitions.ts:33:    // Update database
backend/services/payment-service//src/services/state-machine/transitions.ts:35:      'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/services/state-machine/transitions.ts:39:    // Update order state based on payment state
backend/services/payment-service//src/services/state-machine/transitions.ts:58:        'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/services/databaseService.ts:15:    await this.pool.query('SELECT NOW()');
backend/services/payment-service//src/services/core/venue-balance.service.ts:62:    await VenueBalanceModel.updateBalance(venueId, -amount, 'available');
backend/services/payment-service//src/services/core/payment-processor.service.ts:71:        .update({
backend/services/payment-service//src/services/webhooks/outbound-webhook.ts:41:    hmac.update(JSON.stringify(payload));
backend/services/payment-service//src/services/webhooks/outbound-webhook.ts:47:      `INSERT INTO outbound_webhooks (url, event, payload, status, error, sent_at)
backend/services/payment-service//src/webhooks/stripe-handler.ts:32:      'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
backend/services/payment-service//src/webhooks/stripe-handler.ts:42:      `INSERT INTO webhook_inbox (webhook_id, provider, event_type, payload, processed)
backend/services/payment-service//src/webhooks/stripe-handler.ts:52:      'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE webhook_id = $1',
backend/services/payment-service//src/webhooks/stripe-handler.ts:76:      'SELECT id, state, order_id FROM payments WHERE provider_payment_id = $1',
backend/services/payment-service//src/workers/outbox.processor.ts:46:      .update(signaturePayload)
backend/services/payment-service//src/workers/outbox.processor.ts:66:        SELECT * FROM outbox 
backend/services/payment-service//src/workers/outbox.processor.ts:75:        FOR UPDATE SKIP LOCKED
backend/services/payment-service//src/workers/outbox.processor.ts:132:          UPDATE outbox 
backend/services/payment-service//src/workers/outbox.processor.ts:139:        // Update retry attempt
backend/services/payment-service//src/workers/outbox.processor.ts:141:          UPDATE outbox 
backend/services/payment-service//src/workers/outbox.processor.ts:154:      // Update retry attempt with error message
backend/services/payment-service//src/workers/outbox.processor.ts:156:        UPDATE outbox 
backend/services/payment-service//src/workers/outbox.processor.ts:284:        INSERT INTO outbox_dlq (
backend/services/payment-service//src/workers/outbox.processor.ts:307:        UPDATE outbox 
backend/services/payment-service//src/workers/webhook.consumer.ts:48:      // Update webhook as processed
backend/services/payment-service//src/workers/webhook.consumer.ts:51:        .update({
backend/services/payment-service//src/workers/webhook.processor.ts:121:      // Update retry count
backend/services/payment-service//src/workers/webhook.processor.ts:124:        .update({
backend/services/payment-service//src/workers/webhook.processor.ts:134:      .update({
backend/services/payment-service//src/types/payment.types.ts:5:  tickets: TicketSelection[];
backend/services/payment-service//src/types/payment.types.ts:11:export interface TicketSelection {
backend/services/payment-service//src/types/payment.types.ts:75:  updatedAt: Date;
backend/services/payment-service//src/types/group.types.ts:1:import { TicketSelection } from './payment.types';
backend/services/payment-service//src/types/group.types.ts:8:  ticketSelections: TicketSelection[];

### All JOIN operations:
backend/services/payment-service//src/controllers/refundController.ts:42:         JOIN orders o ON pi.order_id = o.id
backend/services/payment-service//src/models/transaction.model.ts:136:    // The ${updates.join(', ')} only contains column names and parameter placeholders
backend/services/payment-service//src/models/transaction.model.ts:139:      SET ${updates.join(', ')}
backend/services/payment-service//src/middleware/validation.ts:94:        field: detail.path.join('.'),
backend/services/payment-service//src/middleware/validation.ts:121:        field: detail.path.join('.'),
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:49:      JOIN group_payment_members m ON c.member_id = m.id
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:149:        JOIN group_payment_members gpm ON gp.id = gpm.group_payment_id
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:150:        JOIN events e ON gp.event_id = e.id
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:164:      JOIN events e ON gp.event_id = e.id
backend/services/payment-service//src/services/group/reminder-engine.service.ts:60:        JOIN group_payments g ON m.group_payment_id = g.id
backend/services/payment-service//src/services/group/reminder-engine.service.ts:61:        JOIN events e ON g.event_id = e.id
backend/services/payment-service//src/services/group/reminder-engine.service.ts:172:      JOIN group_payment_members m ON rh.member_id = m.id
backend/services/payment-service//src/services/group/reminder-engine.service.ts:173:      JOIN group_payments g ON m.group_payment_id = g.id
backend/services/payment-service//src/services/group/reminder-engine.service.ts:174:      JOIN events e ON g.event_id = e.id
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:148:      JOIN payment_transactions pt ON rd.transaction_id = pt.id
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:149:      JOIN events e ON pt.event_id = e.id
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:23:      plugins: (deviceData.plugins || []).sort().join(','),
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:24:      fonts: (deviceData.fonts || []).slice(0, 20).sort().join(','),
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:162:      JOIN device_activity da2 ON da1.device_fingerprint = da2.device_fingerprint
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:179:      JOIN tickets t ON rl.ticket_id = t.id
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:257:      JOIN events e ON pt.event_id = e.id
backend/services/payment-service//src/services/compliance/tax-calculator.service.ts:260:       JOIN venues v ON pt.venue_id = v.id
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:90:      JOIN tickets t ON rl.ticket_id = t.id
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:91:      JOIN events e ON t.event_id = e.id
backend/services/payment-service//src/services/compliance/form-1099-da.service.ts:122:       LEFT JOIN user_tax_info uti ON u.id = uti.user_id
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:64:        LEFT JOIN tickets t ON t.order_id = o.id
backend/services/payment-service//src/services/reconciliation/reconciliation-service.ts:186:        LEFT JOIN payment_intents pi ON pi.order_id = o.id
backend/services/payment-service//src/services/high-demand/purchase-limiter.service.ts:202:       JOIN user_addresses ua ON pt.user_id = ua.user_id
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:38:  async joinWaitingRoom(
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:81:    // Record queue join
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:82:    await this.recordQueueActivity(eventId, userId, 'joined', { queueId, position });
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:380:        COUNT(*) FILTER (WHERE action = 'joined') as joined
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:388:    const joined = parseInt(abandonmentStats.rows[0].joined);
backend/services/payment-service//src/services/high-demand/waiting-room.service.ts:389:    const abandonmentRate = joined > 0 ? (abandoned / joined) * 100 : 0;
backend/services/payment-service//src/services/blockchain/nft-queue.service.ts:69:    return jobs.map(j => j.id).join(',');

### All WHERE clauses:
backend/services/payment-service//src/jobs/process-webhook-queue.ts:18:       WHERE processed = false 
backend/services/payment-service//src/jobs/process-webhook-queue.ts:43:        'UPDATE webhook_inbox SET processed = true, processed_at = NOW() WHERE id = $1',
backend/services/payment-service//src/jobs/process-webhook-queue.ts:53:         WHERE id = $2`,
backend/services/payment-service//src/jobs/retry-failed-payments.ts:18:       WHERE state = $1 
backend/services/payment-service//src/jobs/retry-failed-payments.ts:34:        'UPDATE payments SET retry_count = retry_count + 1, updated_at = NOW() WHERE id = $1',
backend/services/payment-service//src/migrations/005_event_ordering.sql:20:CREATE INDEX idx_payment_event_sequence_unprocessed ON payment_event_sequence(processed_at) WHERE processed_at IS NULL;
backend/services/payment-service//src/migrations/005_event_ordering.sql:75:        WHERE from_state = current_state
backend/services/payment-service//src/migrations/005_event_ordering.sql:91:    WHERE id = p_payment_id
backend/services/payment-service//src/migrations/20250930143102_fix_transactions_idempotency.sql:26:  WHERE idempotency_key IS NOT NULL;
backend/services/payment-service//src/migrations/20250930143102_fix_transactions_idempotency.sql:48:WHERE tablename = 'transactions' AND indexname = 'uq_transactions_idempotency';
backend/services/payment-service//src/migrations/20250930142553_fix_idempotency_constraints.sql:18:  WHERE idempotency_key IS NOT NULL;
backend/services/payment-service//src/migrations/20250930142553_fix_idempotency_constraints.sql:30:  WHERE idempotency_key IS NOT NULL;
backend/services/payment-service//src/migrations/20250930142553_fix_idempotency_constraints.sql:45:WHERE indexname IN ('uq_payment_intents_idempotency', 'uq_refunds_idempotency');
backend/services/payment-service//src/migrations/004_outbox_enhancements.sql:26:  WHERE processed_at IS NULL;
backend/services/payment-service//src/migrations/002_outbox.sql:12:CREATE INDEX idx_outbox_unprocessed ON outbox(processed_at) WHERE processed_at IS NULL;
backend/services/payment-service//src/index.ts:166:      WHERE created_at > NOW() - INTERVAL '24 hours'
backend/services/payment-service//src/controllers/refundController.ts:43:         WHERE pi.stripe_intent_id = $1 AND o.tenant_id = $2`,
backend/services/payment-service//src/controllers/refundController.ts:94:          `UPDATE payment_intents SET status = 'refunded' WHERE stripe_intent_id = $1`,
backend/services/payment-service//src/models/refund.model.ts:45:      WHERE id = $1
backend/services/payment-service//src/models/venue-balance.model.ts:14:      WHERE venue_id = $1
backend/services/payment-service//src/models/transaction.model.ts:47:      SELECT * FROM transactions WHERE id = $1
backend/services/payment-service//src/models/transaction.model.ts:61:      SELECT * FROM transactions WHERE stripe_payment_intent_id = $1
backend/services/payment-service//src/models/transaction.model.ts:77:      WHERE id = $1
backend/services/payment-service//src/models/transaction.model.ts:140:      WHERE id = $${paramIndex}
backend/services/payment-service//src/models/transaction.model.ts:160:      WHERE user_id = $1
backend/services/payment-service//src/models/transaction.model.ts:176:      WHERE venue_id = $1
backend/services/payment-service//src/cron/webhook-cleanup.ts:16:       WHERE processed = true 
backend/services/payment-service//src/cron/webhook-cleanup.ts:25:       WHERE processed = false 
backend/services/payment-service//src/cron/payment-reconciliation.ts:20:       WHERE state = $1 
backend/services/payment-service//src/cron/payment-reconciliation.ts:44:            'UPDATE payments SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/cron/payment-reconciliation.ts:74:        'SELECT id FROM webhook_inbox WHERE webhook_id = $1',
backend/services/payment-service//src/processors/payment-event-processor.ts:67:      'SELECT retry_count FROM payments WHERE id = $1',
backend/services/payment-service//src/processors/order-event-processor.ts:20:      'SELECT state FROM orders WHERE id = $1',
backend/services/payment-service//src/processors/order-event-processor.ts:50:      'UPDATE orders SET state = $1, updated_at = NOW() WHERE id = $2',
backend/services/payment-service//src/services/paymentService.ts:102:       WHERE stripe_intent_id = $1
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:50:      WHERE c.group_id = $1
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:63:      WHERE id = $1
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:72:      WHERE group_id = $1
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:107:         WHERE id = $1 AND group_payment_id = $2`,
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:120:       WHERE group_id = $1 AND member_id = $2`,
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:141:        COUNT(*) FILTER (WHERE status = 'completed') as successful_groups,
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:151:        WHERE e.venue_id = $1
backend/services/payment-service//src/services/group/contribution-tracker.service.ts:165:      WHERE e.venue_id = $1 
backend/services/payment-service//src/services/group/reminder-engine.service.ts:62:        WHERE g.id = $1 AND m.paid = false
backend/services/payment-service//src/services/group/reminder-engine.service.ts:80:         WHERE group_payment_id = $1 AND paid = false`,
backend/services/payment-service//src/services/group/reminder-engine.service.ts:175:      WHERE e.venue_id = $1
backend/services/payment-service//src/services/group/group-payment.service.ts:149:        WHERE id = $1 AND group_payment_id = $2
backend/services/payment-service//src/services/group/group-payment.service.ts:174:        WHERE id = $1 AND group_payment_id = $2
backend/services/payment-service//src/services/group/group-payment.service.ts:181:         WHERE group_payment_id = $1 AND paid = false`,
backend/services/payment-service//src/services/group/group-payment.service.ts:190:           WHERE id = $1`,
backend/services/payment-service//src/services/group/group-payment.service.ts:224:           WHERE id = $1`,
backend/services/payment-service//src/services/group/group-payment.service.ts:326:       WHERE id = $1`,
backend/services/payment-service//src/services/group/group-payment.service.ts:339:       WHERE id = $1`,
backend/services/payment-service//src/services/group/group-payment.service.ts:351:      'SELECT * FROM group_payments WHERE id = $1',
backend/services/payment-service//src/services/group/group-payment.service.ts:356:      'SELECT * FROM group_payment_members WHERE group_payment_id = $1',
backend/services/payment-service//src/services/group/group-payment.service.ts:368:      'SELECT * FROM group_payment_members WHERE group_payment_id = $1 AND paid = false',
backend/services/payment-service//src/services/event-ordering.service.ts:72:        WHERE payment_id = $1 
backend/services/payment-service//src/services/event-ordering.service.ts:163:      WHERE payment_id = $1 AND processed_at IS NOT NULL
backend/services/payment-service//src/services/event-ordering.service.ts:173:      SELECT status, version FROM payment_intents WHERE id = $1
backend/services/payment-service//src/services/event-ordering.service.ts:204:        WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
backend/services/payment-service//src/services/event-ordering.service.ts:217:      WHERE id = $3 AND version = $4
backend/services/payment-service//src/services/event-ordering.service.ts:249:      WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
backend/services/payment-service//src/services/event-ordering.service.ts:285:      WHERE payment_id = $1
backend/services/payment-service//src/services/event-ordering.service.ts:354:        WHERE processed_at IS NULL
backend/services/payment-service//src/services/event-ordering.service.ts:377:        WHERE payment_id = $1
backend/services/payment-service//src/services/event-ordering.service.ts:433:        WHERE idempotency_key = $1
backend/services/payment-service//src/services/event-ordering.service.ts:441:          SELECT request_hash FROM payment_idempotency WHERE idempotency_key = $1
backend/services/payment-service//src/services/webhookProcessor.ts:14:      `SELECT * FROM webhook_inbox WHERE webhook_id = $1`,
backend/services/payment-service//src/services/webhookProcessor.ts:43:         WHERE webhook_id = $1`,
backend/services/payment-service//src/services/webhookProcessor.ts:54:         WHERE webhook_id = $1`,
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:95:      'SELECT * FROM venue_royalty_settings WHERE venue_id = $1',
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:104:      'SELECT * FROM event_royalty_settings WHERE event_id = $1',
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:133:      WHERE recipient_id = $1 
backend/services/payment-service//src/services/marketplace/royalty-splitter.service.ts:150:      WHERE rd.recipient_id = $1 
backend/services/payment-service//src/services/marketplace/escrow.service.ts:228:       WHERE escrow_id = $1 AND required = true`,
backend/services/payment-service//src/services/marketplace/escrow.service.ts:241:      'SELECT * FROM payment_escrows WHERE id = $1',
backend/services/payment-service//src/services/marketplace/escrow.service.ts:261:      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:152:      'SELECT * FROM venue_price_rules WHERE venue_id = $1',
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:164:       WHERE venue_id = $1 AND created_at > $2`,
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:187:        COUNT(*) FILTER (WHERE status = 'blocked_price_violation') as violations_blocked,
backend/services/payment-service//src/services/marketplace/price-enforcer.service.ts:190:      WHERE venue_id = $1
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:130:       WHERE device_fingerprint = $1`,
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:141:       WHERE device_fingerprint = $1
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:163:      WHERE da1.device_fingerprint = $1
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:193:       WHERE device_fingerprint = $1`,
backend/services/payment-service//src/services/fraud/device-fingerprint.service.ts:209:       WHERE device_fingerprint = $1
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:137:      WHERE user_id = $1
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:177:        COUNT(*) FILTER (WHERE rl.created_at < t.purchased_at + INTERVAL '24 hours') as quick_resales
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:180:      WHERE rl.seller_id = $1
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:219:      WHERE device_fingerprint = $1
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:253:        COUNT(*) FILTER (WHERE e.demand_score > 0.8) as high_demand_purchases,
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:258:      WHERE pt.user_id = $1
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:304:      WHERE user_id = $1 OR device_fingerprint = $2
backend/services/payment-service//src/services/fraud/scalper-detector.service.ts:398:         WHERE suspected_scalper_id = $1
backend/services/payment-service//src/services/compliance/tax-calculator.service.ts:261:       WHERE v.state = $1
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:80:       WHERE user_id = $1
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:136:       WHERE user_id = $1
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:161:       WHERE user_id = $1
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:189:       WHERE user_id = $1
backend/services/payment-service//src/services/compliance/aml-checker.service.ts:220:       WHERE user_id = $1 AND active = true`,

================================================================================
## SECTION 4: CONFIGURATION AND SETUP FILES
================================================================================

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
### knexfile.js
```javascript
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
### .env.example
```
# ================================================
# PAYMENT-SERVICE ENVIRONMENT CONFIGURATION
# ================================================
# Generated: Tue Aug 12 13:18:17 EDT 2025
# Service: payment-service
# Port: 3005
3005
# ================================================

# ==== REQUIRED: Core Service Configuration ====
NODE_ENV=development                    # development | staging | production
PORT=<PORT_NUMBER>         # Service port
PORT=<PORT_NUMBER>         # Service port
SERVICE_NAME=payment-service           # Service identifier

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

# ==== REQUIRED: Payment Provider Configuration ====
STRIPE_SECRET_KEY=<STRIPE_SECRET_KEY>           # Stripe secret key
STRIPE_WEBHOOK_SECRET=<STRIPE_WEBHOOK_SECRET>   # Stripe webhook signing secret
STRIPE_API_VERSION=2023-10-16                   # Stripe API version

# ==== Payment Settings ====
PLATFORM_FEE_PERCENTAGE=2.5                     # Platform fee percentage
PAYMENT_TIMEOUT_MS=30000                        # Payment timeout in milliseconds
REFUND_WINDOW_DAYS=30                          # Refund window in days

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


# Phase 2.2: Waiting Room Security
QUEUE_TOKEN_SECRET=change-this-to-random-32-char-string-in-production
```

================================================================================
## SECTION 5: REPOSITORY AND SERVICE LAYERS
================================================================================

### FILE: src/services/mock/mock-fraud.service.ts
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

### FILE: src/services/mock/mock-stripe.service.ts
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

### FILE: src/services/mock/mock-nft.service.ts
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

### FILE: src/services/mock/mock-email.service.ts
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

### FILE: src/services/paymentService.ts
```typescript
import { DatabaseService } from './databaseService';
import { QUEUES } from "@tickettoken/shared";
import { QueueService } from './queueService';
import { logger } from '../utils/logger';
import { StripeMock } from './providers/stripeMock';

const log = logger.child({ component: 'PaymentService' });

let stripe: any;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
  const Stripe = require('stripe');
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
  });
  log.info('Using real Stripe API');
} else {
  stripe = new StripeMock();
  log.info('Using mock Stripe (no valid key found)');
}

interface CreateIntentParams {
  orderId: string;
  amount: number;        // INTEGER CENTS
  platformFee: number;   // INTEGER CENTS
  venueId?: string;
  metadata?: any;
}

class PaymentServiceClass {
  async createPaymentIntent(params: CreateIntentParams) {
    const db = DatabaseService.getPool();

    // Stripe expects amount in cents (params already in cents)
    const stripeIntent = await stripe.paymentIntents.create({
      amount: params.amount,
      currency: 'usd',
      application_fee_amount: params.platformFee,
      metadata: {
        orderId: params.orderId,
        venueId: params.venueId || '',
        ...params.metadata
      }
    });

    // Store in database (amounts in cents)
    const result = await db.query(
      `INSERT INTO payment_intents
       (order_id, stripe_intent_id, amount, platform_fee, venue_id, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.orderId,
        stripeIntent.id,
        params.amount,
        params.platformFee,
        params.venueId,
        JSON.stringify(params.metadata || {}),
        stripeIntent.status
      ]
    );

    const intent = result.rows[0];

    await db.query(
      `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
       VALUES ($1, $2, $3, $4)`,
      [
        intent.id,
        'payment_intent',
        'payments.intent_created',
        JSON.stringify({
          orderId: params.orderId,
          intentId: intent.id,
          stripeIntentId: stripeIntent.id,
          amount: params.amount
        })
      ]
    );

    log.info('Payment intent created', {
      intentId: intent.id,
      stripeId: stripeIntent.id,
      amount: params.amount
    });

    return {
      id: intent.id,
      stripeIntentId: stripeIntent.id,
      clientSecret: stripeIntent.client_secret,
      amount: params.amount,
      platformFee: params.platformFee
    };
  }

  async confirmPayment(stripeIntentId: string) {
    const intent = await stripe.paymentIntents.retrieve(stripeIntentId);

    const db = DatabaseService.getPool();
    const result = await db.query(
      `UPDATE payment_intents
       SET status = $2, updated_at = NOW()
       WHERE stripe_intent_id = $1
       RETURNING *`,
      [stripeIntentId, intent.status]
    );

    if (result.rows.length > 0) {
      const payment = result.rows[0];

      await db.query(
        `INSERT INTO outbox (aggregate_id, aggregate_type, event_type, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          payment.id,
          'payment',
          'payment.confirmed',
          JSON.stringify({
            orderId: payment.order_id,
            paymentId: payment.id,
            amount: payment.amount
          })
        ]
      );
    }

    return result.rows[0];
  }
}

export const PaymentService = new PaymentServiceClass();
```

### FILE: src/services/group/contribution-tracker.service.ts
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
    
    if (failureCount >= 3) {
      // Mark member as problematic
      await query(
        `UPDATE group_payment_members 
         SET status = 'payment_failed', 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND group_payment_id = $2`,
        [memberId, groupId]
      );
    }
  }
  
  private async getFailureCount(
    groupId: string,
    memberId: string
  ): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count 
       FROM group_contribution_failures 
       WHERE group_id = $1 AND member_id = $2`,
      [groupId, memberId]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async getGroupAnalytics(venueId: string): Promise<{
    totalGroups: number;
    successRate: number;
    averageGroupSize: number;
    averageCompletionTime: number;
    commonFailureReasons: Array<{
      reason: string;
      count: number;
    }>;
  }> {
    // Get overall stats
    const statsQuery = `
      SELECT 
        COUNT(*) as total_groups,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_groups,
        AVG(member_count) as avg_group_size,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/60) as avg_completion_minutes
      FROM (
        SELECT 
          gp.*,
          COUNT(gpm.id) as member_count
        FROM group_payments gp
        JOIN group_payment_members gpm ON gp.id = gpm.group_payment_id
        JOIN events e ON gp.event_id = e.id
        WHERE e.venue_id = $1
        GROUP BY gp.id
      ) as group_stats
    `;
    
    const stats = await query(statsQuery, [venueId]);
    
    // Get failure reasons
    const failuresQuery = `
      SELECT 
        cancellation_reason as reason,
        COUNT(*) as count
      FROM group_payments gp
      JOIN events e ON gp.event_id = e.id
      WHERE e.venue_id = $1 
        AND gp.status = 'cancelled'
        AND gp.cancellation_reason IS NOT NULL
      GROUP BY cancellation_reason
      ORDER BY count DESC
      LIMIT 5
    `;
    
    const failures = await query(failuresQuery, [venueId]);
    
    const statsRow = stats.rows[0];
    return {
      totalGroups: parseInt(statsRow.total_groups),
      successRate: (parseInt(statsRow.successful_groups) / parseInt(statsRow.total_groups)) * 100,
      averageGroupSize: parseFloat(statsRow.avg_group_size),
      averageCompletionTime: parseFloat(statsRow.avg_completion_minutes),
      commonFailureReasons: failures.rows
    };
  }
}
```

### FILE: src/services/group/reminder-engine.service.ts
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
      isFinal,
      minutesRemaining
    );
    
    // In production, integrate with email service
    console.log(`Sending reminder #${reminderNumber} to ${member.email}`);
    console.log(`Event: ${member.event_name}`);
    console.log(`Amount due: $${member.amount_due}`);
    console.log(`Time remaining: ${minutesRemaining} minutes`);
    console.log(`Message: ${template.subject}`);
    
    // Record reminder sent
    await query(
      `INSERT INTO reminder_history 
       (group_id, member_id, reminder_number, sent_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [member.group_payment_id, member.id, reminderNumber]
    );
  }
  
  private getReminderTemplate(
    reminderNumber: number,
    isFinal: boolean,
    minutesRemaining: number
  ): { subject: string; urgency: string } {
    if (isFinal) {
      return {
        subject: `FINAL REMINDER: ${minutesRemaining} minutes left to secure your tickets!`,
        urgency: 'critical'
      };
    }
    
    switch (reminderNumber) {
      case 1:
        return {
          subject: `Reminder: Complete your ticket payment (${minutesRemaining} minutes remaining)`,
          urgency: 'normal'
        };
      case 2:
        return {
          subject: `Don't miss out! Only ${minutesRemaining} minutes left to pay`,
          urgency: 'high'
        };
      default:
        return {
          subject: `Payment reminder for your tickets`,
          urgency: 'normal'
        };
    }
  }
  
  async getReminderEffectiveness(venueId: string): Promise<{
    reminderStats: Array<{
      reminderNumber: number;
      conversionRate: number;
      averageResponseTime: number;
    }>;
    optimalTiming: {
      firstReminder: number;
      secondReminder: number;
      finalReminder: number;
    };
  }> {
    // Analyze reminder effectiveness
    const statsQuery = `
      SELECT 
        rh.reminder_number,
        COUNT(DISTINCT rh.member_id) as reminders_sent,
        COUNT(DISTINCT CASE WHEN m.paid = true THEN m.id END) as conversions,
        AVG(EXTRACT(EPOCH FROM (m.paid_at - rh.sent_at))/60) as avg_response_minutes
      FROM reminder_history rh
      JOIN group_payment_members m ON rh.member_id = m.id
      JOIN group_payments g ON m.group_payment_id = g.id
      JOIN events e ON g.event_id = e.id
      WHERE e.venue_id = $1
      GROUP BY rh.reminder_number
      ORDER BY rh.reminder_number
    `;
    
    const stats = await query(statsQuery, [venueId]);
    
    const reminderStats = stats.rows.map(row => ({
      reminderNumber: row.reminder_number,
      conversionRate: (row.conversions / row.reminders_sent) * 100,
      averageResponseTime: parseFloat(row.avg_response_minutes) || 0
    }));
    
    // Calculate optimal timing based on historical data
    // This is simplified - in production would use ML
    const optimalTiming = {
      firstReminder: 5,   // 5 minutes
      secondReminder: 8,  // 8 minutes
      finalReminder: 9.5  // 9.5 minutes
    };
    
    return {
      reminderStats,
      optimalTiming
    };
  }
}
```

### FILE: src/services/group/group-payment.service.ts
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
          member.ticketCount
        ];
        
        const memberResult = await client.query(memberQuery, memberValues);
        groupMembers.push({
          ...memberResult.rows[0],
          paid: false,
          remindersSent: 0
        });
      }
      
      await client.query('COMMIT');
      
      // Schedule expiry check
      await this.expiryQueue.add(
        'check-expiry',
        { groupId },
        { delay: 10 * 60 * 1000 } // 10 minutes
      );
      
      // Send initial invitations
      await this.sendGroupInvitations(groupPayment, groupMembers);
      
      return {
        ...groupPayment,
        members: groupMembers
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  
  async recordMemberPayment(
    groupId: string,
    memberId: string,
    paymentMethodId: string
  ): Promise<void> {
    const { client, release } = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get member details
      const memberQuery = `
        SELECT * FROM group_payment_members 
        WHERE id = $1 AND group_payment_id = $2
      `;
      const memberResult = await client.query(memberQuery, [memberId, groupId]);
      const member = memberResult.rows[0];
      
      if (!member) {
        throw new Error('Member not found');
      }
      
      if (member.paid) {
        throw new Error('Member already paid');
      }
      
      // Process payment (integrate with PaymentProcessorService)
      const paymentId = await this.processMemberPayment(
        member,
        paymentMethodId
      );
      
      // Update member status
      const updateQuery = `
        UPDATE group_payment_members
        SET paid = true,
            paid_at = CURRENT_TIMESTAMP,
            payment_id = $3
        WHERE id = $1 AND group_payment_id = $2
      `;
      await client.query(updateQuery, [memberId, groupId, paymentId]);
      
      // Check if all members have paid
      const statusCheck = await client.query(
        `SELECT COUNT(*) as unpaid FROM group_payment_members 
         WHERE group_payment_id = $1 AND paid = false`,
        [groupId]
      );
      
      if (parseInt(statusCheck.rows[0].unpaid) === 0) {
        // All paid - update group status
        await client.query(
          `UPDATE group_payments 
           SET status = $2, completed_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [groupId, GroupPaymentStatus.COMPLETED]
        );
        
        // Trigger ticket purchase
        await this.completePurchase(groupId);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  
  async sendReminders(groupId: string): Promise<void> {
    const unpaidMembers = await this.getUnpaidMembers(groupId);
    
    for (const member of unpaidMembers) {
      if (member.remindersSent < 3) { // Max 3 reminders
        await this.reminderQueue.add('send-reminder', {
          groupId,
          memberId: member.id,
          email: member.email,
          name: member.name,
          amountDue: member.amountDue
        });
        
        // Update reminder count
        await query(
          `UPDATE group_payment_members 
           SET reminders_sent = reminders_sent + 1
           WHERE id = $1`,
          [member.id]
        );
      }
    }
  }
  
  async handleExpiredGroup(groupId: string): Promise<void> {
    const { client, release } = await getClient();
    
    try {
      await client.query('BEGIN');
      
      // Get group details
      const group = await this.getGroupPayment(groupId);
      
      if (group.status !== GroupPaymentStatus.COLLECTING) {
        return; // Already processed
      }
      
      // Check paid members
      const paidMembers = group.members.filter(m => m.paid);
      
      if (paidMembers.length === 0) {
        // No one paid - cancel entirely
        await this.cancelGroup(groupId, 'expired_no_payment');
      } else {
        // Partial payment - process for those who paid
        await this.processPartialGroup(groupId, paidMembers);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }
  
  private setupQueues() {
    // Process reminder queue
    this.reminderQueue.process('send-reminder', async (job) => {
      const { email, name, amountDue } = job.data;
      
      // In production, integrate with email service
      console.log(`Sending reminder to ${name} (${email}) for $${amountDue}`);
      
      return { sent: true };
    });
    
    // Process expiry queue
    this.expiryQueue.process('check-expiry', async (job) => {
      const { groupId } = job.data;
      await this.handleExpiredGroup(groupId);
      return { processed: true };
    });
  }
  
  private async sendGroupInvitations(
    group: GroupPayment,
    members: GroupMember[]
  ): Promise<void> {
    for (const member of members) {
      const paymentLink = this.generatePaymentLink(group.id, member.id);
      
      // In production, send actual emails
      console.log(`Sending invitation to ${member.name} (${member.email})`);
      console.log(`Payment link: ${paymentLink}`);
      console.log(`Amount due: $${member.amountDue}`);
    }
  }
  
  private generatePaymentLink(groupId: string, memberId: string): string {
    // In production, generate secure payment links
    return `https://tickettoken.com/group-payment/${groupId}/${memberId}`;
  }
  
  private async processMemberPayment(
    member: any,
    paymentMethodId: string
  ): Promise<string> {
    // In production, integrate with PaymentProcessorService
    // For now, return mock payment ID
    return `payment_${uuidv4()}`;
  }
  
  private async completePurchase(groupId: string): Promise<void> {
    const group = await this.getGroupPayment(groupId);
    
    // In production, trigger actual ticket purchase
    console.log(`Completing purchase for group ${groupId}`);
    console.log(`Total amount: $${group.totalAmount}`);
    console.log(`Tickets:`, group.ticketSelections);
  }
  
  private async cancelGroup(groupId: string, reason: string): Promise<void> {
    await query(
      `UPDATE group_payments 
       SET status = $2, 
           cancelled_at = CURRENT_TIMESTAMP,
           cancellation_reason = $3
       WHERE id = $1`,
      [groupId, GroupPaymentStatus.CANCELLED, reason]
    );
  }
  
  private async processPartialGroup(
    groupId: string,
    paidMembers: GroupMember[]
  ): Promise<void> {
    // Update status to partially paid
    await query(
      `UPDATE group_payments 
       SET status = $2 
       WHERE id = $1`,
      [groupId, GroupPaymentStatus.PARTIALLY_PAID]
    );
    
    // Process tickets for paid members only
    console.log(`Processing partial group for ${paidMembers.length} members`);
    
    // Refund would be handled for unpaid tickets
  }
  
  private async getGroupPayment(groupId: string): Promise<GroupPayment> {
    const groupResult = await query(
      'SELECT * FROM group_payments WHERE id = $1',
      [groupId]
    );
    
    const membersResult = await query(
      'SELECT * FROM group_payment_members WHERE group_payment_id = $1',
      [groupId]
    );
    
    return {
      ...groupResult.rows[0],
      members: membersResult.rows
    };
  }
  
  private async getUnpaidMembers(groupId: string): Promise<GroupMember[]> {
    const result = await query(
      'SELECT * FROM group_payment_members WHERE group_payment_id = $1 AND paid = false',
      [groupId]
    );
    
    return result.rows;
  }
  
  async getGroupStatus(groupId: string): Promise<{
    group: GroupPayment;
    summary: {
      totalMembers: number;
      paidMembers: number;
      totalExpected: number;
      totalCollected: number;
      percentageCollected: number;
    };
  }> {
    const group = await this.getGroupPayment(groupId);
    
    const paidMembers = group.members.filter(m => m.paid);
    const totalCollected = paidMembers.reduce((sum, m) => sum + m.amountDue, 0);
    
    return {
      group,
      summary: {
        totalMembers: group.members.length,
        paidMembers: paidMembers.length,
        totalExpected: group.totalAmount,
        totalCollected,
        percentageCollected: (totalCollected / group.totalAmount) * 100
      }
    };
  }
}
```

### FILE: src/services/event-ordering.service.ts
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
          order_id,
          event_type,
          sequence_number,
          event_timestamp,
          stripe_event_id,
          idempotency_key,
          payload
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        event.paymentId,
        event.orderId,
        event.eventType,
        sequenceNumber,
        event.eventTimestamp,
        event.stripeEventId,
        idempotencyKey,
        JSON.stringify(event.payload)
      ]);

      // Check if this is the next expected event
      const isInOrder = await this.checkEventOrder(client, event.paymentId, sequenceNumber);

      if (isInOrder) {
        // Process this event and any queued events
        await this.processEventInOrder(client, event);
        await this.processQueuedEvents(client, event.paymentId);
      } else {
        this.log.warn('Event received out of order, queuing for later', {
          paymentId: event.paymentId,
          sequenceNumber,
          eventType: event.eventType
        });
      }

      await client.query('COMMIT');

      return {
        sequenceNumber,
        processed: isInOrder
      };

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error('Failed to process payment event', {
        error,
        event
      });
      throw error;
    } finally {
      client.release();
    }
  }

  private async checkEventOrder(
    client: any,
    paymentId: string,
    sequenceNumber: number
  ): Promise<boolean> {
    // Get the last processed sequence number
    const result = await client.query(`
      SELECT MAX(sequence_number) as last_processed
      FROM payment_event_sequence
      WHERE payment_id = $1 AND processed_at IS NOT NULL
    `, [paymentId]);

    const lastProcessed = result.rows[0].last_processed || 0;
    return sequenceNumber === lastProcessed + 1;
  }

  private async processEventInOrder(client: any, event: PaymentEvent): Promise<void> {
    // Get current payment state
    const paymentResult = await client.query(`
      SELECT status, version FROM payment_intents WHERE id = $1
    `, [event.paymentId]);

    if (paymentResult.rows.length === 0) {
      throw new Error(`Payment not found: ${event.paymentId}`);
    }

    const currentStatus = paymentResult.rows[0].status;
    const currentVersion = paymentResult.rows[0].version;

    // Determine new state based on event
    const newStatus = this.getNewStatus(event.eventType, currentStatus);

    // Validate state transition
    const isValid = await client.query(
      'SELECT validate_payment_state_transition($1, $2, $3) as valid',
      [currentStatus, newStatus, event.eventType]
    );

    if (!isValid.rows[0].valid) {
      this.log.warn('Invalid state transition', {
        paymentId: event.paymentId,
        from: currentStatus,
        to: newStatus,
        event: event.eventType
      });
      
      // Mark event as processed but don't change state
      await client.query(`
        UPDATE payment_event_sequence
        SET processed_at = NOW()
        WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
      `, [event.paymentId, event.eventType, event.idempotencyKey]);
      
      return;
    }

    // Update payment state with optimistic locking
    const updateResult = await client.query(`
      UPDATE payment_intents
      SET status = $1,
          version = version + 1,
          last_event_timestamp = $2,
          updated_at = NOW()
      WHERE id = $3 AND version = $4
    `, [newStatus, event.eventTimestamp, event.paymentId, currentVersion]);

    if (updateResult.rowCount === 0) {
      throw new Error('Concurrent update detected');
    }

    // Record state transition
    await client.query(`
      INSERT INTO payment_state_transitions (
        payment_id,
        order_id,
        from_state,
        to_state,
        metadata
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      event.paymentId,
      event.orderId,
      currentStatus,
      newStatus,
      JSON.stringify({
        event_type: event.eventType,
        event_timestamp: event.eventTimestamp,
        stripe_event_id: event.stripeEventId
      })
    ]);

    // Mark event as processed
    await client.query(`
      UPDATE payment_event_sequence
      SET processed_at = NOW()
      WHERE payment_id = $1 AND event_type = $2 AND idempotency_key = $3
    `, [event.paymentId, event.eventType, event.idempotencyKey]);

    // Write to outbox for downstream services
    await client.query(`
      INSERT INTO outbox (
        aggregate_id,
        aggregate_type,
        event_type,
        payload
      ) VALUES ($1, $2, $3, $4)
    `, [
      event.orderId || event.paymentId,
      'payment',
      event.eventType,
      JSON.stringify({
        paymentId: event.paymentId,
        orderId: event.orderId,
        status: newStatus,
        previousStatus: currentStatus,
        ...event.payload
      })
    ]);

    this.log.info('Payment event processed in order', {
      paymentId: event.paymentId,
      eventType: event.eventType,
      fromState: currentStatus,
      toState: newStatus
    });
  }

  private async processQueuedEvents(client: any, paymentId: string): Promise<void> {
    // Process any events that were waiting for this one
    const queuedEvents = await client.query(`
      SELECT * FROM payment_event_sequence
      WHERE payment_id = $1
        AND processed_at IS NULL
      ORDER BY sequence_number ASC
      LIMIT 10
    `, [paymentId]);

    for (const queuedEvent of queuedEvents.rows) {
      const isInOrder = await this.checkEventOrder(client, paymentId, queuedEvent.sequence_number);
      
      if (isInOrder) {
        await this.processEventInOrder(client, {
          paymentId: queuedEvent.payment_id,
          orderId: queuedEvent.order_id,
          eventType: queuedEvent.event_type,
          eventTimestamp: queuedEvent.event_timestamp,
          stripeEventId: queuedEvent.stripe_event_id,
          idempotencyKey: queuedEvent.idempotency_key,
          payload: queuedEvent.payload
        });
      } else {
        // Stop processing as we hit another gap
        break;
      }
    }
  }

  private getNewStatus(eventType: string, currentStatus: string): string {
    const statusMap: Record<string, string> = {
      'payment.processing': 'PROCESSING',
      'payment.succeeded': 'PAID',
      'payment_intent.succeeded': 'PAID',
      'payment.failed': 'PAYMENT_FAILED',
      'payment_intent.payment_failed': 'PAYMENT_FAILED',
      'payment.cancelled': 'CANCELLED',
      'refund.initiated': 'REFUNDING',
      'refund.partial': 'PARTIALLY_REFUNDED',
      'refund.completed': 'REFUNDED',
      'refund.failed': currentStatus === 'REFUNDING' ? 'PAID' : currentStatus
    };

    return statusMap[eventType] || currentStatus;
  }

  private generateIdempotencyKey(event: PaymentEvent): string {
    const data = `${event.paymentId}-${event.eventType}-${event.eventTimestamp.getTime()}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Background processor for stuck events
   */
  private startBackgroundProcessor(): void {
    setInterval(async () => {
      try {
        await this.processStuckEvents();
      } catch (error) {
        this.log.error('Background processor error', error);
      }
    }, 30000); // Run every 30 seconds
  }

  private async processStuckEvents(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find payments with unprocessed events older than 5 minutes
      const stuckPayments = await client.query(`
        SELECT DISTINCT payment_id
        FROM payment_event_sequence
        WHERE processed_at IS NULL
          AND created_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      for (const row of stuckPayments.rows) {
        await this.reprocessPaymentEvents(row.payment_id);
      }

    } finally {
      client.release();
    }
  }

  private async reprocessPaymentEvents(paymentId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get all unprocessed events in order
      const events = await client.query(`
        SELECT * FROM payment_event_sequence
        WHERE payment_id = $1
          AND processed_at IS NULL
        ORDER BY sequence_number ASC
      `, [paymentId]);

      this.log.info(`Reprocessing ${events.rows.length} stuck events for payment ${paymentId}`);

      for (const event of events.rows) {
        const isInOrder = await this.checkEventOrder(client, paymentId, event.sequence_number);
        
        if (isInOrder) {
          await this.processEventInOrder(client, {
            paymentId: event.payment_id,
            orderId: event.order_id,
            eventType: event.event_type,
            eventTimestamp: event.event_timestamp,
            stripeEventId: event.stripe_event_id,
            idempotencyKey: event.idempotency_key,
            payload: event.payload
          });
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      this.log.error(`Failed to reprocess events for payment ${paymentId}`, error);
    } finally {
      client.release();
    }
  }

  /**
   * Handle idempotent payment operations
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    operation: string,
    request: any,
    handler: () => Promise<T>
  ): Promise<T> {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Check for existing idempotent response
      const existing = await client.query(`
        SELECT response, status_code
        FROM payment_idempotency
        WHERE idempotency_key = $1
      `, [idempotencyKey]);

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        
        // Verify request hasn't changed
        const existingHash = await client.query(`
          SELECT request_hash FROM payment_idempotency WHERE idempotency_key = $1
        `, [idempotencyKey]);

        if (existingHash.rows[0].request_hash !== requestHash) {
          throw new Error('Idempotency key reused with different request');
        }

        await client.query('COMMIT');
        
        this.log.info('Returning idempotent response', { idempotencyKey, operation });
        return row.response as T;
      }

      // Execute the operation
      const result = await handler();

      // Store idempotent response
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      await client.query(`
        INSERT INTO payment_idempotency (
          idempotency_key,
          operation,
          request_hash,
          response,
          status_code,
          expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        idempotencyKey,
        operation,
        requestHash,
        JSON.stringify(result),
        200,
        expiresAt
      ]);

      await client.query('COMMIT');
      return result;

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
```

### FILE: src/services/marketplace/royalty-splitter.service.ts
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
  
  private async getEventRoyaltySettings(eventId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM event_royalty_settings WHERE event_id = $1',
      [eventId]
    );
    
    return result.rows[0];
  }
  
  async getRoyaltyReport(
    venueId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRoyalties: number;
    transactionCount: number;
    averageRoyalty: number;
    byEvent: Array<{
      eventId: string;
      eventName: string;
      royalties: number;
      transactions: number;
    }>;
  }> {
    // Get total royalties for venue
    const totalQuery = `
      SELECT 
        COUNT(*) as transaction_count,
        SUM(amount) as total_royalties,
        AVG(amount) as average_royalty
      FROM royalty_distributions
      WHERE recipient_id = $1 
        AND recipient_type = 'venue'
        AND created_at BETWEEN $2 AND $3
    `;
    
    const totalResult = await query(totalQuery, [venueId, startDate, endDate]);
    
    // Get breakdown by event
    const byEventQuery = `
      SELECT 
        e.id as event_id,
        e.name as event_name,
        COUNT(rd.id) as transactions,
        SUM(rd.amount) as royalties
      FROM royalty_distributions rd
      JOIN payment_transactions pt ON rd.transaction_id = pt.id
      JOIN events e ON pt.event_id = e.id
      WHERE rd.recipient_id = $1 
        AND rd.recipient_type = 'venue'
        AND rd.created_at BETWEEN $2 AND $3
      GROUP BY e.id, e.name
      ORDER BY royalties DESC
    `;
    
    const byEventResult = await query(byEventQuery, [venueId, startDate, endDate]);
    
    return {
      totalRoyalties: parseFloat(totalResult.rows[0].total_royalties || 0),
      transactionCount: parseInt(totalResult.rows[0].transaction_count || 0),
      averageRoyalty: parseFloat(totalResult.rows[0].average_royalty || 0),
      byEvent: byEventResult.rows
    };
  }
}
```

### FILE: src/services/marketplace/escrow.service.ts
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
    );

    if (paymentIntent.status === 'requires_capture') {
      await this.updateEscrowStatus(escrowId, EscrowStatus.FUNDED);
      await this.startReleaseMonitoring(escrowId);
      return this.getEscrow(escrowId);
    } else {
      throw new Error('Payment confirmation failed');
    }
  }

  async releaseEscrow(escrowId: string): Promise<void> {
    const { client, release } = await getClient();

    try {
      await client.query('BEGIN');

      const escrow = await this.getEscrow(escrowId);

      if (escrow.status !== EscrowStatus.FUNDED) {
        throw new Error('Escrow not in funded state');
      }

      const conditionsMet = await this.checkReleaseConditions(escrow.id);
      if (!conditionsMet) {
        throw new Error('Release conditions not met');
      }

      const paymentIntent = await this.stripe.paymentIntents.capture(
        escrow.stripePaymentIntentId
      );

      if (paymentIntent.status !== 'succeeded') {
        throw new Error('Payment capture failed');
      }

      // Create payout records (amounts in cents)
      await TransactionModel.create({
        userId: escrow.sellerId,
        amount: escrow.sellerPayout,
        status: TransactionStatus.COMPLETED,
        metadata: { escrowId, role: 'seller' }
      });

      const listing = await this.getListing(escrow.listingId);
      await VenueBalanceModel.updateBalance(
        listing.venueId,
        escrow.venueRoyalty,
        'available'
      );

      await this.updateEscrowStatus(escrowId, EscrowStatus.RELEASED);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      release();
    }
  }

  async refundEscrow(escrowId: string, reason: string): Promise<void> {
    const escrow = await this.getEscrow(escrowId);

    if (escrow.status === EscrowStatus.RELEASED) {
      throw new Error('Escrow already released');
    }

    if (escrow.status === EscrowStatus.REFUNDED) {
      throw new Error('Escrow already refunded');
    }

    if (escrow.status === EscrowStatus.FUNDED) {
      await this.stripe.refunds.create({
        payment_intent: escrow.stripePaymentIntentId,
        reason: 'requested_by_customer',
        metadata: { escrowId, refundReason: reason }
      });
    } else {
      await this.stripe.paymentIntents.cancel(escrow.stripePaymentIntentId);
    }

    await this.updateEscrowStatus(escrowId, EscrowStatus.REFUNDED);
  }

  private calculatePaymentSplits(
    priceCents: number,
    venueRoyaltyPercentage: number
  ): {
    sellerPayout: number;
    venueRoyalty: number;
    platformFee: number;
  } {
    // Convert percentages to basis points
    const venueRoyaltyBps = Math.round(venueRoyaltyPercentage * 100);
    const platformFeeBps = 500; // 5%

    const venueRoyaltyCents = percentOfCents(priceCents, venueRoyaltyBps);
    const platformFeeCents = percentOfCents(priceCents, platformFeeBps);
    const sellerPayoutCents = priceCents - venueRoyaltyCents - platformFeeCents;

    return {
      sellerPayout: sellerPayoutCents,
      venueRoyalty: venueRoyaltyCents,
      platformFee: platformFeeCents
    };
  }

  private async setReleaseConditions(client: any, escrowId: string): Promise<void> {
    const conditions = [
      { type: 'nft_transferred', required: true },
      { type: 'cooling_period', required: true, duration: 600 }
    ];

    for (const condition of conditions) {
      await client.query(
        `INSERT INTO escrow_release_conditions
         (escrow_id, condition_type, required, metadata)
         VALUES ($1, $2, $3, $4)`,
        [escrowId, condition.type, condition.required, JSON.stringify(condition)]
      );
    }
  }

  private async checkReleaseConditions(escrowId: string): Promise<boolean> {
    const result = await query(
      `SELECT * FROM escrow_release_conditions
       WHERE escrow_id = $1 AND required = true`,
      [escrowId]
    );

    return result.rows.every((condition: any) => condition.satisfied);
  }

  private async startReleaseMonitoring(escrowId: string): Promise<void> {
    console.log(`Started monitoring release conditions for escrow ${escrowId}`);
  }

  private async getEscrow(escrowId: string): Promise<ExtendedEscrowTransaction> {
    const result = await query(
      'SELECT * FROM payment_escrows WHERE id = $1',
      [escrowId]
    );

    if (result.rows.length === 0) {
      throw new Error('Escrow not found');
    }

    return result.rows[0];
  }

  private async getListing(listingId: string): Promise<any> {
    return { venueId: 'mock-venue-id' };
  }

  private async updateEscrowStatus(
    escrowId: string,
    status: EscrowStatus
  ): Promise<void> {
    await query(
      'UPDATE payment_escrows SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [escrowId, status]
    );
  }
}
```

### FILE: src/services/marketplace/price-enforcer.service.ts
```typescript
import { query } from '../../config/database';
import { ResaleListing } from '../../types';

export class PriceEnforcerService {
  async validateListingPrice(
    ticketId: string,
    listingPrice: number,
    venueId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    originalPrice?: number;
    maxAllowedPrice?: number;
    minAllowedPrice?: number;
  }> {
    // Get original ticket price
    const ticket = await this.getTicket(ticketId);
    const originalPrice = ticket.price;
    
    // Get venue price cap settings
    const priceRules = await this.getVenuePriceRules(venueId);
    
    // Calculate allowed price range
    const maxMarkup = priceRules?.maxMarkupPercentage ?? 150; // Default 150% markup
    const minMarkdown = priceRules?.minMarkdownPercentage ?? 50; // Can't sell below 50% of face value
    
    const maxAllowedPrice = originalPrice * (maxMarkup / 100);
    const minAllowedPrice = originalPrice * (minMarkdown / 100);
    
    // Validate listing price
    if (listingPrice > maxAllowedPrice) {
      return {
        valid: false,
        reason: `Price exceeds maximum allowed markup of ${maxMarkup - 100}%`,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    if (listingPrice < minAllowedPrice) {
      return {
        valid: false,
        reason: `Price below minimum allowed price (${minMarkdown}% of face value)`,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    // Check for suspicious pricing patterns
    const suspiciousPattern = await this.checkSuspiciousPricing(
      listingPrice,
      originalPrice,
      venueId
    );
    
    if (suspiciousPattern) {
      return {
        valid: false,
        reason: suspiciousPattern.reason,
        originalPrice,
        maxAllowedPrice,
        minAllowedPrice
      };
    }
    
    return {
      valid: true,
      originalPrice,
      maxAllowedPrice,
      minAllowedPrice
    };
  }
  
  async enforceDynamicPriceCaps(
    eventId: string,
    currentDemand: number
  ): Promise<{
    maxMarkupPercentage: number;
    reason: string;
  }> {
    // Get event details
    const event = await this.getEvent(eventId);
    const daysUntilEvent = this.getDaysUntilEvent(event.date);
    
    let maxMarkup = 150; // Base 150% markup
    let reason = 'Standard pricing rules';
    
    // Adjust based on time until event
    if (daysUntilEvent <= 1) {
      maxMarkup = 200; // Allow higher markup for last-minute sales
      reason = 'Last-minute pricing allowed';
    } else if (daysUntilEvent <= 7) {
      maxMarkup = 175;
      reason = 'Week-of-event pricing';
    }
    
    // Adjust based on demand
    if (currentDemand > 0.9) { // 90% sold
      maxMarkup = Math.min(maxMarkup + 50, 300); // Cap at 300%
      reason = 'High demand adjustment';
    }
    
    // Special events can have different rules
    if (event.category === 'charity') {
      maxMarkup = 100; // No markup for charity events
      reason = 'Charity event - no markup allowed';
    }
    
    return {
      maxMarkupPercentage: maxMarkup,
      reason
    };
  }
  
  private async checkSuspiciousPricing(
    listingPrice: number,
    originalPrice: number,
    venueId: string
  ): Promise<{ reason: string } | null> {
    // Check for round number scalping (e.g., $50 ticket listed at exactly $500)
    if (listingPrice % 100 === 0 && listingPrice / originalPrice > 5) {
      return { reason: 'Suspicious round number pricing detected' };
    }
    
    // Check for pattern of high markups from venue
    const recentListings = await this.getRecentListings(venueId, 24); // Last 24 hours
    const highMarkupCount = recentListings.filter(
      listing => listing.price / listing.originalPrice > 2
    ).length;
    
    if (highMarkupCount > 10) {
      return { reason: 'Unusual pattern of high markups detected' };
    }
    
    return null;
  }
  
  private async getTicket(ticketId: string): Promise<any> {
    // This would integrate with ticket service
    return { price: 50 }; // Mock
  }
  
  private async getEvent(eventId: string): Promise<any> {
    // This would integrate with event service
    return { date: new Date(), category: 'concert' }; // Mock
  }
  
  private async getVenuePriceRules(venueId: string): Promise<any> {
    const result = await query(
      'SELECT * FROM venue_price_rules WHERE venue_id = $1',
      [venueId]
    );
    
    return result.rows[0];
  }
  
  private async getRecentListings(venueId: string, hours: number): Promise<any[]> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT * FROM resale_listings 
       WHERE venue_id = $1 AND created_at > $2`,
      [venueId, since]
    );
    
    return result.rows;
  }
  
  private getDaysUntilEvent(eventDate: Date): number {
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  async getPricingAnalytics(venueId: string): Promise<{
    averageMarkup: number;
    medianMarkup: number;
    violationsBlocked: number;
    totalListings: number;
  }> {
    const analyticsQuery = `
      SELECT 
        AVG((price - original_price) / original_price * 100) as avg_markup,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (price - original_price) / original_price * 100) as median_markup,
        COUNT(*) FILTER (WHERE status = 'blocked_price_violation') as violations_blocked,
        COUNT(*) as total_listings
      FROM resale_listings
      WHERE venue_id = $1
        AND created_at > CURRENT_DATE - INTERVAL '30 days'
    `;
    
    const result = await query(analyticsQuery, [venueId]);
    
    return {
      averageMarkup: parseFloat(result.rows[0].avg_markup || 0),
      medianMarkup: parseFloat(result.rows[0].median_markup || 0),
      violationsBlocked: parseInt(result.rows[0].violations_blocked || 0),
      totalListings: parseInt(result.rows[0].total_listings || 0)
    };
  }
}
```

### FILE: src/services/fraud/device-fingerprint.service.ts
```typescript
import crypto from 'crypto';
import { query } from '../../config/database';

export class DeviceFingerprintService {
  generateFingerprint(deviceData: {
    userAgent: string;
    screenResolution: string;
    timezone: string;
    language: string;
    platform: string;
    plugins?: string[];
    fonts?: string[];
    canvas?: string;
    webgl?: string;
  }): string {
    // Create a stable fingerprint from device characteristics
    const fingerprintData = {
      ua: deviceData.userAgent,
      sr: deviceData.screenResolution,
      tz: deviceData.timezone,
      lang: deviceData.language,
      plat: deviceData.platform,
      plugins: (deviceData.plugins || []).sort().join(','),
      fonts: (deviceData.fonts || []).slice(0, 20).sort().join(','),
      canvas: deviceData.canvas ? deviceData.canvas.substring(0, 50) : '',
      webgl: deviceData.webgl ? deviceData.webgl.substring(0, 50) : ''
    };
    
    const fingerprintString = JSON.stringify(fingerprintData);
    const hash = crypto.createHash('sha256').update(fingerprintString).digest('hex');
    
    return hash;
  }
  
  async recordDeviceActivity(
    deviceFingerprint: string,
    userId: string,
    activity: string,
    metadata?: any
  ): Promise<void> {
    await query(
      `INSERT INTO device_activity 
       (device_fingerprint, user_id, activity_type, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [deviceFingerprint, userId, activity, JSON.stringify(metadata || {})]
    );
  }
  
  async getDeviceRiskScore(deviceFingerprint: string): Promise<{
    score: number;
    factors: Array<{
      factor: string;
      weight: number;
      value: any;
    }>;
  }> {
    const factors = [];
    let totalScore = 0;
    
    // Factor 1: Number of accounts associated
    const accountCount = await this.getAssociatedAccountCount(deviceFingerprint);
    if (accountCount > 1) {
      const accountFactor = {
        factor: 'multiple_accounts',
        weight: 0.3,
        value: accountCount
      };
      factors.push(accountFactor);
      totalScore += Math.min(accountCount / 5, 1) * accountFactor.weight;
    }
    
    // Factor 2: Suspicious activity patterns
    const suspiciousActivity = await this.getSuspiciousActivityCount(deviceFingerprint);
    if (suspiciousActivity > 0) {
      const activityFactor = {
        factor: 'suspicious_activity',
        weight: 0.25,
        value: suspiciousActivity
      };
      factors.push(activityFactor);
      totalScore += Math.min(suspiciousActivity / 10, 1) * activityFactor.weight;
    }
    
    // Factor 3: Geographic anomalies
    const geoAnomalies = await this.checkGeographicAnomalies(deviceFingerprint);
    if (geoAnomalies.hasAnomalies) {
      const geoFactor = {
        factor: 'geographic_anomalies',
        weight: 0.2,
        value: geoAnomalies
      };
      factors.push(geoFactor);
      totalScore += geoFactor.weight;
    }
    
    // Factor 4: Device age
    const deviceAge = await this.getDeviceAge(deviceFingerprint);
    if (deviceAge < 24) { // Less than 24 hours old
      const ageFactor = {
        factor: 'new_device',
        weight: 0.15,
        value: `${deviceAge} hours`
      };
      factors.push(ageFactor);
      totalScore += (1 - deviceAge / 24) * ageFactor.weight;
    }
    
    // Factor 5: Failed payment attempts
    const failedAttempts = await this.getFailedPaymentAttempts(deviceFingerprint);
    if (failedAttempts > 2) {
      const failedFactor = {
        factor: 'failed_payments',
        weight: 0.1,
        value: failedAttempts
      };
      factors.push(failedFactor);
      totalScore += Math.min(failedAttempts / 5, 1) * failedFactor.weight;
    }
    
    return {
      score: Math.min(totalScore, 1),
      factors
    };
  }
  
  private async getAssociatedAccountCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(DISTINCT user_id) as count
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async getSuspiciousActivityCount(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM device_activity
       WHERE device_fingerprint = $1
         AND activity_type IN ('failed_payment', 'fraud_detected', 'account_locked')
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '30 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  private async checkGeographicAnomalies(deviceFingerprint: string): Promise<{
    hasAnomalies: boolean;
    details?: any;
  }> {
    // Check for impossible travel scenarios
    const geoQuery = `
      SELECT 
        da1.timestamp as time1,
        da1.metadata->>'location' as location1,
        da2.timestamp as time2,
        da2.metadata->>'location' as location2
      FROM device_activity da1
      JOIN device_activity da2 ON da1.device_fingerprint = da2.device_fingerprint
      WHERE da1.device_fingerprint = $1
        AND da2.timestamp > da1.timestamp
        AND da2.timestamp < da1.timestamp + INTERVAL '1 hour'
        AND da1.metadata->>'location' != da2.metadata->>'location'
      ORDER BY da1.timestamp DESC
      LIMIT 1
    `;
    
    const result = await query(geoQuery, [deviceFingerprint]);
    
    if (result.rows.length > 0) {
      const anomaly = result.rows[0];
      // In production, calculate actual distance between locations
      return {
        hasAnomalies: true,
        details: {
          location1: anomaly.location1,
          location2: anomaly.location2,
          timeDifference: anomaly.time2 - anomaly.time1
        }
      };
    }
    
    return { hasAnomalies: false };
  }
  
  private async getDeviceAge(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT MIN(timestamp) as first_seen
       FROM device_activity
       WHERE device_fingerprint = $1`,
      [deviceFingerprint]
    );
    
    if (result.rows[0].first_seen) {
      const ageMs = Date.now() - new Date(result.rows[0].first_seen).getTime();
      return ageMs / (1000 * 60 * 60); // Convert to hours
    }
    
    return 0;
  }
  
  private async getFailedPaymentAttempts(deviceFingerprint: string): Promise<number> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM payment_transactions
       WHERE device_fingerprint = $1
         AND status = 'failed'
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '7 days'`,
      [deviceFingerprint]
    );
    
    return parseInt(result.rows[0].count);
  }
  
  async compareFingerprints(fp1: string, fp2: string): Promise<{
    similar: boolean;
    similarity: number;
  }> {
    // Simple comparison - in production would use more sophisticated matching
    if (fp1 === fp2) {
      return { similar: true, similarity: 1.0 };
    }
    
    // Check if fingerprints are similar (could be same device with minor changes)
    const distance = this.calculateHammingDistance(fp1, fp2);
    const similarity = 1 - (distance / Math.max(fp1.length, fp2.length));
    
    return {
      similar: similarity > 0.85,
      similarity
    };
  }
  
  private calculateHammingDistance(str1: string, str2: string): number {
    let distance = 0;
    const length = Math.min(str1.length, str2.length);
    
    for (let i = 0; i < length; i++) {
      if (str1[i] !== str2[i]) distance++;
    }
    
    distance += Math.abs(str1.length - str2.length);
    
    return distance;
  }
}
```

### FILE: src/services/fraud/velocity-checker.service.ts
```typescript
import { query } from '../../config/database';
import { createClient } from 'redis';
import { config } from '../../config';

export class VelocityCheckerService {
  private redis: any;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;

  constructor() {
    this.initRedis();
  }

  private initRedis() {
    this.connectionPromise = this.connectRedis();
  }

  private async connectRedis(): Promise<void> {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.on('error', (err: any) => {
      console.error('Redis Client Error (Velocity):', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      console.log('Redis connected (Velocity)');
      this.isConnected = true;
    });

    try {
      await this.redis.connect();
      this.isConnected = true;
    } catch (err) {
      console.error('Failed to connect to Redis (Velocity):', err);
      this.isConnected = false;
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
    return this.isConnected;
  }

  async checkVelocity(
    userId: string,
    eventId: string,
    ipAddress: string,
    cardFingerprint?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limits: any;
  }> {
    const connected = await this.ensureConnection();
    
    if (!connected) {
      console.warn('Redis not connected, bypassing velocity checks');
      return { allowed: true, limits: {} };
    }

    const checks = await Promise.all([
      this.checkUserVelocity(userId),
      this.checkEventVelocity(userId, eventId),
      this.checkIPVelocity(ipAddress),
      cardFingerprint ? this.checkCardVelocity(cardFingerprint) : null
    ]);

    const failedCheck = checks.find(check => check && !check.allowed);

    if (failedCheck) {
      return failedCheck;
    }

    return {
      allowed: true,
      limits: {
        user: checks[0]?.limits,
        event: checks[1]?.limits,
        ip: checks[2]?.limits,
        card: checks[3]?.limits
      }
    };
  }

  private async checkUserVelocity(userId: string): Promise<any> {
    const limits = {
      perHour: 5,
      perDay: 20,
      perWeek: 50
    };

    const counts = await this.getVelocityCounts(
      `velocity:user:${userId}`,
      [3600, 86400, 604800]
    );

    if (counts.hour && counts.hour >= limits.perHour) {
      return {
        allowed: false,
        reason: 'Too many purchases in the last hour',
        limits: {
          current: counts.hour,
          limit: limits.perHour,
          resetIn: await this.getResetTime(`velocity:user:${userId}:hour`)
        }
      };
    }

    if (counts.day && counts.day >= limits.perDay) {
      return {
        allowed: false,
        reason: 'Daily purchase limit reached',
        limits: {
          current: counts.day,
          limit: limits.perDay,
          resetIn: await this.getResetTime(`velocity:user:${userId}:day`)
        }
      };
    }

    if (counts.week && counts.week >= limits.perWeek) {
      return {
        allowed: false,
        reason: 'Weekly purchase limit reached',
        limits: {
          current: counts.week,
          limit: limits.perWeek,
          resetIn: await this.getResetTime(`velocity:user:${userId}:week`)
        }
      };
    }

    return {
      allowed: true,
      limits: {
        hourly: { used: counts.hour || 0, limit: limits.perHour },
        daily: { used: counts.day || 0, limit: limits.perDay },
        weekly: { used: counts.week || 0, limit: limits.perWeek }
      }
    };
  }

  private async checkEventVelocity(userId: string, eventId: string): Promise<any> {
    const key = `velocity:event:${eventId}:user:${userId}`;
    const eventPurchaseLimit = 4;

    const count = await this.getCount(key);

    if (count >= eventPurchaseLimit) {
      return {
        allowed: false,
        reason: `Maximum ${eventPurchaseLimit} tickets per event already purchased`,
        limits: {
          current: count,
          limit: eventPurchaseLimit
        }
      };
    }

    return {
      allowed: true,
      limits: {
        used: count,
        limit: eventPurchaseLimit
      }
    };
  }

  private async checkIPVelocity(ipAddress: string): Promise<any> {
    const limits = {
      perMinute: 10,
      perHour: 50
    };

    const counts = await this.getVelocityCounts(
      `velocity:ip:${ipAddress}`,
      [60, 3600]
    );

    if (counts.minute && counts.minute >= limits.perMinute) {
      return {
        allowed: false,
        reason: 'Too many requests from this IP address',
        limits: {
          current: counts.minute,
          limit: limits.perMinute,
          resetIn: 60 - (Date.now() / 1000 % 60)
        }
      };
    }

    if (counts.hour && counts.hour >= limits.perHour) {
      return {
        allowed: false,
        reason: 'Hourly IP limit exceeded',
        limits: {
          current: counts.hour,
          limit: limits.perHour,
          resetIn: await this.getResetTime(`velocity:ip:${ipAddress}:hour`)
        }
      };
    }

    return {
      allowed: true,
      limits: {
        perMinute: { used: counts.minute || 0, limit: limits.perMinute },
        perHour: { used: counts.hour || 0, limit: limits.perHour }
      }
    };
  }

  private async checkCardVelocity(cardFingerprint: string): Promise<any> {
    const limits = {
      perDay: 10,
      uniqueUsers: 3
    };

    const key = `velocity:card:${cardFingerprint}`;
    const count = await this.getCount(`${key}:day`);

    if (count >= limits.perDay) {
      return {
        allowed: false,
        reason: 'Daily limit for this payment method reached',
        limits: {
          current: count,
          limit: limits.perDay
        }
      };
    }

    const uniqueUsers = await this.getSetSize(`${key}:users:day`);

    if (uniqueUsers >= limits.uniqueUsers) {
      return {
        allowed: false,
        reason: 'Payment method used by too many accounts',
        limits: {
          current: uniqueUsers,
          limit: limits.uniqueUsers
        }
      };
    }

    return {
      allowed: true,
      limits: {
        dailyUsage: { used: count, limit: limits.perDay },
        uniqueUsers: { used: uniqueUsers, limit: limits.uniqueUsers }
      }
    };
  }

  async recordPurchase(
    userId: string,
    eventId: string,
    ipAddress: string,
    cardFingerprint?: string
  ): Promise<void> {
    const connected = await this.ensureConnection();
    if (!connected) return;

    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);

    await this.incrementCounter(`velocity:user:${userId}:hour`, 3600);
    await this.incrementCounter(`velocity:user:${userId}:day`, 86400);
    await this.incrementCounter(`velocity:user:${userId}:week`, 604800);
    await this.incrementCounter(`velocity:event:${eventId}:user:${userId}`, 86400 * 30);
    await this.incrementCounter(`velocity:ip:${ipAddress}:minute`, 60);
    await this.incrementCounter(`velocity:ip:${ipAddress}:hour`, 3600);

    if (cardFingerprint) {
      await this.incrementCounter(`velocity:card:${cardFingerprint}:day`, 86400);
      await this.addToSet(`velocity:card:${cardFingerprint}:users:day`, userId, 86400);
    }

    await this.storePurchaseEvent(userId, eventId, ipAddress, now);
  }

  private async incrementCounter(key: string, ttl: number): Promise<void> {
    try {
      await this.redis.incr(key);
      await this.redis.expire(key, ttl);
    } catch (err) {
      console.error(`Failed to increment counter ${key}:`, err);
    }
  }

  private async getCount(key: string): Promise<number> {
    try {
      const count = await this.redis.get(key);
      return parseInt(count || '0');
    } catch (err) {
      console.error(`Failed to get count for ${key}:`, err);
      return 0;
    }
  }

  private async getSetSize(key: string): Promise<number> {
    try {
      const count = await this.redis.sCard(key);
      return count || 0;
    } catch (err) {
      console.error(`Failed to get set size for ${key}:`, err);
      return 0;
    }
  }

  private async addToSet(key: string, member: string, ttl: number): Promise<void> {
    try {
      await this.redis.sAdd(key, member);
      await this.redis.expire(key, ttl);
    } catch (err) {
      console.error(`Failed to add to set ${key}:`, err);
    }
  }

  private async getVelocityCounts(
    baseKey: string,
    periods: number[]
  ): Promise<{ minute?: number; hour?: number; day?: number; week?: number }> {
    const counts: any = {};

    if (periods.includes(60)) {
      counts.minute = await this.getCount(`${baseKey}:minute`);
    }
    if (periods.includes(3600)) {
      counts.hour = await this.getCount(`${baseKey}:hour`);
    }
    if (periods.includes(86400)) {
      counts.day = await this.getCount(`${baseKey}:day`);
    }
    if (periods.includes(604800)) {
      counts.week = await this.getCount(`${baseKey}:week`);
    }

    return counts;
  }

  private async getResetTime(key: string): Promise<number> {
    try {
      const ttl = await this.redis.ttl(key);
      return ttl || 0;
    } catch (err) {
      console.error(`Failed to get TTL for ${key}:`, err);
      return 0;
    }
  }

  private async storePurchaseEvent(
    userId: string,
    eventId: string,
    ipAddress: string,
    timestamp: number
  ): Promise<void> {
    try {
      const event = JSON.stringify({
        userId,
        eventId,
        ipAddress,
        timestamp
      });

      await this.redis.zAdd('purchase_events', {
        score: timestamp,
        value: event
      });

      const sevenDaysAgo = timestamp - (7 * 24 * 60 * 60 * 1000);
      await this.redis.zRemRangeByScore('purchase_events', '-inf', sevenDaysAgo);
    } catch (err) {
      console.error('Failed to store purchase event:', err);
    }
  }
}
```

### FILE: src/services/fraud/scalper-detector.service.ts
```typescript
import { query } from '../../config/database';
import { FraudCheck, FraudSignal, SignalType, FraudDecision } from '../../types';
import { createClient } from 'redis';
import { config } from '../../config';

export class ScalperDetectorService {
  private redis: any;
  private isConnected: boolean = false;
  private connectionPromise: Promise<void> | null = null;
  private knownScalperPatterns: Set<string>;

  constructor() {
    this.knownScalperPatterns = new Set([
      'rapid_multi_event_purchases',
      'consistent_high_markup_resales',
      'bot_like_behavior',
      'multiple_payment_methods',
      'suspicious_account_creation'
    ]);
    
    this.initRedis();
  }

  private initRedis() {
    this.connectionPromise = this.connectRedis();
  }

  private async connectRedis(): Promise<void> {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.on('error', (err: any) => {
      console.error('Redis Client Error (Scalper):', err);
      this.isConnected = false;
    });

    this.redis.on('connect', () => {
      console.log('Redis connected (Scalper)');
      this.isConnected = true;
    });

    try {
      await this.redis.connect();
      this.isConnected = true;
    } catch (err) {
      console.error('Failed to connect to Redis (Scalper):', err);
      this.isConnected = false;
    }
  }

  private async ensureConnection(): Promise<boolean> {
    if (this.connectionPromise) {
      await this.connectionPromise;
    }
    return this.isConnected;
  }

  async detectScalper(
    userId: string,
    purchaseData: any,
    deviceFingerprint: string
  ): Promise<FraudCheck> {
    // Ensure Redis is connected but don't block if it's not
    await this.ensureConnection();
    
    const signals: FraudSignal[] = [];
    let totalScore = 0;

    // Check 1: Purchase velocity
    const velocitySignal = await this.checkPurchaseVelocity(userId);
    if (velocitySignal) {
      signals.push(velocitySignal);
      totalScore += velocitySignal.confidence * 0.3;
    }

    // Check 2: Resale patterns
    const resaleSignal = await this.checkResalePatterns(userId);
    if (resaleSignal) {
      signals.push(resaleSignal);
      totalScore += resaleSignal.confidence * 0.25;
    }

    // Check 3: Multiple accounts
    const multiAccountSignal = await this.checkMultipleAccounts(deviceFingerprint);
    if (multiAccountSignal) {
      signals.push(multiAccountSignal);
      totalScore += multiAccountSignal.confidence * 0.2;
    }

    // Check 4: High-demand targeting
    const demandSignal = await this.checkHighDemandTargeting(userId);
    if (demandSignal) {
      signals.push(demandSignal);
      totalScore += demandSignal.confidence * 0.15;
    }

    // Check 5: Known scalper database
    const knownScalperSignal = await this.checkKnownScalperDatabase(userId, deviceFingerprint);
    if (knownScalperSignal) {
      signals.push(knownScalperSignal);
      totalScore += knownScalperSignal.confidence * 0.1;
    }

    // Determine decision
    const decision = this.determineDecision(totalScore, signals);

    const fraudCheck: FraudCheck = {
      userId,
      ipAddress: purchaseData.ipAddress,
      deviceFingerprint,
      score: totalScore,
      signals,
      decision,
      timestamp: new Date()
    };

    // Store check result
    await this.storeFraudCheck(fraudCheck);

    return fraudCheck;
  }

  private async checkPurchaseVelocity(userId: string): Promise<FraudSignal | null> {
    // Check purchases in last hour
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const velocityQuery = `
      SELECT
        COUNT(*) as purchase_count,
        COUNT(DISTINCT event_id) as unique_events,
        SUM(ticket_count) as total_tickets
      FROM payment_transactions
      WHERE user_id = $1
        AND created_at > $2
        AND status = 'completed'
    `;

    try {
      const result = await query(velocityQuery, [userId, hourAgo]);
      const stats = result.rows[0];

      const purchaseCount = parseInt(stats.purchase_count);
      const uniqueEvents = parseInt(stats.unique_events);
      const totalTickets = parseInt(stats.total_tickets);

      // Suspicious patterns
      if (purchaseCount > 5 || totalTickets > 20 || uniqueEvents > 3) {
        return {
          type: SignalType.RAPID_PURCHASES,
          severity: purchaseCount > 10 ? 'high' : 'medium',
          confidence: Math.min(purchaseCount / 10, 1),
          details: {
            purchaseCount,
            uniqueEvents,
            totalTickets,
            timeWindow: '1_hour'
          }
        };
      }
    } catch (err) {
      console.error('Error checking purchase velocity:', err);
    }

    return null;
  }

  private async checkResalePatterns(userId: string): Promise<FraudSignal | null> {
    // Check resale history
    const resaleQuery = `
      SELECT
        COUNT(*) as total_resales,
        AVG((rl.price - t.original_price) / t.original_price * 100) as avg_markup,
        COUNT(*) FILTER (WHERE rl.created_at < t.purchased_at + INTERVAL '24 hours') as quick_resales
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      WHERE rl.seller_id = $1
        AND rl.created_at > CURRENT_DATE - INTERVAL '30 days'
    `;

    try {
      const result = await query(resaleQuery, [userId]);
      const stats = result.rows[0];

      const totalResales = parseInt(stats.total_resales);
      const avgMarkup = parseFloat(stats.avg_markup) || 0;
      const quickResales = parseInt(stats.quick_resales);

      if (totalResales > 10 || avgMarkup > 100 || quickResales > 5) {
        return {
          type: SignalType.KNOWN_SCALPER,
          severity: avgMarkup > 200 ? 'high' : 'medium',
          confidence: Math.min((totalResales + quickResales) / 20, 1),
          details: {
            totalResales,
            averageMarkup: avgMarkup,
            quickResales,
            timeFrame: '30_days'
          }
        };
      }
    } catch (err) {
      console.error('Error checking resale patterns:', err);
    }

    return null;
  }

  private async checkMultipleAccounts(deviceFingerprint: string): Promise<FraudSignal | null> {
    // Check how many accounts use this device
    const deviceQuery = `
      SELECT
        COUNT(DISTINCT user_id) as account_count,
        COUNT(*) as total_transactions
      FROM payment_transactions
      WHERE device_fingerprint = $1
        AND created_at > CURRENT_DATE - INTERVAL '7 days'
    `;

    try {
      const result = await query(deviceQuery, [deviceFingerprint]);
      const stats = result.rows[0];

      const accountCount = parseInt(stats.account_count);
      const totalTransactions = parseInt(stats.total_transactions);

      if (accountCount > 2) {
        return {
          type: SignalType.MULTIPLE_ACCOUNTS,
          severity: accountCount > 5 ? 'high' : 'medium',
          confidence: Math.min(accountCount / 5, 1),
          details: {
            accountCount,
            totalTransactions,
            deviceFingerprint
          }
        };
      }
    } catch (err) {
      console.error('Error checking multiple accounts:', err);
    }

    return null;
  }

  private async checkHighDemandTargeting(userId: string): Promise<FraudSignal | null> {
    // Check if user only buys high-demand events
    const targetingQuery = `
      SELECT
        COUNT(*) FILTER (WHERE e.demand_score > 0.8) as high_demand_purchases,
        COUNT(*) as total_purchases,
        AVG(pt.ticket_count) as avg_tickets_per_purchase
      FROM payment_transactions pt
      JOIN events e ON pt.event_id = e.id
      WHERE pt.user_id = $1
        AND pt.created_at > CURRENT_DATE - INTERVAL '30 days'
        AND pt.status = 'completed'
    `;

    try {
      const result = await query(targetingQuery, [userId]);
      const stats = result.rows[0];

      const highDemandPurchases = parseInt(stats.high_demand_purchases);
      const totalPurchases = parseInt(stats.total_purchases);
      const avgTickets = parseFloat(stats.avg_tickets_per_purchase) || 0;

      const highDemandRatio = totalPurchases > 0 ? highDemandPurchases / totalPurchases : 0;

      if (highDemandRatio > 0.8 && totalPurchases > 5) {
        return {
          type: SignalType.BOT_BEHAVIOR,
          severity: 'medium',
          confidence: highDemandRatio,
          details: {
            highDemandPurchases,
            totalPurchases,
            highDemandRatio,
            averageTicketsPerPurchase: avgTickets
          }
        };
      }
    } catch (err) {
      console.error('Error checking high demand targeting:', err);
    }

    return null;
  }

  private async checkKnownScalperDatabase(
    userId: string,
    deviceFingerprint: string
  ): Promise<FraudSignal | null> {
    // Check if user or device is in known scalper database
    const knownQuery = `
      SELECT
        reason,
        confidence_score,
        added_at
      FROM known_scalpers
      WHERE user_id = $1 OR device_fingerprint = $2
      ORDER BY confidence_score DESC
      LIMIT 1
    `;

    try {
      const result = await query(knownQuery, [userId, deviceFingerprint]);

      if (result.rows.length > 0) {
        const scalper = result.rows[0];

        return {
          type: SignalType.KNOWN_SCALPER,
          severity: 'high',
          confidence: scalper.confidence_score,
          details: {
            reason: scalper.reason,
            addedAt: scalper.added_at,
            source: 'known_scalper_database'
          }
        };
      }
    } catch (err) {
      console.error('Error checking known scalper database:', err);
    }

    return null;
  }

  private determineDecision(score: number, signals: FraudSignal[]): FraudDecision {
    // Check for high-severity signals
    const hasHighSeverity = signals.some(s => s.severity === 'high');

    if (score >= 0.8 || hasHighSeverity) {
      return FraudDecision.DECLINE;
    } else if (score >= 0.6) {
      return FraudDecision.REVIEW;
    } else if (score >= 0.4) {
      return FraudDecision.CHALLENGE;
    } else {
      return FraudDecision.APPROVE;
    }
  }

  private async storeFraudCheck(fraudCheck: FraudCheck): Promise<void> {
    try {
      await query(
        `INSERT INTO fraud_checks
         (user_id, device_fingerprint, score, signals, decision, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          fraudCheck.userId,
          fraudCheck.deviceFingerprint,
          fraudCheck.score,
          JSON.stringify(fraudCheck.signals),
          fraudCheck.decision,
          fraudCheck.timestamp
        ]
      );
    } catch (err) {
      console.error('Error storing fraud check:', err);
    }
  }

  async reportScalper(
    reporterId: string,
    suspectedScalperId: string,
    evidence: any
  ): Promise<void> {
    try {
      // Store user report
      await query(
        `INSERT INTO scalper_reports
         (reporter_id, suspected_scalper_id, evidence, status)
         VALUES ($1, $2, $3, 'pending_review')`,
        [reporterId, suspectedScalperId, JSON.stringify(evidence)]
      );

      // Trigger review if multiple reports
      const reportCount = await this.getReportCount(suspectedScalperId);

      if (reportCount >= 3) {
        await this.triggerManualReview(suspectedScalperId);
      }
    } catch (err) {
      console.error('Error reporting scalper:', err);
    }
  }

  private async getReportCount(userId: string): Promise<number> {
    try {
      const result = await query(
        `SELECT COUNT(*) as count
         FROM scalper_reports
         WHERE suspected_scalper_id = $1
           AND created_at > CURRENT_DATE - INTERVAL '30 days'`,
        [userId]
      );

      return parseInt(result.rows[0].count);
    } catch (err) {
      console.error('Error getting report count:', err);
      return 0;
    }
  }

  private async triggerManualReview(userId: string): Promise<void> {
    console.log(`Triggering manual review for suspected scalper: ${userId}`);

    try {
      // In production, this would create a task for the fraud team
      await query(
        `INSERT INTO fraud_review_queue
         (user_id, reason, priority, status)
         VALUES ($1, 'multiple_scalper_reports', 'high', 'pending')`,
        [userId]
      );
    } catch (err) {
      console.error('Error triggering manual review:', err);
    }
  }
}
```

### FILE: src/services/compliance/tax-calculator.service.ts
```typescript
import axios from 'axios';
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';
import { config } from '../../config';
import { percentOfCents } from '../../utils/money';

export class TaxCalculatorService {
  private taxJarClient: any;
  private taxCache: Map<string, any> = new Map();

  constructor() {
    if (config.taxJar.apiKey) {
      const Taxjar = require('taxjar');
      this.taxJarClient = new Taxjar({
        apiKey: config.taxJar.apiKey
      });
    }
  }

  // amount is in INTEGER CENTS
  async calculateTax(
    amountCents: number,
    venueAddress: {
      street: string;
      city: string;
      state: string;
      zip: string;
    },
    customerAddress?: {
      city?: string;
      state?: string;
      zip?: string;
    }
  ): Promise<{
    taxableAmount: number;
    stateTax: number;
    localTax: number;
    specialTax: number;
    totalTax: number;
    breakdown: any;
  }> {
    if (venueAddress.state === 'TN') {
      return this.calculateTennesseeTax(amountCents, venueAddress.city);
    }

    if (this.taxJarClient && customerAddress) {
      return this.calculateWithTaxJar(amountCents, venueAddress, customerAddress);
    }

    return this.calculateBasicTax(amountCents, venueAddress.state);
  }

  private async calculateTennesseeTax(
    amountCents: number,
    city: string
  ): Promise<any> {
    const stateTaxBps = complianceConfig.tax.tennessee.stateSalesRate * 100; // 7% = 700 bps
    let localTaxBps = 225; // Default Nashville 2.25%

    const cityLower = city.toLowerCase();
    const rates = complianceConfig.tax.tennessee.localRates as any;
    if (rates[cityLower]) {
      localTaxBps = Math.round(rates[cityLower] * 100);
    }

    const entertainmentTaxBps = ['nashville', 'memphis'].includes(cityLower) ? 100 : 0; // 1%

    const stateTaxCents = percentOfCents(amountCents, stateTaxBps);
    const localTaxCents = percentOfCents(amountCents, localTaxBps);
    const specialTaxCents = percentOfCents(amountCents, entertainmentTaxBps);
    const totalTaxCents = stateTaxCents + localTaxCents + specialTaxCents;

    return {
      taxableAmount: amountCents,
      stateTax: stateTaxCents,
      localTax: localTaxCents,
      specialTax: specialTaxCents,
      totalTax: totalTaxCents,
      breakdown: {
        state: {
          name: 'Tennessee Sales Tax',
          rate: stateTaxBps / 100,
          amount: stateTaxCents
        },
        local: {
          name: `${city} Local Tax`,
          rate: localTaxBps / 100,
          amount: localTaxCents
        },
        special: entertainmentTaxBps > 0 ? {
          name: 'Entertainment Tax',
          rate: entertainmentTaxBps / 100,
          amount: specialTaxCents
        } : null
      }
    };
  }

  private async calculateWithTaxJar(
    amountCents: number,
    venueAddress: any,
    customerAddress: any
  ): Promise<any> {
    try {
      // TaxJar expects dollars, convert cents to dollars
      const amountDollars = amountCents / 100;

      const taxData = await this.taxJarClient.taxForOrder({
        from_street: venueAddress.street,
        from_city: venueAddress.city,
        from_state: venueAddress.state,
        from_zip: venueAddress.zip,
        to_city: customerAddress.city,
        to_state: customerAddress.state,
        to_zip: customerAddress.zip,
        amount: amountDollars,
        shipping: 0,
        line_items: [{
          id: '1',
          quantity: 1,
          unit_price: amountDollars,
          product_tax_code: '20410'
        }]
      });

      // Convert TaxJar response back to cents
      return {
        taxableAmount: Math.round(taxData.tax.taxable_amount * 100),
        stateTax: Math.round(taxData.tax.state_amount * 100),
        localTax: Math.round((taxData.tax.city_amount + taxData.tax.county_amount) * 100),
        specialTax: Math.round(taxData.tax.special_district_amount * 100),
        totalTax: Math.round(taxData.tax.amount_to_collect * 100),
        breakdown: taxData.tax.breakdown
      };
    } catch (error) {
      console.error('TaxJar calculation failed:', error);
      return this.calculateBasicTax(amountCents, venueAddress.state);
    }
  }

  private async calculateBasicTax(amountCents: number, state: string): Promise<any> {
    // Tax rates in basis points (5.0% = 500 bps)
    const stateTaxRates: { [key: string]: number } = {
      'AL': 400, 'AK': 0, 'AZ': 560, 'AR': 650,
      'CA': 725, 'CO': 290, 'CT': 635, 'DE': 0,
      'FL': 600, 'GA': 400, 'HI': 400, 'ID': 600,
      'IL': 625, 'IN': 700, 'IA': 600, 'KS': 650,
      'KY': 600, 'LA': 445, 'ME': 550, 'MD': 600,
      'MA': 625, 'MI': 600, 'MN': 688, 'MS': 700,
      'MO': 423, 'MT': 0, 'NE': 550, 'NV': 685,
      'NH': 0, 'NJ': 663, 'NM': 513, 'NY': 400,
      'NC': 475, 'ND': 500, 'OH': 575, 'OK': 450,
      'OR': 0, 'PA': 600, 'RI': 700, 'SC': 600,
      'SD': 450, 'TN': 700, 'TX': 625, 'UT': 595,
      'VT': 600, 'VA': 530, 'WA': 650, 'WV': 600,
      'WI': 500, 'WY': 400
    };

    const taxBps = stateTaxRates[state] || 0;
    const stateTaxCents = percentOfCents(amountCents, taxBps);

    return {
      taxableAmount: amountCents,
      stateTax: stateTaxCents,
      localTax: 0,
      specialTax: 0,
      totalTax: stateTaxCents,
      breakdown: {
        state: {
          name: `${state} Sales Tax`,
          rate: taxBps / 100,
          amount: stateTaxCents
        }
      }
    };
  }

  async recordTaxCollection(
    transactionId: string,
    taxDetails: any
  ): Promise<void> {
    await query(
      `INSERT INTO tax_collections
       (transaction_id, state_tax, local_tax, special_tax,
        total_tax, jurisdiction, breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        transactionId,
        taxDetails.stateTax,
        taxDetails.localTax,
        taxDetails.specialTax,
        taxDetails.totalTax,
        taxDetails.breakdown.state.name,
        JSON.stringify(taxDetails.breakdown)
      ]
    );
  }

  async getNexusStatus(state: string): Promise<{
    hasNexus: boolean;
    threshold: any;
    currentStatus: any;
  }> {
    const isNexusState = complianceConfig.tax.nexusStates.includes(state);

    if (!isNexusState) {
      const thresholdStatus = await this.checkNexusThreshold(state);
      return {
        hasNexus: false,
        threshold: this.getStateNexusThreshold(state),
        currentStatus: thresholdStatus
      };
    }

    return {
      hasNexus: true,
      threshold: this.getStateNexusThreshold(state),
      currentStatus: await this.getStateTransactionVolume(state)
    };
  }

  private async checkNexusThreshold(state: string): Promise<any> {
    const threshold = this.getStateNexusThreshold(state);
    const currentVolume = await this.getStateTransactionVolume(state);

    return {
      revenue: currentVolume.revenue,
      transactionCount: currentVolume.transactionCount,
      revenueThreshold: threshold.revenue,
      transactionThreshold: threshold.transactions,
      percentOfRevenueThreshold: (currentVolume.revenue / threshold.revenue) * 100,
      percentOfTransactionThreshold: (currentVolume.transactionCount / threshold.transactions) * 100
    };
  }

  private getStateNexusThreshold(state: string): any {
    const thresholds: { [key: string]: any } = {
      'AL': { revenue: 25000000, transactions: null }, // $250k in cents
      'AZ': { revenue: 10000000, transactions: null },
      'CA': { revenue: 50000000, transactions: null },
      'CO': { revenue: 10000000, transactions: null },
      'FL': { revenue: 10000000, transactions: null },
      'GA': { revenue: 10000000, transactions: 200 },
      'IL': { revenue: 10000000, transactions: 200 },
      'NY': { revenue: 50000000, transactions: 100 },
      'TX': { revenue: 50000000, transactions: null },
    };

    return thresholds[state] || { revenue: 10000000, transactions: 200 };
  }

  private async getStateTransactionVolume(state: string): Promise<any> {
    const yearStart = new Date(new Date().getFullYear(), 0, 1);

    const result = await query(
      `SELECT
        COUNT(*) as transaction_count,
        SUM(pt.amount_cents) as revenue_cents
       FROM payment_transactions pt
       JOIN venues v ON pt.venue_id = v.id
       WHERE v.state = $1
         AND pt.created_at >= $2
         AND pt.status = 'completed'`,
      [state, yearStart]
    );

    return {
      transactionCount: parseInt(result.rows[0].transaction_count),
      revenue: parseInt(result.rows[0].revenue_cents) || 0 // Revenue in cents
    };
  }
}
```

### FILE: src/services/compliance/aml-checker.service.ts
```typescript
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';

export class AMLCheckerService {
  async checkTransaction(
    userId: string,
    amount: number,
    transactionType: string
  ): Promise<{
    passed: boolean;
    flags: string[];
    requiresReview: boolean;
    riskScore: number;
  }> {
    const flags: string[] = [];
    let riskScore = 0;
    
    // Check 1: Transaction amount threshold
    if (amount >= complianceConfig.aml.transactionThreshold) {
      flags.push('high_value_transaction');
      riskScore += 0.3;
    }
    
    // Check 2: Aggregate amount in rolling window
    const aggregateCheck = await this.checkAggregateAmount(userId);
    if (aggregateCheck.exceeds) {
      flags.push('aggregate_threshold_exceeded');
      riskScore += 0.25;
    }
    
    // Check 3: Suspicious patterns
    const patterns = await this.checkSuspiciousPatterns(userId);
    if (patterns.length > 0) {
      flags.push(...patterns.map(p => `pattern_${p.type}`));
      riskScore += patterns.reduce((sum, p) => sum + p.risk, 0);
    }
    
    // Check 4: Sanctions list
    const sanctionsCheck = await this.checkSanctionsList(userId);
    if (sanctionsCheck.matched) {
      flags.push('sanctions_list_match');
      riskScore = 1.0; // Automatic high risk
    }
    
    // Check 5: PEP (Politically Exposed Person)
    const pepCheck = await this.checkPEPStatus(userId);
    if (pepCheck.isPEP) {
      flags.push('politically_exposed_person');
      riskScore += 0.3;
    }
    
    const requiresReview = riskScore >= 0.5 || flags.includes('sanctions_list_match');
    const passed = !requiresReview;
    
    // Record AML check
    await this.recordAMLCheck(userId, amount, transactionType, {
      passed,
      flags,
      requiresReview,
      riskScore
    });
    
    return {
      passed,
      flags,
      requiresReview,
      riskScore
    };
  }
  
  private async checkAggregateAmount(userId: string): Promise<{
    exceeds: boolean;
    amount: number;
  }> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT SUM(amount) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > $2
         AND status = 'completed'`,
      [userId, thirtyDaysAgo]
    );
    
    const total = parseFloat(result.rows[0].total) || 0;
    
    return {
      exceeds: total >= complianceConfig.aml.aggregateThreshold,
      amount: total
    };
  }
  
  private async checkSuspiciousPatterns(userId: string): Promise<any[]> {
    const patterns = [];
    
    // Pattern 1: Rapid high-value transactions
    const rapidHighValue = await this.checkRapidHighValuePattern(userId);
    if (rapidHighValue.detected) {
      patterns.push({
        type: 'rapid_high_value',
        risk: 0.2,
        details: rapidHighValue
      });
    }
    
    // Pattern 2: Structured transactions (smurfing)
    const structuring = await this.checkStructuringPattern(userId);
    if (structuring.detected) {
      patterns.push({
        type: 'structured_transactions',
        risk: 0.3,
        details: structuring
      });
    }
    
    // Pattern 3: Unusual geographic patterns
    const geographic = await this.checkGeographicPattern(userId);
    if (geographic.detected) {
      patterns.push({
        type: 'unusual_geography',
        risk: 0.15,
        details: geographic
      });
    }
    
    return patterns;
  }
  
  private async checkRapidHighValuePattern(userId: string): Promise<any> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await query(
      `SELECT COUNT(*) as count, SUM(amount) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > $2
         AND amount > $3
         AND status = 'completed'`,
      [userId, oneDayAgo, 5000]
    );
    
    const count = parseInt(result.rows[0].count);
    const total = parseFloat(result.rows[0].total) || 0;
    
    return {
      detected: count >= 3 || total >= 20000,
      transactionCount: count,
      totalAmount: total
    };
  }
  
  private async checkStructuringPattern(userId: string): Promise<any> {
    // Check for multiple transactions just below reporting threshold
    const result = await query(
      `SELECT 
        COUNT(*) as count,
        AVG(amount) as avg_amount,
        STDDEV(amount) as stddev_amount
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > CURRENT_DATE - INTERVAL '7 days'
         AND amount BETWEEN $2 AND $3
         AND status = 'completed'`,
      [userId, 9000, 9999] // Just below $10k threshold
    );
    
    const count = parseInt(result.rows[0].count);
    const avgAmount = parseFloat(result.rows[0].avg_amount) || 0;
    const stdDev = parseFloat(result.rows[0].stddev_amount) || 0;
    
    // Low standard deviation with multiple transactions suggests structuring
    return {
      detected: count >= 3 && stdDev < 100,
      transactionCount: count,
      averageAmount: avgAmount,
      standardDeviation: stdDev
    };
  }
  
  private async checkGeographicPattern(userId: string): Promise<any> {
    // Check for transactions from unusual locations
    const result = await query(
      `SELECT 
        COUNT(DISTINCT country) as country_count,
        COUNT(DISTINCT state) as state_count,
        array_agg(DISTINCT country) as countries
       FROM payment_transactions
       WHERE user_id = $1
         AND created_at > CURRENT_DATE - INTERVAL '30 days'
         AND status = 'completed'`,
      [userId]
    );
    
    const countryCount = parseInt(result.rows[0].country_count);
    const stateCount = parseInt(result.rows[0].state_count);
    const countries = result.rows[0].countries || [];
    
    // High-risk countries
    const highRiskCountries = ['KP', 'IR', 'SY', 'CU', 'VE'];
    const hasHighRiskCountry = countries.some((c: string) => highRiskCountries.includes(c));
    
    return {
      detected: countryCount > 5 || hasHighRiskCountry,
      countryCount,
      stateCount,
      countries,
      hasHighRiskCountry
    };
  }
  
  private async checkSanctionsList(userId: string): Promise<{
    matched: boolean;
    listName?: string;
  }> {
    // In production, integrate with OFAC and other sanctions lists
    // For now, check local database
    const result = await query(
      `SELECT * FROM sanctions_list_matches
       WHERE user_id = $1 AND active = true`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        matched: true,
        listName: result.rows[0].list_name
      };
    }
    
    return { matched: false };
  }
  
  private async checkPEPStatus(userId: string): Promise<{
    isPEP: boolean;
    details?: any;
  }> {
    // Check if user is a Politically Exposed Person
    const result = await query(
      `SELECT * FROM pep_database
       WHERE user_id = $1 OR linked_user_ids @> ARRAY[$1]`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        isPEP: true,
        details: {
          position: result.rows[0].position,
          country: result.rows[0].country,
          since: result.rows[0].since_date
        }
      };
    }
    
    return { isPEP: false };
  }
  
  private async recordAMLCheck(
    userId: string,
    amount: number,
    transactionType: string,
    results: any
  ): Promise<void> {
    await query(
      `INSERT INTO aml_checks 
       (user_id, amount, transaction_type, passed, 
        flags, risk_score, requires_review, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
      [
        userId,
        amount,
        transactionType,
        results.passed,
        JSON.stringify(results.flags),
        results.riskScore,
        results.requiresReview
      ]
    );
  }
  
  async generateSAR(
    userId: string,
    transactionIds: string[],
    suspiciousActivity: string
  ): Promise<{
    sarId: string;
    filingDeadline: Date;
  }> {
    // Generate Suspicious Activity Report
    const sarId = `SAR-${Date.now()}-${userId.substring(0, 8)}`;
    const filingDeadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    await query(
      `INSERT INTO suspicious_activity_reports 
       (sar_id, user_id, transaction_ids, activity_description,
        filing_deadline, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_TIMESTAMP)`,
      [
        sarId,
        userId,
        transactionIds,
        suspiciousActivity,
        filingDeadline
      ]
    );
    
    // In production, notify compliance team
    console.log(`SAR generated: ${sarId} for user ${userId}`);
    
    return {
      sarId,
      filingDeadline
    };
  }
}
```

### FILE: src/services/compliance/form-1099-da.service.ts
```typescript
import { query } from '../../config/database';
import { complianceConfig } from '../../config/compliance';

export class Form1099DAService {
  async generateForm1099DA(
    userId: string,
    taxYear: number
  ): Promise<{
    required: boolean;
    formData?: any;
    transactions?: any[];
  }> {
    // Check if form is required (starting Jan 2025)
    const startDate = new Date(complianceConfig.tax.digitalAssetReporting.startDate);
    if (new Date() < startDate) {
      return { required: false };
    }

    // Get all NFT transactions for the user
    const transactions = await this.getUserNFTTransactions(userId, taxYear);

    // Calculate total proceeds
    const totalProceeds = transactions.reduce((sum, tx) => sum + tx.proceeds, 0);

    // Check if meets reporting threshold ($600)
    if (totalProceeds < complianceConfig.tax.digitalAssetReporting.threshold) {
      return {
        required: false,
        transactions
      };
    }

    // Get user information
    const userInfo = await this.getUserTaxInfo(userId);

    // Generate form data
    const formData = {
      recipientInfo: {
        name: userInfo.name,
        address: userInfo.address,
        tin: userInfo.tin // Taxpayer Identification Number
      },
      payerInfo: {
        name: 'TicketToken Inc.',
        address: '123 Music Row, Nashville, TN 37203',
        tin: '12-3456789' // Company EIN
      },
      taxYear,
      transactions: transactions.map(tx => ({
        dateAcquired: tx.acquiredDate,
        dateDisposed: tx.disposedDate,
        proceeds: tx.proceeds,
        costBasis: tx.costBasis,
        gain: tx.proceeds - tx.costBasis,
        assetDescription: `NFT Ticket - ${tx.eventName}`,
        transactionId: tx.transactionId
      })),
      summary: {
        totalProceeds,
        totalCostBasis: transactions.reduce((sum, tx) => sum + tx.costBasis, 0),
        totalGain: transactions.reduce((sum, tx) => sum + (tx.proceeds - tx.costBasis), 0),
        transactionCount: transactions.length
      }
    };

    return {
      required: true,
      formData,
      transactions
    };
  }

  private async getUserNFTTransactions(
    userId: string,
    taxYear: number
  ): Promise<any[]> {
    const yearStart = new Date(taxYear, 0, 1);
    const yearEnd = new Date(taxYear + 1, 0, 1);

    const sqlQuery = `
      SELECT
        rl.id as transaction_id,
        rl.created_at as disposed_date,
        rl.price as proceeds,
        t.purchase_price as cost_basis,
        t.purchased_at as acquired_date,
        e.name as event_name,
        rl.ticket_id
      FROM resale_listings rl
      JOIN tickets t ON rl.ticket_id = t.id
      JOIN events e ON t.event_id = e.id
      WHERE rl.seller_id = $1
        AND rl.status = 'sold'
        AND rl.sold_at >= $2
        AND rl.sold_at < $3
      ORDER BY rl.sold_at`;
    
    const result = await query(sqlQuery, [userId, yearStart, yearEnd]);

    return result.rows.map((row: any) => ({
      transactionId: row.transaction_id,
      disposedDate: row.disposed_date,
      proceeds: parseFloat(row.proceeds),
      costBasis: parseFloat(row.cost_basis),
      acquiredDate: row.acquired_date,
      eventName: row.event_name,
      ticketId: row.ticket_id
    }));
  }

  private async getUserTaxInfo(userId: string): Promise<any> {
    // Get user tax information
    const result = await query(
      `SELECT
        u.id,
        u.email,
        u.first_name || ' ' || u.last_name as name,
        uti.address,
        uti.tin,
        uti.tin_type
       FROM users u
       LEFT JOIN user_tax_info uti ON u.id = uti.user_id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    return result.rows[0];
  }

  async recordFormGeneration(
    userId: string,
    taxYear: number,
    formData: any
  ): Promise<void> {
    await query(
      `INSERT INTO tax_forms_1099da
       (user_id, tax_year, form_data, total_proceeds,
        transaction_count, generated_at, status)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'generated')`,
      [
        userId,
        taxYear,
        JSON.stringify(formData),
        formData.summary.totalProceeds,
        formData.summary.transactionCount
      ]
    );
  }

  async batchGenerate1099DA(taxYear: number): Promise<{
    totalGenerated: number;
    totalRequired: number;
    errors: any[];
  }> {
    // Get all users who need 1099-DA
    const usersQuery = `
      SELECT DISTINCT
        rl.seller_id as user_id,
        SUM(rl.price) as total_proceeds,
        COUNT(*) as transaction_count
      FROM resale_listings rl
      WHERE rl.status = 'sold'
        AND EXTRACT(YEAR FROM rl.sold_at) = $1
      GROUP BY rl.seller_id
      HAVING SUM(rl.price) >= $2`;

    const users = await query(usersQuery, [
      taxYear,
      complianceConfig.tax.digitalAssetReporting.threshold
    ]);

    let generated = 0;
    const errors: any[] = [];

    for (const user of users.rows) {
      try {
        const form = await this.generateForm1099DA(user.user_id, taxYear);
        if (form.required && form.formData) {
          await this.recordFormGeneration(user.user_id, taxYear, form.formData);
          generated++;
        }
      } catch (error) {
        errors.push({
          userId: user.user_id,
          error: error instanceof Error ? error.message : "Unknown error"
        });
      }
    }

    return {
      totalGenerated: generated,
      totalRequired: users.rows.length,
      errors
    };
  }

  async getFormStatus(userId: string, taxYear: number): Promise<{
    status: string;
    generatedAt?: Date;
    downloadUrl?: string;
    summary?: any;
  }> {
    const result = await query(
      `SELECT * FROM tax_forms_1099da
       WHERE user_id = $1 AND tax_year = $2
       ORDER BY generated_at DESC
       LIMIT 1`,
      [userId, taxYear]
    );

    if (result.rows.length === 0) {
      // Check if form is needed
      const formCheck = await this.generateForm1099DA(userId, taxYear);

      return {
        status: formCheck.required ? 'pending' : 'not_required',
        summary: formCheck.formData?.summary
      };
    }

    const form = result.rows[0];

    return {
      status: form.status,
      generatedAt: form.generated_at,
      downloadUrl: `/api/tax/forms/1099-da/${userId}/${taxYear}`,
      summary: JSON.parse(form.form_data).summary
    };
  }
}
```

### FILE: src/services/reconciliation/reconciliation-service.ts
```typescript
import { Pool } from 'pg';
import { logger } from '../../utils/logger';
import axios from 'axios';
import crypto from 'crypto';

const WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET || 'internal-webhook-secret-change-in-production';

export class ReconciliationService {
  private pool: Pool;
  private log = logger.child({ component: 'ReconciliationService' });
  private reconciliationInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  async start() {
    this.log.info('Starting reconciliation service...');
    
    // Run every 5 minutes
    this.reconciliationInterval = setInterval(() => {
      this.reconcile();
    }, 5 * 60 * 1000);

    // Run immediately on start
    this.reconcile();
  }

  async stop() {
    if (this.reconciliationInterval) {
      clearInterval(this.reconciliationInterval);
      this.reconciliationInterval = null;
    }
    this.log.info('Reconciliation service stopped');
  }

  async reconcile() {
    this.log.info('Starting reconciliation run...');

    try {
      await this.reconcileOrphanedPayments();
      await this.reconcileFailedOutboxEvents();
      await this.reconcilePendingOrders();
      
      this.log.info('Reconciliation run completed');
    } catch (error) {
      this.log.error('Reconciliation failed:', error);
    }
  }

  /**
   * Find orders marked as PAID but without tickets
   */
  private async reconcileOrphanedPayments() {
    const client = await this.pool.connect();

    try {
      // Find orders that are PAID but have no tickets after 5 minutes
      const result = await client.query(`
        SELECT o.* 
        FROM orders o
        LEFT JOIN tickets t ON t.order_id = o.id
        WHERE o.status = 'PAID'
          AND t.id IS NULL
          AND o.updated_at < NOW() - INTERVAL '5 minutes'
        LIMIT 10
      `);

      if (result.rows.length > 0) {
        this.log.warn(`Found ${result.rows.length} orphaned paid orders without tickets`);

        for (const order of result.rows) {
          await this.fixOrphanedOrder(client, order);
        }
      }

    } catch (error) {
      this.log.error('Failed to reconcile orphaned payments:', error);
    } finally {
      client.release();
    }
  }

  private async fixOrphanedOrder(client: any, order: any) {
    this.log.info(`Fixing orphaned order ${order.id}`);

    try {
      // Check if there's already an outbox event for this order
      const existingOutbox = await client.query(`
        SELECT * FROM outbox
        WHERE aggregate_id = $1
          AND aggregate_type = 'order'
          AND event_type = 'order.paid'
          AND processed_at IS NULL
      `, [order.id]);

      if (existingOutbox.rows.length === 0) {
        // Create a new outbox event to trigger ticket creation
        await client.query(`
          INSERT INTO outbox (
            aggregate_id,
            aggregate_type,
            event_type,
            payload,
            created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `, [
          order.id,
          'order',
          'order.paid',
          JSON.stringify({
            orderId: order.id,
            paymentId: order.payment_intent_id,
            userId: order.user_id,
            eventId: order.event_id,
            amount: order.total_amount,
            ticketQuantity: order.ticket_quantity,
            reconciliation: true,
            timestamp: new Date().toISOString()
          })
        ]);

        this.log.info(`Created reconciliation outbox event for order ${order.id}`);
      } else {
        // Reset the existing outbox event for retry
        await client.query(`
          UPDATE outbox
          SET attempts = 0,
              last_attempt_at = NULL,
              last_error = 'Reset by reconciliation'
          WHERE id = $1
        `, [existingOutbox.rows[0].id]);

        this.log.info(`Reset outbox event for order ${order.id}`);
      }

    } catch (error) {
      this.log.error(`Failed to fix orphaned order ${order.id}:`, error);
    }
  }

  /**
   * Retry failed outbox events that haven't exceeded max attempts
   */
  private async reconcileFailedOutboxEvents() {
    const client = await this.pool.connect();

    try {
      // Find stuck outbox events (not processed after 10 minutes)
      const result = await client.query(`
        UPDATE outbox
        SET attempts = 0,
            last_attempt_at = NULL,
            last_error = 'Reset by reconciliation'
        WHERE processed_at IS NULL
          AND attempts < 5
          AND created_at < NOW() - INTERVAL '10 minutes'
          AND (last_attempt_at IS NULL OR last_attempt_at < NOW() - INTERVAL '5 minutes')
        RETURNING id
      `);

      if (result.rows.length > 0) {
        this.log.info(`Reset ${result.rows.length} stuck outbox events`);
      }

    } catch (error) {
      this.log.error('Failed to reconcile outbox events:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Check for orders stuck in PENDING state
   */
  private async reconcilePendingOrders() {
    const client = await this.pool.connect();

    try {
      // Find orders stuck in PENDING for more than 15 minutes
      const result = await client.query(`
        SELECT o.*, pi.status as payment_status
        FROM orders o
        LEFT JOIN payment_intents pi ON pi.order_id = o.id
        WHERE o.status = 'PENDING'
          AND o.created_at < NOW() - INTERVAL '15 minutes'
        LIMIT 10
      `);

      for (const order of result.rows) {
        if (order.payment_status === 'succeeded') {
          // Payment succeeded but order not updated
          this.log.warn(`Found order ${order.id} in PENDING with successful payment`);

          await client.query(`
            UPDATE orders
            SET status = 'PAID',
                updated_at = NOW()
            WHERE id = $1 AND status = 'PENDING'
          `, [order.id]);

          // Create outbox event for ticket creation
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            order.id,
            'order',
            'order.paid',
            JSON.stringify({
              orderId: order.id,
              paymentId: order.payment_intent_id,
              userId: order.user_id,
              eventId: order.event_id,
              amount: order.total_amount,
              ticketQuantity: order.ticket_quantity,
              reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

        } else {
          // Payment failed or expired
          this.log.info(`Expiring stale PENDING order ${order.id}`);

          await client.query(`
            UPDATE orders
            SET status = 'EXPIRED',
                updated_at = NOW()
            WHERE id = $1 AND status = 'PENDING'
          `, [order.id]);
        }
      }

      if (result.rows.length > 0) {
        this.log.info(`Reconciled ${result.rows.length} pending orders`);
      }

    } catch (error) {
      this.log.error('Failed to reconcile pending orders:', error);
    } finally {
      client.release();
    }
  }

  /**
   * Manual reconciliation for specific order
   */
  async reconcileOrder(orderId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const order = await client.query(`
        SELECT * FROM orders WHERE id = $1
      `, [orderId]);

      if (order.rows.length === 0) {
        throw new Error(`Order ${orderId} not found`);
      }

      const orderData = order.rows[0];

      // Check payment status
      const payment = await client.query(`
        SELECT * FROM payment_intents WHERE order_id = $1
      `, [orderId]);

      if (payment.rows.length > 0 && payment.rows[0].status === 'succeeded') {
        // Ensure order is marked as paid
        if (orderData.status !== 'PAID') {
          await client.query(`
            UPDATE orders SET status = 'PAID', updated_at = NOW()
            WHERE id = $1
          `, [orderId]);
        }

        // Check for tickets
        const tickets = await client.query(`
          SELECT COUNT(*) as count FROM tickets WHERE order_id = $1
        `, [orderId]);

        if (tickets.rows[0].count === 0) {
          // Create outbox event to generate tickets
          await client.query(`
            INSERT INTO outbox (
              aggregate_id,
              aggregate_type,
              event_type,
              payload
            ) VALUES ($1, $2, $3, $4)
          `, [
            orderId,
            'order',
            'order.paid',
            JSON.stringify({
              orderId: orderId,
              paymentId: payment.rows[0].stripe_intent_id,
              userId: orderData.user_id,
              eventId: orderData.event_id,
              amount: orderData.total_amount,
              ticketQuantity: orderData.ticket_quantity,
              manual_reconciliation: true,
              timestamp: new Date().toISOString()
            })
          ]);

          this.log.info(`Created manual reconciliation event for order ${orderId}`);
        }
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const reconciliationService = new ReconciliationService();
```

### FILE: src/services/security/pci-compliance.service.ts
```typescript
import { Redis } from 'ioredis';

export class PCIComplianceService {
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.redis = redis;
  }
  
  // Never store card data - only tokens
  async validateNoCardStorage(data: any): Promise<boolean> {
    const sensitivePatterns = [
      /\b\d{13,19}\b/, // Card numbers
      /\b\d{3,4}\b/, // CVV
      /^(0[1-9]|1[0-2])\/\d{2,4}$/ // Expiry dates
    ];
    
    const jsonString = JSON.stringify(data);
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(jsonString)) {
        console.error('CRITICAL: Attempt to store card data detected!');
        await this.logSecurityIncident('CARD_DATA_STORAGE_ATTEMPT', data);
        return false;
      }
    }
    
    return true;
  }
  
  async logSecurityIncident(type: string, metadata: any): Promise<void> {
    const incident = {
      type,
      timestamp: new Date().toISOString(),
      metadata: this.sanitizeForLogging(metadata)
    };
    
    await this.redis.lpush('security:incidents', JSON.stringify(incident));
    
    // Alert security team in production
    if (process.env.NODE_ENV === 'production') {
      console.error('SECURITY INCIDENT:', type);
    }
  }
  
  private sanitizeForLogging(data: any): any {
    const sanitized = { ...data };
    
    // Remove any potential sensitive data
    delete sanitized.cardNumber;
    delete sanitized.cvv;
    delete sanitized.pin;
    delete sanitized.password;
    
    return sanitized;
  }
}
```

### FILE: src/services/high-demand/purchase-limiter.service.ts
```typescript
import { query } from '../../config/database';
import { createClient } from 'redis';
import { config } from '../../config';

export class PurchaseLimiterService {
  private redis: any; // TODO: Add proper Redis client type

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });
    
    this.redis.connect().catch(console.error);
  }

  async checkPurchaseLimit(
    userId: string,
    eventId: string,
    requestedQuantity: number,
    paymentMethod: {
      type: string;
      fingerprint?: string;
      last4?: string;
    }
  ): Promise<{
    allowed: boolean;
    reason?: string;
    limits: {
      perUser: number;
      perPaymentMethod: number;
      perAddress: number;
      perEvent: number;
    };
    current: {
      userPurchases: number;
      paymentMethodPurchases: number;
      addressPurchases: number;
    };
  }> {
    // Get event limits
    const eventLimits = await this.getEventLimits(eventId);

    // Check user limit
    const userPurchases = await this.getUserPurchaseCount(userId, eventId);
    if (userPurchases + requestedQuantity > eventLimits.perUser) {
      return {
        allowed: false,
        reason: `Maximum ${eventLimits.perUser} tickets per person for this event`,
        limits: eventLimits,
        current: {
          userPurchases,
          paymentMethodPurchases: 0,
          addressPurchases: 0
        }
      };
    }

    // Check payment method limit
    if (paymentMethod.fingerprint) {
      const paymentMethodPurchases = await this.getPaymentMethodPurchaseCount(
        paymentMethod.fingerprint,
        eventId
      );

      if (paymentMethodPurchases + requestedQuantity > eventLimits.perPaymentMethod) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perPaymentMethod} tickets per payment method`,
          limits: eventLimits,
          current: {
            userPurchases,
            paymentMethodPurchases,
            addressPurchases: 0
          }
        };
      }
    }

    // Check address limit
    const userAddress = await this.getUserAddress(userId);
    if (userAddress) {
      const addressPurchases = await this.getAddressPurchaseCount(
        userAddress,
        eventId
      );

      if (addressPurchases + requestedQuantity > eventLimits.perAddress) {
        return {
          allowed: false,
          reason: `Maximum ${eventLimits.perAddress} tickets per household`,
          limits: eventLimits,
          current: {
            userPurchases,
            paymentMethodPurchases: 0,
            addressPurchases
          }
        };
      }
    }

    // Check cooldown period
    const cooldownCheck = await this.checkCooldownPeriod(userId, eventId);
    if (!cooldownCheck.allowed) {
      return {
        allowed: false,
        reason: cooldownCheck.reason,
        limits: eventLimits,
        current: {
          userPurchases,
          paymentMethodPurchases: 0,
          addressPurchases: 0
        }
      };
    }

    return {
      allowed: true,
      limits: eventLimits,
      current: {
        userPurchases,
        paymentMethodPurchases: 0,
        addressPurchases: 0
      }
    };
  }

  private async getEventLimits(eventId: string): Promise<any> {
    const result = await query(
      `SELECT
        purchase_limit_per_user,
        purchase_limit_per_payment_method,
        purchase_limit_per_address,
        max_tickets_per_order
       FROM event_purchase_limits
       WHERE event_id = $1`,
      [eventId]
    );

    if (result.rows.length > 0) {
      return {
        perUser: result.rows[0].purchase_limit_per_user || 4,
        perPaymentMethod: result.rows[0].purchase_limit_per_payment_method || 4,
        perAddress: result.rows[0].purchase_limit_per_address || 8,
        perEvent: result.rows[0].max_tickets_per_order || 4
      };
    }

    // Default limits
    return {
      perUser: 4,
      perPaymentMethod: 4,
      perAddress: 8,
      perEvent: 4
    };
  }

  private async getUserPurchaseCount(
    userId: string,
    eventId: string
  ): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total
       FROM payment_transactions
       WHERE user_id = $1
         AND event_id = $2
         AND status IN ('completed', 'processing')`,
      [userId, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private async getPaymentMethodPurchaseCount(
    paymentFingerprint: string,
    eventId: string
  ): Promise<number> {
    const result = await query(
      `SELECT SUM(ticket_count) as total
       FROM payment_transactions
       WHERE payment_method_fingerprint = $1
         AND event_id = $2
         AND status IN ('completed', 'processing')`,
      [paymentFingerprint, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private async getAddressPurchaseCount(
    address: string,
    eventId: string
  ): Promise<number> {
    // Normalize address for comparison
    const normalizedAddress = this.normalizeAddress(address);

    const result = await query(
      `SELECT SUM(pt.ticket_count) as total
       FROM payment_transactions pt
       JOIN user_addresses ua ON pt.user_id = ua.user_id
       WHERE ua.normalized_address = $1
         AND pt.event_id = $2
         AND pt.status IN ('completed', 'processing')`,
      [normalizedAddress, eventId]
    );

    return parseInt(result.rows[0].total) || 0;
  }

  private normalizeAddress(address: string): string {
    // Simple normalization - in production use address validation service
    return address.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async getUserAddress(userId: string): Promise<string | null> {
    const result = await query(
      `SELECT billing_address FROM users WHERE id = $1`,
      [userId]
    );

    return result.rows[0]?.billing_address || null;
  }

  private async checkCooldownPeriod(
    userId: string,
    eventId: string
  ): Promise<{ allowed: boolean; reason?: string }> {
    const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
    const cooldownKey = `cooldown:${userId}:${eventId}`;

    const exists = await this.redis.exists(cooldownKey);

    if (exists) {
      const ttl = await this.redis.ttl(cooldownKey);
      const minutesRemaining = Math.ceil(ttl / 60);

      return {
        allowed: false,
        reason: `Please wait ${minutesRemaining} minutes before purchasing more tickets`
      };
    }

    return { allowed: true };
  }

  async recordPurchase(
    userId: string,
    eventId: string,
    quantity: number,
    paymentMethod: any
  ): Promise<void> {
    // Set cooldown
    const cooldownMinutes = parseInt(process.env.PURCHASE_COOLDOWN_MINUTES || '10');
    const cooldownKey = `cooldown:${userId}:${eventId}`;

    await this.redis.setEx(cooldownKey, cooldownMinutes * 60, '1');

    // Update purchase counts (handled by transaction creation)
  }

  async enforceDynamicLimits(
    eventId: string,
    demandLevel: number
  ): Promise<void> {
    // Adjust limits based on demand
    let perUserLimit = 4;
    let perPaymentLimit = 4;

    if (demandLevel > 0.9) {
      // Very high demand - strict limits
      perUserLimit = 2;
      perPaymentLimit = 2;
    } else if (demandLevel > 0.7) {
      // High demand - moderate limits
      perUserLimit = 3;
      perPaymentLimit = 3;
    }

    await query(
      `UPDATE event_purchase_limits
       SET purchase_limit_per_user = $2,
           purchase_limit_per_payment_method = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE event_id = $1`,
      [eventId, perUserLimit, perPaymentLimit]
    );
  }

  async getPurchaseLimitStats(eventId: string): Promise<{
    uniquePurchasers: number;
    averageTicketsPerPurchaser: number;
    maxTicketsPurchased: number;
    limitViolationsBlocked: number;
  }> {
    const statsQuery = `
      SELECT
        COUNT(DISTINCT user_id) as unique_purchasers,
        AVG(tickets_per_user) as avg_tickets,
        MAX(tickets_per_user) as max_tickets,
        COUNT(*) FILTER (WHERE violation_type IS NOT NULL) as violations
      FROM (
        SELECT
          user_id,
          SUM(ticket_count) as tickets_per_user,
          NULL as violation_type
        FROM payment_transactions
        WHERE event_id = $1 AND status = 'completed'
        GROUP BY user_id

        UNION ALL

        SELECT
          user_id,
          0 as tickets_per_user,
          reason as violation_type
        FROM purchase_limit_violations
        WHERE event_id = $1
      ) as purchase_stats
    `;

    const result = await query(statsQuery, [eventId]);

    return {
      uniquePurchasers: parseInt(result.rows[0].unique_purchasers),
      averageTicketsPerPurchaser: parseFloat(result.rows[0].avg_tickets) || 0,
      maxTicketsPurchased: parseInt(result.rows[0].max_tickets) || 0,
      limitViolationsBlocked: parseInt(result.rows[0].violations) || 0
    };
  }
}
```

### FILE: src/services/high-demand/waiting-room.service.ts
```typescript
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { config } from '../../config';
import { query } from '../../config/database';

// SECURITY FIX: Phase 2.2 - Use cryptographically signed JWT tokens
const QUEUE_TOKEN_SECRET = process.env.QUEUE_TOKEN_SECRET || (() => {
  console.error('WARNING: QUEUE_TOKEN_SECRET not set. Using default for development only.');
  return 'dev-secret-change-in-production';
})();

export interface QueueTokenPayload {
  sub: string;      // userId
  evt: string;      // eventId  
  qid: string;      // queueId
  scope: 'queue';
  iat: number;
  exp: number;
  jti: string;      // unique token ID
}

export class WaitingRoomService {
  private redis: any; // TODO: Add proper Redis client type
  private processingRate: number = 100; // Users per minute

  constructor() {
    this.redis = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port
      }
    });

    this.redis.connect().catch(console.error);
  }

  async joinWaitingRoom(
    eventId: string,
    userId: string,
    sessionId: string,
    priority: number = 0
  ): Promise<{
    queueId: string;
    position: number;
    estimatedWaitTime: number;
    status: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const queueId = uuidv4();
    const timestamp = Date.now();

    // Check if user already in queue
    const existingPosition = await this.getUserPosition(eventId, userId);
    if (existingPosition) {
      return existingPosition;
    }

    // Calculate score (lower timestamp = higher priority, with priority boost)
    const score = timestamp - (priority * 1000000); // Priority users get million-point boost

    // Add to sorted set
    await this.redis.zAdd(queueKey, {
      score: score,
      value: JSON.stringify({
        queueId,
        userId,
        sessionId,
        timestamp,
        priority
      })
    });

    // Set queue expiry (2 hours)
    await this.redis.expire(queueKey, 7200);

    // Get position and estimate
    const position = await this.getQueuePosition(queueKey, queueId);
    const estimatedWaitTime = this.calculateWaitTime(position);

    // Record queue join
    await this.recordQueueActivity(eventId, userId, 'joined', { queueId, position });

    return {
      queueId,
      position,
      estimatedWaitTime,
      status: position === 1 ? 'ready' : 'waiting'
    };
  }

  async checkPosition(
    eventId: string,
    queueId: string
  ): Promise<{
    position: number;
    estimatedWaitTime: number;
    status: string;
    accessToken?: string;
  }> {
    const queueKey = `waiting_room:${eventId}`;

    // Get current position
    const position = await this.getQueuePosition(queueKey, queueId);

    if (position === 0) {
      return {
        position: 0,
        estimatedWaitTime: 0,
        status: 'expired'
      };
    }

    // Check if user's turn
    const activeSlots = await this.getActiveSlots(eventId);

    if (position <= activeSlots) {
      // Generate access token - SECURITY FIX: Use JWT instead of predictable string
      const accessToken = await this.generateAccessToken(eventId, queueId);

      return {
        position,
        estimatedWaitTime: 0,
        status: 'ready',
        accessToken
      };
    }

    return {
      position,
      estimatedWaitTime: this.calculateWaitTime(position - activeSlots),
      status: 'waiting'
    };
  }

  async processQueue(eventId: string): Promise<{
    processed: number;
    remaining: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const processingKey = `processing:${eventId}`;

    // Get current queue size
    const queueSize = await this.redis.zCard(queueKey) || 0;

    if (queueSize === 0) {
      return { processed: 0, remaining: 0 };
    }

    // Calculate how many to process
    const activeCount = await this.getActiveUserCount(eventId);
    const maxActive = await this.getMaxActiveUsers(eventId);
    const toProcess = Math.min(
      maxActive - activeCount,
      this.processingRate,
      queueSize
    );

    if (toProcess <= 0) {
      return { processed: 0, remaining: queueSize };
    }

    // Get next batch of users
    const users = await this.redis.zRange(queueKey, 0, toProcess - 1) || [];

    // Process each user
    let processed = 0;
    for (const userJson of users) {
      const user = JSON.parse(userJson);

      // Move to processing
      await this.moveToProcessing(eventId, user);
      processed++;

      // Remove from queue
      await this.redis.zRem(queueKey, userJson);
    }

    return {
      processed,
      remaining: queueSize - processed
    };
  }

  private async getQueuePosition(
    queueKey: string,
    queueId: string
  ): Promise<number> {
    // Find member with this queueId
    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.queueId === queueId) {
        return i + 1; // 1-indexed position
      }
    }

    return 0; // Not found
  }

  private calculateWaitTime(position: number): number {
    // Estimate based on processing rate
    const minutes = Math.ceil(position / this.processingRate);
    return minutes;
  }

  // SECURITY FIX: Phase 2.2 - Replace predictable token with signed JWT
  private async generateAccessToken(
    eventId: string,
    queueId: string,
    userId?: string
  ): Promise<string> {
    // Get userId from queue if not provided
    if (!userId) {
      const queueKey = `waiting_room:${eventId}`;
      const members = await this.redis.zRange(queueKey, 0, -1) || [];
      for (const memberJson of members) {
        const member = JSON.parse(memberJson);
        if (member.queueId === queueId) {
          userId = member.userId;
          break;
        }
      }
    }

    const payload: QueueTokenPayload = {
      sub: userId || 'unknown',
      evt: eventId,
      qid: queueId,
      scope: 'queue',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 600, // 10 min validity
      jti: uuidv4() // Unique token ID
    };

    // Sign the token
    const token = jwt.sign(payload, QUEUE_TOKEN_SECRET, {
      algorithm: 'HS256',
      issuer: 'waiting-room'
    });

    // Still store in Redis for quick validation and revocation
    const tokenKey = `access_token:${payload.jti}`;
    await this.redis.setEx(tokenKey, 600, JSON.stringify({
      eventId,
      queueId,
      userId: userId || 'unknown',
      grantedAt: new Date()
    }));

    return token;
  }

  // SECURITY FIX: Phase 2.2 - Validate JWT signature
  async validateAccessToken(token: string): Promise<{
    valid: boolean;
    eventId?: string;
  }> {
    try {
      // Verify JWT signature
      const decoded = jwt.verify(token, QUEUE_TOKEN_SECRET, {
        algorithms: ['HS256'],
        issuer: 'waiting-room'
      }) as QueueTokenPayload;

      // Check if token scope is correct
      if (decoded.scope !== 'queue') {
        return { valid: false };
      }

      // Check if token still exists in Redis (for revocation)
      const tokenKey = `access_token:${decoded.jti}`;
      const redisData = await this.redis.get(tokenKey);

      if (!redisData) {
        // Token was revoked or expired in Redis
        return { valid: false };
      }

      return {
        valid: true,
        eventId: decoded.evt
      };
    } catch (err) {
      // Invalid signature, expired, or malformed token
      return { valid: false };
    }
  }

  private async getActiveSlots(eventId: string): Promise<number> {
    // Get event configuration
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async getActiveUserCount(eventId: string): Promise<number> {
    const activeKey = `active_users:${eventId}`;
    return await this.redis.sCard(activeKey) || 0;
  }

  private async getMaxActiveUsers(eventId: string): Promise<number> {
    const event = await this.getEventConfig(eventId);
    return event.maxConcurrentPurchasers || 100;
  }

  private async moveToProcessing(eventId: string, user: any): Promise<void> {
    const activeKey = `active_users:${eventId}`;

    await this.redis.sAdd(activeKey, user.userId);

    // Set expiry on active user (10 minutes to complete purchase)
    await this.redis.expire(activeKey, 600);
  }

  private async recordQueueActivity(
    eventId: string,
    userId: string,
    action: string,
    metadata: any
  ): Promise<void> {
    await query(
      `INSERT INTO waiting_room_activity
       (event_id, user_id, action, metadata, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [eventId, userId, action, JSON.stringify(metadata)]
    );
  }

  private async getEventConfig(eventId: string): Promise<any> {
    // In production, get from event service
    return {
      maxConcurrentPurchasers: 100,
      processingRate: 100
    };
  }

  private async getUserPosition(
    eventId: string,
    userId: string
  ): Promise<any | null> {
    const queueKey = `waiting_room:${eventId}`;

    const members = await this.redis.zRange(queueKey, 0, -1) || [];

    for (let i = 0; i < members.length; i++) {
      const member = JSON.parse(members[i]);
      if (member.userId === userId) {
        return {
          queueId: member.queueId,
          position: i + 1,
          estimatedWaitTime: this.calculateWaitTime(i + 1),
          status: 'waiting'
        };
      }
    }

    return null;
  }

  async getQueueStats(eventId: string): Promise<{
    totalInQueue: number;
    activeUsers: number;
    processingRate: number;
    averageWaitTime: number;
    abandonmentRate: number;
  }> {
    const queueKey = `waiting_room:${eventId}`;
    const activeKey = `active_users:${eventId}`;

    const [queueSize, activeCount] = await Promise.all([
      this.redis.zCard(queueKey),
      this.redis.sCard(activeKey)
    ]);

    // Calculate abandonment rate from activity logs
    const abandonmentStats = await query(
      `SELECT
        COUNT(*) FILTER (WHERE action = 'abandoned') as abandoned,
        COUNT(*) FILTER (WHERE action = 'joined') as joined
       FROM waiting_room_activity
       WHERE event_id = $1
         AND timestamp > CURRENT_TIMESTAMP - INTERVAL '1 hour'`,
      [eventId]
    );

    const abandoned = parseInt(abandonmentStats.rows[0].abandoned);
    const joined = parseInt(abandonmentStats.rows[0].joined);
    const abandonmentRate = joined > 0 ? (abandoned / joined) * 100 : 0;

    return {
      totalInQueue: queueSize || 0,
      activeUsers: activeCount || 0,
      processingRate: this.processingRate,
      averageWaitTime: queueSize && queueSize > 0 ? Math.ceil(queueSize / this.processingRate) : 0,
      abandonmentRate
    };
  }
}
```

### FILE: src/services/high-demand/bot-detector.service.ts
```typescript
import { query } from '../../config/database';

export class BotDetectorService {
  private botIndicators = {
    // Timing patterns
    rapidClicking: { weight: 0.3, threshold: 100 }, // ms between actions
    consistentTiming: { weight: 0.2, threshold: 0.1 }, // timing variance
    impossibleSpeed: { weight: 0.4, threshold: 50 }, // ms to complete form
    
    // Behavior patterns
    noMouseMovement: { weight: 0.3, threshold: 0 },
    linearMousePath: { weight: 0.2, threshold: 0.9 },
    noScrolling: { weight: 0.1, threshold: 0 },
    
    // Technical indicators
    headlessBrowser: { weight: 0.4, threshold: 1 },
    automationTools: { weight: 0.5, threshold: 1 },
    suspiciousUserAgent: { weight: 0.3, threshold: 1 }
  };
  
  async detectBot(sessionData: {
    userId: string;
    sessionId: string;
    userAgent: string;
    actions: Array<{
      type: string;
      timestamp: number;
      x?: number;
      y?: number;
    }>;
    browserFeatures: {
      webdriver?: boolean;
      languages?: string[];
      plugins?: any[];
      permissions?: any;
      webgl?: string;
    };
  }): Promise<{
    isBot: boolean;
    confidence: number;
    indicators: string[];
    recommendation: string;
  }> {
    const indicators: string[] = [];
    let totalScore = 0;
    
    // Check timing patterns
    const timingScore = this.analyzeTimingPatterns(sessionData.actions);
    if (timingScore.score > 0) {
      indicators.push(...timingScore.indicators);
      totalScore += timingScore.score;
    }
    
    // Check mouse patterns
    const mouseScore = this.analyzeMousePatterns(sessionData.actions);
    if (mouseScore.score > 0) {
      indicators.push(...mouseScore.indicators);
      totalScore += mouseScore.score;
    }
    
    // Check browser features
    const browserScore = this.analyzeBrowserFeatures(
      sessionData.browserFeatures,
      sessionData.userAgent
    );
    if (browserScore.score > 0) {
      indicators.push(...browserScore.indicators);
      totalScore += browserScore.score;
    }
    
    // Check historical patterns
    const historicalScore = await this.analyzeHistoricalPatterns(
      sessionData.userId,
      sessionData.sessionId
    );
    if (historicalScore.score > 0) {
      indicators.push(...historicalScore.indicators);
      totalScore += historicalScore.score;
    }
    
    // Determine if bot
    const confidence = Math.min(totalScore, 1);
    const isBot = confidence >= 0.7;
    
    // Record detection
    await this.recordBotDetection(sessionData, {
      isBot,
      confidence,
      indicators
    });
    
    return {
      isBot,
      confidence,
      indicators,
      recommendation: this.getRecommendation(confidence, indicators)
    };
  }
  
  private analyzeTimingPatterns(actions: any[]): {
    score: number;
    indicators: string[];
  } {
    if (actions.length < 2) {
      return { score: 0, indicators: [] };
    }
    
    const indicators: string[] = [];
    let score = 0;
    
    // Calculate time between actions
    const timeDiffs: number[] = [];
    for (let i = 1; i < actions.length; i++) {
      timeDiffs.push(actions[i].timestamp - actions[i - 1].timestamp);
    }
    
    // Check for rapid clicking
    const avgTimeDiff = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
    if (avgTimeDiff < this.botIndicators.rapidClicking.threshold) {
      indicators.push('rapid_clicking');
      score += this.botIndicators.rapidClicking.weight;
    }
    
    // Check for consistent timing (low variance)
    const variance = this.calculateVariance(timeDiffs);
    const coefficientOfVariation = variance / avgTimeDiff;
    
    if (coefficientOfVariation < this.botIndicators.consistentTiming.threshold) {
      indicators.push('consistent_timing');
      score += this.botIndicators.consistentTiming.weight;
    }
    
    // Check for impossible speed
    const formCompletionTime = actions[actions.length - 1].timestamp - actions[0].timestamp;
    if (formCompletionTime < this.botIndicators.impossibleSpeed.threshold) {
      indicators.push('impossible_speed');
      score += this.botIndicators.impossibleSpeed.weight;
    }
    
    return { score, indicators };
  }
  
  private analyzeMousePatterns(actions: any[]): {
    score: number;
    indicators: string[];
  } {
    const mouseActions = actions.filter(a => 
      a.type === 'mousemove' || a.type === 'click'
    );
    
    if (mouseActions.length < 5) {
      return { score: 0, indicators: [] };
    }
    
    const indicators: string[] = [];
    let score = 0;
    
    // Check for mouse movement
    const hasMouseMovement = mouseActions.some(a => a.type === 'mousemove');
    if (!hasMouseMovement) {
      indicators.push('no_mouse_movement');
      score += this.botIndicators.noMouseMovement.weight;
    }
    
    // Check for linear paths
    if (mouseActions.length >= 3) {
      const linearity = this.calculatePathLinearity(mouseActions);
      if (linearity > this.botIndicators.linearMousePath.threshold) {
        indicators.push('linear_mouse_path');
        score += this.botIndicators.linearMousePath.weight;
      }
    }
    
    // Check for scrolling
    const hasScrolling = actions.some(a => a.type === 'scroll');
    if (!hasScrolling && actions.length > 10) {
      indicators.push('no_scrolling');
      score += this.botIndicators.noScrolling.weight;
    }
    
    return { score, indicators };
  }
  
  private analyzeBrowserFeatures(
    features: any,
    userAgent: string
  ): {
    score: number;
    indicators: string[];
  } {
    const indicators: string[] = [];
    let score = 0;
    
    // Check for webdriver
    if (features.webdriver) {
      indicators.push('webdriver_detected');
      score += this.botIndicators.headlessBrowser.weight;
    }
    
    // Check for headless browser indicators
    if (!features.plugins || features.plugins.length === 0) {
      indicators.push('no_plugins');
      score += 0.1;
    }
    
    if (!features.languages || features.languages.length === 0) {
      indicators.push('no_languages');
      score += 0.1;
    }
    
    // Check user agent
    const suspiciousPatterns = [
      /headless/i,
      /phantom/i,
      /selenium/i,
      /puppeteer/i,
      /playwright/i
    ];
    
    if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
      indicators.push('suspicious_user_agent');
      score += this.botIndicators.suspiciousUserAgent.weight;
    }
    
    return { score, indicators };
  }
  
  private async analyzeHistoricalPatterns(
    userId: string,
    sessionId: string
  ): Promise<{
    score: number;
    indicators: string[];
  }> {
    const indicators: string[] = [];
    let score = 0;
    
    // Check for multiple failed attempts
    const failedAttempts = await query(
      `SELECT COUNT(*) as count
       FROM bot_detections
       WHERE user_id = $1
         AND created_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
         AND is_bot = true`,
      [userId]
    );
    
    if (parseInt(failedAttempts.rows[0].count) > 3) {
      indicators.push('multiple_bot_detections');
      score += 0.3;
    }
    
    // Check for IP reputation
    const ipReputation = await this.checkIPReputation(sessionId);
    if (ipReputation.suspicious) {
      indicators.push('suspicious_ip');
      score += 0.2;
    }
    
    return { score, indicators };
  }
  
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / numbers.length;
  }
  
  private calculatePathLinearity(mouseActions: any[]): number {
    if (mouseActions.length < 3) return 0;
    
    // Calculate the straightness of the path
    let totalDistance = 0;
    let directDistance = 0;
    
    for (let i = 1; i < mouseActions.length; i++) {
      const dx = mouseActions[i].x - mouseActions[i - 1].x;
      const dy = mouseActions[i].y - mouseActions[i - 1].y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    
    const firstPoint = mouseActions[0];
    const lastPoint = mouseActions[mouseActions.length - 1];
    const dx = lastPoint.x - firstPoint.x;
    const dy = lastPoint.y - firstPoint.y;
    directDistance = Math.sqrt(dx * dx + dy * dy);
    
    return directDistance / (totalDistance || 1);
  }
  
  private async checkIPReputation(sessionId: string): Promise<{
    suspicious: boolean;
  }> {
    // Check if IP is from known bot networks, VPNs, or proxies
    // In production, integrate with IP reputation service
    return { suspicious: false };
  }
  
  private getRecommendation(confidence: number, indicators: string[]): string {
    if (confidence >= 0.9) {
      return 'block_immediately';
    } else if (confidence >= 0.7) {
      return 'require_captcha';
    } else if (confidence >= 0.5) {
      return 'increase_monitoring';
    } else {
      return 'allow';
    }
  }
  
  private async recordBotDetection(
    sessionData: any,
    detection: any
  ): Promise<void> {
    await query(
      `INSERT INTO bot_detections 
       (user_id, session_id, is_bot, confidence, 
        indicators, user_agent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        sessionData.userId,
        sessionData.sessionId,
        detection.isBot,
        detection.confidence,
        JSON.stringify(detection.indicators),
        sessionData.userAgent
      ]
    );
  }
  
  async trainModel(verifiedData: Array<{
    sessionId: string;
    wasBot: boolean;
  }>): Promise<void> {
    // Update bot detection model based on verified data
    // In production, this would update ML model weights
    console.log(`Training bot detection model with ${verifiedData.length} samples`);
  }
}
```

### FILE: src/services/blockchain/nft-queue.service.ts
```typescript
import Bull from 'bull';
import { config } from '../../config';
import { NFTMintRequest, MintBatch } from '../../types';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { blockchainConfig } from '../../config/blockchain';

export class NFTQueueService {
  private mintQueue: Bull.Queue;
  private batchQueue: Bull.Queue;
  private solanaConnection: Connection;
  
  constructor() {
    this.mintQueue = new Bull('nft-minting', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.batchQueue = new Bull('nft-batch-minting', {
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password
      }
    });
    
    this.solanaConnection = new Connection(
      blockchainConfig.solana.rpcUrl,
      blockchainConfig.solana.commitment
    );
    
    this.setupProcessors();
  }
  
  async queueMinting(request: NFTMintRequest): Promise<string> {
    const job = await this.mintQueue.add('mint-tickets', request, {
      priority: this.getPriority(request.priority),
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: false
    });
    
    return job.id.toString();
  }
  
  async queueBatchMinting(requests: NFTMintRequest[]): Promise<string> {
    // Group by event for efficient batch minting
    const batches = this.groupByEvent(requests);
    
    const jobs = await Promise.all(
      batches.map(batch => 
        this.batchQueue.add('batch-mint', batch, {
          priority: 1,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000
          }
        })
      )
    );
    
    return jobs.map(j => j.id).join(',');
  }
  
  private setupProcessors() {
    // Individual minting processor
    this.mintQueue.process('mint-tickets', async (job) => {
      const request = job.data as NFTMintRequest;
      console.log(`Processing NFT mint for payment ${request.paymentId}`);
      
      try {
        // Check if we should batch this instead
        const pendingCount = await this.mintQueue.count();
        if (pendingCount > 10 && request.priority !== 'urgent') {
          // Move to batch queue
          await this.moveJobToBatch(request);
          return { status: 'moved_to_batch' };
        }
        
        // Process individual mint
        const result = await this.mintNFTs(request);
        return result;
      } catch (error) {
        console.error('Minting failed:', error);
        throw error;
      }
    });
    
    // Batch minting processor
    this.batchQueue.process('batch-mint', async (job) => {
      const batch = job.data as MintBatch;
      console.log(`Processing batch mint for ${batch.ticketIds.length} tickets`);
      
      try {
        const result = await this.batchMintNFTs(batch);
        return result;
      } catch (error) {
        console.error('Batch minting failed:', error);
        throw error;
      }
    });
  }
  
  private async mintNFTs(request: NFTMintRequest): Promise<any> {
    // In production, this would call your Solana program
    // For now, simulate the minting process
    
    console.log(`Minting ${request.ticketIds.length} NFTs on ${request.blockchain}`);
    
    // Simulate blockchain interaction
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      transactionHash: `mock_tx_${Date.now()}`,
      ticketIds: request.ticketIds,
      gasUsed: 0.001 * request.ticketIds.length
    };
  }
  
  private async batchMintNFTs(batch: MintBatch): Promise<any> {
    console.log(`Batch minting ${batch.ticketIds.length} NFTs`);
    
    // Simulate batch transaction
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return {
      success: true,
      transactionHash: `mock_batch_tx_${Date.now()}`,
      ticketIds: batch.ticketIds,
      gasUsed: 0.0008 * batch.ticketIds.length // Cheaper per ticket in batch
    };
  }
  
  private getPriority(priority: string): number {
    switch (priority) {
      case 'urgent': return 3;
      case 'high': return 2;
      case 'standard': return 1;
      default: return 0;
    }
  }
  
  private groupByEvent(requests: NFTMintRequest[]): MintBatch[] {
    const groups: { [key: string]: NFTMintRequest[] } = {};
    
    requests.forEach(request => {
      const key = `${request.eventId}_${request.blockchain}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(request);
    });
    
    return Object.entries(groups).map(([key, reqs]) => ({
      id: `batch_${Date.now()}_${key}`,
      ticketIds: reqs.flatMap(r => r.ticketIds),
      status: 'queued',
      attempts: 0
    }));
  }
  
  private async moveJobToBatch(request: NFTMintRequest): Promise<void> {
    // Add to pending batch
    await this.batchQueue.add('pending-batch', request, {
      delay: 5000 // Wait 5 seconds to collect more
    });
  }
  
  async getQueueStatus(): Promise<{
    mintQueue: { waiting: number; active: number; completed: number };
    batchQueue: { waiting: number; active: number; completed: number };
  }> {
    const [
      mintWaiting, mintActive, mintCompleted,
      batchWaiting, batchActive, batchCompleted
    ] = await Promise.all([
      this.mintQueue.getWaitingCount(),
      this.mintQueue.getActiveCount(),
      this.mintQueue.getCompletedCount(),
      this.batchQueue.getWaitingCount(),
      this.batchQueue.getActiveCount(),
      this.batchQueue.getCompletedCount()
    ]);
    
    return {
      mintQueue: {
        waiting: mintWaiting,
        active: mintActive,
        completed: mintCompleted
      },
      batchQueue: {
        waiting: batchWaiting,
        active: batchActive,
        completed: batchCompleted
      }
    };
  }

  async getJobStatus(jobId: string): Promise<any> {
    // TODO: Implement actual job status check
    return {
      jobId,
      status: "completed",
      progress: 100
    };
  }
}

```

### FILE: src/services/blockchain/gas-estimator.service.ts
```typescript
import { Connection } from '@solana/web3.js';
import { ethers } from 'ethers';
import { GasEstimate } from '../../types';
import { blockchainConfig } from '../../config/blockchain';

export class GasEstimatorService {
  private solanaConnection: Connection;
  private polygonProvider: ethers.JsonRpcProvider;
  private cache: Map<string, { estimate: GasEstimate; timestamp: number }> = new Map();
  private cacheTTL = 60000; // 1 minute
  
  constructor() {
    this.solanaConnection = new Connection(blockchainConfig.solana.rpcUrl);
    this.polygonProvider = new ethers.JsonRpcProvider(blockchainConfig.polygon.rpcUrl);
  }
  
  async estimateGasFees(
    blockchain: 'solana' | 'polygon',
    ticketCount: number
  ): Promise<GasEstimate> {
    const cacheKey = `${blockchain}_${ticketCount}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.estimate;
    }
    
    let estimate: GasEstimate;
    
    if (blockchain === 'solana') {
      estimate = await this.estimateSolanaFees(ticketCount);
    } else {
      estimate = await this.estimatePolygonFees(ticketCount);
    }
    
    this.cache.set(cacheKey, { estimate, timestamp: Date.now() });
    return estimate;
  }
  
  private async estimateSolanaFees(ticketCount: number): Promise<GasEstimate> {
    try {
      // Get recent blockhash for fee calculation
      const { blockhash } = await this.solanaConnection.getLatestBlockhash();
      
      // Base fee + per-signature fee
      const baseFee = 5000; // lamports
      const perTicketFee = 5000; // lamports per ticket
      const totalLamports = baseFee + (perTicketFee * ticketCount);
      
      // Get current SOL price (mock for now)
      const solPriceUSD = 25; // $25 per SOL
      const feeInSOL = totalLamports / 1_000_000_000;
      const feeInUSD = feeInSOL * solPriceUSD;
      
      // Determine congestion level based on recent slot
      const slot = await this.solanaConnection.getSlot();
      const congestionLevel = this.determineCongestionLevel(slot);
      
      return {
        blockchain: 'solana',
        estimatedFee: feeInSOL,
        feeInUSD: feeInUSD,
        congestionLevel,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Solana fee estimation error:', error);
      // Fallback estimate
      return {
        blockchain: 'solana',
        estimatedFee: 0.001 * ticketCount,
        feeInUSD: 0.025 * ticketCount,
        congestionLevel: 'medium',
        timestamp: new Date()
      };
    }
  }
  
  private async estimatePolygonFees(ticketCount: number): Promise<GasEstimate> {
    try {
      // Get current gas price
      const gasPrice = await this.polygonProvider.getFeeData();
      
      // Estimate gas units
      const gasPerMint = blockchainConfig.polygon.gasLimits.mint;
      const totalGas = gasPerMint * ticketCount;
      
      // Calculate fee in wei
      const feeWei = totalGas * Number(gasPrice.gasPrice);
      const feeInMatic = Number(ethers.formatEther(feeWei));
      
      // Get MATIC price (mock for now)
      const maticPriceUSD = 0.50; // $0.50 per MATIC
      const feeInUSD = feeInMatic * maticPriceUSD;
      
      return {
        blockchain: 'polygon',
        estimatedFee: feeInMatic,
        feeInUSD: feeInUSD,
        congestionLevel: this.getPolygonCongestion(Number(gasPrice.gasPrice)),
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Polygon fee estimation error:', error);
      // Fallback estimate
      return {
        blockchain: 'polygon',
        estimatedFee: 0.01 * ticketCount,
        feeInUSD: 0.005 * ticketCount,
        congestionLevel: 'medium',
        timestamp: new Date()
      };
    }
  }
  
  private determineCongestionLevel(slot: number): 'low' | 'medium' | 'high' {
    // Simple heuristic - in production would analyze actual network metrics
    const timeOfDay = new Date().getHours();
    
    if (timeOfDay >= 9 && timeOfDay <= 17) {
      return 'high'; // Business hours
    } else if (timeOfDay >= 18 && timeOfDay <= 22) {
      return 'medium'; // Evening
    } else {
      return 'low'; // Night/early morning
    }
  }
  
  private getPolygonCongestion(gasPrice: number): 'low' | 'medium' | 'high' {
    const gweiPrice = gasPrice / 1_000_000_000;
    
    if (gweiPrice < 30) return 'low';
    if (gweiPrice < 100) return 'medium';
    return 'high';
  }
  
  async getBestBlockchain(ticketCount: number): Promise<{
    recommended: 'solana' | 'polygon';
    reason: string;
    estimates: {
      solana: GasEstimate;
      polygon: GasEstimate;
    };
  }> {
    const [solanaEstimate, polygonEstimate] = await Promise.all([
      this.estimateGasFees('solana', ticketCount),
      this.estimateGasFees('polygon', ticketCount)
    ]);
    
    let recommended: 'solana' | 'polygon';
    let reason: string;
    
    if (solanaEstimate.feeInUSD < polygonEstimate.feeInUSD) {
      recommended = 'solana';
      reason = `Solana is ${((polygonEstimate.feeInUSD - solanaEstimate.feeInUSD) / polygonEstimate.feeInUSD * 100).toFixed(0)}% cheaper`;
    } else {
      recommended = 'polygon';
      reason = `Polygon is ${((solanaEstimate.feeInUSD - polygonEstimate.feeInUSD) / solanaEstimate.feeInUSD * 100).toFixed(0)}% cheaper`;
    }
    
    // Override if one network is congested
    if (solanaEstimate.congestionLevel === 'high' && polygonEstimate.congestionLevel !== 'high') {
      recommended = 'polygon';
      reason = 'Solana network is congested';
    } else if (polygonEstimate.congestionLevel === 'high' && solanaEstimate.congestionLevel !== 'high') {
      recommended = 'solana';
      reason = 'Polygon network is congested';
    }
    
    return {
      recommended,
      reason,
      estimates: {
        solana: solanaEstimate,
        polygon: polygonEstimate
      }
    };
  }
}
```

### FILE: src/services/blockchain/mint-batcher.service.ts
```typescript
import { NFTMintRequest, MintBatch } from '../../types';
import { blockchainConfig } from '../../config/blockchain';

export class MintBatcherService {
  private pendingBatches: Map<string, MintBatch> = new Map();
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private batchDelay = 5000; // 5 seconds to collect tickets
  
  async addToBatch(request: NFTMintRequest): Promise<string> {
    const batchKey = `${request.eventId}_${request.blockchain}`;
    
    let batch = this.pendingBatches.get(batchKey);
    
    if (!batch) {
      batch = {
        id: `batch_${Date.now()}_${batchKey}`,
        ticketIds: [],
        status: 'collecting',
        attempts: 0
      };
      if (batch) this.pendingBatches.set(batchKey, batch);
      
      // Set timer to process batch
      const timer = setTimeout(() => {
        this.processBatch(batchKey);
      }, this.batchDelay);
      
      this.batchTimers.set(batchKey, timer);
    }
    
    // Add tickets to batch
    if (batch) batch.ticketIds.push(...request.ticketIds);
    
    // Check if batch is full
    const maxBatchSize = blockchainConfig.batchSizes[request.blockchain];
    if (batch && batch.ticketIds.length >= maxBatchSize) {
      // Process immediately if full
      clearTimeout(this.batchTimers.get(batchKey)!);
      this.batchTimers.delete(batchKey);
      await this.processBatch(batchKey);
    }
    
    return batch ? batch.id : "";
  }
  
  private async processBatch(batchKey: string): Promise<void> {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch || batch.ticketIds.length === 0) {
      return;
    }
    
    // Remove from pending
    this.pendingBatches.delete(batchKey);
    this.batchTimers.delete(batchKey);
    
    // Update status
    batch.status = 'processing';
    
    console.log(`Processing batch ${batch.id} with ${batch.ticketIds.length} tickets`);
    
    // In production, this would submit the batch to the blockchain
    // For now, we'll simulate processing
    try {
      await this.submitBatchToBlockchain(batch);
      batch.status = 'completed';
    } catch (error) {
      batch.status = 'failed';
      batch.error = error instanceof Error ? error.message : "Unknown error";
      
      // Retry logic would go here
      if (batch.attempts < blockchainConfig.retryConfig.maxAttempts) {
        batch.attempts++;
        // Re-queue for retry
        setTimeout(() => {
          this.retryBatch(batch);
        }, blockchainConfig.retryConfig.baseDelay * batch.attempts);
      }
    }
  }
  
  private async submitBatchToBlockchain(batch: MintBatch): Promise<void> {
    // Simulate blockchain submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Random failure for testing
    if (Math.random() < 0.1) {
      throw new Error('Blockchain submission failed');
    }
    
    batch.transactionHash = `0x${Date.now().toString(16)}`;
    batch.gasUsed = 0.001 * batch.ticketIds.length * 0.8; // 20% discount for batching
  }
  
  private async retryBatch(batch: MintBatch): Promise<void> {
    console.log(`Retrying batch ${batch.id}, attempt ${batch.attempts}`);
    batch.status = 'processing';
    
    try {
      await this.submitBatchToBlockchain(batch);
      batch.status = 'completed';
    } catch (error) {
      batch.status = 'failed';
      batch.error = error instanceof Error ? error.message : "Unknown error";
    }
  }
  
  getBatchStatus(): {
    pending: number;
    processing: number;
    averageSize: number;
  } {
    const pending = this.pendingBatches.size;
    let totalTickets = 0;
    
    this.pendingBatches.forEach(batch => {
      totalTickets += batch.ticketIds.length;
    });
    
    return {
      pending,
      processing: 0, // Would track processing batches in production
      averageSize: pending > 0 ? totalTickets / pending : 0
    };
  }
}
```

### FILE: src/services/databaseService.ts
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

### FILE: src/services/redisService.ts
```typescript
import Redis from 'ioredis';

class RedisServiceClass {
  private client: Redis | null = null;

  async initialize(): Promise<void> {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'redis',
      port: parseInt(process.env.REDIS_PORT || '6379')
    });
    await this.client.ping();
    console.log('Redis connected');
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    if (!this.client) throw new Error('Redis not initialized');
    await this.client.setex(key, ttl, value);
  }

  async del(key: string): Promise<number> {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client.del(key);
  }

  getClient(): Redis {
    if (!this.client) throw new Error('Redis not initialized');
    return this.client;
  }
}

export const RedisService = new RedisServiceClass();
```

### FILE: src/services/core/venue-balance.service.ts
```typescript
import { VenueBalanceModel } from '../../models';
import { VenueBalance } from '../../types';
import { chargebackReserves, payoutThresholds } from '../../config/fees';

export class VenueBalanceService {
  async getBalance(venueId: string): Promise<VenueBalance> {
    return VenueBalanceModel.getBalance(venueId);
  }
  
  async calculatePayoutAmount(venueId: string): Promise<{
    available: number;
    reserved: number;
    payable: number;
  }> {
    const balance = await this.getBalance(venueId);
    
    // Calculate required reserve based on venue risk
    const riskLevel = await this.getVenueRiskLevel(venueId);
    const reservePercentage = chargebackReserves[riskLevel];
    const requiredReserve = balance.available * (reservePercentage / 100);
    
    // Ensure minimum reserve
    const currentReserve = balance.reserved;
    const additionalReserve = Math.max(0, requiredReserve - currentReserve);
    
    // Calculate payable amount
    const payable = Math.max(
      0,
      balance.available - additionalReserve - payoutThresholds.minimum
    );
    
    return {
      available: balance.available,
      reserved: requiredReserve,
      payable: payable >= payoutThresholds.minimum ? payable : 0
    };
  }
  
  private async getVenueRiskLevel(venueId: string): Promise<'low' | 'medium' | 'high'> {
    // In production, this would analyze:
    // - Chargeback history
    // - Time in business
    // - Transaction volume
    // - Event types
    
    // Placeholder
    return 'medium';
  }
  
  async processPayout(venueId: string, amount: number): Promise<void> {
    const { payable } = await this.calculatePayoutAmount(venueId);
    
    if (amount > payable) {
      throw new Error('Insufficient funds for payout');
    }
    
    if (amount > payoutThresholds.maximumDaily) {
      throw new Error('Exceeds daily payout limit');
    }
    
    // Move from available to processing
    await VenueBalanceModel.updateBalance(venueId, -amount, 'available');
    
    // In production, would initiate actual bank transfer here
    // For now, just mark as processed
    console.log(`Processing payout of $${amount} for venue ${venueId}`);
  }
}
```

### FILE: src/services/core/payment-processor.service.ts
```typescript
import { v4 as uuidv4 } from 'uuid';
import { withLock, LockKeys } from '@tickettoken/shared';
import { logger } from '../../utils/logger';

export class PaymentProcessorService {
  private stripe: any;
  private db: any;
  
  constructor(stripe: any, db: any) {
    this.stripe = stripe;
    this.db = db;
  }

  async processPayment(data: {
    userId: string;
    orderId: string;
    amountCents: number;
    currency: string;
    idempotencyKey?: string;
    tenantId?: string;
  }): Promise<any> {
    const userLockKey = LockKeys.userPurchase(data.userId);
    
    return await withLock(userLockKey, 15000, async () => {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: data.amountCents,
        currency: data.currency,
        metadata: {
          orderId: data.orderId,
          userId: data.userId,
          tenantId: data.tenantId || 'default'
        }
      }, {
        idempotencyKey: data.idempotencyKey
      });

      const [transaction] = await this.db('payment_transactions')
        .insert({
          id: uuidv4(),
          order_id: data.orderId,
          user_id: data.userId,
          amount: data.amountCents,
          currency: data.currency,
          stripe_payment_intent_id: paymentIntent.id,
          status: paymentIntent.status,
          idempotency_key: data.idempotencyKey,
          tenant_id: data.tenantId || 'default',
          created_at: new Date()
        })
        .returning('*');

      logger.info(`Payment processed for user ${data.userId}, order ${data.orderId}`);
      
      return {
        transactionId: transaction.id,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        clientSecret: paymentIntent.client_secret
      };
    });
  }

  async confirmPayment(paymentIntentId: string, userId: string): Promise<any> {
    const userLockKey = LockKeys.userPurchase(userId);
    
    return await withLock(userLockKey, 10000, async () => {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);
      
      await this.db('payment_transactions')
        .where({ stripe_payment_intent_id: paymentIntentId })
        .update({
          status: paymentIntent.status,
          confirmed_at: new Date()
        });
      
      logger.info(`Payment confirmed for intent ${paymentIntentId}`);
      
      return {
        status: paymentIntent.status,
        confirmedAt: new Date()
      };
    });
  }
}

export default PaymentProcessorService;
```

### FILE: src/services/core/fee-calculator.service.ts
```typescript
import { feeConfig } from '../../config/fees';
import { VenueTier, DynamicFees, FeeBreakdown } from '../../types';

// Inline utility functions (replacing shared module dependency)
function percentOfCents(cents: number, basisPoints: number): number {
  return Math.round((cents * basisPoints) / 10000);
}

function addCents(...amounts: number[]): number {
  return amounts.reduce((sum, amount) => sum + amount, 0);
}

// All calculations use INTEGER CENTS
export class FeeCalculatorService {
  async calculateDynamicFees(
    venueId: string,
    amountCents: number,
    ticketCount: number
  ): Promise<DynamicFees> {
    const tier = await this.getVenueTier(venueId);
    const platformPercentageBps = this.getTierPercentageBps(tier);
    
    const platformFee = percentOfCents(amountCents, platformPercentageBps);
    const gasEstimate = await this.estimateGasFees(ticketCount);
    const tax = await this.calculateTax(amountCents, venueId);
    
    const total = addCents(amountCents, platformFee, gasEstimate, tax.state, tax.local);

    const breakdown: FeeBreakdown = {
      ticketPrice: amountCents,
      platformFee,
      gasEstimate,
      stateTax: tax.state,
      localTax: tax.local,
      total
    };

    return {
      platform: platformFee,
      platformPercentage: platformPercentageBps / 100,
      gasEstimate,
      tax: tax.state + tax.local,
      total,
      breakdown
    };
  }

  private async getVenueTier(venueId: string): Promise<VenueTier> {
    const monthlyVolumeCents = await this.getMonthlyVolume(venueId);

    if (monthlyVolumeCents < feeConfig.tiers.starter.monthlyVolumeMax * 100) {
      return VenueTier.STARTER;
    } else if (monthlyVolumeCents < feeConfig.tiers.pro.monthlyVolumeMax * 100) {
      return VenueTier.PRO;
    } else {
      return VenueTier.ENTERPRISE;
    }
  }

  private getTierPercentageBps(tier: VenueTier): number {
    switch (tier) {
      case VenueTier.STARTER:
        return Math.round(feeConfig.tiers.starter.percentage * 100);
      case VenueTier.PRO:
        return Math.round(feeConfig.tiers.pro.percentage * 100);
      case VenueTier.ENTERPRISE:
        return Math.round(feeConfig.tiers.enterprise.percentage * 100);
      default:
        return Math.round(feeConfig.tiers.starter.percentage * 100);
    }
  }

  private async getMonthlyVolume(venueId: string): Promise<number> {
    return 500000; // $5,000 = 500,000 cents
  }

  private async estimateGasFees(ticketCount: number): Promise<number> {
    const baseGasFeeCents = 50; // 50 cents per ticket
    return baseGasFeeCents * ticketCount;
  }

  private async calculateTax(
    amountCents: number,
    venueId: string
  ): Promise<{ state: number; local: number; total: number }> {
    const stateTaxBps = 700;  // 7%
    const localTaxBps = 225;  // 2.25%
    
    const state = percentOfCents(amountCents, stateTaxBps);
    const local = percentOfCents(amountCents, localTaxBps);
    
    return { state, local, total: state + local };
  }
}
```

### FILE: src/services/queueService.ts
```typescript
const amqp = require('amqplib');
// import { QUEUES } from '@tickettoken/shared/src/mq/queues'; // Commented out - unused

export class QueueService {
  private connection: any = null;
  private channel: any = null;

  async connect(): Promise<void> {
    if (!this.connection) {
      this.connection = await amqp.connect(process.env.AMQP_URL || 'amqp://rabbitmq:5672');
      this.channel = await this.connection.createChannel();
    }
  }

  async publish(queue: string, message: any): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    await this.channel.assertQueue(queue, { durable: true });
    const buffer = Buffer.from(JSON.stringify(message));
    await this.channel.sendToQueue(queue, buffer, { persistent: true });
  }

  async close(): Promise<void> {
    if (this.channel) await this.channel.close();
    if (this.connection) await this.connection.close();
    this.channel = null;
    this.connection = null;
  }
}

export const queueService = new QueueService();
```

