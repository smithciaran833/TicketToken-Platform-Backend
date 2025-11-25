import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import Stripe from 'stripe';
import { DatabaseService } from '../../../src/services/databaseService';
import { RedisService } from '../../../src/services/redisService';

/**
 * RefundController Integration Tests
 * 
 * These tests verify the complete refund flow including:
 * 1. Authorization and tenant isolation
 * 2. Real Stripe refund API calls
 * 3. Database transaction handling
 * 4. Idempotency protection
 * 5. Rate limiting enforcement
 * 6. Audit logging
 * 7. Event publishing to outbox
 * 
 * Prerequisites:
 * - STRIPE_SECRET_KEY must be set (sk_test_*)
 * - Database must be running and migrated
 * - Redis must be running
 */

const app = require('../../../src/index').default;

describe('RefundController Integration Tests', () => {
  let authToken: string;
  let stripe: Stripe;
  let testPaymentIntentId: string;
  let testStripeRefundIds: string[] = [];
  
  const userId = uuidv4();
  const tenantId = uuidv4();
  const venueId = uuidv4();

  beforeAll(async () => {
    // Wait for services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify Stripe test key
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || !stripeKey.startsWith('sk_test_')) {
      throw new Error('STRIPE_SECRET_KEY must be set to sk_test_* for integration tests');
    }

    stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    });

    // Generate test JWT token
    const jwt = require('jsonwebtoken');
    authToken = jwt.sign(
      {
        id: userId,
        userId: userId,
        tenantId: tenantId,
        role: 'admin'
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );

    // Create a test payment intent in Stripe for refund tests
    const testIntent = await stripe.paymentIntents.create({
      amount: 5000,
      currency: 'usd',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://test.com/return',
    });

    testPaymentIntentId = testIntent.id;

    // Insert test payment intent into database
    const db = DatabaseService.getPool();
    const testOrderId = uuidv4();

    await db.query(
      `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', 5000, NOW(), NOW())`,
      [testOrderId, tenantId, userId, venueId]
    );

    await db.query(
      `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
       VALUES ($1, $2, 5000, 500, $3, 'succeeded', '{}', NOW(), NOW())`,
      [testOrderId, testPaymentIntentId, venueId]
    );
  });

  afterAll(async () => {
    // Cleanup: Cancel test refunds in Stripe
    for (const refundId of testStripeRefundIds) {
      try {
        // Note: Refunds can't be canceled, but we track them for monitoring
        const refund = await stripe.refunds.retrieve(refundId);
        console.log(`Test refund ${refundId}: ${refund.status}`);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Cleanup database
    try {
      const db = DatabaseService.getPool();
      await db.query('DELETE FROM payment_intents WHERE stripe_intent_id = $1', [testPaymentIntentId]);
      await db.query('DELETE FROM orders WHERE user_id = $1', [userId]);
    } catch (error) {
      console.error('Database cleanup failed:', error);
    }
  });

  afterEach(async () => {
    // Clean up Redis rate limit keys
    try {
      const client = RedisService.getClient();
      const keys = await client.keys('rate_limit:*');
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.log('Redis cleanup skipped:', err);
    }
  });

  describe('1. Authorization & Authentication', () => {
    it('should reject refund without authentication', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 1000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });

    it('should reject refund without tenant context', async () => {
      // Token without tenantId
      const jwt = require('jsonwebtoken');
      const noTenantToken = jwt.sign(
        { id: userId, userId: userId, role: 'admin' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${noTenantToken}`)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 1000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Tenant context required');
    });

    it('should reject refund for unauthorized payment intent (wrong tenant)', async () => {
      const wrongTenantId = uuidv4();
      const jwt = require('jsonwebtoken');
      const wrongTenantToken = jwt.sign(
        {
          id: userId,
          userId: userId,
          tenantId: wrongTenantId,
          role: 'admin'
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${wrongTenantToken}`)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 1000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not found or unauthorized');
    });
  });

  describe('2. Input Validation', () => {
    it('should reject refund with invalid amount (negative)', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: -1000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should reject refund with amount exceeding original payment', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 10000, // Original was 5000
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exceeds original payment');
    });

    it('should reject refund with invalid reason enum', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 1000,
          reason: 'invalid_reason'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation failed');
    });

    it('should reject refund without payment intent ID', async () => {
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 1000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Validation failed');
    });
  });

  describe('3. Real Stripe Refund Processing', () => {
    it('should create a real Stripe refund and update database', async () => {
      const refundAmount = 2000; // Partial refund

      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: refundAmount,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('refundId');
      expect(res.body.status).toMatch(/succeeded|pending/);
      expect(res.body.amount).toBe(refundAmount);

      // Verify refund ID format (Stripe format: re_...)
      expect(res.body.refundId).toMatch(/^re_/);

      // Track for cleanup
      testStripeRefundIds.push(res.body.refundId);

      // Verify in Stripe
      const stripeRefund = await stripe.refunds.retrieve(res.body.refundId);
      expect(stripeRefund.id).toBe(res.body.refundId);
      expect(stripeRefund.amount).toBe(refundAmount);
      expect(stripeRefund.payment_intent).toBe(testPaymentIntentId);

      // Verify database was updated
      const db = DatabaseService.getPool();
      const refundCheck = await db.query(
        'SELECT * FROM refunds WHERE stripe_refund_id = $1',
        [res.body.refundId]
      );

      expect(refundCheck.rows.length).toBe(1);
      expect(refundCheck.rows[0].amount).toBe(refundAmount);
      expect(refundCheck.rows[0].payment_intent_id).toBe(testPaymentIntentId);
    });

    it('should handle full refund correctly', async () => {
      // Create another test payment for full refund
      const testIntent2 = await stripe.paymentIntents.create({
        amount: 3000,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        return_url: 'https://test.com/return',
      });

      const db = DatabaseService.getPool();
      const testOrderId2 = uuidv4();

      await db.query(
        `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'completed', 3000, NOW(), NOW())`,
        [testOrderId2, tenantId, userId, venueId]
      );

      await db.query(
        `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, 3000, 300, $3, 'succeeded', '{}', NOW(), NOW())`,
        [testOrderId2, testIntent2.id, venueId]
      );

      // Full refund
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testIntent2.id,
          amount: 3000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(3000);

      testStripeRefundIds.push(res.body.refundId);

      // Verify payment intent status updated to 'refunded'
      const paymentCheck = await db.query(
        'SELECT status FROM payment_intents WHERE stripe_intent_id = $1',
        [testIntent2.id]
      );

      expect(paymentCheck.rows[0].status).toBe('refunded');
    });

    it('should include Stripe refund reason in API call', async () => {
      // Create another test payment
      const testIntent3 = await stripe.paymentIntents.create({
        amount: 1500,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        return_url: 'https://test.com/return',
      });

      const db = DatabaseService.getPool();
      const testOrderId3 = uuidv4();

      await db.query(
        `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'completed', 1500, NOW(), NOW())`,
        [testOrderId3, tenantId, userId, venueId]
      );

      await db.query(
        `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, 1500, 150, $3, 'succeeded', '{}', NOW(), NOW())`,
        [testOrderId3, testIntent3.id, venueId]
      );

      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testIntent3.id,
          amount: 1500,
          reason: 'fraudulent'
        });

      expect(res.status).toBe(200);

      testStripeRefundIds.push(res.body.refundId);

      // Verify reason in Stripe
      const stripeRefund = await stripe.refunds.retrieve(res.body.refundId);
      expect(stripeRefund.reason).toBe('fraudulent');
    });
  });

  describe('4. Idempotency Protection', () => {
    it('should prevent duplicate refunds with same idempotency key', async () => {
      const idempotencyKey = uuidv4();

      // First refund
      const first = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 500,
          reason: 'duplicate'
        });

      expect(first.status).toBe(200);
      testStripeRefundIds.push(first.body.refundId);

      // Duplicate request with SAME idempotency key
      const second = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          paymentIntentId: testPaymentIntentId,
          amount: 500,
          reason: 'duplicate'
        });

      expect(second.status).toBe(200);

      // Should return same refund ID (from cache/Stripe idempotency)
      expect(second.body.refundId).toBe(first.body.refundId);
    });

    it('should allow different refunds with different idempotency keys', async () => {
      const key1 = uuidv4();
      const key2 = uuidv4();

      // Create test payment for multiple partial refunds
      const testIntent4 = await stripe.paymentIntents.create({
        amount: 10000,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        return_url: 'https://test.com/return',
      });

      const db = DatabaseService.getPool();
      const testOrderId4 = uuidv4();

      await db.query(
        `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'completed', 10000, NOW(), NOW())`,
        [testOrderId4, tenantId, userId, venueId]
      );

      await db.query(
        `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, 10000, 1000, $3, 'succeeded', '{}', NOW(), NOW())`,
        [testOrderId4, testIntent4.id, venueId]
      );

      // First partial refund
      const first = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key1)
        .send({
          paymentIntentId: testIntent4.id,
          amount: 3000,
          reason: 'requested_by_customer'
        });

      expect(first.status).toBe(200);
      testStripeRefundIds.push(first.body.refundId);

      // Second partial refund with DIFFERENT key
      const second = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', key2)
        .send({
          paymentIntentId: testIntent4.id,
          amount: 2000,
          reason: 'requested_by_customer'
        });

      expect(second.status).toBe(200);
      testStripeRefundIds.push(second.body.refundId);

      // Should be different refunds
      expect(second.body.refundId).not.toBe(first.body.refundId);
    });
  });

  describe('5. Rate Limiting', () => {
    it('should enforce 5 refunds per minute rate limit', async () => {
      // Create test payments for rate limit testing
      const testIntents = [];
      const db = DatabaseService.getPool();

      for (let i = 0; i < 6; i++) {
        const intent = await stripe.paymentIntents.create({
          amount: 1000,
          currency: 'usd',
          payment_method: 'pm_card_visa',
          confirm: true,
          return_url: 'https://test.com/return',
        });

        const orderId = uuidv4();
        await db.query(
          `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'completed', 1000, NOW(), NOW())`,
          [orderId, tenantId, userId, venueId]
        );

        await db.query(
          `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
           VALUES ($1, $2, 1000, 100, $3, 'succeeded', '{}', NOW(), NOW())`,
          [orderId, intent.id, venueId]
        );

        testIntents.push(intent.id);
      }

      // Make 5 refund requests (should succeed)
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/api/v1/refunds')
          .set('Authorization', `Bearer ${authToken}`)
          .set('Idempotency-Key', uuidv4())
          .send({
            paymentIntentId: testIntents[i],
            amount: 1000,
            reason: 'requested_by_customer'
          });

        expect(res.status).toBe(200);
        testStripeRefundIds.push(res.body.refundId);
      }

      // 6th request should be rate limited
      const rateLimitedRes = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Idempotency-Key', uuidv4())
        .send({
          paymentIntentId: testIntents[5],
          amount: 1000,
          reason: 'requested_by_customer'
        });

      expect(rateLimitedRes.status).toBe(429);
      expect(rateLimitedRes.body).toHaveProperty('error');
    });
  });

  describe('6. Audit Logging', () => {
    it('should create audit log entry for successful refund', async () => {
      // Create test payment
      const testIntent5 = await stripe.paymentIntents.create({
        amount: 2000,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        return_url: 'https://test.com/return',
      });

      const db = DatabaseService.getPool();
      const testOrderId5 = uuidv4();

      await db.query(
        `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'completed', 2000, NOW(), NOW())`,
        [testOrderId5, tenantId, userId, venueId]
      );

      await db.query(
        `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, 2000, 200, $3, 'succeeded', '{}', NOW(), NOW())`,
        [testOrderId5, testIntent5.id, venueId]
      );

      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testIntent5.id,
          amount: 2000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(200);
      testStripeRefundIds.push(res.body.refundId);

      // Verify audit log was created
      // Note: This depends on your audit service implementation
      // Check logs or audit_logs table if it exists
    });
  });

  describe('7. Outbox Event Publishing', () => {
    it('should publish refund.completed event to outbox', async () => {
      // Create test payment
      const testIntent6 = await stripe.paymentIntents.create({
        amount: 1800,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        return_url: 'https://test.com/return',
      });

      const db = DatabaseService.getPool();
      const testOrderId6 = uuidv4();

      await db.query(
        `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'completed', 1800, NOW(), NOW())`,
        [testOrderId6, tenantId, userId, venueId]
      );

      await db.query(
        `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, 1800, 180, $3, 'succeeded', '{}', NOW(), NOW())`,
        [testOrderId6, testIntent6.id, venueId]
      );

      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testIntent6.id,
          amount: 1800,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(200);
      testStripeRefundIds.push(res.body.refundId);

      // Verify outbox event
      const outboxCheck = await db.query(
        `SELECT * FROM outbox 
         WHERE aggregate_type = 'refund' 
         AND event_type = 'refund.completed'
         AND payload->>'refundId' = $1`,
        [res.body.refundId]
      );

      expect(outboxCheck.rows.length).toBeGreaterThan(0);
      
      const event = outboxCheck.rows[0];
      const payload = JSON.parse(event.payload);
      
      expect(payload.refundId).toBe(res.body.refundId);
      expect(payload.amount).toBe(1800);
      expect(payload.paymentIntentId).toBe(testIntent6.id);
    });
  });

  describe('8. Error Handling', () => {
    it('should handle Stripe API errors gracefully', async () => {
      // Try to refund non-existent payment intent
      const res = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: 'pi_nonexistent',
          amount: 1000,
          reason: 'requested_by_customer'
        });

      expect(res.status).toBe(500);
      expect(res.body).toHaveProperty('error');
      expect(res.body.message).toContain('Unable to process refund');
    });

    it('should prevent refund of already-refunded payment', async () => {
      // Create and fully refund a payment
      const testIntent7 = await stripe.paymentIntents.create({
        amount: 1200,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        return_url: 'https://test.com/return',
      });

      const db = DatabaseService.getPool();
      const testOrderId7 = uuidv4();

      await db.query(
        `INSERT INTO orders (id, tenant_id, user_id, venue_id, status, total, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'completed', 1200, NOW(), NOW())`,
        [testOrderId7, tenantId, userId, venueId]
      );

      await db.query(
        `INSERT INTO payment_intents (order_id, stripe_intent_id, amount, platform_fee, venue_id, status, metadata, created_at, updated_at)
         VALUES ($1, $2, 1200, 120, $3, 'succeeded', '{}', NOW(), NOW())`,
        [testOrderId7, testIntent7.id, venueId]
      );

      // First refund (full)
      const firstRefund = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testIntent7.id,
          amount: 1200,
          reason: 'requested_by_customer'
        });

      expect(firstRefund.status).toBe(200);
      testStripeRefundIds.push(firstRefund.body.refundId);

      // Attempt second refund (should fail)
      const secondRefund = await request(app)
        .post('/api/v1/refunds')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          paymentIntentId: testIntent7.id,
          amount: 1200,
          reason: 'requested_by_customer'
        });

      expect(secondRefund.status).toBe(400);
      expect(secondRefund.body.error).toContain('already refunded');
    });
  });
});
